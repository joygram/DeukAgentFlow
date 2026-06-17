/**
 * Populates ../DeukAgentFlow for the public GitHub repo.
 * Run: cd deuk-agent-flow && npm run sync:oss
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { DEUK_ROOT_DIR, makePath, resolvePackageRoot } from "./cli-utils.js";
const pkgRoot = resolvePackageRoot({ fromUrl: import.meta.url });
const repoRoot = makePath(pkgRoot, "..");
const publicTreeRoot = makePath(repoRoot, ["O", "SS"].join(""), "DeukAgentFlow");
const publicOverlayRoot = makePath(pkgRoot, "oss-public");
const PUBLIC_DOCS = [
    "architecture.md",
    "architecture.ko.md",
    "how-it-works.md",
    "how-it-works.ko.md",
    "principles.md",
    "principles.ko.md",
    "skills-guide.md",
    "skills-guide.ko.md",
    "usage-guide.ko.md",
];
const PUBLIC_SCRIPTS = [
    "cli.ts",
    "cli-args.ts",
    "cli-usage-commands.ts",
    "cli-init-commands.ts",
    "cli-init-logic.ts",
    "cli-prompts.ts",
    "cli-rule-compiler.ts",
    "cli-skill-commands.ts",
    "cli-telemetry-commands.ts",
    "cli-ticket-command-shared.ts",
    "cli-ticket-commands.ts",
    "cli-ticket-index.ts",
    "cli-ticket-migration.ts",
    "cli-ticket-parser.ts",
    "cli-utils.ts",
    "lint-md.ts",
    "lint-rules.ts",
    "merge-logic.ts",
    "plan-parser.ts",
];
const PUBLIC_RESET_PATHS = [
    ".aiassistant",
    ".claude",
    ".codex",
    ".cursor",
    ".github/workflows",
    ".windsurf",
    "AGENTS.md",
    ".npmrc",
    ".versionrc.cjs",
    "bin",
    "changelog-templates",
    "core-rules",
    "docs",
    "packages",
    "PROJECT_RULE.md",
    "RELEASING.md",
    "RELEASING.ko.md",
    "GITHUB_DESCRIPTION.md",
    "publish",
    "scripts",
    "bundle",
    "bundled",
    "node_modules",
];
/** Set DEUK_AGENT_FLOW_PUBLIC_REPO to override, e.g. https://github.com/you/DeukAgentFlow */
const PUBLIC_REPO = process.env.DEUK_AGENT_FLOW_PUBLIC_REPO
    || process.env.DEUK_AGENT_RULES_PUBLIC_REPO
    || "https://github.com/joygram/DeukAgentFlow";
function gitBase() {
    let u = PUBLIC_REPO.trim().replace(/\.git$/i, "").replace(/\/$/, "");
    if (!u.startsWith("http"))
        return u;
    return u;
}
const base = gitBase();
const gitUrl = base.startsWith("http") ? "git+" + base + ".git" : base;
/** Strip public package.json hooks not used in the public release tree. */
function stripPublicVersionrcScripts(publicVersionrcPath) {
    let t = readFileSync(publicVersionrcPath, "utf8").replace(/\r\n/g, "\n");
    t = t.replace(/\n  scripts:\s*\{\n[\s\S]*?\n  \},\s*\n/, "\n");
    writeFileSync(publicVersionrcPath, t, "utf8");
}
function withSkipTests(command) {
    if (!command || command.includes("--skip-tests"))
        return command;
    return command + " --skip-tests";
}
export function buildPublicPackageJson(srcPkg, baseUrl = base, gitRemoteUrl = gitUrl) {
    const outPkg = {
        ...srcPkg,
        license: srcPkg.license || "Apache-2.0",
        repository: {
            type: "git",
            url: gitRemoteUrl,
        },
        bugs: {
            url: baseUrl.startsWith("http") ? baseUrl + "/issues" : baseUrl,
        },
        homepage: baseUrl.startsWith("http") ? baseUrl + "#readme" : baseUrl,
        files: [
            "LICENSE",
            "bin/**/*",
            "core-rules/**/*",
            "docs/architecture.md",
            "docs/architecture.ko.md",
            "docs/badges/**/*",
            "docs/how-it-works.md",
            "docs/how-it-works.ko.md",
            "docs/principles.md",
            "docs/principles.ko.md",
            "docs/usage-guide.ko.md",
            "docs/assets/**/*",
            "bundled/**/*",
            "scripts/out/**/*",
            "templates/**/*",
            ...PUBLIC_SCRIPTS.map((script) => "scripts/" + script),
            "README.md",
            "README.ko.md",
            "CHANGELOG.md",
            "CHANGELOG.ko.md",
        ],
    };
    delete outPkg.private;
    if (outPkg.scripts && outPkg.scripts["merge:dry"]) {
        const { "merge:dry": _md, ...r2 } = outPkg.scripts;
        outPkg.scripts = r2;
    }
    if (outPkg.scripts && outPkg.scripts["sync:oss"]) {
        const { "sync:oss": _drop, ...rest } = outPkg.scripts;
        outPkg.scripts = rest;
    }
    /** Mirror is not a template/version source: no bump scripts or release devDependencies. */
    for (const k of ["bump", "bump:patch", "bump:minor", "bump:major"]) {
        if (outPkg.scripts && outPkg.scripts[k]) {
            const { [k]: _drop, ...rest } = outPkg.scripts;
            outPkg.scripts = rest;
        }
    }
    delete outPkg.devDependencies;
    for (const k of ["bundle:vscode", "bundle:vscode:no-install", "badge:downloads"]) {
        if (outPkg.scripts && outPkg.scripts[k]) {
            const { [k]: _drop, ...rest } = outPkg.scripts;
            outPkg.scripts = rest;
        }
    }
    if (outPkg.scripts) {
        outPkg.scripts["prepack"] = "npm run build:vscode";
    }
    if (outPkg.scripts && outPkg.scripts.test) {
        const { test: _drop, ...rest } = outPkg.scripts;
        outPkg.scripts = rest;
    }
    for (const key of ["publish", "publish:dry", "publish:bootstrap", "publish:bootstrap:dry"]) {
        if (outPkg.scripts && outPkg.scripts[key]) {
            outPkg.scripts[key] = withSkipTests(outPkg.scripts[key]);
        }
    }
    return outPkg;
}
export function syncPublicTree(paths = {}) {
    const sourceRoot = paths.pkgRoot || pkgRoot;
    const mirrorRoot = paths.publicTreeRoot || publicTreeRoot;
    const publicRoot = paths.publicOverlayRoot || publicOverlayRoot;
    const agentRoot = makePath(mirrorRoot, DEUK_ROOT_DIR);
    if (existsSync(agentRoot)) {
        rmSync(agentRoot, { recursive: true, force: true });
    }
    if (existsSync(makePath(mirrorRoot, "TICKET_LIST.md"))) {
        unlinkSync(makePath(mirrorRoot, "TICKET_LIST.md"));
    }
    for (const rel of PUBLIC_RESET_PATHS) {
        const abs = makePath(mirrorRoot, rel);
        if (existsSync(abs)) {
            rmSync(abs, { recursive: true, force: true });
        }
    }
    if (existsSync(mirrorRoot)) {
        for (const ent of readdirSync(mirrorRoot)) {
            if (/\.tgz$/i.test(ent)) {
                rmSync(makePath(mirrorRoot, ent), { recursive: true, force: true });
            }
        }
    }
    mkdirSync(makePath(mirrorRoot, "scripts"), { recursive: true });
    mkdirSync(makePath(mirrorRoot, "bin"), { recursive: true });
    mkdirSync(makePath(mirrorRoot, "templates"), { recursive: true });
    mkdirSync(makePath(mirrorRoot, "core-rules"), { recursive: true });
    cpSync(makePath(sourceRoot, "bin"), makePath(mirrorRoot, "bin"), { recursive: true, force: true });
    if (existsSync(makePath(sourceRoot, "bundled"))) {
        mkdirSync(makePath(mirrorRoot, "bundled"), { recursive: true });
        cpSync(makePath(sourceRoot, "bundled"), makePath(mirrorRoot, "bundled"), { recursive: true, force: true });
    }
    cpSync(makePath(sourceRoot, "templates"), makePath(mirrorRoot, "templates"), { recursive: true, force: true });
    cpSync(makePath(sourceRoot, "core-rules"), makePath(mirrorRoot, "core-rules"), { recursive: true, force: true });
    cpSync(makePath(sourceRoot, "packages"), makePath(mirrorRoot, "packages"), { recursive: true, force: true });
    mkdirSync(makePath(mirrorRoot, "docs"), { recursive: true });
    for (const doc of PUBLIC_DOCS) {
        cpSync(makePath(sourceRoot, "docs", doc), makePath(mirrorRoot, "docs", doc), { force: true });
    }
    cpSync(makePath(sourceRoot, "docs", "assets"), makePath(mirrorRoot, "docs", "assets"), { recursive: true, force: true });
    const copilotInstructions = makePath(sourceRoot, ".github", "copilot-instructions.md");
    if (existsSync(copilotInstructions)) {
        mkdirSync(makePath(mirrorRoot, ".github"), { recursive: true });
        cpSync(copilotInstructions, makePath(mirrorRoot, ".github", "copilot-instructions.md"), { force: true });
    }
    if (existsSync(makePath(sourceRoot, "scripts", "out"))) {
        cpSync(makePath(sourceRoot, "scripts", "out"), makePath(mirrorRoot, "scripts", "out"), { recursive: true, force: true });
    }
    for (const script of PUBLIC_SCRIPTS) {
        const src = makePath(sourceRoot, "scripts", script);
        if (existsSync(src)) {
            cpSync(src, makePath(mirrorRoot, "scripts", script), { force: true });
        }
    }
    if (!existsSync(publicRoot)) {
        throw new Error("Missing public export overlay: " + publicRoot);
    }
    cpSync(makePath(sourceRoot, "README.md"), makePath(mirrorRoot, "README.md"), { force: true });
    cpSync(makePath(sourceRoot, "README.ko.md"), makePath(mirrorRoot, "README.ko.md"), { force: true });
    if (existsSync(makePath(sourceRoot, "CHANGELOG.md"))) {
        cpSync(makePath(sourceRoot, "CHANGELOG.md"), makePath(mirrorRoot, "CHANGELOG.md"), { force: true });
    }
    if (existsSync(makePath(sourceRoot, "CHANGELOG.ko.md"))) {
        cpSync(makePath(sourceRoot, "CHANGELOG.ko.md"), makePath(mirrorRoot, "CHANGELOG.ko.md"), { force: true });
    }
    if (existsSync(makePath(sourceRoot, "package-lock.json"))) {
        cpSync(makePath(sourceRoot, "package-lock.json"), makePath(mirrorRoot, "package-lock.json"), { force: true });
    }
    if (existsSync(makePath(sourceRoot, "LICENSE"))) {
        cpSync(makePath(sourceRoot, "LICENSE"), makePath(mirrorRoot, "LICENSE"), { force: true });
    }
    const srcPkg = JSON.parse(readFileSync(makePath(sourceRoot, "package.json"), "utf8"));
    const outPkg = buildPublicPackageJson(srcPkg);
    writeFileSync(makePath(mirrorRoot, "package.json"), JSON.stringify(outPkg, null, 2) + "\n", "utf8");
    console.log("deuk-agent-flow: public release tree updated");
    console.log("  Public commit message: describe the released feature/fix/docs/release change; do not use 'sync' as the subject, and do not add an '(oss)' scope.");
    console.log("  Override repo URL: DEUK_AGENT_FLOW_PUBLIC_REPO=https://github.com/joygram/DeukAgentFlow");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    syncPublicTree();
}
//# sourceMappingURL=sync-oss.js.map