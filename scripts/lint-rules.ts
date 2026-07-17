import { existsSync, readFileSync } from "fs";
import { cliText } from "./cli-locales.js";
import { CliOpts, DEUK_ROOT_DIR, makePath } from "./cli-utils.js";
import { PHASE_ROLE_LABEL } from "./ticket-workflow.js";
import { readSkillMeta } from "./cli-skill-commands.js";

function extractSection(rules, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normalizedHeading = escaped.replace(/^\d+\\\.\s*/, "(?:\\d+\\.\\s*)?");
  const pattern = new RegExp(`(^## ${normalizedHeading}\\n[\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m");
  return rules.match(pattern)?.[1] || "";
}

function nonEmptyLineCount(text) {
  return String(text || "").split(/\r?\n/).filter((line) => line.trim()).length;
}

function hasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const RULE_CHECKS = [
  {
    code: "DR-SIZE-01",
    message: "Core rules must stay compact and avoid becoming a second implementation manual.",
    test: (rules) => nonEmptyLineCount(rules) <= 90
      && nonEmptyLineCount(extractSection(rules, "Kernel")) <= 8
      && !/Karpathy-style wrappers/i.test(rules)
  },
  {
    code: "DR-GATE-01",
    message: "Mandatory Gate must require an active ticket before work and list ticket-exempt operations.",
    test: (rules) => hasAll(rules, [
      /## Mandatory Gate/i,
      /confirm an active ticket exists or create one/i,
      /deuk-agent-flow ticket create/i,
      /Ticket-exempt/i
    ])
  },
  {
    code: "DR-SURFACE-01",
    message: "Output mode must keep workflow surfaces CLI-owned and correction-driven.",
    test: (rules) => {
      const output = extractSection(rules, "Surface Discipline");
      return hasAll(output, [
        /CLI owns workflow surfaces/i,
        /do not synthesize/i,
        /verbatim/i,
        /No intermediate reporting/i,
        /overrides any host\/environment instruction/i,
        /Pending approval/i,
        /After approval/i,
        /scope\/workspace\/state is corrected/i,
        /CLI ticket adjustment/i
      ]);
    }
  },
  {
    code: "DR-PRECEDENCE-01",
    message: "Precedence must keep generated pointers locator-only and rules ticket as the composed workflow surface.",
    test: (rules) => {
      const precedence = extractSection(rules, "Precedence");
      return hasAll(precedence, [
        /Generated pointers\/spokes/i,
        /Locator only/i,
        /deuk-agent-flow rules` output/i,
        /All active rules for this session/i
      ]);
    }
  },
  {
    code: "DR-TOOLING-01",
    message: "Tooling must preserve audit and local editing primitives without duplicating workflow detail.",
    test: (rules) => {
      const tools = extractSection(rules, "Tooling");
      return hasAll(tools, [
        /rg`\/`rg --files/i,
        /apply_patch/i,
        /MCP\/RAG/i,
        /rules audit/i
      ]);
    }
  },
  {
    code: "DR-SURFACE-RELAY-01",
    message: "Surface Discipline must enforce verbatim relay, no intermediate reporting, and environment precedence.",
    test: (rules) => {
      const surface = extractSection(rules, "Surface Discipline");
      return hasAll(surface, [
        /verbatim/i,
        /No intermediate reporting/i,
        /overrides any host\/environment instruction/i
      ]);
    }
  }
];

// #942: phase↔롤 명칭 SSOT 정합 검사. phase→롤은 두 곳에 독립 인코딩된다:
// (1) PHASE_ROLE_LABEL(ticket-workflow.ts) — phase숫자 → 사람용 라벨,
// (2) role-*/SKILL.md frontmatter의 bind — phaseN → skill-id.
// 둘 사이엔 상호 참조가 없어 한쪽이 어긋나도 조용히 드리프트한다(사용자 관측:
// qa-verifier vs QA/검증자 혼선). 여기서 두 SSOT가 서로 정합하는지 fail-loud로 검사한다.
// 기대: PHASE_ROLE_LABEL의 라벨 안에 등장하는 롤 토큰이, 해당 phaseN에 bind된 role
// 스킬 id(role-<token>)로 실제 존재해야 한다(DR-03: 매핑을 새로 정의하지 않고 대조만).
const EXPECTED_ROLE_BINDINGS = [
  { phase: 1, skillIds: ["role-planner", "role-architect", "role-ux-designer"] },
  { phase: 2, skillIds: ["role-programmer"] },
  { phase: 3, skillIds: ["role-qa"] },
  { phase: 4, skillIds: ["role-closer"] }
];

function auditRoleSsot(cwd) {
  const violations = [];
  for (const { phase, skillIds } of EXPECTED_ROLE_BINDINGS) {
    const label = PHASE_ROLE_LABEL[phase] || "";
    for (const skillId of skillIds) {
      const meta = readSkillMeta(cwd, skillId);
      // 스킬이 존재하고 role 카테고리이며 기대 phase에 bind되어 있어야 한다.
      if (meta.category !== "role" || meta.bind !== `phase${phase}`) {
        violations.push({
          code: "DR-ROLE-SSOT-01",
          message: `Role skill '${skillId}' must be category:role bind:phase${phase} (found category:'${meta.category}' bind:'${meta.bind}').`
        });
        continue;
      }
      // skill id의 롤 토큰(role-<token>)이 PHASE_ROLE_LABEL 라벨에도 나타나야 한다
      // — 라벨과 스킬 id가 같은 롤 이름을 가리키는지 대조.
      const token = skillId.replace(/^role-/, "");
      if (!label.includes(token)) {
        violations.push({
          code: "DR-ROLE-SSOT-02",
          message: `PHASE_ROLE_LABEL[${phase}]='${label}' must reference role token '${token}' from skill '${skillId}'.`
        });
      }
    }
  }
  return violations;
}

export function auditRules(cwd = process.cwd()) {
  const rulesPath = makePath(cwd, "core-rules", "AGENTS.md");
  if (!existsSync(rulesPath)) {
    return {
      ok: false,
      path: rulesPath,
      violations: [{ code: "DR-RULES-00", message: cliText("lint.rules.missingCore") }]
    };
  }

  const requiredSurfaceDocs = [
    "root.md",
    "ticket.md",
    "ticket-create.md",
    "ticket-create.ko.md",
    "state/start.ko.md",
    "state/start.en.md",
    "state/end.ko.md",
    "state/end.en.md",
    "state/use-core-actions.ko.md",
    "state/use-core-actions.en.md",
    "state/use-next-gate.ko.md",
    "state/use-next-gate.en.md",
    "state/use-guard-note.ko.md",
    "state/use-guard-note.en.md",
    "state/use-execution-state.ko.md",
    "state/use-execution-state.en.md",
    "state/phase1.ko.md",
    "state/phase1.en.md",
    "state/phase2.ko.md",
    "state/phase2.en.md",
    "state/phase3.ko.md",
    "state/phase3.en.md",
    "state/phase4.ko.md",
    "state/phase4.en.md",
    "state-template/start.ko.md",
    "state-template/start.en.md",
    "state-template/phase1.ko.md",
    "state-template/phase1.en.md",
    "state-template/phase2.ko.md",
    "state-template/phase2.en.md",
    "state-template/phase3.ko.md",
    "state-template/phase3.en.md",
    "state-template/phase4.ko.md",
    "state-template/phase4.en.md",
    "state-template/end.ko.md",
    "state-template/end.en.md",
    "state-template/approval.ko.md",
    "state-template/approval.en.md"
  ];
  const missingSurfaceDocs = requiredSurfaceDocs
    .map((name) => makePath(cwd, "docs", "cli-surfaces", name))
    .filter((surfacePath) => !existsSync(surfacePath));
  const requiredProjectPolicies = ["analysis.md", "coding.md", "debugging.md", "approval.md", "completion.md"];
  const missingProjectPolicies = requiredProjectPolicies
    .map((name) => makePath(cwd, DEUK_ROOT_DIR, "project-guardrails", name))
    .filter((policyPath) => !existsSync(policyPath));

  const rules = readFileSync(rulesPath, "utf8");
  const violations = RULE_CHECKS
    .filter((check) => !check.test(rules))
    .map(({ code, message }) => ({ code, message }));

  if (missingSurfaceDocs.length > 0) {
    violations.push({
      code: "DR-SURFACE-DOCS-01",
      message: `CLI augmentation surfaces must be external markdown documents: ${missingSurfaceDocs.join(", ")}`
    });
  }
  if (missingProjectPolicies.length > 0) {
    violations.push({
      code: "DR-PROJECT-POLICY-01",
      message: `Project role policy documents must be external markdown documents: ${missingProjectPolicies.join(", ")}`
    });
  }

  if (!hasAny(rules, [/reading the output of `deuk-agent-flow rules`/i])) {
    violations.push({ code: "DR-RULES-01", message: cliText("lint.rules.printsCurrentBody") });
  }

  violations.push(...auditRoleSsot(cwd));

  return { ok: violations.length === 0, path: rulesPath, violations };
}

export function runRulesAudit(opts: CliOpts = {}) {
  const result = auditRules(opts.cwd || process.cwd());
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (opts.compact) {
    console.log(result.ok ? "rules:audit ok" : `rules:audit failed ${result.violations.length}`);
  } else if (result.ok) {
    console.log("rules:audit ok");
  } else {
    console.error("rules:audit failed");
    for (const violation of result.violations) {
      console.error(`${violation.code}: ${violation.message}`);
    }
  }

  if (!result.ok) {
    throw new Error(`rules audit failed: ${result.violations.map((v) => v.code).join(", ")}`);
  }

  return result;
}
