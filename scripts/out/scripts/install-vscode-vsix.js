#!/usr/bin/env node
import fs from "fs";
import os from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync, spawnSync } from "child_process";
import { makePath, toFileUri } from "./cli-utils.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const vsixPath = makePath(root, 'bundled', 'deuk-agent-flow.vsix');
const extensionId = 'deukpack.deuk-agent-flow';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const homeDir = process.env.HOME || os.homedir();
// Windows VS Code 데스크탑 확장 경로: WSL에서 cmd.exe + wslpath로 Windows 홈 경로 도출
function resolveWindowsHome() {
    try {
        const winProfile = execFileSync('cmd.exe', ['/c', 'echo %USERPROFILE%'], { encoding: 'utf8' }).trim();
        if (!winProfile || winProfile === '%USERPROFILE%')
            return null;
        return execFileSync('wslpath', ['-u', winProfile], { encoding: 'utf8' }).trim();
    }
    catch {
        return null;
    }
}
const windowsHome = resolveWindowsHome();
function loadTargets() {
    const targetsPath = makePath(homeDir, '.deuk', 'dev', 'install-targets.json');
    let rawTargets = [];
    if (fs.existsSync(targetsPath)) {
        rawTargets = JSON.parse(fs.readFileSync(targetsPath, 'utf8')).targets;
    }
    else {
        // 폴백: 레거시 고정 목록
        rawTargets = [
            { id: 'vscode-server', label: 'VS Code Server (WSL)', extensionsDir: '~/.vscode-server/extensions', condition: 'always' },
            { id: 'vscode-desktop', label: 'VS Code Desktop (WSL)', extensionsDir: '~/.vscode/extensions', condition: 'always' },
            { id: 'vscode-desktop-windows', label: 'VS Code Desktop (Windows)', extensionsDir: '%USERPROFILE%/.vscode/extensions', condition: 'windows-home' },
            { id: 'antigravity', label: 'Antigravity IDE', extensionsDir: '~/.antigravity-ide/extensions', condition: 'dir-exists:~/.antigravity-ide' },
            { id: 'code-server', label: 'code-server', extensionsDir: '~/.local/share/code-server/extensions', condition: 'dir-exists:~/.local/share/code-server' },
        ];
    }
    const resolved = [];
    for (const t of rawTargets) {
        let dir = t.extensionsDir;
        const cond = t.condition ?? 'always';
        if (dir.startsWith('%USERPROFILE%')) {
            if (!windowsHome)
                continue;
            dir = dir.replace('%USERPROFILE%', windowsHome);
        }
        else {
            dir = dir.replace('~', homeDir);
        }
        if (cond === 'always') {
            // pass
        }
        else if (cond === 'windows-home') {
            if (!windowsHome || windowsHome === homeDir)
                continue;
        }
        else if (cond.startsWith('dir-exists:')) {
            const checkDir = cond.slice('dir-exists:'.length).replace('~', homeDir);
            if (!fs.existsSync(checkDir))
                continue;
        }
        resolved.push({ extensionsDir: dir, label: t.label });
    }
    return resolved;
}
const activeTargets = loadTargets();
const remoteWorkspaceStateRoot = process.env.REMOTE_WORKSPACE_STATE_ROOT
    || makePath(homeDir, 'workspace', 'remote-workspace', 'runtime', 'vscode-remote-workspace');
const remoteWorkspaceExtensionsDir = makePath(remoteWorkspaceStateRoot, 'server', 'extensions');
const workspaceStorageDir = makePath(homeDir, '.config', 'Code', 'User', 'workspaceStorage');
const backupRoot = makePath(homeDir, '.config', 'Code', 'User', `workspaceStorage-backup-${timestamp}`);
if (!fs.existsSync(vsixPath)) {
    console.error(`[deuk-agent-flow] VSIX not found: ${vsixPath}`);
    process.exit(1);
}
const unpackedExtension = unpackVsix();
for (const { extensionsDir, label } of activeTargets) {
    installExtensionToProfile(extensionsDir, unpackedExtension);
}
// remoteWorkspace 는 server 타겟 존재 시 추가 설치
const hasServer = activeTargets.some(t => t.extensionsDir.includes('.vscode-server'));
if (hasServer && fs.existsSync(remoteWorkspaceStateRoot)) {
    installExtensionToProfile(remoteWorkspaceExtensionsDir, unpackedExtension);
}
const resetResult = resetAgentFlowWorkspaceState();
printSummary(resetResult);
function installExtensionToProfile(extensionsDir, unpacked) {
    fs.mkdirSync(extensionsDir, { recursive: true });
    const targetDirName = `${extensionId}-${unpacked.version}`;
    const targetDirPath = makePath(extensionsDir, targetDirName);
    pruneOldVersions(extensionsDir, targetDirName);
    fs.rmSync(targetDirPath, { recursive: true, force: true });
    copyDirectory(unpacked.extensionDir, targetDirPath);
    writeExtensionsProfile(extensionsDir, unpacked.version, targetDirName);
}
function compareExtensionVersions(left, right) {
    return compareSemver(extractVersion(left), extractVersion(right));
}
function extractVersion(entry) {
    const prefix = `${extensionId}-`;
    return entry.startsWith(prefix) ? entry.slice(prefix.length) : '0.0.0';
}
function compareSemver(left, right) {
    const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
        const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}
function resolveEnvWithUnzip() {
    if (process.platform !== 'win32')
        return process.env;
    const pathEntries = (process.env.PATH || '').split(';');
    const hasUnzip = pathEntries.some((p) => fs.existsSync(makePath(p, 'unzip.exe')));
    if (hasUnzip)
        return process.env;
    const gitUsrBin = makePath('C:\\Program Files\\Git\\usr\\bin');
    if (fs.existsSync(makePath(gitUsrBin, 'unzip.exe'))) {
        return { ...process.env, PATH: `${gitUsrBin};${process.env.PATH}` };
    }
    return process.env;
}
function unpackVsix() {
    const tempRoot = fs.mkdtempSync(makePath(os.tmpdir(), 'deuk-agent-flow-vsix-'));
    execFileSync('unzip', ['-q', vsixPath, '-d', tempRoot], {
        cwd: root,
        stdio: 'inherit',
        env: resolveEnvWithUnzip(),
    });
    const extensionDir = makePath(tempRoot, 'extension');
    const extensionPackage = JSON.parse(fs.readFileSync(makePath(extensionDir, 'package.json'), 'utf8'));
    return {
        extensionDir,
        version: extensionPackage.version,
    };
}
function pruneOldVersions(extensionsDir, keepDirName) {
    if (!fs.existsSync(extensionsDir)) {
        return;
    }
    const directories = fs.readdirSync(extensionsDir)
        .filter((entry) => entry.startsWith(`${extensionId}-`))
        .sort(compareExtensionVersions);
    for (const entry of directories) {
        if (entry === keepDirName) {
            continue;
        }
        fs.rmSync(makePath(extensionsDir, entry), { recursive: true, force: true });
    }
}
function copyDirectory(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = makePath(sourceDir, entry.name);
        const targetPath = makePath(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
            continue;
        }
        fs.copyFileSync(sourcePath, targetPath);
    }
}
function writeExtensionsProfile(extensionsDir, version, relativeLocation) {
    const profilePath = makePath(extensionsDir, 'extensions.json');
    let profile = [];
    if (fs.existsSync(profilePath)) {
        try {
            profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        }
        catch {
            profile = [];
        }
    }
    const nextProfile = profile.filter((entry) => entry?.identifier?.id !== extensionId);
    nextProfile.push({
        identifier: { id: extensionId },
        version,
        location: {
            $mid: 1,
            fsPath: makePath(extensionsDir, relativeLocation),
            external: toFileUri(makePath(extensionsDir, relativeLocation)),
            path: makePath(extensionsDir, relativeLocation),
            scheme: 'file',
        },
        relativeLocation,
        metadata: {
            installedTimestamp: Date.now(),
            pinned: true,
            source: 'vsix',
        },
    });
    fs.writeFileSync(profilePath, JSON.stringify(nextProfile, null, 2));
}
function resetAgentFlowWorkspaceState() {
    if (!fs.existsSync(workspaceStorageDir)) {
        return { resetFiles: [], backupRoot: null };
    }
    const signatures = [
        'memento/webviewView.deukagentflow-command-center',
        'memento/webviewView.deukpack-agentflow-command-center',
        'deukagentflow.agentflow.',
        'deukpack.deuk-agent-flow',
    ];
    const resetFiles = [];
    for (const entry of fs.readdirSync(workspaceStorageDir)) {
        const stateDbPath = makePath(workspaceStorageDir, entry, 'state.vscdb');
        if (!fs.existsSync(stateDbPath)) {
            continue;
        }
        if (!hasAnySignature(stateDbPath, signatures)) {
            continue;
        }
        fs.mkdirSync(backupRoot, { recursive: true });
        const backupDir = makePath(backupRoot, entry);
        fs.mkdirSync(backupDir, { recursive: true });
        fs.copyFileSync(stateDbPath, makePath(backupDir, 'state.vscdb'));
        fs.renameSync(stateDbPath, `${stateDbPath}.bak-${timestamp}`);
        resetFiles.push(stateDbPath);
    }
    return {
        resetFiles,
        backupRoot: resetFiles.length > 0 ? backupRoot : null,
    };
}
function hasAnySignature(filePath, signatures) {
    const result = spawnSync('strings', [filePath], { encoding: 'utf8' });
    if (result.status !== 0) {
        return false;
    }
    return signatures.some((signature) => result.stdout.includes(signature));
}
function printSummary(resetResult) {
    const summary = {
        targets: activeTargets.map(({ extensionsDir, label }) => ({
            label,
            version: newestInstalledVersion(extensionsDir),
        })),
        resetFiles: resetResult.resetFiles,
        backupRoot: resetResult.backupRoot,
    };
    console.log('[deuk-agent-flow] VSIX install summary');
    console.log(JSON.stringify(summary, null, 2));
}
function newestInstalledVersion(extensionsDir) {
    if (!fs.existsSync(extensionsDir)) {
        return null;
    }
    const directories = fs.readdirSync(extensionsDir)
        .filter((entry) => entry.startsWith(`${extensionId}-`))
        .sort(compareExtensionVersions);
    return directories.at(-1) ?? null;
}
//# sourceMappingURL=install-vscode-vsix.js.map