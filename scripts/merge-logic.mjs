import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";

export const DEFAULT_TAG = "deuk-agent-rule";

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

export function findMarkerRegion(content, begin, end) {
  const i = content.indexOf(begin);
  if (i === -1) return null;
  const j = content.indexOf(end, i + begin.length);
  if (j === -1) {
    throw new Error(
      "Found begin marker but no matching end marker after it.\n  begin: " + begin + "\n  end: " + end,
    );
  }
  const innerStart = i + begin.length;
  const innerEnd = j;
  return { innerStart, innerEnd };
}

export function applyAgents(opts) {
  const {
    targetPath,
    bundleContent,
    markers,
    flavor,
    appendIfNoMarkers,
    dryRun,
    backup,
    agentsMode,
  } = opts;

  if (agentsMode === "skip") {
    return {
      action: "skip",
      reason: existsSync(targetPath)
        ? "agents mode skip (file exists)"
        : "agents mode skip",
    };
  }

  if (agentsMode === "overwrite") {
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

  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  const region = findMarkerRegion(existing, markers.begin, markers.end);

  if (region) {
    const inner = bundleContent.trimEnd() + (bundleContent.endsWith("\n") ? "" : "\n");
    const next =
      existing.slice(0, region.innerStart) +
      "\n" +
      inner +
      existing.slice(region.innerEnd);
    if (dryRun) {
      return { action: "would-write", path: targetPath, mode: "inject-region" };
    }
    if (backup && existsSync(targetPath)) {
      copyFileSync(targetPath, targetPath + ".bak");
    }
    writeFileSync(targetPath, next, "utf8");
    return { action: "write", path: targetPath, mode: "inject-region" };
  }

  const allowAppend =
    appendIfNoMarkers || flavor === "init";

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

  const inner = bundleContent.trimEnd() + (bundleContent.endsWith("\n") ? "" : "\n");
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
      if (existsSync(destPath)) {
        actions.push({
          action: "skip",
          src,
          dest: destPath,
          reason: "prefixed target also exists",
        });
        continue;
      }
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
