import {
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";

export const DEFAULT_TAG = "DeukAgentRules";

export function readBundleAgents(bundleRoot) {
  const p = join(bundleRoot, "core-rules", "AGENTS.md");
  if (!existsSync(p)) {
    throw new Error("Bundle AGENTS.md missing: " + p);
  }
  return readFileSync(p, "utf8");
}

export function removeTaggedBlock(content, begin, end) {
  const i = content.indexOf(begin);
  if (i === -1) {
    return { ok: false, reason: "begin not found" };
  }
  if (end === null) {
    let blockStart = i;
    const prevText = content.slice(0, i);
    const hrIndex = prevText.lastIndexOf("---");
    if (hrIndex !== -1 && prevText.slice(hrIndex).trim() === "") {
        blockStart = hrIndex;
    }
    let next = content.slice(0, blockStart).trimEnd() + "\n";
    return { ok: true, content: next };
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
