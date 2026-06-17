#!/usr/bin/env node
/**
 * dev-install: build the local source and install it globally for internal use.
 *
 * Flow: bump:patch -> npm pack (--ignore-scripts) -> npm install -g <tgz> -> cleanup.
 *
 * This is the INTERNAL development install path. It never calls `npm publish`.
 * External distribution goes through the OSS sync path (`npm run sync:oss`) and
 * publishes from the OSS package, not from here.
 *
 * Flags:
 *   --no-bump   Skip the patch version bump (reinstall current version as-is).
 *   --no-vsix   Skip building/installing the VS Code/Antigravity extension.
 */
import { readFileSync, readdirSync, unlinkSync, lstatSync, mkdirSync, copyFileSync } from "fs";
import { spawnSync } from "child_process";
import { homedir } from "os";
import { makePath, resolvePackageRoot } from "./cli-utils.js";
const rootDir = resolvePackageRoot({ fromUrl: import.meta.url });
const skipBump = process.argv.includes("--no-bump");
const skipVsix = process.argv.includes("--no-vsix");
function run(command, args, opts = {}) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        stdio: "inherit",
        shell: process.platform === "win32",
        ...opts,
    });
    if (result.status !== 0) {
        console.error(`[dev-install] command failed: ${command} ${args.join(" ")}`);
        process.exit(result.status ?? 1);
    }
    return result;
}
function readVersion() {
    return JSON.parse(readFileSync(makePath(rootDir, "package.json"), "utf8")).version;
}
// Guard against a stale `npm link` (or `npm i -g <dir>`) leaving the global
// package as a symlink into this source tree. That state shadows the tarball
// we are about to install and quietly runs unbundled source. If we find one,
// remove it first so `npm install -g <tgz>` lands a real directory.
function clearStaleLink() {
    const root = spawnSync("npm", ["root", "-g"], {
        cwd: rootDir,
        encoding: "utf8",
        shell: process.platform === "win32",
    });
    const globalRoot = (root.stdout || "").trim();
    if (!globalRoot)
        return; // can't resolve global root; let the install proceed
    const pkgDir = makePath(globalRoot, "deuk-agent-flow");
    let linked = false;
    try {
        linked = lstatSync(pkgDir).isSymbolicLink();
    }
    catch {
        return; // not installed globally — nothing to clear
    }
    if (!linked)
        return;
    console.log("[dev-install] stale symlink detected at global root, removing it...");
    run("npm", ["rm", "-g", "deuk-agent-flow"]);
}
if (!skipBump) {
    console.log("[dev-install] bumping patch version...");
    run("npm", ["run", "bump:patch"]);
}
const version = readVersion();
console.log(`[dev-install] packing v${version} (scripts skipped)...`);
run("npm", ["pack", "--ignore-scripts"]);
const tgz = readdirSync(rootDir)
    .filter((f) => f.startsWith("deuk-agent-flow-") && f.endsWith(".tgz"))
    .map((f) => ({ f, t: f }))
    .sort((a, b) => b.t.localeCompare(a.t))[0]?.f;
if (!tgz) {
    console.error("[dev-install] no packed tarball found");
    process.exit(1);
}
const tgzPath = makePath(rootDir, tgz);
try {
    clearStaleLink();
    console.log(`[dev-install] installing ${tgz} globally...`);
    run("npm", ["install", "-g", tgzPath, "--ignore-scripts"]);
}
finally {
    try {
        unlinkSync(tgzPath);
        console.log(`[dev-install] cleaned up ${tgz}`);
    }
    catch {
        /* best-effort cleanup */
    }
}
// ~/.deuk/dev/ 에 vsix-master.sh + install-targets.json 배포
// Windows node에서 실행 시 WSL 홈(wslpath -u %USERPROFILE% 아닌 wsl ~ 경로)에 복사해야 함.
// install-vsix-wsl.sh 가 WSL $HOME 기준으로 마스터를 찾으므로 WSL 경로가 SSOT.
deployDeukDev();
function deployDeukDev() {
    const devSrcDir = makePath(rootDir, "scripts", "dev");
    const files = ["install-targets.json", "vsix-master.sh"];
    if (process.platform === "win32") {
        // Windows node: wsl.exe 경유로 WSL 홈에 배포
        // bash -c 'set -e; ...' 로 묶어야 set -e가 서브셸에서만 동작
        const cpLines = files.map(f => {
            const winSrc = makePath(devSrcDir, f).replace(/\\/g, "/");
            return `cp "$(wslpath '${winSrc}')" "$DEST/${f}"`;
        }).join("; ");
        const script = `set -e; DEST="$HOME/.deuk/dev"; mkdir -p "$DEST"; ${cpLines}; chmod +x "$DEST/vsix-master.sh"; echo "[dev-install] deployed vsix-master to $DEST"`;
        run("wsl.exe", ["bash", "-c", script]);
    }
    else {
        // WSL/Linux node: $HOME 직接 사용
        const wslHome = process.env.HOME || homedir();
        const deukDevDir = makePath(wslHome, ".deuk", "dev");
        mkdirSync(deukDevDir, { recursive: true });
        for (const f of files) {
            copyFileSync(makePath(devSrcDir, f), makePath(deukDevDir, f));
        }
        run("chmod", ["+x", makePath(deukDevDir, "vsix-master.sh")]);
        console.log(`[dev-install] deployed vsix-master to ${deukDevDir}`);
    }
}
if (!skipVsix) {
    // CLI 설치에 이어 VS Code/Antigravity 확장도 빌드·설치(--install → install-vscode-vsix --all).
    console.log("[dev-install] building & installing VS Code/Antigravity extension...");
    run("node", ["scripts/out/scripts/bundle-vscode-vsix.js", "--install"]);
}
console.log(`[dev-install] done. deuk-agent-flow v${version} installed globally (dev build, not published).`);
//# sourceMappingURL=dev-install.js.map