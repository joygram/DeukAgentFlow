#!/usr/bin/env node
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseArgs, parseTicketArgs } from "./cli-args.mjs";
import { runInit, runMerge } from "./cli-init-commands.mjs";
import { runTicketCreate, runTicketList, runTicketUse, runTicketClose, runTicketArchive, runTicketReports } from "./cli-ticket-commands.mjs";
import { loadInitConfig, writeInitConfig } from "./cli-prompts.mjs";
import { runInteractive } from "./cli-prompts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const bundleRoot = join(pkgRoot, "bundle");
async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help" || sub === "help") {
    printHelp();
    return;
  }

  const rest = argv.slice(1);

  if (sub === "ticket") {
    const action = rest[0];
    const opts = parseTicketArgs(rest.slice(1));
    if (action === "create") await runTicketCreate(opts);
    else if (action === "list") await runTicketList(opts);
    else if (action === "use") await runTicketUse(opts);
    else if (action === "close") await runTicketClose(opts);
    else if (action === "archive") await runTicketArchive(opts);
    else if (action === "reports") await runTicketReports(opts);
    else if (action === "migrate") await runTicketMigrate(opts);
    else {
      console.error("Unknown ticket action: " + action);
      printHelp();
    }
    return;
  }

  if (sub === "init" || sub === "merge") {
    const opts = parseArgs(rest);
    if (opts.help) {
      printHelp();
      return;
    }

    const saved = loadInitConfig(opts.cwd);
    if (saved && !opts.interactive) {
      // CLI flags (opts) take precedence over saved config
      for (const key in saved) {
        if (opts[key] === undefined) opts[key] = saved[key];
      }
      console.log(`Using saved config from .deuk-agent-rule.config.json (CLI overrides applied)`);
    }

    if (sub === "init") {
      await handleInit(opts);
    } else {
      runMerge(opts, bundleRoot);
    }
    return;
  }

  console.error("Unknown command: " + sub);
  printHelp();
}

import { runTicketMigrate } from "./cli-ticket-commands.mjs";

async function handleInit(opts) {
  if (!opts.interactive && !opts.nonInteractive && !loadInitConfig(opts.cwd)) {
    // If no config and not interactive, prompt unless non-interactive
    await runInteractive(opts);
    if (!opts.dryRun) writeInitConfig(opts.cwd, opts);
  } else if (opts.interactive) {
    await runInteractive(opts);
    if (!opts.dryRun) writeInitConfig(opts.cwd, opts);
  }
  await runInit(opts, bundleRoot);
}

function printHelp() {
  console.log(`DeukAgentRules CLI - Generalization Rules & Ticket Management

Usage:
  npx deuk-agent-rule init   [options]
  npx deuk-agent-rule merge  [options]
  npx deuk-agent-rule ticket <create|list|use|close|archive|reports|migrate> [options]

Options:
  --cwd <path>          Target repo root
  --dry-run             Print actions without writing
  --non-interactive     CI/scripts mode: no prompts
  --tag <id>            Custom marker ID (default: deuk-agent-rule)
  --agents <mode>       inject | skip | overwrite
  --rules <mode>        prefix | skip | overwrite
  --cursorrules <mode>  inject | skip | overwrite

Ticket Options:
  --topic <name>        Ticket topic slug
  --group <name>        Ticket group (sub|main|discussion)
  --project <name>      Project filter (DeukUI|DeukAgentRules)
  --latest              Use most recent ticket
  --path-only           Print only the file path
`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
