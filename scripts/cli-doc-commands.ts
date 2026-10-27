/** doc-oracle CLI — 문서 관리 표준(Doc Oracle)의 결정적(형식-사실) 집행 지점. */
import { parseHeading,stripLeadingHashes } from "./markdown-headings.js";
import { createHash } from "crypto";
import { existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync } from "fs";
import { CliOpts,DEUK_ROOT_DIR,loadAllRegistryWorkspaceCandidates,makePath,normalizeRegistryPath,resolveUserHome } from "./cli-utils.js";

function resolveWorkspacePath(opts: CliOpts): string {
  const query = String(opts.workspace || "").trim();
  if (!query) {
    throw new Error(
      "--workspace <id> is required. Workspace is resolved only from the registry, never from cwd."
    );
  }
  const candidates = loadAllRegistryWorkspaceCandidates(opts);
  const list = candidates?.workspaces || [];
  const hit =
    list.find(w => w.id === query) ||
    list.find(w => (w.aliases || []).includes(query));
  if (!hit) {
    const known = list.map(w => w.id).join(", ") || "(none registered)";
    throw new Error(`--workspace "${query}" did not match any registered workspace. Known: ${known}`);
  }
  return hit.path;
}

type DocLayer = "design" | "principle" | "guide" | "internal" | "rule" | "other";
function classifyLayer(relPath: string): DocLayer {
  const p = relPath.replace(/\\/g, "/");
  if (p.startsWith("docs/internal/")) return "internal";
  if (p.startsWith("docs/public/architecture/")) return "design";
  if (p.startsWith("docs/public/principles/")) return "principle";
  if (p.startsWith("docs/public/guides/")) return "guide";
  if (p.startsWith("core-rules/")) return "rule";
  return "other";
}

function reader(relPath: string): "public" | "internal" {
  return relPath.replace(/\\/g, "/").startsWith("docs/internal/") ? "internal" : "public";
}

function collectDocs(root: string, opts: CliOpts): string[] {
  const out: string[] = [];
  const roots = ["docs", "core-rules", "README.md", "README.ko.md"];
  for (const r of roots) {
    const abs = makePath(root, r, opts);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) { out.push(r); continue; }
    walk(abs, r);
  }
  function walk(absDir: string, relDir: string) {
    for (const ent of readdirSync(absDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relPath = `${relDir}/${ent.name}`;
      const absPath = makePath(absDir, ent.name, opts);
      if (ent.isDirectory()) { walk(absPath, relPath); continue; }
      if (ent.name.endsWith(".md")) out.push(relPath);
    }
  }
  return out;
}

const POLLUTION_MARKERS: Array<{ re: RegExp; kind: string }> = [
  { re: /구현\s*완료|구현됨/, kind: "결과-서술(구현 완료)" },
  { re: /검증됨|실제로\s*동작/, kind: "결과-서술(검증)" },
  { re: /\*\*\s*완료\s*\*\*|~~[^~]+~~/, kind: "일기(완료 표시·취소선)" },
  { re: /\d+(\.\d+)?\s*KB\b/i, kind: "현상(파일 크기)" },
  { re: /이번\s*(티켓|작업|세션)에서/, kind: "일기(이번 작업 서사)" },
  { re: /```(bash|sh|console)\b/, kind: "실행-로그 블록 가능성" },
];

function scanPollution(root: string, opts: CliOpts) {
  const hits: Array<{ file: string; line: number; kind: string; text: string }> = [];
  for (const rel of collectDocs(root, opts)) {
    const layer = classifyLayer(rel);
    if (layer !== "design" && layer !== "principle") continue;
    const abs = makePath(root, rel, opts);
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      for (const m of POLLUTION_MARKERS) {
        if (m.re.test(text)) hits.push({ file: rel, line: i + 1, kind: m.kind, text: text.trim().slice(0, 120) });
      }
    });
  }
  return hits;
}

function normHeading(h: string): string {
  return stripLeadingHashes(h).replace(/[#*`>·\-–—:()]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function scanScatter(root: string, opts: CliOpts) {
  const byHeading = new Map<string, Set<string>>();
  for (const rel of collectDocs(root, opts)) {
    const abs = makePath(root, rel, opts);
    for (const raw of readFileSync(abs, "utf8").split(/\r?\n/)) {
      const m = parseHeading(raw);
      if (!m || m.depth < 2 || m.depth > 4) continue;
      const key = normHeading(m.text);
      if (key.length < 6) continue; // 너무 짧은 헤딩(개요/목표 등)은 노이즈
      if (!byHeading.has(key)) byHeading.set(key, new Set());
      byHeading.get(key)!.add(rel);
    }
  }
  return Array.from(byHeading.entries())
    .filter(([, files]) => files.size >= 2)
    .map(([heading, files]) => ({ heading, files: Array.from(files).sort() }))
    .sort((a, b) => b.files.length - a.files.length);
}

const FRESHNESS_MARKER = /last_validated|검증\s*완료일|확인\s*커밋|last-verified/i;

function scanStale(root: string, opts: CliOpts) {
  const out: Array<{ file: string; layer: DocLayer }> = [];
  for (const rel of collectDocs(root, opts)) {
    const layer = classifyLayer(rel);
    if (layer !== "design" && layer !== "principle") continue;
    const abs = makePath(root, rel, opts);
    const body = readFileSync(abs, "utf8");
    if (!FRESHNESS_MARKER.test(body)) out.push({ file: rel, layer });
  }
  return out;
}

function scanStructure(root: string, opts: CliOpts) {
  return collectDocs(root, opts).map(rel => ({ file: rel, layer: classifyLayer(rel), reader: reader(rel) }));
}

/** phase 전이(closer/qa 진입) 시 자동 감지용 — 오염·분산 후보 개수와 상위 예시만 요약한다. */
function docCorpusToken(root: string, opts: CliOpts): string {
  let maxMtime = 0, count = 0;
  for (const rel of collectDocs(root, opts)) {
    try {
      const m = statSync(makePath(root, rel, opts)).mtimeMs;
      if (m > maxMtime) maxMtime = m;
      count++;
    } catch { /* file vanished mid-walk → ignore */ }
  }
  return `${count}:${maxMtime}`;
}

function docHealthCachePath(root: string, opts: CliOpts): string {
  const key = createHash("sha1").update(normalizeRegistryPath(root)).digest("hex");
  return makePath(resolveUserHome(opts), DEUK_ROOT_DIR, "doc-health-cache", `${key}.json`, opts);
}

/** phase 전이(closer/qa 진입) 시 자동 감지용 — 오염·분산 후보 개수와 상위 예시만 요약한다. */
export function summarizeDocHealth(root: string, opts: CliOpts = {}): {
  pollution: number; scatter: number; stale: number;
  topPollution: Array<{ file: string; line: number; kind: string }>;
  topScatter: Array<{ heading: string; files: string[] }>;
} | null {
  try {
    if (!root || !existsSync(root)) return null;

    const token = docCorpusToken(root, opts);
    const cachePath = docHealthCachePath(root, opts);
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cached && cached.token === token && cached.result) return cached.result;
    } catch { /* no/invalid cache → scan */ }

    const pol = scanPollution(root, opts);
    const sct = scanScatter(root, opts);
    const stl = scanStale(root, opts);
    const result = {
      pollution: pol.length,
      scatter: sct.length,
      stale: stl.length,
      topPollution: pol.slice(0, 3).map(h => ({ file: h.file, line: h.line, kind: h.kind })),
      topScatter: sct.slice(0, 3).map(g => ({ heading: g.heading, files: g.files })),
    };
    try {
      const dir = makePath(resolveUserHome(opts), DEUK_ROOT_DIR, "doc-health-cache", opts);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ token, result }));
    } catch { /* cache write best-effort — never block the summary */ }
    return result;
  } catch {
    return null;
  }
}

function emit(obj: unknown, json: boolean) {
  if (json) { console.log(JSON.stringify(obj, null, 2)); return false; }
  return true;
}

const TRIGGER = (verb: string) =>
  `\n▶ 실질 판단은 여기서 CLI가 하지 않는다. 위 후보를 근거로 doc-sync 스킬을 호출해 ${verb} — ` +
  `어느 것이 진짜 오염/분산인지, 어디 한 곳(SSOT)으로 모을지는 에이전트가 판정한다.`;

const CANON_GUIDE_BODY = (title: string) =>
  `# ${title}\n\n` +
  `> 🚧 **빈 정본 — 아래 골격을 실제 내용으로 채워야 이 문서가 정본이 된다.**\n` +
  `> 채우기 전에는 이 문서를 근거로 판단하지 마라. 채운 뒤 이 안내 블록을 지운다.\n\n` +
  `## 채우는 규격\n\n` +
  `- 제목은 번호가 아니라 **명제**로 쓴다 — \`## 완주 조건은 재려는 것과 일치해야 한다\`.\n` +
  `- 문서는 **기준**만 말한다. 겪은 일(실측·완료·이번 작업 서사)은 티켓이 받는다.\n` +
  `- 한 조항은 240자 안에서 끝낸다. 길어지면 조항을 나눈다.\n` +
  `- 코드 현상(file:line·현재 결함)이 아니라 **왜·원칙·구조·경계**를 쓴다.\n` +
  `- 같은 개념을 두 문서에 재서술하지 않는다 — 한 곳이 정본이고 나머지는 링크다.\n\n` +
  `## 이 대상은 무엇인가\n\n` +
  `<!-- 무엇을 다루는 정본인지 한 문단. 경계(무엇은 여기 없는가)를 함께 적는다. -->\n\n` +
  `## 어떻게 동작해야 하는가\n\n` +
  `<!-- 목표 구조를 개념에서 연역해 쓴다. 지금 코드가 그런지는 여기 쓰지 않는다. -->\n\n` +
  `## 무엇을 하지 않는가\n\n` +
  `<!-- 의도적으로 배제한 것과 그 이유. 이게 없으면 다음 세션이 스코프를 넓힌다. -->\n`;

const DOCS_README_BODY =
  `# Docs 진입점\n\n` +
  `> 🚧 **빈 정본 — 작업유형→정본 경로 매핑을 실제로 채워야 한다.** 채운 뒤 이 블록을 지운다.\n\n` +
  `에이전트는 작업 시작 시 이 파일을 먼저 읽어 그 작업이 딛고 설 정본 경로를 확인한다.\n\n` +
  `## 작업유형별 정본 경로\n\n` +
  `| 작업유형 | 정본 경로 |\n|---|---|\n` +
  `| 설계 (How) | \`docs/public/architecture/\` |\n` +
  `| 핵심 원칙 | \`docs/public/principles/\` |\n` +
  `| 사용 가이드 | \`docs/public/guides/\` |\n` +
  `| 기획 (Why+What) | \`docs/internal/planning/\` |\n\n` +
  `<!-- 이 워크스페이스에 실재하는 정본 파일을 위 표에 추가한다. -->\n`;

const SCAFFOLD_DIRS = [
  "public/architecture",
  "public/guides",
  "public/principles",
  "internal/planning",
];

export function scaffoldDocs(root: string, opts: { canonName?: string } = {}) {
  const docsRoot = makePath(root, "docs");
  const created: string[] = [];
  const ensureDir = (rel: string) => {
    const abs = makePath(docsRoot, rel);
    if (!existsSync(abs)) { mkdirSync(abs, { recursive: true }); created.push(`${rel}/`); }
  };
  const ensureFile = (rel: string, body: string) => {
    const abs = makePath(docsRoot, rel);
    if (existsSync(abs)) return;
    writeFileSync(abs, body, "utf8");
    created.push(rel);
  };

  if (!existsSync(docsRoot)) { mkdirSync(docsRoot, { recursive: true }); created.push("docs/"); }
  for (const d of SCAFFOLD_DIRS) ensureDir(d);
  ensureFile("README.md", DOCS_README_BODY);

  const canonName = String(opts.canonName || "").trim();
  if (canonName) {
    const fileName = canonName.endsWith(".md") ? canonName : `${canonName}.md`;
    const title = fileName.replace(/\.md$/, "").replace(/[-_]/g, " ");
    ensureFile(`public/architecture/${fileName}`, CANON_GUIDE_BODY(title));
  }
  return { docsRoot, created };
}

export function runDocCommand(args: string[] = []) {
  const opts: CliOpts = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--workspace") opts.workspace = args[++i];
    else if (a.startsWith("--workspace=")) opts.workspace = a.slice("--workspace=".length);
    else if (a === "--non-interactive") opts.nonInteractive = true;
    else positional.push(a);
  }
  const sub = positional[0] || "scan";
  const json = !!opts.json;

  if (sub === "help" || sub === "--help") {
    console.log(
      "deuk-agent-flow doc <scaffold|scan|pollution|scatter|stale> --workspace <id> [--json]\n" +
      "  scaffold   docs 표준 구조와 빈 정본을 생성(내용은 채워야 할 가이드 골격)\n" +
      "  scan       docs 계층 구조를 형식 사실로 나열(공개/내부·설계/규약)\n" +
      "  pollution  설계/원칙 계층에 낀 현상·일기·실행로그 마커 검출(DR-13)\n" +
      "  scatter    같은 헤딩(개념)이 여러 문서에 재서술된 분산 후보 검출\n" +
      "  stale      갱신 기준 마커 없는 설계 문서 나열\n" +
      "CLI는 형식 사실만 뽑는다. 실질 판단(통합 위치·진짜 오염 여부)은 doc-sync 스킬이 한다."
    );
    return;
  }

  const root = resolveWorkspacePath(opts);

  if (sub === "scaffold") {
    const canonName = positional[1] || "";
    const { docsRoot, created } = scaffoldDocs(root, { canonName });
    if (emit({ command: "scaffold", workspace: opts.workspace, docsRoot, created }, json)) {
      console.log(`# doc scaffold — ${opts.workspace} (${created.length} created)`);
      for (const c of created) console.log(`  + ${c}`);
      if (!created.length) console.log("  (이미 전부 존재 — 새로 만든 것 없음)");
      else console.log(`\n▶ 생성된 파일은 채워야 할 골격과 가이드만 들어 있다. 지금 doc-sync 스킬로 실제 내용을 채워라.`);
    }
    return;
  }

  if (sub === "scan") {
    const rows = scanStructure(root, opts);
    if (emit({ command: "scan", workspace: opts.workspace, count: rows.length, docs: rows }, json)) {
      console.log(`# doc scan — ${opts.workspace} (${rows.length} docs)`);
      for (const r of rows) console.log(`  [${r.reader}/${r.layer}] ${r.file}`);
    }
    return;
  }

  if (sub === "pollution") {
    const hits = scanPollution(root, opts);
    if (emit({ command: "pollution", workspace: opts.workspace, count: hits.length, hits }, json)) {
      console.log(`# doc pollution — ${opts.workspace} (${hits.length} marker hits in design/principle layers)`);
      for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
      if (hits.length) console.log(TRIGGER("계층 오염을 배출하라"));
      else console.log("  (형식 마커상 오염 후보 없음 — 실질 판단은 여전히 스킬 몫)");
    }
    return;
  }

  if (sub === "scatter") {
    const groups = scanScatter(root, opts);
    if (emit({ command: "scatter", workspace: opts.workspace, count: groups.length, groups }, json)) {
      console.log(`# doc scatter — ${opts.workspace} (${groups.length} headings appearing in ≥2 docs)`);
      for (const g of groups) console.log(`  "${g.heading}"\n      → ${g.files.join("\n      → ")}`);
      if (groups.length) console.log(TRIGGER("분산을 한 곳 SSOT로 모으고 나머지는 링크로 바꿔라"));
      else console.log("  (같은 헤딩의 재서술 후보 없음)");
    }
    return;
  }

  if (sub === "stale") {
    const rows = scanStale(root, opts);
    if (emit({ command: "stale", workspace: opts.workspace, count: rows.length, docs: rows }, json)) {
      console.log(`# doc stale — ${opts.workspace} (${rows.length} design/principle docs without a freshness marker)`);
      for (const r of rows) console.log(`  [${r.layer}] ${r.file}`);
      if (rows.length) console.log(TRIGGER("신선도를 확인하고 필요한 곳에 갱신 기준을 남겨라"));
    }
    return;
  }

  throw new Error(`unknown doc subcommand: "${sub}" — try: scan | pollution | scatter | stale | help`);
}
