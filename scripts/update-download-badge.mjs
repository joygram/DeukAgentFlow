#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_PACKAGES = ["deuk-agent-flow", "deuk-agent-rule"];
const DEFAULT_RANGE = "last-month";
const DEFAULT_OUT = "docs/badges/npm-downloads.json";

function parseArgs(argv) {
  const opts = {
    packages: [...DEFAULT_PACKAGES],
    range: DEFAULT_RANGE,
    out: DEFAULT_OUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--packages") {
      opts.packages = argv[++i].split(",").map((name) => name.trim()).filter(Boolean);
    } else if (arg === "--range") {
      opts.range = argv[++i];
    } else if (arg === "--out") {
      opts.out = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.packages.length === 0) {
    throw new Error("--packages must include at least one npm package name");
  }

  return opts;
}

async function fetchDownloads(packageName, range) {
  const url = `https://api.npmjs.org/downloads/point/${encodeURIComponent(range)}/${encodeURIComponent(packageName)}`;
  const res = await fetch(url);

  if (res.status === 404) {
    return { package: packageName, downloads: 0, missing: true };
  }

  if (!res.ok) {
    throw new Error(`npm downloads request failed for ${packageName}: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  return {
    package: packageName,
    downloads: Number(body.downloads || 0),
    missing: false,
  };
}

function formatDownloads(value) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export async function buildDownloadsBadge(opts) {
  const packages = await Promise.all(opts.packages.map((name) => fetchDownloads(name, opts.range)));
  const total = packages.reduce((sum, pkg) => sum + pkg.downloads, 0);

  return {
    schemaVersion: 1,
    label: "npm downloads",
    message: `${formatDownloads(total)}/${opts.range}`,
    color: "2f6fed",
    namedLogo: "npm",
    cacheSeconds: 86400,
    total,
    range: opts.range,
    packages,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const badge = await buildDownloadsBadge(opts);
  const outPath = join(process.cwd(), opts.out);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(badge, null, 2) + "\n", "utf8");
  console.log(`Wrote ${opts.out}: ${badge.message}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
