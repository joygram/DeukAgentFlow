#!/usr/bin/env node
/**
 * OSS publish pre-build script.
 * Runs in the OSS mirror (no dev source, no pre-built scripts/out).
 * Steps: (1) root npm install, (2) tsc scripts, (3) vscode-extension npm install, (4) vsix bundle.
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ext = path.join(root, "vscode-extension");

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("[oss-prepack] (1/4) root npm install...");
run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=silent"], root);

console.log("[oss-prepack] (2/4) tsc scripts...");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
run("node", [tscBin, "-p", "tsconfig.scripts.json"], root);

console.log("[oss-prepack] (3/4) vscode-extension npm install...");
run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=silent"], ext);

console.log("[oss-prepack] (4/4) vsix bundle...");
run("node", ["scripts/out/scripts/bundle-vscode-vsix.js"], root);

console.log("[oss-prepack] done.");
