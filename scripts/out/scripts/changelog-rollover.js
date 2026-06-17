import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePath, resolvePackageRoot } from "./cli-utils.js";
const CHANGELOG_FILES = ["CHANGELOG.md", "CHANGELOG.ko.md"];
const VERSION_HEADER_RE = /^## \[(.+?)\](?:\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2}))?$/;
export function hasRealEntries(sectionLines) {
    return sectionLines.some((line) => {
        const text = line.trim();
        if (!text.startsWith("-")) {
            return false;
        }
        return !isUnreleasedPlaceholder(text);
    });
}
export function isUnreleasedPlaceholder(line) {
    return line === "- _Nothing to release yet._" || line === "- _미공개 누적 변경 없음._";
}
export function readPreviousFile(rootDir, fileName) {
    const content = execFileSync("git", ["show", `HEAD:${fileName}`], {
        cwd: rootDir,
        encoding: "utf8"
    });
    return content;
}
function normalizeBody(lines) {
    const filtered = [];
    for (const line of lines) {
        if (isUnreleasedPlaceholder(line.trim())) {
            continue;
        }
        filtered.push(line);
    }
    let start = 0;
    while (start < filtered.length && filtered[start].trim() === "") {
        start++;
    }
    let end = filtered.length;
    while (end > start && filtered[end - 1].trim() === "") {
        end--;
    }
    return filtered.slice(start, end);
}
function splitSectionIndexes(lines) {
    const headers = [];
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(VERSION_HEADER_RE);
        if (!match) {
            continue;
        }
        headers.push({ name: match[1], start: i });
    }
    return headers.map((section, idx) => ({
        ...section,
        end: idx + 1 < headers.length ? headers[idx + 1].start : lines.length
    }));
}
function pickSection(sections, name) {
    const index = sections.findIndex((section) => section.name === name);
    if (index < 0) {
        return null;
    }
    return { ...sections[index], index };
}
function buildVersionBlock(sourceBlock, version, date, keepHeader = null) {
    const header = keepHeader || `## [${version}] - ${date}`;
    const normalized = normalizeBody(sourceBlock.slice(1));
    return normalized.length === 0
        ? [header]
        : [header, "", ...normalized];
}
function updateChangelog(rootDir, fileName, version, date) {
    const filePath = makePath(rootDir, fileName);
    const currentText = readFileSync(filePath, "utf8");
    const previousText = readPreviousFile(rootDir, fileName);
    const currentLines = currentText.split("\n");
    const previousLines = previousText.split("\n");
    const currentSections = splitSectionIndexes(currentLines);
    const previousSections = splitSectionIndexes(previousLines);
    const unreleasedSection = pickSection(previousSections, "Unreleased");
    if (!unreleasedSection) {
        return false;
    }
    const unreleasedBlock = previousLines.slice(unreleasedSection.start, unreleasedSection.end);
    const hasPending = hasRealEntries(unreleasedBlock.slice(1));
    if (!hasPending) {
        return false;
    }
    const versionSection = pickSection(currentSections, version);
    const normalizedPending = normalizeBody(unreleasedBlock.slice(1));
    if (normalizedPending.length === 0) {
        return false;
    }
    const desiredBlock = buildVersionBlock(unreleasedBlock, version, date, versionSection && currentLines[versionSection.start]);
    if (versionSection) {
        const versionLines = currentLines.slice(versionSection.start, versionSection.end);
        if (hasRealEntries(versionLines)) {
            return false;
        }
        const next = currentLines.slice(0, versionSection.start);
        const after = currentLines.slice(versionSection.end);
        const normalizedDesired = [...desiredBlock];
        if (next.length && next[next.length - 1].trim() !== "") {
            next.push("");
        }
        if (after.length && after[0].trim() !== "") {
            after.unshift("");
        }
        writeFileSync(filePath, [...next, ...normalizedDesired, ...after].join("\n"));
        return true;
    }
    const unreleasedIdx = pickSection(currentSections, "Unreleased");
    if (!unreleasedIdx) {
        return false;
    }
    const after = currentLines.slice(unreleasedIdx.end);
    const before = currentLines.slice(0, unreleasedIdx.end);
    if (before.length && before[before.length - 1].trim() !== "") {
        before.push("");
    }
    if (after.length && after[0].trim() !== "") {
        after.unshift("");
    }
    writeFileSync(filePath, [...before, ...desiredBlock, ...after].join("\n"));
    return true;
}
export function syncChangelogRollovers({ rootDir = process.cwd(), version = undefined, date = undefined } = {}) {
    const today = date || new Date().toISOString().slice(0, 10);
    if (!version) {
        const rootPkg = JSON.parse(readFileSync(makePath(rootDir, "package.json"), "utf8"));
        version = rootPkg.version;
    }
    let changed = false;
    for (const fileName of CHANGELOG_FILES) {
        try {
            changed = updateChangelog(rootDir, fileName, version, today) || changed;
        }
        catch (error) {
            if (process.env.NODE_ENV === "test") {
                throw error;
            }
            // best-effort in non-test paths; preserve existing release flow even if one changelog drifts.
        }
    }
    return changed;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    syncChangelogRollovers({ rootDir: resolvePackageRoot({ fromUrl: import.meta.url }) });
}
//# sourceMappingURL=changelog-rollover.js.map