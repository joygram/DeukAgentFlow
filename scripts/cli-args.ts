// Parse a phase token from --phase/--to. Accepts "2", "phase2", "phase 2", "end", "start".
// Returns NaN when no digit is present and not a known named state so callers can detect
// a malformed value (e.g. "--to phaseX") instead of silently advancing. (#635)
const NAMED_PHASE_MAP = { start: 1, phase1: 1, phase2: 2, phase3: 3, phase4: 4, end: 4 };
function parsePhaseToken(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (NAMED_PHASE_MAP[s] !== undefined) return NAMED_PHASE_MAP[s];
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

export function parseTicketArgs(argv) {
  const invocationCwd = process.cwd();
  const out: Record<string, any> = { cwd: invocationCwd, invocationCwd, dryRun: false, nonInteractive: false, limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      out.cwd = argv[++i];
      out.cwdExplicit = true;
    }
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--id" || a === "--ticket") out.ticketId = argv[++i];
    else if (a === "--title") out.title = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--group") out.group = argv[++i];
    else if (a === "--parent" || a === "--main-ticket") out.parent = argv[++i];
    else if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--allow-cwd-target") {
      throw new Error("ticket commands no longer support cwd-based target selection. Use --workspace <id>.");
    }
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--content") out.content = argv[++i];
    else if (a === "--content-file") out.contentFile = argv[++i];
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--plan-body") out.planBody = argv[++i];
    else if (a === "--plan-body-file") out.planBodyFile = argv[++i];
    else if (a === "--ref") out.ref = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--submodule") out.submodule = argv[++i];
    else if (a === "--latest" || a === "-l") out.latest = true;
    else if (a === "--path-only") out.pathOnly = true;
    else if (a === "--print-content") out.printContent = true;
    else if (a === "--with-total") out.withTotal = true;
    else if (a === "--takeover") out.takeover = true;
    else if (a === "--all") out.all = true;
    else if (a === "--active") out.active = true;
    else if (a === "--status") out.status = argv[++i];
    else if (a === "--archived") out.archived = true;
    else if (a === "--priority") out.priority = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--remote") out.remote = argv[++i];
    else if (a === "--sync") out.sync = true;
    else if (a === "--no-sync") out.sync = false;
    else if (a === "--chain") out.chain = true;
    else if (a === "--render") out.render = true;
    else if (a === "--docs-language") out.docsLanguage = argv[++i];
    else if (a === "--workflow") out.workflowMode = argv[++i];
    else if (a === "--approval") out.approval = argv[++i];
    else if (a === "--evidence") out.evidence = argv[++i];
    else if (a === "--skip-phase0") out.skipPhase0 = true;
    else if (a === "--summary") out.summary = argv[++i];
    else if (a === "--type") out.ticketType = argv[++i];
    else if (a === "--tags") out.tags = argv[++i];
    else if (a === "--phase" || a === "--to") { out.phase = parsePhaseToken(argv[++i]); out.phaseRequested = true; }
    else if (a === "--next") out.next = true;
    else if (a === "--handoff") out.handoff = true;
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--claim") out.claim = argv[++i];
    else if (a === "--require-filled") out.requireFilled = true;
    else if (a === "--allow-placeholder") out.allowPlaceholder = true;
    else if (a === "--compact") out.compact = true;
    else if (a === "--status-detail") out.statusDetail = true;
    else if (a === "--verbose") out.verbose = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--session-id") out.sessionId = argv[++i];
    else if (a.startsWith("-")) {
      // #775: unknown 플래그를 조용히 무시하지 않는다. 에이전트가 흔히 쓰는
      // --description/--body 등을 no-op으로 삼키면, 그 뒤 본문이 positional로
      // ticketId에 둔갑 흡수되고(아래 분기) plan-body 없음으로 모호하게 실패해
      // 원인을 못 짚고 반복 실패한다. 결정적 에러로 즉시 알린다.
      const hint = UNKNOWN_FLAG_HINTS[a];
      throw new Error(
        `unknown flag: ${a}` +
        (hint ? ` (did you mean ${hint}?)` : "") +
        `. Run \`deuk-agent-flow ticket --help\` for supported flags.`
      );
    }
    // #775: positional 토큰은 selector(ticketId) 후보. 단, title/plan-body/summary가
    // 이미 있는 create 컨텍스트에서 떠도는 본문 문자열을 ticketId로 흡수하면
    // 본문이 거대한 ID로 둔갑한다. 이미 selector가 있거나 본문 입력이 잡혔으면 거부.
    else if (out.ticketId !== undefined) {
      throw new Error(
        `unexpected extra argument: "${truncateArg(a)}". ` +
        `A ticket selector is already set ("${truncateArg(String(out.ticketId))}"). ` +
        `Pass free-form text via --plan-body/--summary, not as a positional argument.`
      );
    }
    else if (out.title !== undefined || out.summary !== undefined || out.planBody !== undefined || out.planBodyFile !== undefined) {
      throw new Error(
        `unexpected positional argument: "${truncateArg(a)}". ` +
        `Use --plan-body or --summary for descriptive text; positional input is only the ticket id/selector.`
      );
    }
    else out.ticketId = a;
  }
  return out;
}

// #775: 흔히 오타·타 CLI 관습으로 들어오는 미지원 플래그를 올바른 플래그로 안내.
const UNKNOWN_FLAG_HINTS: Record<string, string> = {
  "--description": "--plan-body or --summary",
  "--desc": "--plan-body or --summary",
  "--body": "--plan-body",
  "--message": "--summary",
  "-m": "--summary",
  "--name": "--title",
  "--ws": "--workspace",
};

// 에러 메시지에 긴 본문이 통째로 찍히지 않도록 길이를 자른다.
function truncateArg(value: string, max = 60): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function parseArgs(argv) {
  const out: Record<string, any> = { cwd: process.cwd(), dryRun: false, backup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      out.cwd = argv[++i];
      out.cwdExplicit = true;
    }
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--backup") out.backup = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--interactive") out.interactive = true;
    else if (a === "--clean") out.clean = true;
    else if (a === "--tag") out.tag = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--marker-begin") out.markerBegin = argv[++i];
    else if (a === "--marker-end") out.markerEnd = argv[++i];
    else if (a === "--cursorrules") out.cursorrules = argv[++i];
    else if (a === "--append-if-no-markers") out.appendIfNoMarkers = true;
    else if (a === "--workflow") out.workflowMode = argv[++i];
    else if (a === "--approval") out.approval = argv[++i];
    else if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--section") out.section = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--path-only") out.pathOnly = true;
    else if (a === "--remote") out.remote = argv[++i];
    else if (a === "--kind" || a === "--workspace-kind") out.workspaceKind = argv[++i];
    else if (a === "--stack" || a === "--technical-surface") out.stack = argv[++i];
    else if (a === "--context-mcp") out.contextMcp = argv[++i];
    else if (a === "--sync") out.sync = true;
    else if (a === "--no-sync") out.sync = false;
    else if (a === "--docs-language") out.docsLanguage = argv[++i];
    else if (a === "--compact") out.compact = true;
    else if (a === "--session-id") out.sessionId = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

export function parseSkillArgs(argv) {
  const out: Record<string, any> = { cwd: process.cwd(), dryRun: false, nonInteractive: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--skill" || a === "--id") out.skill = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

export function parseUsageArgs(argv) {
  const out: Record<string, any> = {
    cwd: process.cwd(),
    json: false,
    platform: "",
    client: "",
    agentId: "",
    weeklyRemaining: null,
    fiveHourRemaining: null,
    weeklyReset: "",
    fiveHourReset: "",
    taskGrade: "",
    taskLabel: "",
    turnCount: 0,
    linkedTicketCount: 0,
    crossWorkspace: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--client") out.client = argv[++i];
    else if (a === "--agent" || a === "--agent-id") out.agentId = argv[++i];
    else if (a === "--weekly-remaining") out.weeklyRemaining = Number(argv[++i]);
    else if (a === "--five-hour-remaining") out.fiveHourRemaining = Number(argv[++i]);
    else if (a === "--weekly-reset") out.weeklyReset = argv[++i];
    else if (a === "--five-hour-reset") out.fiveHourReset = argv[++i];
    else if (a === "--task-grade") out.taskGrade = argv[++i];
    else if (a === "--task" || a === "--task-label") out.taskLabel = argv[++i];
    else if (a === "--turns" || a === "--turn-count") out.turnCount = Number(argv[++i]);
    else if (a === "--linked-tickets" || a === "--linked-ticket-count") out.linkedTicketCount = Number(argv[++i]);
    else if (a === "--cross-workspace") out.crossWorkspace = true;
    else if (a === "--json") out.json = true;
  }
  return out;
}

export function parseTelemetryArgs(argv) {
  const out: Record<string, any> = {
    cwd: process.cwd(),
    tokens: 0,
    tdw: 0,
    model: "",
    client: "",
    agentId: "",
    ticket: "",
    action: "",
    file: "",
    remote: "",
    source: "",
    kind: "",
    event: "",
    occurredAt: "",
    phase: "",
    status: "",
    ragResult: "",
    localFallback: false,
    knowledgeAction: "",
    tokenQuality: "",
    savedTokens: 0,
    sessionMode: "",
    retryCount: 0,
    turnCount: 0,
    failureCount: 0,
    phaseTransitionCount: 0,
    outcome: "",
    qualityScore: 0,
    json: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--tokens") out.tokens = Number(argv[++i]);
    else if (a === "--tdw") out.tdw = Number(argv[++i]);
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--client") out.client = argv[++i];
    else if (a === "--agent" || a === "--agent-id") out.agentId = argv[++i];
    else if (a === "--ticket") out.ticket = argv[++i];
    else if (a === "--action") out.action = argv[++i];
    else if (a === "--file") out.file = argv[++i];
    else if (a === "--remote") out.remote = argv[++i];
    else if (a === "--source") out.source = argv[++i];
    else if (a === "--kind") out.kind = argv[++i];
    else if (a === "--event") out.event = argv[++i];
    else if (a === "--occurred-at") out.occurredAt = argv[++i];
    else if (a === "--phase") out.phase = Number(argv[++i]);
    else if (a === "--status") out.status = argv[++i];
    else if (a === "--rag-result") out.ragResult = argv[++i];
    else if (a === "--local-fallback") out.localFallback = true;
    else if (a === "--knowledge-action") out.knowledgeAction = argv[++i];
    else if (a === "--token-quality") out.tokenQuality = argv[++i];
    else if (a === "--saved-tokens") out.savedTokens = Number(argv[++i]);
    else if (a === "--session-mode") out.sessionMode = argv[++i];
    else if (a === "--retries") out.retryCount = Number(argv[++i]);
    else if (a === "--turns") out.turnCount = Number(argv[++i]);
    else if (a === "--failures") out.failureCount = Number(argv[++i]);
    else if (a === "--phase-transitions") out.phaseTransitionCount = Number(argv[++i]);
    else if (a === "--outcome") out.outcome = argv[++i];
    else if (a === "--quality-score") out.qualityScore = Number(argv[++i]);
    else if (a === "--json") out.json = true;
  }
  return out;
}
