import { CliOpts, toSnakeCaseKey } from "./cli-utils.js";
// #875: 실행증거 헤딩 SSOT. slots.ts가 이 모듈을 import하지만, 아래 참조는 모두 함수
// 본문(지연 평가)이라 순환 로드 시 TDZ가 나지 않는다.
import { EVIDENCE_SECTION_SLOTS } from "./cli-ticket-evidence-slots.js";
// #691 follow-up: content-completion 검증기는 500줄 Refactor Gate(#870) 때문에
// cli-ticket-evidence-quality.ts로 분리했다. 여기서 재-export해 기존
// `from "./cli-ticket-evidence.js"` import 경로를 그대로 유지한다.
import {
  isSubstantiveDecisionText,
  isSubstantiveExecutionText,
  isDocsReflectedVerified
} from "./cli-ticket-evidence-quality.js";

export function hasPlaceholderTokens(text) {
  const lines = String(text || "")
    .split("\n")
    .map(line => line.trim().toLowerCase())
    .filter(Boolean);

  return lines.some(line => {
    const normalized = line
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    return /^\[(?:add|fill)[^\]]*\]$/.test(normalized)
      || /^<[^>]*(?:placeholder|todo|tbd|fill|add)[^>]*>$/.test(normalized)
      || /^(?:placeholder|todo|tbd)$/.test(normalized);
  });
}

export const ANALYSIS_DESIGN_SECTION_REQUIREMENTS = [
  {
    section: "Analysis",
    reason: "analysis_missing",
    scaffolds: [
      "Record root-cause analysis, relevant file:line evidence, and hypotheses here."
    ]
  },
  {
    section: "Direction",
    reason: "direction_missing",
    scaffolds: [
      "Record the proposed fix direction or follow-up design path."
    ]
  }
];

export const REQUIRED_PHASE1_SECTIONS = [
  "Scope",
  "Plan",
  "Analysis",
  "Direction"
];

// G1+G2 (phase1-design-env-sections.md): 설계기반흐름이 요구하는 Design·Environment
// 섹션. 하위호환을 위해 REQUIRED_PHASE1_SECTIONS에 넣지 않는다 — 그러면 기존 4섹션
// 티켓 .md가 즉시 미충족으로 판정돼 진행 중 티켓이 전부 막힌다(대안A 기각). 대신
// create 경로에서만 신규 강제하고, validate는 "섹션이 있으면 검증, 없으면 구 스키마
// 면제"로 관대하게 다룬다.
export const PHASE1_DESIGN_ENV_SECTIONS = [
  "Design",
  "Environment"
];

// 신규 스키마 티켓의 전체 phase1 섹션 순서(create 스켈레톤/헤딩용). 정의 SSOT는
// 여전히 위 두 배열이며, 소비처는 이 함수를 순회해 자동 반영한다(하드코딩 금지, DR-03).
export function phase1SectionsForCreate() {
  return [
    REQUIRED_PHASE1_SECTIONS[0], // Scope
    ...PHASE1_DESIGN_ENV_SECTIONS,
    ...PHASE1_DATA_SECTIONS
  ];
}

export const REQUIRED_APC_MARKERS = [];

const PHASE1_DATA_SECTIONS = [
  "Plan",
  "Analysis",
  "Direction"
];

function dataSectionsForType(_type = "") {
  return [...PHASE1_DATA_SECTIONS];
}

const FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS = [
  /\bno[- ]follow[- ]up\b/i,
  /\bfollow[- ]up\s*:\s*none\b/i,
  /\bno further action\b/i,
  /\bnone required\b/i,
  /후속(?:\s+작업)?\s*(?:없음|불필요)/,
  /추가(?:\s+작업)?\s*(?:없음|불필요)/
];

export function parseMarkdownH2Sections(content) {
  const lines = String(content || "").split("\n");
  const sections = new Map();
  let currentHeading = "";
  let buffer = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.set(currentHeading, buffer.join("\n").trim());
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }
    if (currentHeading) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

const PHASE1_HEADING_ALIASES = new Map([
  // #806: 정본명은 "Scope". 아래는 옛 이름·약어 하위호환 alias(기존 티켓 호환).
  ["apc", "Scope"],
  ["agent permission contract", "Scope"],
  ["agent permission contract (apc)", "Scope"],
  ["scope & approval", "Scope"],
  ["compact plan", "Plan"],
  ["problem analysis", "Analysis"],
  ["source observations", "Analysis"],
  ["cause hypotheses", "Analysis"],
  ["audit evidence", "Analysis"],
  ["improvement direction", "Direction"],
  ...REQUIRED_PHASE1_SECTIONS.map(section => [section.toLowerCase(), section] as [string, string])
]);

export function normalizePhase1PlanBodyHeadings(body) {
  return String(body || "").split("\n").map((line) => {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) return line;
    const normalized = PHASE1_HEADING_ALIASES.get(match[1].trim().toLowerCase());
    return normalized ? `## ${normalized}` : line;
  }).join("\n");
}

export function extractMarkdownSection(content, heading) {
  return parseMarkdownH2Sections(content).get(String(heading || "").trim()) || "";
}

function extractMarkdownSectionByAliases(content, aliases) {
  const sections = parseMarkdownH2Sections(content);
  for (const alias of aliases) {
    const value = sections.get(String(alias || "").trim());
    if (value !== undefined) return value;
  }
  return "";
}

export function hasSubstantiveSectionContent(text, scaffolds = []) {
  const src = String(text || "").trim();
  if (!src || hasPlaceholderTokens(src)) return false;
  const normalized = src.replace(/\s+/g, " ");
  return !scaffolds.some(phrase => normalized.includes(phrase));
}

function hasApcMarker(text, marker) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerPattern = new RegExp(`^\\s*(?:#{1,6}\\s+)?${escapedMarker}(?:\\s|$)`);
  return String(text || "").split("\n").some(line => markerPattern.test(line));
}

function getApcContentWithoutMarkers(text) {
  return String(text || "")
    .split("\n")
    .map(line => {
      for (const { marker } of REQUIRED_APC_MARKERS) {
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const markerPattern = new RegExp(`^\\s*(?:#{1,6}\\s+)?${escapedMarker}\\s*`);
        if (markerPattern.test(line)) return line.replace(markerPattern, "");
      }
      return line;
    })
    .join("\n")
    .trim();
}

function getMissingApcFields(text) {
  return REQUIRED_APC_MARKERS
    .filter(({ marker }) => !hasApcMarker(text, marker))
    .map(field => field.name);
}

// 미충족 플레이스홀더 스캔. 템플릿(templates/TICKET_TEMPLATE.*.md)의 채워야 할 자리는
// {{ ... }} 로 표기된다. 에이전트가 템플릿을 복사해 각 {{ }}를 실제 내용으로 치환하면
// 본문에 {{ }}가 하나도 남지 않는다. 남아 있으면 그 자리는 아직 안 채워진 것이다.
// design-driven-flow.md §6.0: 마크다운을 정규식으로 파싱해 헤딩 존재·substantive를
// 판정하던 근거 자체가 틀렸다(마크다운 프레임워크 변형으로 매번 오탐). 새 계약은 "구조는
// 템플릿이 이미 보장하고, 게이트는 {{ }} 미충족만 본다"이다.
const UNFILLED_PLACEHOLDER_RE = /\{\{([^}]*)\}\}/g;

export function getUnfilledPlaceholders(body) {
  const found = [];
  let m;
  UNFILLED_PLACEHOLDER_RE.lastIndex = 0;
  while ((m = UNFILLED_PLACEHOLDER_RE.exec(String(body || ""))) !== null) {
    found.push(m[1].trim());
  }
  return found;
}

export function getPhase1PlanBodyReasons(body, _opts: CliOpts = {}) {
  // 채워야 할 {{ }} 자리가 하나라도 남아 있으면 미완성이다. 남은 자리의 앞부분을 사유로
  // 실어 "어느 섹션이 비었는지"를 이름으로 알린다(정규식 마크다운 파싱 없음).
  const unfilled = getUnfilledPlaceholders(body);
  return unfilled.map(hint => {
    const label = hint.split(/[:.]/)[0].trim().slice(0, 40) || "placeholder";
    return `unfilled_placeholder: ${label}`;
  });
}

export function phase1SectionsForType(_type = "") {
  return [REQUIRED_PHASE1_SECTIONS[0], ...dataSectionsForType()];
}

export function getAnalysisDesignIncompleteReasons(meta, content) {
  const reasons = [];
  for (const requirement of ANALYSIS_DESIGN_SECTION_REQUIREMENTS) {
    if (!hasSubstantiveSectionContent(extractMarkdownSection(content, requirement.section), requirement.scaffolds)) {
      reasons.push(requirement.reason);
    }
  }

  return reasons;
}

export function hasSubstantiveFollowUpDecision(content) {
  return hasSubstantiveSectionContent(extractMarkdownSection(content, "Follow-up Decision"), []);
}

export function followUpDecisionMeansNoFollowUp(content) {
  const text = extractMarkdownSection(content, "Follow-up Decision");
  if (!hasSubstantiveSectionContent(text, [])) return false;
  return FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(text));
}

export function hasTicketCompletionEvidence(content) {
  return hasSubstantiveSectionContent(extractMarkdownSection(content, "Completion Report"), [])
    || hasSubstantiveSectionContent(extractMarkdownSection(content, "Verification Outcome"), [])
    || followUpDecisionMeansNoFollowUp(content);
}

// phase3 진입은 실행 증거로만 통과한다. 인정 헤딩은 executionEvidence 슬롯 정의(SSOT)에서
// 파생한다 — 별도 게이트인 Docs Reflected는 제외(meetsDocsReflectedGate가 따로 검사).
// #875: 과거엔 "실행 슬롯"/"Execution Slots" 헤딩만 봤는데, move가 실제로 주입하는 헤딩은
// Reproduction/Verification Command/Result 이라 전혀 매칭되지 않았고, Analysis 폴백이 그
// 미스매치를 가려 모든 티켓이 폴백으로만 통과했다. 폴백을 제거하니(No-Fallback Gate) 깨진
// 로직이 드러나 여기서 실제 헤딩을 인식하도록 정정한다.
function phase2ExecutionEvidenceHeadings() {
  return EVIDENCE_SECTION_SLOTS.executionEvidence
    .map(slot => slot.heading)
    .filter(heading => heading !== "Docs Reflected");
}

export function hasPhase2ExecutionEvidence(content) {
  const body = String(content || "");
  for (const heading of phase2ExecutionEvidenceHeadings()) {
    if (hasSubstantiveSectionContent(extractMarkdownSection(body, heading), [])) return true;
  }
  return false;
}

// #808: SSOT for the evidence sections each phase transition injects into the ticket
// .md body. `move` accepts a CLI flag per slot (symmetric to `create`'s
// --scope/--plan/--analysis/--direction) so the agent never hand-edits the .md to
// satisfy the phase3→4 / phase2→3 gates. The canonical H2 heading + the CLI flag name
// live here once; both the arg parser surface and the move injector derive from this
// map so heading text and flag names can never drift apart. Headings mirror the phase
// state-template slots (docs/cli-surfaces/state-template/phase{3,4}.*.md).
//
// Keyed by the workflow transition's required-evidence key (ticket-workflow.ts
// requiredEvidence). Each slot: optsKey = the parsed CliOpts field, heading = the
// canonical H2 section the value is written under.
// docsync-transition-gate.md §4.2: 신규 스키마 티켓(phase1에 Design 섹션을 가진 티켓)은
// phase2→3 전이에서 "Docs Reflected"를 필수로 요구한다. 구 스키마 티켓(Design 섹션 없음)은
// 슬롯 부재 시 면제 — 진행 중 티켓이 갑자기 막히지 않는다(G1+G2 동형 하위호환).
export function isNewSchemaTicket(content) {
  const sections = parseMarkdownH2Sections(String(content || ""));
  return sections.has(PHASE1_DESIGN_ENV_SECTIONS[0]); // "Design"
}

export function hasDocsReflected(content) {
  return hasSubstantiveSectionContent(
    extractMarkdownSection(String(content || ""), "Docs Reflected"),
    []
  );
}

// #691 follow-up: design-driven-flow.md §6.0 Analysis절이 명시한 결함 — 과거
// meetsDocsReflectedGate는 "섹션이 비지 않음"만 봤다("Docs Reflected" 섹션 존재 검사).
// 이는 완주를 위장한다: "문서 갱신함"이라는 한 줄 문장은 실제로 아무 문서도 안 고쳐도
// 통과한다. 이제 섹션에 언급된 문서/파일 경로가 실제로 git상 변경됐거나 존재하는지
// 대조해 "산출-입력 성립"을 판정한다(대조 로직은 cli-ticket-evidence-quality.ts).
export function hasVerifiedDocsReflected(content, cwd) {
  if (!hasDocsReflected(content)) return false;
  const docsReflectedText = extractMarkdownSection(String(content || ""), "Docs Reflected");
  return isDocsReflectedVerified(cwd, docsReflectedText);
}

// phase2→3 전이가 문서반영 요건을 충족하는가. 신규 스키마면 Docs Reflected 필수(내용 대조
// 포함), 구 스키마면 항상 통과(면제).
export function meetsDocsReflectedGate(content, cwd = "") {
  if (!isNewSchemaTicket(content)) return true;
  return hasVerifiedDocsReflected(content, cwd);
}

// design-driven-flow.md §6.0.4: 게이트가 막혔을 때 "왜"를 관측 가능하게 준다. executionEvidence는
// 두 하위조건(실행 슬롯 + Docs Reflected 대조)의 AND라, 단일 "execution_evidence_missing"만
// 내면 에이전트가 무엇이 부족한지 몰라 플래그/바디를 추측하며 삽질한다. 어느 조건이 왜 막혔는지
// 구체 문장을 반환한다. 통과면 빈 배열.
export function diagnoseExecutionEvidence(content, cwd = ""): string[] {
  const body = String(content || "");
  const reasons: string[] = [];
  if (!hasPhase2ExecutionEvidence(body)) {
    reasons.push(
      "실행 증거 슬롯이 비었거나 부실합니다 — --reproduction(재현 조건) --verification-command(실제 실행한 명령) --result(그 명령의 실제 출력)을 실질 내용으로 채우세요. 플래그 이름이 아니라 '무엇을 돌려 무엇이 나왔는지'가 실려야 합니다."
    );
  }
  if (isNewSchemaTicket(body) && !hasVerifiedDocsReflected(body, cwd)) {
    if (!hasDocsReflected(body)) {
      reasons.push(
        "Docs Reflected가 비었습니다 — --docs-reflected에 이 변경으로 실제 고친 설계/분석 문서 경로를 적으세요(신규 스키마 티켓 필수)."
      );
    } else {
      reasons.push(
        "Docs Reflected에 적은 문서가 실제로 확인되지 않습니다 — 언급한 문서 경로가 git 변경 목록에 있거나 저장소에 존재해야 통과합니다. 문장만 적지 말고 실제 고친 문서의 실재 경로를 적으세요(§6.0 위장 통과 방지)."
      );
    }
  }
  return reasons;
}

// #691 follow-up: phase3(QA) → phase4 전이의 code↔design 대조. 티켓 Scope/Design
// 섹션이 언급한 파일이 실제로 git상 변경됐거나 존재하는지 확인한다 — QA state의 서브 FSM
// Evidence slots & phase-transition assembly moved to cli-ticket-evidence-slots.ts to
// keep this module under the 500-line Refactor Gate (#870). Re-exported here so every
// existing `from "./cli-ticket-evidence.js"` import keeps working unchanged.
// EVIDENCE_SECTION_SLOTS is imported above (used by hasPhase2ExecutionEvidence) and
// re-exported here so consumers keep their existing import path.
export { EVIDENCE_SECTION_SLOTS };
export { isSubstantiveDecisionText, isSubstantiveExecutionText };
export {
  DECISION_EVIDENCE_FLAGS,
  getEvidenceSlotFlagSpecs,
  getEvidenceFlagSpecsForTargetState,
  evidenceFlagsForEvidenceKey,
  evidenceFlagForSlotHeading,
  buildEvidenceSectionsForTransition,
  mergeH2SectionsIntoBody,
  buildSlotStatusSummary,
  getCloseWorkflowReasons,
  resolveTicketType,
  TICKET_TYPES,
  buildRequiredFlagsGuideText
} from "./cli-ticket-evidence-slots.js";
