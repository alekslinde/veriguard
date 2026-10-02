// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
// Types for the plain .mjs script come from its JSDoc via checkJs.
import {
  parseVersion,
  compareVersions,
  isBreakingUpgrade,
  assessAlert,
  dedupeAlerts,
  formatDigest,
  isAlertsAccessDenied,
} from "../scripts/dependabot-triage.mjs";

// Minimal builder for the bits of a Dependabot alert the assessor reads.
function alert({
  number = 1,
  pkg = "acme",
  severity = "high",
  scope = "runtime",
  fix = "1.2.3",
  cvss = 5,
  ghsa = "GHSA-xxxx",
  manifest = "/package.json",
} : Record<string, unknown> = {}) {
  return {
    number,
    html_url: `https://example/${number}`,
    dependency: { package: { name: pkg }, manifest_path: manifest, scope },
    security_advisory: { ghsa_id: ghsa, severity, cvss: { score: cvss } },
    security_vulnerability: {
      package: { name: pkg },
      severity,
      first_patched_version: fix ? { identifier: fix } : null,
    },
  };
}

describe("semver-lite helpers", () => {
  it("parses and compares versions, ignoring prerelease/build", () => {
    expect(parseVersion("v0.35.3")).toEqual([0, 35, 3]);
    expect(parseVersion("garbage")).toBeNull();
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "bad")).toBeNull();
  });

  it("treats a different major — and any 0.x minor — as breaking", () => {
    expect(isBreakingUpgrade("1.4.0", "2.0.0")).toBe(true);
    expect(isBreakingUpgrade("0.34.5", "0.35.3")).toBe(true); // sharp case
    expect(isBreakingUpgrade("1.4.0", "1.9.0")).toBe(false);
    expect(isBreakingUpgrade("4.0.0", "4.3.0")).toBe(false); // js-yaml case
    expect(isBreakingUpgrade(null, "1.0.0")).toBe(false); // unknown => don't cry wolf
  });
});

describe("assessAlert verdicts", () => {
  it("auto-merges a non-breaking dev-only (build-time) advisory", () => {
    const r = assessAlert(alert({ pkg: "brace-expansion", scope: "development", fix: "1.1.16" }), {
      installedVersions: new Map([["brace-expansion", "1.1.11"]]),
    });
    expect(r.verdict).toBe("auto");
    expect(r.reachable).toBe(false);
  });

  it("auto-merges a non-breaking runtime *transitive* dep", () => {
    const r = assessAlert(alert({ pkg: "js-yaml", scope: "runtime", fix: "4.3.0" }), {
      installedVersions: new Map([["js-yaml", "4.1.0"]]),
      directImports: new Set(), // not imported by our code directly
    });
    expect(r.verdict).toBe("auto");
  });

  it("routes a directly-imported runtime dep to review even with a safe fix", () => {
    const r = assessAlert(alert({ pkg: "jsqr", scope: "runtime", fix: "1.5.0" }), {
      installedVersions: new Map([["jsqr", "1.4.0"]]),
      directImports: new Set(["jsqr"]),
    });
    expect(r.verdict).toBe("review");
    expect(r.directlyUsed).toBe(true);
  });

  it("routes a breaking/major fix to review (the sharp 0.34->0.35 case)", () => {
    const r = assessAlert(alert({ pkg: "sharp", scope: "runtime", fix: "0.35.3" }), {
      installedVersions: new Map([["sharp", "0.34.5"]]),
      directImports: new Set(["sharp"]),
    });
    expect(r.verdict).toBe("review");
    expect(r.fixIsBreaking).toBe(true);
  });

  it("flags a 'fix' that is actually a downgrade for manual review", () => {
    const r = assessAlert(alert({ pkg: "next", scope: "runtime", fix: "14.2.35" }), {
      installedVersions: new Map([["next", "15.5.18"]]),
    });
    expect(r.verdict).toBe("review");
    expect(r.fixIsDowngrade).toBe(true);
    expect(r.reasons.some((x: string) => /LOWER than installed/.test(x))).toBe(true);
  });

  it("marks an alert with no published fix as monitor", () => {
    const r = assessAlert(alert({ pkg: "vuln-nofix", fix: null }), {});
    expect(r.verdict).toBe("monitor");
    expect(r.fixVersion).toBeNull();
  });

  it("does not let an unscored CVSS (0) lower a high/critical label", () => {
    const scored = assessAlert(alert({ pkg: "sharp", cvss: 7.5, severity: "high", fix: "0.35.3" }), {
      installedVersions: new Map([["sharp", "0.34.5"]]),
    });
    const unscored = assessAlert(alert({ pkg: "sharp", cvss: 0, severity: "high", fix: "0.35.3" }), {
      installedVersions: new Map([["sharp", "0.34.5"]]),
    });
    // Severity-driven priority is identical; the unscored one carries a note.
    expect(unscored.priority).toBe(scored.priority);
    expect(unscored.reasons.some((x: string) => /CVSS unscored/.test(x))).toBe(true);
  });

  it("ranks critical above high, and reachable above unreachable", () => {
    const crit = assessAlert(alert({ severity: "critical", scope: "runtime" }), {});
    const highDev = assessAlert(alert({ severity: "high", scope: "development" }), {});
    expect(crit.priority).toBeGreaterThan(highDev.priority);
  });
});

describe("dedupeAlerts", () => {
  it("collapses the same advisory across manifests and keeps the max priority", () => {
    const a = assessAlert(alert({ number: 1, pkg: "js-yaml", ghsa: "GHSA-dup", manifest: "/package.json" }), {});
    const b = assessAlert(alert({ number: 2, pkg: "js-yaml", ghsa: "GHSA-dup", manifest: "/workers/inbound-email/package.json" }), {});
    const rows = dedupeAlerts([a, b]);
    expect(rows).toHaveLength(1);
    expect(rows[0].manifests.sort()).toEqual(["/package.json", "/workers/inbound-email/package.json"]);
  });

  it("keeps genuinely distinct advisories separate", () => {
    const a = assessAlert(alert({ pkg: "js-yaml", ghsa: "GHSA-a" }), {});
    const b = assessAlert(alert({ pkg: "sharp", ghsa: "GHSA-b" }), {});
    expect(dedupeAlerts([a, b])).toHaveLength(2);
  });
});

describe("formatDigest", () => {
  it("renders the clean-slate message when there are no alerts", () => {
    expect(formatDigest([])).toContain("No open Dependabot alerts");
  });

  it("groups by verdict with counts and per-alert reasons", () => {
    const rows = dedupeAlerts([
      assessAlert(alert({ pkg: "sharp", scope: "runtime", fix: "0.35.3", ghsa: "GHSA-1" }), {
        installedVersions: new Map([["sharp", "0.34.5"]]),
      }),
      assessAlert(alert({ pkg: "brace-expansion", scope: "development", fix: "1.1.16", ghsa: "GHSA-2" }), {}),
    ]);
    const body = formatDigest(rows, { generatedAt: "2026-07-22T00:00:00Z" });
    expect(body).toContain("Needs a human");
    expect(body).toContain("Safe to auto-merge");
    expect(body).toContain("**sharp**");
    expect(body).toContain("2026-07-22T00:00:00Z");
  });
});

describe("isAlertsAccessDenied", () => {
  it("is true for a 403 from the alerts endpoint (GITHUB_TOKEN lacks access)", () => {
    const err = new Error(
      "GitHub API GET /repos/o/r/dependabot/alerts?state=open&per_page=100 -> 403 " +
        '{"message":"Resource not accessible by integration"}'
    );
    expect(isAlertsAccessDenied(err)).toBe(true);
  });

  it("is true for a 401 (expired/revoked PAT) so token lapse pauses instead of failing", () => {
    const err = new Error(
      "GitHub API GET /repos/o/r/dependabot/alerts?state=open&per_page=100 -> 401 " +
        '{"message":"Bad credentials"}'
    );
    expect(isAlertsAccessDenied(err)).toBe(true);
  });

  it("is false for other HTTP errors (e.g. 404, 500) so they still surface", () => {
    expect(isAlertsAccessDenied(new Error("GitHub API GET /x -> 404 not found"))).toBe(false);
    expect(isAlertsAccessDenied(new Error("GitHub API GET /x -> 500 boom"))).toBe(false);
  });

  it("is false for a non-HTTP failure (network, undefined message)", () => {
    expect(isAlertsAccessDenied(new Error("fetch failed"))).toBe(false);
    expect(isAlertsAccessDenied(undefined)).toBe(false);
  });

  it("does not treat an incidental '403' elsewhere in the text as an access denial", () => {
    // Must be the HTTP status right after the "-> " arrow, not a random 403.
    expect(isAlertsAccessDenied(new Error("resolved version 4.403.0 -> 200 ok"))).toBe(false);
  });
});
