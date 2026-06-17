#!/usr/bin/env node
/**
 * Packs vscode-extension into bundled/deuk-agent-flow.vsix for the npm tarball.
 * Temporarily sets the extension package.json version to the root package version.
 */
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { CliOpts, makePath, resolvePackageRoot } from "./cli-utils.js";

const root = resolvePackageRoot({ fromUrl: import.meta.url });
const extDir = makePath(root, 'vscode-extension');
const extPkgPath = makePath(extDir, 'package.json');
const bundledDir = makePath(root, 'bundled');
const vsixPath = makePath(bundledDir, 'deuk-agent-flow.vsix');
const installAfterBundle = process.argv.includes('--install') || process.env.DEUK_AGENT_FLOW_INSTALL_VSIX === '1';
const skipCompile = process.argv.includes('--skip-compile') || process.env.DEUK_AGENT_FLOW_SKIP_COMPILE === '1';

const rootPkg = JSON.parse(fs.readFileSync(makePath(root, 'package.json'), 'utf8'));
const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf8'));
const savedPrepublish = extPkg.scripts?.['vscode:prepublish'];
extPkg.version = rootPkg.version;
extPkg.scripts = {
  ...extPkg.scripts,
  'vscode:prepublish': 'tsc -p ./',
};
fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n');

try {
  if (!fs.existsSync(bundledDir)) fs.mkdirSync(bundledDir, { recursive: true });
  execSync('npm install --no-audit --no-fund --loglevel=silent', { cwd: extDir, stdio: 'inherit', shell: true } as any);
  if (!skipCompile) {
    execSync('npm run compile', { cwd: extDir, stdio: 'inherit' } as any);
  }
  const vsceBin = makePath(extDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');
  if (!fs.existsSync(vsceBin)) {
    console.error('[deuk-agent-flow] @vscode/vsce missing. Run npm install in vscode-extension.');
    process.exit(1);
  }
  const q = (s) => (s.includes(' ') ? `"${s.replace(/"/g, '\\"')}"` : s);
  execSync(`${q(vsceBin)} package --no-dependencies --out ${q(vsixPath)}`, { cwd: extDir, stdio: 'inherit', shell: true } as any);
  if (!fs.existsSync(vsixPath)) {
    console.error('[deuk-agent-flow] bundle-vscode: expected VSIX missing:', vsixPath);
    process.exit(1);
  }
  console.log('[deuk-agent-flow] bundled VS Code extension:', vsixPath);
  if (installAfterBundle) {
    if (process.platform === 'win32') {
      // Windows node 컨텍스트: WSL bash 스크립트로 WSL 파일시스템에 직접 설치
      const wslScript = execSync(`wsl.exe wslpath -u "${root.replace(/\\/g, '/')}/scripts/install-vsix-wsl.sh"`, { encoding: 'utf8', shell: true } as any).toString().trim();
      execSync(`wsl.exe bash "${wslScript}"`, { stdio: 'inherit', shell: true } as any);
    } else {
      execSync('node scripts/out/scripts/install-vscode-vsix.js --all', { cwd: root, stdio: 'inherit', shell: true } as any);
    }
  }
} finally {
  // #version-sync: keep the extension package.json version pinned to the root version
  // (do NOT restore savedVer) so vscode-extension/package.json auto-tracks the root on
  // every bundle instead of drifting back to a stale value. Only prepublish is temporary.
  extPkg.version = rootPkg.version;
  if (savedPrepublish === undefined) {
    delete extPkg.scripts['vscode:prepublish'];
  } else {
    extPkg.scripts['vscode:prepublish'] = savedPrepublish;
  }
  fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n');
}
