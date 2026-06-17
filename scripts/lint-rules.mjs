import { existsSync, readFileSync } from "fs";
import { join } from "path";

const RULE_CHECKS = [
  {
    code: "DR-KERNEL-01",
    message: "Compact kernel must keep ticket-first and tool-contract invariants at the top of the core rules.",
    test: (rules) => /## Compact Kernel/i.test(rules)
      && /Tools own detail/i.test(rules)
      && /No ticket, no writes/i.test(rules)
      && /Every phase must request and satisfy the tool-provided contract/i.test(rules)
      && /Phase state has two records/i.test(rules)
      && /Verification is mandatory/i.test(rules)
      && /never bypass ticket, scope, generated-file, or verification gates/i.test(rules)
  },
  {
    code: "DR-TOKEN-01",
    message: "Low-token mode must stay quiet and compact.",
    test: (rules) => /Silent-by-default is mandatory/i.test(rules)
      && /Keep chat compact/i.test(rules)
      && /Final answers must be short but complete enough/i.test(rules)
      && /짧게|매우 짧게|한 줄로|간단히/i.test(rules)
      && /one-sentence or bullet-only/i.test(rules)
      && /avoid repeating them in chat/i.test(rules)
  },
  {
    code: "DR-PRIORITY-01",
    message: "Rules must define pointer/core/project instruction precedence.",
    test: (rules) => /## 0\. Priority/i.test(rules)
      && /Global DeukAgentRules pointer/i.test(rules)
      && /Local generated pointer\/spoke/i.test(rules)
      && /core-rules\/AGENTS\.md/i.test(rules)
      && /PROJECT_RULE\.md/i.test(rules)
  },
  {
    code: "DR-BOOT-01",
    message: "Boot sequence must load core rules, project rules, and ticket context.",
    test: (rules) => /Boot Sequence \(run once\)/i.test(rules)
      && /Read this file \(AGENTS\.md\)/i.test(rules)
      && /Read `PROJECT_RULE\.md`/i.test(rules)
      && /set_workflow_context\(project, ticket_id, phase\)/i.test(rules)
      && /clickable ticket-start line/i.test(rules)
  },
  {
    code: "DR-TICKET-01",
    message: "First-turn and discovery behavior must stay ticket-first.",
    test: (rules) => /First-Turn Invariant/i.test(rules)
      && /Ticket Discovery \(1-CALL RULE\)/i.test(rules)
      && /create the ticket first/i.test(rules)
      && /Do not use `ticket list` for discovery/i.test(rules)
  },
  {
    code: "DR-CHANGE-01",
    message: "Phase contract must require tool-provided requirements and block shortcuts.",
    test: (rules) => /Phase Contract/i.test(rules)
      && /complete requirement bundle/i.test(rules)
      && /Required ticket fields\/tasks/i.test(rules)
      && /Scope boundaries, generated\/source mapping/i.test(rules)
      && /Do not invent a shortcut/i.test(rules)
  },
  {
    code: "DR-LIFECYCLE-01",
    message: "Lifecycle must cover phases, durable records, and compact chat.",
    test: (rules) => /Ticket Lifecycle/i.test(rules)
      && /Phase 0/i.test(rules)
      && /Phase 4/i.test(rules)
      && /findings, hypotheses, scope, compact plan, and phase contract/i.test(rules)
      && /affected files, and residual risk/i.test(rules)
      && /Keep chat compact once the ticket carries the durable record/i.test(rules)
  },
  {
    code: "DR-GATE-01",
    message: "Hard stops must block missing contracts, unsafe scope, and premature execution.",
    test: (rules) => /Hard Stops/i.test(rules)
      && /missing phase contract/i.test(rules)
      && /generated\/source uncertainty/i.test(rules)
      && /shared-interface changes/i.test(rules)
      && /read-only until the ticket records findings/i.test(rules)
  },
  {
    code: "DR-HALT-01",
    message: "Kernel must still define halt conditions and file guards.",
    test: (rules) => /Hard Stops/i.test(rules)
      && /generated\/source uncertainty/i.test(rules)
      && /missing tests/i.test(rules)
  },
  {
    code: "DR-CHURN-01",
    message: "Repeated symptom fixes must trigger stabilization instead of ticket churn.",
    test: (rules) => /Hard Stops/i.test(rules)
      && /stabilization or root-cause ticket/i.test(rules)
      && /same failure family/i.test(rules)
  },
  {
    code: "DR-CLI-01",
    message: "Tool delegation and CLI ownership must stay explicit.",
    test: (rules) => /Tool Delegation/i.test(rules)
      && /Use `rg`\/`rg --files` first/i.test(rules)
      && /Use MCP\/RAG only when local evidence is insufficient/i.test(rules)
      && /Let CLI own lifecycle enforcement, claim checks, reports, and audits/i.test(rules)
      && /rules audit/i.test(rules)
  }
];

export function auditRules(cwd = process.cwd()) {
  const rulesPath = join(cwd, "core-rules", "AGENTS.md");
  if (!existsSync(rulesPath)) {
    return {
      ok: false,
      path: rulesPath,
      violations: [{ code: "DR-RULES-00", message: "core-rules/AGENTS.md not found" }]
    };
  }

  const rules = readFileSync(rulesPath, "utf8");
  const violations = RULE_CHECKS
    .filter((check) => !check.test(rules))
    .map(({ code, message }) => ({ code, message }));

  return { ok: violations.length === 0, path: rulesPath, violations };
}

export function runRulesAudit(opts = {}) {
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
