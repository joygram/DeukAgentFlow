import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, statSync } from "fs";
import { basename, dirname, join, relative } from "path";
import {
  toRepoRelativePath, AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_LIST_FILENAME,
  parseFrontMatter, stringifyFrontMatter, findFileRecursively, detectConsumerTicketDir
} from "./cli-utils.mjs";
import { readTicketIndexJson, writeTicketIndexJson, syncActiveTicketId } from "./cli-ticket-index.mjs";
import { collectTicketMarkdownFiles, rebuildTicketIndexFromTopicFilesIfNeeded } from "./cli-ticket-parser.mjs";

// ─── Summary Extraction ─────────────────────────────────────────────────────

/**
 * Extracts a concise summary from ticket body content for legacy tickets.
 * Strategy: combine title + scope/background + top tasks into 1-2 lines.
 * Handles 3 legacy formats:
 *   - Old format: 🎯 Scope Bounds, 📁 Files to Modify
 *   - Mid format: ## Background, ## Analysis, ## Tasks
 *   - New format: ## Target Module, ## APC (already has summary usually)
 */
export function extractSummary(meta, content) {
  const title = meta.title || "";
  const lines = content.split("\n");

  // Collect section contents by known header patterns
  const sections = {};
  let currentSection = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Match ## headers (with or without emoji prefix)
    const headerMatch = trimmed.match(/^##\s+(?:[\u{1F3AF}\u{1F4C1}\u{1F3D7}\u{1F6D1}\u{1F504}\u{2705}\s]*)?(.+)$/u);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
      sections[currentSection] = [];
      continue;
    }
    // Match # title
    if (trimmed.startsWith("# ") && !currentSection) {
      continue; // skip title line
    }
    if (currentSection && trimmed && !trimmed.startsWith(">") && !trimmed.startsWith("<!--")) {
      sections[currentSection].push(trimmed);
    }
  }

  // Priority: scope/background > analysis > tasks
  let contextLine = "";

  // Try scope bounds (old format)
  const scopeKeys = Object.keys(sections).filter(k =>
    k.includes("scope") || k.includes("target") || k.includes("background")
  );
  for (const key of scopeKeys) {
    const scopeLines = (sections[key] || [])
      .filter(l => !l.startsWith("- **Context") && !l.startsWith("["))
      .map(l => l.replace(/^[-*]\s*\*\*[^*]+:\*\*\s*/, "").replace(/`/g, ""))
      .filter(l => l.length > 5 && l.length < 200);
    if (scopeLines.length > 0) {
      contextLine = scopeLines[0];
      break;
    }
  }

  // Try analysis section if no scope found
  if (!contextLine) {
    const analysisKeys = Object.keys(sections).filter(k =>
      k.includes("analysis") || k.includes("design") || k.includes("decisions")
    );
    for (const key of analysisKeys) {
      const analysisLines = (sections[key] || [])
        .filter(l => l.length > 10 && l.length < 200 && !l.startsWith("|"))
        .map(l => l.replace(/^[-*]\s*/, ""));
      if (analysisLines.length > 0) {
        contextLine = analysisLines[0];
        break;
      }
    }
  }

  // Collect task summary (first 3 task items)
  const taskKeys = Object.keys(sections).filter(k =>
    k.includes("task") || k.includes("phased") || k.includes("execution steps")
  );
  let taskItems = [];
  for (const key of taskKeys) {
    taskItems = (sections[key] || [])
      .filter(l => /^-\s*\[[ x]\]/.test(l) || /^\d+\.\s*\[/.test(l))
      .map(l => l.replace(/^[-*\d.]+\s*\[[ x]\]\s*/, "").replace(/\[Phase\s*\d+[>]\s*/i, "").replace(/]/g, "").trim())
      .filter(l => l.length > 3)
      .slice(0, 3);
    if (taskItems.length > 0) break;
  }

  // Build summary
  const parts = [];
  if (contextLine) {
    parts.push(contextLine.length > 120 ? contextLine.substring(0, 117) + "..." : contextLine);
  }
  if (taskItems.length > 0) {
    parts.push(`주요 작업: ${taskItems.join(", ")}`);
  }

  if (parts.length === 0) {
    // Fallback: use title itself as summary
    return title || null;
  }

  const summary = parts.join(". ").substring(0, 300);
  return summary || null;
}

// ─── CAUTION Block / Target Module Injection ─────────────────────────────────

const CAUTION_BLOCK = `> **[CAUTION FOR AI AGENTS]**
> 1. Restrict all analysis, file creation, and modifications to the declared **Target Module** below.
> 2. Read the files listed in **Context Files** before doing ANY code generation.
> 3. DO NOT leak configuration, logic, or dependencies from other modules.

## Target Module
- **Target:** [Fill in the target module/submodule path]
- **Context Files:** [List architecture docs or key files to read first]`;

/**
 * Ensures the CAUTION block and Target Module section exist after the title.
 * Returns modified content or null if no change needed.
 */
export function ensureCautionBlock(content) {
  // Already has Target Module or the new-format CAUTION
  if (content.includes("## Target Module")) return null;

  // Also skip if it already has the old-format scope bounds (don't duplicate)
  const hasOldScope = /## [\u{1F3AF}]?\s*Scope Bounds/u.test(content);
  if (hasOldScope) return null;

  // Find the # title line and insert after it
  const titleMatch = content.match(/^(# .+)\n/m);
  if (!titleMatch) return null;

  const titleEnd = content.indexOf(titleMatch[0]) + titleMatch[0].length;
  const before = content.substring(0, titleEnd);
  let after = content.substring(titleEnd);

  // Skip if CAUTION already exists (old variant)
  if (after.includes("[CAUTION FOR AI AGENTS]")) return null;

  return before + "\n" + CAUTION_BLOCK + "\n" + after;
}

// ─── Main Migration ─────────────────────────────────────────────────────────

export function performUpgradeMigration(cwd, opts = {}) {
  const root = detectConsumerTicketDir(cwd, { createIfMissing: true });
  
  const files = collectTicketMarkdownFiles(root).filter(p => {
    const base = basename(p);
    return base !== "LATEST.md" && base !== TICKET_LIST_FILENAME && base !== "ACTIVE_TICKET.md";
  });

  console.log(`[UPGRADE] Scanning ${files.length} tickets for V2 migration...`);

  let upgraded = 0;
  let summaryAdded = 0;
  let cautionAdded = 0;

  for (const abs of files) {
    const rel = toRepoRelativePath(cwd, abs);
    const body = readFileSync(abs, "utf8");
    const { meta, content } = parseFrontMatter(body);
    let dirty = false;
    let modifiedContent = content;

    const isAlreadyInArchive = rel.includes("/archive/");

    // 1. Summary enrichment for legacy tickets
    if (!meta.summary) {
      const generated = extractSummary(meta, content);
      if (generated) {
        meta.summary = generated;
        dirty = true;
        summaryAdded++;
      }
    }

    // 2. CAUTION / Target Module injection
    const cautionResult = ensureCautionBlock(modifiedContent);
    if (cautionResult !== null) {
      modifiedContent = cautionResult;
      dirty = true;
      cautionAdded++;
    }

    // 3. Archive placement fix (existing logic)
    if (meta.status === "archived" && !isAlreadyInArchive && !opts.dryRun) {
      const finalAbs = moveFileToArchive(cwd, abs, meta.group || basename(dirname(abs)));
      const migratedBody = stringifyFrontMatter(meta, modifiedContent);
      writeFileSync(finalAbs, migratedBody, "utf8");
      upgraded++;
      console.log(`[OK] Upgraded + archived: ${toRepoRelativePath(cwd, finalAbs)}`);
      continue;
    }

    if (dirty) {
      if (opts.dryRun) {
        const changes = [];
        if (!parseFrontMatter(body).meta.summary && meta.summary) changes.push("summary");
        if (cautionResult !== null) changes.push("caution+targetModule");
        console.log(`[DRY-RUN] Would upgrade: ${rel} (+${changes.join(", ")})`);
      } else {
        const migratedBody = stringifyFrontMatter(meta, modifiedContent);
        writeFileSync(abs, migratedBody, "utf8");
        upgraded++;
      }
    }
  }

  console.log(`[UPGRADE] Results: ${upgraded} upgraded, ${summaryAdded} summaries added, ${cautionAdded} caution blocks added`);

  if (!opts.dryRun) {
    rebuildTicketIndexFromTopicFilesIfNeeded(cwd, { ...opts, force: true });
    performDefragmentation(cwd, opts);
    syncActiveTicketId(cwd);
  }
  
  return upgraded;
}

// ─── Defragmentation ────────────────────────────────────────────────────────

export function performDefragmentation(cwd, opts = {}) {
  const rootTicketDir = detectConsumerTicketDir(cwd);
  if (!rootTicketDir) return;
  const tickets = collectTicketMarkdownFiles(rootTicketDir).filter(p => {
    const base = basename(p);
    return base !== "LATEST.md" && base !== TICKET_LIST_FILENAME && base !== "ACTIVE_TICKET.md";
  });

  console.log(`[DEFRAG] Checking ${tickets.length} tickets for workspace placement...`);

  const modifiedPaths = new Set();
  
  for (const abs of tickets) {
    const { meta } = parseFrontMatter(readFileSync(abs, "utf8"));
    if (meta.submodule && meta.submodule !== "global") {
      const subPath = join(cwd, meta.submodule);
      if (existsSync(subPath) && statSync(subPath).isDirectory()) {
        const subTicketDir = join(subPath, AGENT_ROOT_DIR, TICKET_SUBDIR);
        
        const relToRoot = relative(rootTicketDir, abs);
        const destAbs = join(subTicketDir, relToRoot);
        
        if (opts.dryRun) {
          console.log(`[DRY-RUN] Would move to workspace: ${relToRoot} -> ${meta.submodule}/${AGENT_ROOT_DIR}/${TICKET_SUBDIR}/`);
        } else {
          mkdirSync(dirname(destAbs), { recursive: true });
          copyFileSync(abs, destAbs);
          unlinkSync(abs);
          console.log(`[DEFRAG] Moved: ${meta.submodule}/${AGENT_ROOT_DIR}/${TICKET_SUBDIR}/${relToRoot}`);
          modifiedPaths.add(subPath);
        }
      }
    }
  }

  if (!opts.dryRun) {
    for (const p of modifiedPaths) {
      rebuildTicketIndexFromTopicFilesIfNeeded(p, { ...opts, force: true });
      syncActiveTicketId(p);
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function moveFileToArchive(cwd, abs, group) {
  const ticketDir = detectConsumerTicketDir(cwd);
  const archiveBase = join(ticketDir, "archive");
  const targetSubDir = (basename(ticketDir) === TICKET_SUBDIR || !group) ? "sub" : group;
  const targetDir = join(archiveBase, targetSubDir);
  mkdirSync(targetDir, { recursive: true });
  const finalAbs = join(targetDir, basename(abs));
  if (finalAbs !== abs) {
    if (existsSync(finalAbs)) {
      unlinkSync(abs);
    } else {
      writeFileSync(finalAbs, readFileSync(abs, "utf8"), "utf8");
      unlinkSync(abs);
    }
  }
  return finalAbs;
}

export function normalizeTicketPaths(cwd, opts = {}) {
  const index = readTicketIndexJson(cwd);
  const ticketDir = detectConsumerTicketDir(cwd);
  const entries = index.entries || [];
  let modified = false;

  for (const entry of entries) {
    if (!entry.path) continue;
    
    const currentAbs = join(cwd, entry.path);
    if (!existsSync(currentAbs)) {
      const fileName = basename(entry.path);
      const found = findFileRecursively(ticketDir, fileName);
      if (found) {
        const newRel = toRepoRelativePath(cwd, found);
        if (entry.path !== newRel) {
          entry.path = newRel;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    index.updatedAt = new Date().toISOString();
    writeTicketIndexJson(cwd, index);
    if (!opts.silent) console.log(`[NORMALIZE] Corrected stale paths in ${basename(cwd)}/INDEX.json`);
  }
  return modified;
}
