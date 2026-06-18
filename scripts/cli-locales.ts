import { CliOpts, resolveDocsLanguage } from "./cli-utils.js";

const CLI_LOCALES = {
  en: {
    "prompts.init.heading": "DeukAgentFlow init — let's configure your workspace.",
    "prompts.init.workspaceKind": "What kind of workspace is this?",
    "prompts.init.noManagedSurface": "No managed surface file found — will create with markers.",
    "prompts.init.missingMarkers": "Managed surface file exists without managed markers — will append a managed block.",
    "prompts.init.summary.workspaceKind": "Workspace Kind: {{value}}",
    "prompts.init.summary.technicalSurface": "Technical Surface: {{value}}",
    "prompts.init.summary.aiClients": "AI Clients: {{value}}",
    "prompts.init.summary.allSupportedClients": "all supported clients",
    "prompts.init.summary.docsLanguage": "Docs Language: {{value}}",
    "prompts.init.summary.workflowMode": "Workflow Mode: {{value}}",
    "prompts.init.summary.shareTickets": "Share Tickets: {{value}}",
    "prompts.init.summary.shareYes": "Yes (Shared)",
    "prompts.init.summary.shareNo": "No (Private)",
    "prompts.init.summary.contextMcp": "Deuk AgentContext MCP: hidden during init",
    "prompts.init.summary.externalSync": "External Sync: {{value}}",
    "prompts.init.summary.enabled": "Enabled",
    "prompts.init.summary.disabled": "Disabled",
    "prompts.init.summary.syncUrl": "Sync URL: {{value}}",
    "prompts.init.summary.surfaceMode": "Managed Surface: {{value}}",
    "ticket.validation.selfServeRecipe": "Use the self-serve recipe from the printed rules surface: do not ask the user, call help, or search for templates.",
    "ticket.phase.fillSlots": "First fill these slots in the ticket file:",
    "init.migrate.convertedMarkers": "[MIGRATE] Converted legacy HTML markers to heading-based format in managed surface file",
    "init.migrate.backupSaved": "[MIGRATE] Backup saved as {{path}}",
    "init.migrate.dryRunConvertedMarkers": "[DRY-RUN] Would convert legacy HTML markers to heading-based format in managed surface file",
    "init.migrate.replaceLegacyHtmlBlock": "[MIGRATE] {{action}} legacy HTML managed block: {{path}}",
    "init.migrate.replaceLegacyPointer": "[MIGRATE] {{action}} legacy managed pointer: {{path}}",
    "init.cleanup.strippedBlock": "stripped generated managed block",
    "init.cleanup.removedPointer": "removed generated managed pointer",
    "init.cleanup.strippedPointer": "stripped generated managed pointer",
    "init.cleanup.message": "[CLEANUP] {{action}}: {{path}}",
    "init.cleanup.summary": "[SUMMARY] {{action}} {{count}} nested generated managed pointer surface(s) under {{workspace}}.",
    "lint.rules.missingCore": "core rules file not found",
    "lint.rules.printsCurrentBody": "Core rules must state that deuk-agent-flow rules prints the current core rules body."
  },
  ko: {
    "prompts.init.heading": "DeukAgentFlow init — 워크스페이스를 설정합니다.",
    "prompts.init.workspaceKind": "이 워크스페이스 유형은 무엇인가요?",
    "prompts.init.noManagedSurface": "관리 표면 파일이 없어 마커와 함께 생성합니다.",
    "prompts.init.missingMarkers": "관리 표면 파일에 관리 마커가 없어 관리 블록을 추가합니다.",
    "prompts.init.summary.workspaceKind": "워크스페이스 유형: {{value}}",
    "prompts.init.summary.technicalSurface": "기술 표면: {{value}}",
    "prompts.init.summary.aiClients": "AI 클라이언트: {{value}}",
    "prompts.init.summary.allSupportedClients": "지원되는 모든 클라이언트",
    "prompts.init.summary.docsLanguage": "문서 언어: {{value}}",
    "prompts.init.summary.workflowMode": "워크플로우 모드: {{value}}",
    "prompts.init.summary.shareTickets": "티켓 공유: {{value}}",
    "prompts.init.summary.shareYes": "예 (공유)",
    "prompts.init.summary.shareNo": "아니오 (개인)",
    "prompts.init.summary.contextMcp": "Deuk AgentContext MCP: init 중 숨김",
    "prompts.init.summary.externalSync": "외부 동기화: {{value}}",
    "prompts.init.summary.enabled": "활성화",
    "prompts.init.summary.disabled": "비활성화",
    "prompts.init.summary.syncUrl": "동기화 URL: {{value}}",
    "prompts.init.summary.surfaceMode": "관리 표면: {{value}}",
    "ticket.validation.selfServeRecipe": "출력된 rules surface의 self-serve 레시피를 사용하세요. 사용자에게 다시 묻거나 help를 호출하거나 템플릿을 검색하지 마세요.",
    "ticket.phase.fillSlots": "먼저 티켓 파일에 다음 슬롯을 채우세요:",
    "init.migrate.convertedMarkers": "[MIGRATE] legacy HTML 마커를 heading 기반 관리 표면 형식으로 변환했습니다",
    "init.migrate.backupSaved": "[MIGRATE] 백업 저장: {{path}}",
    "init.migrate.dryRunConvertedMarkers": "[DRY-RUN] legacy HTML 마커를 heading 기반 관리 표면 형식으로 변환할 예정입니다",
    "init.migrate.replaceLegacyHtmlBlock": "[MIGRATE] legacy HTML 관리 블록 {{action}}: {{path}}",
    "init.migrate.replaceLegacyPointer": "[MIGRATE] legacy 관리 포인터 {{action}}: {{path}}",
    "init.cleanup.strippedBlock": "생성된 관리 블록 제거",
    "init.cleanup.removedPointer": "생성된 관리 포인터 삭제",
    "init.cleanup.strippedPointer": "생성된 관리 포인터 제거",
    "init.cleanup.message": "[CLEANUP] {{action}}: {{path}}",
    "init.cleanup.summary": "[SUMMARY] {{workspace}} 아래 중첩 생성 관리 포인터 표면 {{count}}개를 {{action}}.",
    "lint.rules.missingCore": "core rules 파일을 찾을 수 없습니다",
    "lint.rules.printsCurrentBody": "Core rules는 deuk-agent-flow rules가 현재 core rules 본문을 출력한다고 명시해야 합니다."
  }
};

export function resolveCliLocale(value = "auto", env = process.env) {
  return resolveDocsLanguage(value, env);
}

export function cliText(key, { locale = "auto", env = process.env, vars = {} } = {}) {
  const resolvedLocale = resolveCliLocale(locale, env);
  const dictionary = CLI_LOCALES[resolvedLocale] || CLI_LOCALES.en;
  const template = dictionary[key] || CLI_LOCALES.en[key] || key;
  return String(template).replace(/\{\{(\w+)\}\}/g, (_match, name) => String(vars[name] ?? ""));
}
