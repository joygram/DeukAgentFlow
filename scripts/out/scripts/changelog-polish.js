/**
 * Post-process CHANGELOG.md after commit-and-tag-version: drop internal "sync" wording
 * from user-facing bullets (OSS mirror / sync-oss / release automation noise).
 */
import { readFileSync, writeFileSync } from "fs";
import { makePath, resolvePackageRoot } from "./cli-utils.js";
const root = resolvePackageRoot({ fromUrl: import.meta.url });
const file = makePath(root, "CHANGELOG.md");
let s = readFileSync(file, "utf8");
s = s.replace(/,\s*and OSS sync\b/g, "");
s = s.replace(/\s+and OSS sync\b/g, "");
s = s.replace(/- `sync-oss` copies (`package-lock\.json`) for reproducible installs\./g, "- Release packaging includes $1 for reproducible installs.");
writeFileSync(file, s, "utf8");
//# sourceMappingURL=changelog-polish.js.map