"use strict";
// #701 아카이브 검색 인덱스 (워크스페이스 단위, 디렉토리 단위 생성).
//
// 평소 목록/카운트는 main 만 본다(이 모듈은 호출되지 않는다). 사용자가 검색어를
// 입력했을 때에만 아카이브를 인덱싱한다.
//
// 핵심 통찰(언니): 지난 년월 아카이브 디렉토리(예: archive/sub/2026-05)는 더 이상
// 티켓이 들어오지 않으므로 *불변*이다. 따라서 .search-index.json 을 한 번 만들면
// 영구 재사용한다 — 재파싱 비용 0, 인덱스-원본 어긋남(갱신 버그)도 구조적으로 없다.
//
// 가변으로 취급해 매번 mtime 으로 재검증하는 디렉토리:
//   - 현재 년월 폴더 (아직 티켓이 더 들어올 수 있음)
//   - undated / 년월 패턴이 아닌 디렉토리 (예: archive/main 직하 잔재)
//
// 인덱스 파일은 각 아카이브 디렉토리 안에 .search-index.json 로 둔다. 티켓 .md /
// INDEX.json / front-matter 는 절대 건드리지 않는다.
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadArchiveSearchIndex = void 0;
const fs = require("fs");
const path = require("path");
const INDEX_FILE = '.search-index.json';
const INDEX_VERSION = 1;
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
// 'YYYY-MM' 이름이며 현재 년월보다 과거인 디렉토리는 불변으로 간주한다.
// 현재 년월은 nowYearMonth 로 주입받는다(테스트 가능 + Date.now 회피).
function isImmutableMonthDir(dirName, nowYearMonth) {
    return YEAR_MONTH_RE.test(dirName) && dirName < nowYearMonth;
}
async function listMarkdownFiles(dir) {
    let entries = [];
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => path.join(dir, e.name));
}
// 디렉토리 내 .md 들의 (개수 + 최신 mtime) 캐시 키. readdir+stat 만 사용(본문 미오픈).
async function computeDirKey(dir, files) {
    let maxMtime = 0;
    await Promise.all(files.map(async (f) => {
        try {
            const stat = await fs.promises.stat(f);
            if (stat.mtimeMs > maxMtime)
                maxMtime = stat.mtimeMs;
        }
        catch {
            // ignore
        }
    }));
    return `${files.length}:${Math.floor(maxMtime)}`;
}
async function buildDirEntries(dir, files, archiveRoot, parseFrontmatter) {
    const entries = await Promise.all(files.map(async (filePath) => {
        let text = '';
        try {
            text = await fs.promises.readFile(filePath, 'utf8');
        }
        catch {
            return null;
        }
        const { meta, body } = parseFrontmatter(text);
        const base = path.basename(filePath, '.md');
        const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? '';
        return {
            id: (meta.id || base).trim(),
            title: (meta.title || meta.summary || base).trim(),
            summary: (meta.summary || firstLine).trim(),
            status: (meta.status || 'archived').trim(),
            phase: (meta.phase || '4').trim(),
            relPath: path.relative(archiveRoot, filePath),
        };
    }));
    return entries.filter((e) => e !== null);
}
async function readDirIndexFile(dir) {
    try {
        const raw = await fs.promises.readFile(path.join(dir, INDEX_FILE), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === INDEX_VERSION && Array.isArray(parsed.entries)) {
            return parsed;
        }
    }
    catch {
        // missing or malformed -> rebuild
    }
    return null;
}
async function writeDirIndexFile(dir, index) {
    try {
        await fs.promises.writeFile(path.join(dir, INDEX_FILE), JSON.stringify(index), 'utf8');
    }
    catch {
        // best-effort: an unwritable archive dir still works (entries returned in-memory)
    }
}
// 아카이브 디렉토리 1개에 대한 인덱스 엔트리를 반환한다.
// - 불변(지난 월) 디렉토리: .search-index.json 있으면 그대로(재파싱 0). 없으면 1회 생성.
// - 가변 디렉토리: dirKey(개수+mtime) 대조 후 변경 시에만 재파싱.
async function indexArchiveDir(dir, dirName, archiveRoot, nowYearMonth, parseFrontmatter) {
    const immutable = isImmutableMonthDir(dirName, nowYearMonth);
    const existing = await readDirIndexFile(dir);
    if (immutable && existing) {
        // 지난 월은 변경되지 않으므로 키 검증 없이 영구 재사용.
        return existing.entries;
    }
    const files = await listMarkdownFiles(dir);
    if (files.length === 0) {
        return existing?.entries ?? [];
    }
    if (!immutable && existing) {
        const currentKey = await computeDirKey(dir, files);
        if (existing.key === currentKey) {
            return existing.entries;
        }
    }
    const entries = await buildDirEntries(dir, files, archiveRoot, parseFrontmatter);
    const key = immutable ? `immutable:${files.length}` : await computeDirKey(dir, files);
    await writeDirIndexFile(dir, { version: INDEX_VERSION, key, entries });
    return entries;
}
// 아카이브 디렉토리 트리를 순회하며 .md 를 직접 담은 디렉토리들을 찾는다.
async function collectArchiveLeafDirs(archiveRoot) {
    const result = [];
    const stack = [archiveRoot];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current)
            continue;
        let entries = [];
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        const hasMd = entries.some((e) => e.isFile() && e.name.endsWith('.md'));
        if (hasMd) {
            result.push(current);
        }
        for (const e of entries) {
            if (e.isDirectory() && !e.isSymbolicLink()) {
                stack.push(path.join(current, e.name));
            }
        }
    }
    return result;
}
/**
 * 워크스페이스 1개의 아카이브 전체에 대한 검색 인덱스 엔트리를 반환한다.
 * 검색 트리거 시에만 호출된다. 불변 월 디렉토리는 영구 캐시, 가변 디렉토리만 재검증.
 * nowYearMonth 는 'YYYY-MM'(Date.now 회피를 위해 호출측에서 주입).
 */
async function loadArchiveSearchIndex(archiveRoot, nowYearMonth, parseFrontmatter) {
    let rootStat;
    try {
        rootStat = await fs.promises.stat(archiveRoot);
    }
    catch {
        return [];
    }
    if (!rootStat.isDirectory()) {
        return [];
    }
    const leafDirs = await collectArchiveLeafDirs(archiveRoot);
    const perDir = await Promise.all(leafDirs.map((dir) => indexArchiveDir(dir, path.basename(dir), archiveRoot, nowYearMonth, parseFrontmatter)));
    return perDir.flat();
}
exports.loadArchiveSearchIndex = loadArchiveSearchIndex;
//# sourceMappingURL=archiveSearchIndex.js.map