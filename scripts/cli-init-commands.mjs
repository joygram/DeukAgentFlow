import { join, dirname, basename } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, rmSync, renameSync } from "fs";
import { resolveMarkers, resolveCursorrulesMarkers, applyAgents, applyRules, applyCursorrules, readBundleAgents } from "./merge-logic.mjs";
import { ensureTicketDirAndGitignore } from "./cli-init-logic.mjs";
import { normalizeTicketPaths } from "./cli-ticket-logic.mjs";
import { compileDynamicRules } from "./cli-rule-compiler.mjs";
import { loadInitConfig, writeInitConfig } from "./cli-utils.mjs";
import { runInteractive } from "./cli-prompts.mjs";

import { AGENT_ROOT_DIR, TICKET_SUBDIR, TEMPLATE_SUBDIR, RULES_SUBDIR, discoverAllSubmodules } from "./cli-utils.mjs";

function migrateLegacyStructure(cwd, dryRun) {
  const recursiveMerge = (src, dest) => {
    if (!existsSync(src)) return;
    if (!existsSync(dest)) {
      if (!dryRun) {
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(src, dest);
      }
      return;
    }
    // Both exist, merge contents
    const entries = readdirSync(src, { withFileTypes: true });
    for (const ent of entries) {
      const sPath = join(src, ent.name);
      const dPath = join(dest, ent.name);
      if (ent.isDirectory()) {
        recursiveMerge(sPath, dPath);
      } else {
        if (!existsSync(dPath)) {
          if (!dryRun) renameSync(sPath, dPath);
        } else {
          // If destination exists, we could overwrite or skip. 
          // For tickets, we skip to avoid data loss, but log it.
          if (basename(sPath) !== "INDEX.json" && basename(sPath) !== "TICKET_LIST.md") {
             // console.warn(`[MIGRATE] Skipping existing file: ${dPath}`);
          }
          if (!dryRun) unlinkSync(sPath); // Remove migrated/redundant file
        }
      }
    }
    // Clean up src if empty
    try {
      if (!dryRun && readdirSync(src).length === 0) rmSync(src, { recursive: true });
    } catch {}
  };

  const legacyTemplates = join(cwd, ".deuk-agent-templates");
  const newTemplates = join(cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR);
  if (existsSync(legacyTemplates)) {
    console.log(`[MIGRATE] Merging legacy templates into ${AGENT_ROOT_DIR}/${TEMPLATE_SUBDIR}`);
    recursiveMerge(legacyTemplates, newTemplates);
  }

  const legacyTickets = join(cwd, ".deuk-agent-ticket");
  const legacyTicketsPlural = join(cwd, ".deuk-agent-tickets");
  const newTickets = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);

  if (existsSync(legacyTickets)) {
    console.log(`[MIGRATE] Merging legacy singular ticket directory into ${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`);
    recursiveMerge(legacyTickets, newTickets);
  }
  if (existsSync(legacyTicketsPlural)) {
    console.log(`[MIGRATE] Merging legacy plural tickets directory into ${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`);
    recursiveMerge(legacyTicketsPlural, newTickets);
  }

  const legacyConfig = join(cwd, ".deuk-agent-rule.config.json");
  const newConfig = join(cwd, AGENT_ROOT_DIR, "config.json");
  if (existsSync(legacyConfig) && !existsSync(newConfig)) {
    console.log(`[MIGRATE] Moving legacy config to ${AGENT_ROOT_DIR}/config.json`);
    if (!dryRun) {
      mkdirSync(join(cwd, AGENT_ROOT_DIR), { recursive: true });
      renameSync(legacyConfig, newConfig);
    }
  }

  // 3. Clean up redundant legacy pointer files from the target directory
  if (existsSync(newTickets)) {
    for (const file of ["ACTIVE_TICKET.md", "ACTIVE_TICKET.json", "LATEST.md"]) {
      const p = join(newTickets, file);
      if (existsSync(p)) {
        console.log(`[MIGRATE] Removing redundant pointer file: ${file}`);
        if (!dryRun) unlinkSync(p);
      }
    }
  }
}

function syncTemplates(cwd, bundleRoot, dryRun) {
  const tplSrcDir = join(bundleRoot, "templates");
  const tplDestDir = join(cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR);
  if (!existsSync(tplSrcDir)) return;
  if (!dryRun) mkdirSync(tplDestDir, { recursive: true });

  const srcFiles = readdirSync(tplSrcDir).filter(n => n.endsWith(".md"));
  const destFiles = existsSync(tplDestDir) ? readdirSync(tplDestDir).filter(n => n.endsWith(".md")) : [];

  for (const name of srcFiles) {
    const src = join(tplSrcDir, name);
    const dest = join(tplDestDir, name);
    if (!dryRun) copyFileSync(src, dest);
    console.log(`template synced: ${dest}`);
  }

  for (const name of destFiles) {
    if (!srcFiles.includes(name)) {
      const obsolete = join(tplDestDir, name);
      if (!dryRun) unlinkSync(obsolete);
      console.log(`template removed (obsolete): ${obsolete}`);
    }
  }
}

function syncGlobalCodexInstructions(dryRun) {
  const codexDir = join(homedir(), ".codex");
  if (!existsSync(codexDir)) return;

  const target = join(codexDir, "AGENTS.md");
  const content = `<!-- deuk-agent-rule:begin -->
# Global DeukAgentRules Pointer

This environment is configured to use DeukAgentRules.
When working in a repository, always look for a local \`AGENTS.md\` or \`.deuk-agent/\` directory for project-specific rules.

## Core Directives
- Follow TDD (Ticket-Driven Development) workflow.
- Use \`npx deuk-agent-rule ticket create\` for new tasks.
- Prioritize RAG search via \`mcp_deukrag_search_*\` tools.
- Never refactor without a ticket or explicit instruction.
<!-- deuk-agent-rule:end -->
`;

  if (!dryRun) {
    writeFileSync(target, content, "utf8");
    console.log(`global codex instructions synced: ${target}`);
  }
}

const SPOKE_REGISTRY = [
  {
    id: "cursor",
    detect: (cwd) => existsSync(join(cwd, ".cursor")),
    legacy: ".cursorrules",
    target: ".cursor/rules/deuk-agent.mdc",
    format: "mdc",
  },
  {
    id: "claude",
    detect: (cwd) => existsSync(join(cwd, "CLAUDE.md")) || existsSync(join(cwd, ".claude")),
    legacy: null,
    target: "CLAUDE.md",
    format: "markdown",
  },
  {
    id: "copilot",
    detect: (cwd) => existsSync(join(cwd, ".github")),
    legacy: null,
    target: ".github/copilot-instructions.md",
    format: "markdown",
  },
  {
    id: "windsurf",
    detect: (cwd) => existsSync(join(cwd, ".windsurf")),
    legacy: ".windsurfrules",
    target: ".windsurf/rules/deuk-agent.md",
    format: "markdown",
  },
  {
    id: "jetbrains",
    detect: (cwd) => existsSync(join(cwd, ".aiassistant")) || existsSync(join(cwd, ".idea")),
    legacy: null,
    target: ".aiassistant/rules/deuk-agent.md",
    format: "markdown",
  },
  {
    id: "antigravity",
    detect: (cwd) => existsSync(join(cwd, "gemini.md")) || existsSync(join(cwd, ".gemini")),
    legacy: null,
    target: "gemini.md",
    format: "markdown",
  },
];

function generateSpokeContent(spoke) {
  const depth = spoke.target.split('/').length - 1;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  
  const commonContent = `# Deuk Agent Rules

This project follows the Deuk Agent Rules framework.
- Read the full rules: [AGENTS.md](${prefix}AGENTS.md)
- Module-specific rules: [.deuk-agent/rules/](${prefix}.deuk-agent/rules/)

## Critical Rules
- Use \`.deuk-agent/templates/TICKET_TEMPLATE.md\` for multi-step tasks.
- RAG-First: Use MCP tools before local file search when available.
- Error Loop Prevention: Stop after 2 repeated errors, create a ticket.
`;

  if (spoke.format === "mdc") {
    return `---
description: "Deuk Agent Rules - Project conventions and ticket workflow"
globs: ["**/*"]
alwaysApply: true
---
${commonContent}`;
  }
  return `<!-- deuk-agent-rule:begin -->\n${commonContent}\n<!-- deuk-agent-rule:end -->\n`;
}

function generateLegacyDeprecationNotice(spoke) {
  return `<!-- deuk-agent-rule:deprecated -->
This file is deprecated. Rules have moved to:
- Target: ${spoke.target}
- All agents: AGENTS.md
<!-- deuk-agent-rule:deprecated:end -->
`;
}

function deploySpokePointers(cwd, dryRun) {
  for (const spoke of SPOKE_REGISTRY) {
    if (!spoke.detect(cwd)) continue;
    
    const targetPath = join(cwd, spoke.target);
    const targetDir = dirname(targetPath);
    
    if (!dryRun) {
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, generateSpokeContent(spoke), "utf8");
    }
    console.log(`spoke synced: ${spoke.target} (${spoke.id})`);
    
    // Deprecate legacy file if it exists
    if (spoke.legacy) {
      const legacyPath = join(cwd, spoke.legacy);
      if (existsSync(legacyPath)) {
        if (!dryRun) writeFileSync(legacyPath, generateLegacyDeprecationNotice(spoke), "utf8");
        console.log(`spoke deprecated: ${spoke.legacy} -> ${spoke.target}`);
      }
    }
  }
}

export async function runInit(opts, bundleRoot) {
  const savedConfig = loadInitConfig(opts.cwd) || {};
  const ignoreDirs = savedConfig.ignoreDirs;

  // 0. Sync Global Codex Instructions
  syncGlobalCodexInstructions(opts.dryRun);

  const submodules = discoverAllSubmodules(opts.cwd, ignoreDirs);
  if (!submodules.includes(opts.cwd)) submodules.push(opts.cwd);

  const markers = resolveMarkers(opts);
  const bundleAgents = readBundleAgents(bundleRoot);

  for (const subCwd of submodules) {
    console.log(`\nInitializing ${basename(subCwd)}...`);
    
    // 1. Migration & Directory Setup
    migrateLegacyStructure(subCwd, opts.dryRun);
    ensureTicketDirAndGitignore({ ...opts, cwd: subCwd });
    
    // 2. Normalize INDEX.json paths (fix stale paths)
    normalizeTicketPaths(subCwd, { silent: false });

    // 3. Spoke Pointers (e.g. .cursor/rules/deuk-agent.mdc)
    deploySpokePointers(subCwd, opts.dryRun);

    // 4. Agents Setup (AGENTS.md)
    let cleanBundleAgents = bundleAgents;
    const firstRuleIdxAgents = cleanBundleAgents.indexOf("<!-- RULE MODULE: ");
    if (firstRuleIdxAgents !== -1) {
      cleanBundleAgents = cleanBundleAgents.substring(0, firstRuleIdxAgents).trimEnd();
    }
    
    const compiledAgentsAdditions = compileDynamicRules(subCwd, bundleRoot, "AGENTS.md");
    const fullBundleAgents = cleanBundleAgents + "\n\n" + compiledAgentsAdditions;

    const agentsResult = applyAgents({
      targetPath: join(subCwd, "AGENTS.md"),
      bundleContent: fullBundleAgents,
      markers, flavor: "init",
      appendIfNoMarkers: opts.appendIfNoMarkers,
      dryRun: opts.dryRun, backup: opts.backup,
      agentsMode: opts.agents || "inject"
    });
    console.log(`AGENTS.md: ${agentsResult.action}`);

    // 5. Hub Rules Sync (.deuk-agent/rules/)
    const hubRulesDir = join(subCwd, AGENT_ROOT_DIR, RULES_SUBDIR);
    if (!opts.dryRun) mkdirSync(hubRulesDir, { recursive: true });
    applyRules({
      bundleRulesDir: join(bundleRoot, "rules"),
      targetRulesDir: hubRulesDir,
      rulesMode: opts.rules || "overwrite",
      dryRun: opts.dryRun, backup: opts.backup
    });

    // 6. Gemini Rule Sync (root rule)
    const geminiBundle = join(bundleRoot, "gemini.md");
    const geminiDest = join(subCwd, "gemini.md");
    if (existsSync(geminiBundle)) {
      let baseGemini = readFileSync(geminiBundle, "utf8");
      // Prune any dynamically appended rule modules that might already be at the bottom
      const firstRuleIdx = baseGemini.indexOf("<!-- RULE MODULE: ");
      if (firstRuleIdx !== -1) {
        baseGemini = baseGemini.substring(0, firstRuleIdx).trimEnd();
      }
      const compiledGeminiAdditions = compileDynamicRules(subCwd, bundleRoot, "gemini.md");
      if (!opts.dryRun) {
        writeFileSync(geminiDest, baseGemini + "\n\n" + compiledGeminiAdditions, "utf8");
      }
      console.log(`gemini.md: synced with dynamic rules`);
    }

    // 7. Templates Sync (.deuk-agent/templates/)
    syncTemplates(subCwd, bundleRoot, opts.dryRun);
  }

  if (!loadInitConfig(opts.cwd)) {
    writeInitConfig(opts.cwd, opts);
  }
}

export function runMerge(opts, bundleRoot) {
  const markers = resolveMarkers(opts);
  const agentsResult = applyAgents({
    targetPath: join(opts.cwd, "AGENTS.md"),
    bundleContent: readBundleAgents(bundleRoot),
    markers, flavor: "merge",
    appendIfNoMarkers: opts.appendIfNoMarkers,
    dryRun: opts.dryRun, backup: opts.backup,
    agentsMode: opts.agents || "inject"
  });
  console.log(`AGENTS.md: ${agentsResult.action} (${agentsResult.mode || ""})`);

  const hubRulesDir = join(opts.cwd, AGENT_ROOT_DIR, RULES_SUBDIR);
  const ruleActions = applyRules({
    bundleRulesDir: join(bundleRoot, "rules"),
    targetRulesDir: hubRulesDir,
    rulesMode: opts.rules || "skip",
    dryRun: opts.dryRun, backup: opts.backup
  });
  ruleActions.forEach(r => console.log(`hub rule ${r.action}: ${r.dest || r.src}`));

  syncTemplates(opts.cwd, bundleRoot, opts.dryRun);
}
