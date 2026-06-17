export function parseTicketArgs(argv) {
  const out = { cwd: process.cwd(), dryRun: false, nonInteractive: false, limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--topic") out.topic = argv[++i];
    else if (a === "--group") out.group = argv[++i];
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--content") out.content = argv[++i];
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--ref") out.ref = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--submodule") out.submodule = argv[++i];
    else if (a === "--latest") out.latest = true;
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
    else if (a === "--tag") out.tag = argv[++i];
    else if (a === "--marker-begin") out.markerBegin = argv[++i];
    else if (a === "--marker-end") out.markerEnd = argv[++i];
    else if (a === "--agents") out.agents = argv[++i];
    else if (a === "--rules") out.rules = argv[++i];
    else if (a === "--cursorrules") out.cursorrules = argv[++i];
    else if (a === "--append-if-no-markers") out.appendIfNoMarkers = true;
    else if (a === "--json") out.json = true;
    else if (a === "--remote") out.remote = argv[++i];
    else if (a === "--sync") out.sync = true;
    else if (a === "--no-sync") out.sync = false;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}
