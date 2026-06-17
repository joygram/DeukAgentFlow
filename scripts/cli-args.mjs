export function parseTicketArgs(argv) {
  const out = { cwd: process.cwd(), dryRun: false, nonInteractive: false, limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--topic" || a === "--id") out.topic = argv[++i];
    else if (a === "--group") out.group = argv[++i];
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--content") out.content = argv[++i];
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--plan-body") out.planBody = argv[++i];
    else if (a === "--ref") out.ref = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--submodule") out.submodule = argv[++i];
    else if (a === "--latest" || a === "-l") out.latest = true;
    else if (a === "--path-only") out.pathOnly = true;
    else if (a === "--print-content") out.printContent = true;
    else if (a === "--all") out.all = true;
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
    else if (a === "--evidence") out.evidence = argv[++i];
    else if (a === "--skip-phase0") out.skipPhase0 = true;
    else if (a === "--summary") out.summary = argv[++i];
    else if (a === "--tags") out.tags = argv[++i];
    else if (a === "--phase") out.phase = Number(argv[++i]);
    else if (a === "--next") out.next = true;
    else if (a === "--handoff") out.handoff = true;
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--claim") out.claim = argv[++i];
    else if (a === "--require-filled") out.requireFilled = true;
    else if (a === "--allow-placeholder") out.allowPlaceholder = true;
    else if (a === "--compact") out.compact = true;
    else if (a === "--status-detail") out.statusDetail = true;
  }
  return out;
}

export function parseArgs(argv) {
  const out = { cwd: process.cwd(), dryRun: false, backup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--backup") out.backup = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--interactive") out.interactive = true;
    else if (a === "--clean") out.clean = true;
    else if (a === "--tag") out.tag = argv[++i];
    else if (a === "--marker-begin") out.markerBegin = argv[++i];
    else if (a === "--marker-end") out.markerEnd = argv[++i];
    else if (a === "--agents") out.agents = argv[++i];
    else if (a === "--cursorrules") out.cursorrules = argv[++i];
    else if (a === "--append-if-no-markers") out.appendIfNoMarkers = true;
    else if (a === "--workflow") out.workflowMode = argv[++i];
    else if (a === "--approval") out.approval = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--remote") out.remote = argv[++i];
    else if (a === "--sync") out.sync = true;
    else if (a === "--no-sync") out.sync = false;
    else if (a === "--docs-language") out.docsLanguage = argv[++i];
    else if (a === "--compact") out.compact = true;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

export function parseSkillArgs(argv) {
  const out = { cwd: process.cwd(), dryRun: false, nonInteractive: false };
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
export function parseTelemetryArgs(argv) {
  const out = {
    cwd: process.cwd(),
    tokens: 0,
    tdw: 0,
    model: "",
    client: "",
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
    json: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--tokens") out.tokens = Number(argv[++i]);
    else if (a === "--tdw") out.tdw = Number(argv[++i]);
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--client") out.client = argv[++i];
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
    else if (a === "--json") out.json = true;
  }
  return out;
}
