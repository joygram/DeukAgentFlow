import test from "node:test";
import assert from "node:assert/strict";
import { buildDownloadsBadge } from "../update-download-badge.mjs";

test("downloads badge keeps deuk-agent-flow canonical while summing legacy alias", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const src = String(url);
    if (src.endsWith("/deuk-agent-flow")) {
      return { ok: true, status: 200, json: async () => ({ downloads: 120 }) };
    }
    if (src.endsWith("/deuk-agent-rule")) {
      return { ok: true, status: 200, json: async () => ({ downloads: 30 }) };
    }
    throw new Error(`unexpected url: ${src}`);
  };

  try {
    const badge = await buildDownloadsBadge({
      packages: ["deuk-agent-flow", "deuk-agent-rule"],
      canonicalPackage: "deuk-agent-flow",
      range: "last-month",
    });

    assert.equal(badge.label, "deuk-flow downloads");
    assert.equal(badge.message, "150/last-month");
    assert.equal(badge.namedLogo, "npm");
    assert.equal(badge.cacheSeconds, 86400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("downloads badge treats missing alias package as zero without hiding canonical identity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const src = String(url);
    if (src.endsWith("/deuk-agent-flow")) {
      return { ok: true, status: 200, json: async () => ({ downloads: 12 }) };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  try {
    const badge = await buildDownloadsBadge({
      packages: ["deuk-agent-flow", "deuk-agent-rule"],
      canonicalPackage: "deuk-agent-flow",
      range: "last-week",
    });

    assert.equal(badge.message, "12/last-week");
    assert.equal(badge.color, "2f6fed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
