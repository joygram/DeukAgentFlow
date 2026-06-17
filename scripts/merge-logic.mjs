import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";

export const DEFAULT_TAG = "deuk-agent-rule";

/** HTML-style markers in `.cursorrules` (separate from AGENTS.md markers). */
export const CURSORRULES_TAG = "deuk-agent-rule-cursorrules";

export function resolveCursorrulesMarkers(o = {}) {
  return resolveMarkers({
    tag: o.tag && String(o.tag).trim() ? String(o.tag).trim() : CURSORRULES_TAG,
    markerBegin: o.markerBegin,
    markerEnd: o.markerEnd,
  });
}

export function resolveMarkers(o) {
  const hasBegin = o.markerBegin != null && o.markerBegin !== "";
  const hasEnd = o.markerEnd != null && o.markerEnd !== "";
  if (hasBegin !== hasEnd) {
    throw new Error("Use both --marker-begin and --marker-end, or neither.");
  }
  if (hasBegin && hasEnd) {
    if (o.markerBegin === o.markerEnd) {
      throw new Error("--marker-begin and --marker-end must differ.");
    }
    return { begin: o.markerBegin, end: o.markerEnd };
  }
  const id = o.tag && o.tag.trim() ? o.tag.trim() : DEFAULT_TAG;
  return {
    begin: "<!-- " + id + ":begin -->",
    end: "<!-- " + id + ":end -->",
  };
}

/**
 * Strip all internal begin/end marker lines from content.
 * Preserves only the content between markers without nesting.
 */
export function stripInternalMarkers(content, begin, end) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return t !== begin && t !== end;
    })
    .join('\n');
}

export function findMarkerRegion(content, begin, end) {
  const i = content.indexOf(begin);
  if (i === -1) return null;
  // Use lastIndexOf to match the outermost end marker,
  // preventing nested markers from causing partial replacement.
  const j = content.lastIndexOf(end);
  if (j === -1 || j <= i) {
    throw new Error(
      `[MARKER ERROR] Found begin marker "${begin}" but no matching end marker "${end}" after it.\n` +
      `  This usually happens if one marker was deleted or renamed manually. Please verify the target file.`
    );
  }
  const innerStart = i + begin.length;
  const innerEnd = j;
  return { innerStart, innerEnd };
}

export function applyAgents(opts) {
  const { agentsMode, targetPath } = opts;

  if (agentsMode === "skip") {
    return {
      action: "skip",
      reason: existsSync(targetPath) ? "agents mode skip (file exists)" : "agents mode skip",
    };
  }

  if (agentsMode === "overwrite") {
    return handleAgentOverwrite(opts);
  }

  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";

  // Workflow Safety Check: warn about different tags and error on case-mismatch
  const markerRegex = /<!--\s*([a-zA-Z0-9_-]+):begin\s*-->/gi;
  const currentTagMatch = opts.markers.begin.match(/<!--\s*([a-zA-Z0-9_-]+):begin\s*-->/i);
  const currentTag = currentTagMatch ? currentTagMatch[1] : null;

  const foundTags = [];
  let m;
  while ((m = markerRegex.exec(existing)) !== null) {
    if (currentTag && m[1].toLowerCase() === currentTag.toLowerCase()) {
      if (m[1] !== currentTag) {
        throw new Error(
          `[CRITICAL ERROR] Case mismatch for tag "${currentTag}". Found "${m[1]}" in ${targetPath}.\n` +
          `  Please unify casing to avoid duplicate managed blocks.`
        );
      }
    } else {
      foundTags.push(m[1]);
    }
  }

  if (foundTags.length > 0) {
    console.warn(`[WARNING] Foreign markers in ${targetPath}: ${[...new Set(foundTags)].join(", ")}`);
    console.warn(`          Current tag is "${currentTag}". This might lead to duplicate managed blocks.`);
  }

  const region = findMarkerRegion(existing, opts.markers.begin, opts.markers.end);

  if (region) {
    return handleAgentInject(opts, existing, region);
  }

  return handleAgentAppend(opts, existing);
}

function handleAgentOverwrite(opts) {
  const { targetPath, bundleContent, dryRun, backup } = opts;
  const prev = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  if (dryRun) {
    return { action: "would-write", path: targetPath, mode: "overwrite" };
  }
  if (backup && existsSync(targetPath)) {
    copyFileSync(targetPath, targetPath + ".bak");
  }
  writeFileSync(targetPath, bundleContent, "utf8");
  return { action: "write", path: targetPath, mode: "overwrite", hadPrevious: !!prev };
}

function handleAgentInject(opts, existing, region) {
  const { targetPath, bundleContent, markers, dryRun, backup } = opts;
  // Strip any internal begin/end markers from bundle content to prevent nesting
  const cleanContent = stripInternalMarkers(bundleContent, markers.begin, markers.end);
  const inner = cleanContent.trimEnd() + "\n";
  const next = existing.slice(0, region.innerStart) + "\n" + inner + existing.slice(region.innerEnd);
  if (dryRun) {
    return { action: "would-write", path: targetPath, mode: "inject-region" };
  }
  if (backup && existsSync(targetPath)) {
    copyFileSync(targetPath, targetPath + ".bak");
  }
  writeFileSync(targetPath, next, "utf8");
  return { action: "write", path: targetPath, mode: "inject-region" };
}

function handleAgentAppend(opts, existing) {
  const { targetPath, bundleContent, markers, flavor, appendIfNoMarkers, dryRun, backup } = opts;
  const allowAppend = appendIfNoMarkers || flavor === "init";

  if (!allowAppend) {
    const hint = [
      "",
      "No marker region found. Add a pair like:",
      "",
      markers.begin,
      "",
      markers.end,
      "",
      "Or run: npx deuk-agent-rule init   (appends markers once)",
      "Or pass: --append-if-no-markers",
      "",
    ].join("\n");
    throw new Error(
      "Inject mode requires markers in " + targetPath + " or use --append-if-no-markers." + hint,
    );
  }

  const inner = bundleContent.trimEnd() + "\n";
  const block = "\n" + markers.begin + "\n\n" + inner + "\n" + markers.end + "\n";
  const next = existing ? existing.replace(/\s*$/, "") + block : markers.begin + "\n\n" + inner + "\n" + markers.end + "\n";

  if (dryRun) {
    return {
      action: "would-write",
      path: targetPath,
      mode: flavor === "init" ? "append-markers-init" : "append-markers",
    };
  }
  if (backup && existsSync(targetPath)) {
    copyFileSync(targetPath, targetPath + ".bak");
  }
  writeFileSync(targetPath, next, "utf8");
  return {
    action: "write",
    path: targetPath,
    mode: flavor === "init" ? "append-markers-init" : "append-markers",
  };
}

export function applyRules(opts) {
  const {
    bundleRulesDir,
    targetRulesDir,
    rulesMode,
    filePrefix = "deuk-agent-rule-",
    dryRun,
    backup,
  } = opts;

  if (!existsSync(bundleRulesDir)) {
    throw new Error("Bundle rules directory missing: " + bundleRulesDir);
  }

  const actions = [];
  mkdirSync(targetRulesDir, { recursive: true });

  for (const name of readdirSync(bundleRulesDir)) {
    if (!name.endsWith(".mdc")) continue;
    const src = join(bundleRulesDir, name);
    let destPath = join(targetRulesDir, name);

    if (rulesMode === "skip" && existsSync(destPath)) {
      actions.push({ action: "skip", src, dest: destPath, reason: "exists" });
      continue;
    }

    if (rulesMode === "prefix" && existsSync(destPath)) {
      destPath = join(targetRulesDir, filePrefix + name);
      // If prefixed file exists (repeat init after npm update), overwrite from bundle — do not skip.
    }

    if (dryRun) {
      actions.push({ action: "would-copy", src, dest: destPath });
      continue;
    }

    if (backup && existsSync(destPath)) {
      copyFileSync(destPath, destPath + ".bak");
    }
    copyFileSync(src, destPath);
    actions.push({ action: "copy", src, dest: destPath });
  }

  return actions;
}

export function readBundleAgents(bundleRoot) {
  const p = join(bundleRoot, "AGENTS.md");
  if (!existsSync(p)) {
    throw new Error("Bundle AGENTS.md missing: " + p);
  }
  return readFileSync(p, "utf8");
}

/**
 * Optional bundle file: Cursor root rules pointer to AGENTS.md.
 * @returns {string|null} file contents, or null if missing
 */
export function readBundleCursorrules(bundleRoot) {
  const p = join(bundleRoot, ".cursorrules");
  if (!existsSync(p)) {
    return null;
  }
  return readFileSync(p, "utf8");
}

/**
 * Remove one tagged block (markers inclusive). Returns ok:false if begin marker not found.
 * @returns {{ ok: true, content: string } | { ok: false, reason: string }}
 */
export function removeTaggedBlock(content, begin, end) {
  const i = content.indexOf(begin);
  if (i === -1) {
    return { ok: false, reason: "begin not found" };
  }
  const j = content.indexOf(end, i + begin.length);
  if (j === -1) {
    return { ok: false, reason: "end not found" };
  }
  const afterEnd = j + end.length;
  let next = content.slice(0, i) + content.slice(afterEnd);
  next = next.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").trimEnd();
  if (next.length) {
    next += "\n";
  }
  return { ok: true, content: next };
}


/**
 * @param {{
 *   bundleRoot: string,
 *   cwd: string,
 *   markers: { begin: string, end: string },
 *   cursorrulesMode: "skip" | "inject" | "overwrite",
 *   dryRun?: boolean,
 *   backup?: boolean,
 * }} opts
 */
export function applyCursorrules(opts) {
  const { bundleRoot, cwd, markers, cursorrulesMode, dryRun, backup } = opts;
  const raw = readBundleCursorrules(bundleRoot);
  if (!raw) {
    return { action: "skip", reason: "bundle .cursorrules missing" };
  }
  const inner = raw.trimEnd();
  const targetPath = join(cwd, ".cursorrules");

  if (cursorrulesMode === "skip") {
    return { action: "skip", reason: "cursorrules mode skip" };
  }

  const writeTaggedOnly = (bodyInner) =>
    markers.begin + "\n\n" + bodyInner + "\n\n" + markers.end + "\n";

  if (cursorrulesMode === "overwrite") {
    const next = writeTaggedOnly(inner);
    if (dryRun) {
      return { action: "would-write", path: targetPath, mode: "overwrite" };
    }
    if (backup && existsSync(targetPath)) {
      copyFileSync(targetPath, targetPath + ".bak");
    }
    writeFileSync(targetPath, next, "utf8");
    return { action: "write", path: targetPath, mode: "overwrite" };
  }

  // inject: update tagged region, or prepend tagged block above existing content
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  const region = findMarkerRegion(existing, markers.begin, markers.end);

  if (region) {
    const next =
      existing.slice(0, region.innerStart) + "\n" + inner + "\n" + existing.slice(region.innerEnd);
    if (dryRun) {
      return { action: "would-write", path: targetPath, mode: "inject-region" };
    }
    if (backup && existsSync(targetPath)) {
      copyFileSync(targetPath, targetPath + ".bak");
    }
    writeFileSync(targetPath, next, "utf8");
    return { action: "write", path: targetPath, mode: "inject-region" };
  }

  const block = writeTaggedOnly(inner) + "\n";
  const rest = existing.replace(/^\uFEFF/, "").trimStart();
  const next = rest.length ? block + rest : block.trimEnd() + "\n";

  if (dryRun) {
    return { action: "would-write", path: targetPath, mode: "prepend-tagged" };
  }
  if (backup && existsSync(targetPath)) {
    copyFileSync(targetPath, targetPath + ".bak");
  }
  writeFileSync(targetPath, next, "utf8");
  return { action: "write", path: targetPath, mode: "prepend-tagged" };
}
