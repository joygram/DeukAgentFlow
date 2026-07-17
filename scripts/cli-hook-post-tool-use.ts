// #904: PostToolUse 훅 핸들러. ticket-status-surface(system:true, bind:rules)는 매 턴
// UserPromptSubmit으로 프롬프트에 상태카드 규율을 주입하지만, 이는 확률적 준수일 뿐
// 구조적 보장이 아니다(에이전트가 응답 종합 시 놓칠 수 있음 — 실증됨). 이 핸들러는
// ticket move/use/create/close 실행 직후 CLI가 이미 stdout에 찍은 상태카드(📦 라인,
// formatTicketFlowLine 정본)를 그대로 추출해 hookSpecificOutput.additionalContext로
// 강제 재주입한다 — 새 텍스트를 짓지 않고 존재하는 라인을 재노출만 한다(DR-03: SSOT는
// formatTicketFlowLine 하나, 이 훅은 그 출력을 다시 읽어 쓸 뿐).
const TICKET_STATE_COMMAND_PATTERN = /\bdeuk-agent-flow\s+ticket\s+(move|use|create|close)\b/;
const FLOW_LINE_PATTERN = /^📦.*$/m;

export function extractTicketStatusCardLine(commandText, toolResponseText) {
  if (!TICKET_STATE_COMMAND_PATTERN.test(String(commandText || ""))) return "";
  const match = FLOW_LINE_PATTERN.exec(String(toolResponseText || ""));
  return match ? match[0] : "";
}

// #934: DR-13 (role-architect/SKILL.md) forbids result-narration in design docs — a rule
// stated once in a skill file degrades over a long edit session the same way the persona
// tone rule did (real session: same failure, caught twice by the user before correction,
// zero structural self-insight from the agent afterward). Design docs live under
// docs/public/architecture/ by convention (role-architect/SKILL.md:18) — this is the only
// reliable signal available (no declarative design-doc marker exists elsewhere yet).
// Mirrors buildPostToolUseHookResponse's exact shape: gate on tool, grep new content,
// inject a warning via additionalContext. Never blocks the edit — nudge, not enforcement.
const DESIGN_DOC_PATH_PATTERN = /docs[\\/]public[\\/]architecture[\\/].*\.md$/;
const RESULT_NARRATION_PATTERN = /검증됨|확인했다|구현\s*완료|실제로\s*동작|실제\s*\d+(\.\d+)?\s*(KB|MB)|이번\s*(작업|티켓)에서/;

export function buildDesignDocComplianceWarning(input) {
  const toolName = input && input.tool_name;
  if (toolName !== "Edit" && toolName !== "Write") return "";
  const filePath = input && input.tool_input && (input.tool_input.file_path || input.tool_input.path);
  if (!filePath || !DESIGN_DOC_PATH_PATTERN.test(String(filePath).replace(/\\/g, "/"))) return "";
  const newContent = input && input.tool_input && (input.tool_input.new_string || input.tool_input.content || "");
  const match = RESULT_NARRATION_PATTERN.exec(String(newContent));
  if (!match) return "";
  return `⚠️ DR-13 compliance: this edit to a design doc (${filePath}) contains result-narration ("${match[0]}") — design docs are direction/structure/contract only, never implementation-result history. Move this to the ticket, not the design doc (role-architect/SKILL.md §WHO, §DON'T).`;
}

export function buildPostToolUseHookResponse(input) {
  const toolName = input && input.tool_name;
  if (toolName === "Bash") {
    const commandText = input && input.tool_input && input.tool_input.command;
    const toolResponseText = input && input.tool_response && input.tool_response.text;
    const flowLine = extractTicketStatusCardLine(commandText, toolResponseText);
    if (!flowLine) return null;
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: flowLine
      }
    };
  }
  const designDocWarning = buildDesignDocComplianceWarning(input);
  if (designDocWarning) {
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: designDocWarning
      }
    };
  }
  return null;
}

export function runHookPostToolUse(stdinText) {
  let input;
  try {
    input = JSON.parse(stdinText);
  } catch {
    return "";
  }
  const response = buildPostToolUseHookResponse(input);
  return response ? JSON.stringify(response) : "";
}
