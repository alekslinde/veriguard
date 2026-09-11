// Tests for the threat-intel source registry and its checker.
//
// Two things are worth protecting here:
//   1. The hand-rolled parser. It is dependency-free, so nothing else catches a
//      shape it silently misreads — and a parser that drops half the registry
//      still "passes" a reachability run.
//   2. The indicator quarantine. Scam domains recorded as evidence must never be
//      promoted into a source tier, because the checker fetches source tiers.
//
// Network reachability is deliberately NOT tested — that is what the weekly
// workflow does, and asserting on live sites would make this suite flaky.

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Plain .mjs script with no type declarations. `allowJs` lets TypeScript infer
// its shape from the source, so the import resolves without a suppression.
import { parseRegistry, validate, waybackFreshness, checkOne } from "../scripts/check-sources.mjs";

const REGISTRY_PATH = resolve(__dirname, "../docs/threat-intel/sources.yml");
const registryText = readFileSync(REGISTRY_PATH, "utf8");

type Entry = {
  domain?: string;
  url?: string;
  name?: string;
  note?: string;
  trust?: string;
  feed?: string;
  check?: string;
  retired?: string;
  expect?: string;
};
// `version` and `updated` are nullable because the parser initialises them to
// null and only fills them from a `version:`/`updated:` header. The fragment
// fixtures below omit that header deliberately, so null is a real value here,
// not a defensive guess — typing them as `string` would make every fragment
// parse need a cast that lies about the shape.
type Registry = {
  errors: string[];
  version: string | null;
  updated: string | null;
  tiers: Record<string, Entry[]>;
  brands: Entry[];
  indicators: string[];
};

const reg: Registry = parseRegistry(registryText);
const allSources = [...Object.values(reg.tiers).flat(), ...reg.brands];

describe("registry parsing", () => {
  it("reads the header scalars", () => {
    expect(reg.version).toBe("1");
    expect(reg.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds all three tiers plus brands and indicators", () => {
    expect(Object.keys(reg.tiers).sort()).toEqual(["1", "2", "3"]);
    expect(reg.brands.length).toBeGreaterThan(0);
    expect(reg.indicators.length).toBeGreaterThan(0);
  });

  it("parses a plausible number of sources", () => {
    // Guards the failure mode where a parser change silently drops entries and
    // the run still reports "all OK".
    expect(allSources.length).toBeGreaterThan(90);
  });

  it("gives every source a domain and an https url", () => {
    for (const s of allSources) {
      expect(s.domain, `entry missing domain: ${JSON.stringify(s)}`).toBeTruthy();
      expect(s.url, `${s.domain} missing url`).toBeTruthy();
      expect(s.url!.startsWith("https://"), `${s.domain} is not https`).toBe(true);
    }
  });

  it("folds multi-line >- notes into a single line", () => {
    const scamwatch = reg.tiers["1"].find((s) => s.domain === "scamwatch.gov.au");
    expect(scamwatch?.note).toContain("Highest-value source");
    expect(scamwatch?.note).toContain("27 citations");
    expect(scamwatch?.note).not.toContain("\n");
  });

  it("does not leak the next key into a folded note", () => {
    // The folded-scalar terminator is indentation-based; a bug there swallows
    // the following `region:`/`- domain:` line into the note text.
    for (const s of allSources) {
      if (!s.note) continue;
      expect(s.note, `${s.domain} note absorbed a key`).not.toMatch(/\b(domain|url|feed|region):\s/);
    }
  });

  it("treats indicators as bare strings, not entries", () => {
    for (const i of reg.indicators) {
      expect(typeof i).toBe("string");
      expect(i).not.toContain(":");
    }
  });

  it("parses the live registry with no errors", () => {
    expect(reg.errors).toEqual([]);
  });

  it("lets a comment terminate a folded note", () => {
    // Comments used to be blanked to "" and treated as paragraph breaks, so an
    // open `>-` swallowed everything after a comment, including the next entry.
    const parsed = parseRegistry(
      [
        "tiers:",
        "  1:",
        "    - domain: a.test",
        "      url: https://a.test",
        "      note: >-",
        "        first line",
        "# a comment ends the note",
        "    - domain: b.test",
        "      url: https://b.test",
      ].join("\n"),
    ) as Registry;

    expect(parsed.tiers["1"]).toHaveLength(2);
    expect(parsed.tiers["1"][0].note).toBe("first line");
    expect(parsed.tiers["1"][1].domain).toBe("b.test");
  });

  it("keeps paragraph breaks inside a folded note", () => {
    const parsed = parseRegistry(
      [
        "tiers:",
        "  1:",
        "    - domain: a.test",
        "      url: https://a.test",
        "      note: >-",
        "        one",
        "",
        "        two",
      ].join("\n"),
    ) as Registry;
    expect(parsed.tiers["1"][0].note).toBe("one two");
  });

  it("records a malformed list item instead of dropping it", () => {
    // `- domain:foo.test` (no space) is not a mapping. Silently skipping it is
    // the "quietly drops half the registry" failure the parser must refuse.
    const parsed = parseRegistry(
      ["tiers:", "  1:", "    - domain:foo.test"].join("\n"),
    ) as Registry;

    expect(parsed.tiers["1"] ?? []).toHaveLength(0);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]).toMatch(/missing space|unparseable/i);
  });

  it("surfaces parse errors through the validator", () => {
    const parsed = parseRegistry(
      ["tiers:", "  1:", "    - domain:foo.test"].join("\n"),
    ) as Registry;
    expect(validate(parsed).some((e: string) => e.startsWith("PARSE:"))).toBe(true);
  });

  it("still collects bare items under indicators", () => {
    const parsed = parseRegistry(
      ["indicators:", "  - bad.test", "  - worse.test"].join("\n"),
    ) as Registry;
    expect(parsed.indicators).toEqual(["bad.test", "worse.test"]);
    expect(parsed.errors).toEqual([]);
  });
});

describe("registry validity", () => {
  it("passes its own validator", () => {
    expect(validate(reg)).toEqual([]);
  });

  // The header is printed in every report ("Registry v1, updated …"), so a
  // missing or malformed field publishes a claim about the registry that
  // nothing supports. It is the one part of the file with no other consumer to
  // notice, which is why it is asserted rather than trusted.
  describe("header", () => {
    const withHeader = (over: Partial<Registry>) => ({ ...reg, ...over });

    it("requires both fields", () => {
      expect(validate(withHeader({ version: null })).some((e) => e.includes("missing `version:`"))).toBe(true);
      expect(validate(withHeader({ updated: null })).some((e) => e.includes("missing `updated:`"))).toBe(true);
    });

    it("requires an integer version", () => {
      expect(validate(withHeader({ version: "1.2" })).some((e) => e.startsWith("HEADER:"))).toBe(true);
    });

    it("requires an ISO date, and a real one", () => {
      for (const bad of ["09-09-2026", "2026-9-9", "2026-13-01", "not-a-date"]) {
        expect(
          { bad, flagged: validate(withHeader({ updated: bad })).some((e) => e.startsWith("HEADER:")) },
        ).toEqual({ bad, flagged: true });
      }
    });

    it("rejects a future date", () => {
      // A future date is a typo or a pre-dated edit, and either way it makes
      // the --stale comparison meaningless: the header can never be behind.
      const future = new Date(Date.now() + 86_400_000 * 3).toISOString().slice(0, 10);
      expect(validate(withHeader({ updated: future })).some((e) => e.includes("future"))).toBe(true);
    });

    it("accepts today", () => {
      // The boundary the future check must not catch — the common case of
      // updating the registry and dating it now.
      const today = new Date().toISOString().slice(0, 10);
      expect(validate(withHeader({ updated: today }))).toEqual([]);
    });
  });

  it("has no domain in two tiers at once", () => {
    const seen = new Set<string>();
    for (const s of allSources) {
      expect(seen.has(s.domain!), `${s.domain} listed twice`).toBe(false);
      seen.add(s.domain!);
    }
  });

  it("marks every tier 3 source as low trust", () => {
    for (const s of reg.tiers["3"]) {
      expect(s.trust, `${s.domain} in tier 3 without trust: low`).toBe("low");
    }
  });

  it("gives each source either a feed or an explicit manual check", () => {
    for (const s of allSources) {
      // Brands are reference pages, checked for reachability only.
      if (reg.brands.includes(s)) continue;
      expect(
        Boolean(s.feed) || s.check === "manual",
        `${s.domain} has neither feed: nor check: manual`,
      ).toBe(true);
    }
  });
});

describe("indicator quarantine", () => {
  it("keeps known scam domains out of every source tier", () => {
    const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));
    for (const s of allSources) {
      const host = new URL(s.url!).hostname.toLowerCase().replace(/^www\./, "");
      expect(indicators.has(host), `${host} is an indicator but appears as a source`).toBe(false);
      expect(indicators.has(s.domain!.toLowerCase()), `${s.domain} is an indicator`).toBe(false);
    }
  });

  it("still records the indicators seen in the roadmaps", () => {
    // These are quoted as evidence in the archive; losing them would let one be
    // re-added as a source later.
    expect(reg.indicators).toContain("swyftx-account.xyz");
    expect(reg.indicators).toContain("coinspot-verify.top");
    expect(reg.indicators).toContain("ato-gov-au.github.io");
  });

  it("fails validation when an indicator is promoted to a source", () => {
    const poisoned: Registry = {
      ...reg,
      tiers: {
        ...reg.tiers,
        1: [
          ...reg.tiers["1"],
          { domain: "coinspot-verify.top", url: "https://coinspot-verify.top", name: "oops" },
        ],
      },
    };
    const errors = validate(poisoned);
    expect(errors.some((e: string) => e.startsWith("SAFETY:"))).toBe(true);
  });

  it("catches an indicator even when the entry is also malformed", () => {
    // The SAFETY check must not sit behind early `continue`s for unrelated
    // missing fields — a half-written entry is exactly when a mistake slips in.
    const poisoned: Registry = {
      ...reg,
      brands: [...reg.brands, { url: "https://coinspot-verify.top" }], // no domain
    };
    const errors = validate(poisoned);
    expect(errors.some((e: string) => e.startsWith("SAFETY:"))).toBe(true);
  });

  it("rejects a source with a non-https url", () => {
    const bad: Registry = {
      ...reg,
      brands: [...reg.brands, { domain: "example.test", url: "http://example.test" }],
    };
    expect(validate(bad).some((e: string) => e.includes("must be https"))).toBe(true);
  });
});

describe("lookalike discipline", () => {
  it("keeps the Scamwatch impersonator flagged and untrusted", () => {
    // scamwatchhq.com is NOT the ACCC. It is kept on purpose so the name
    // collision stays documented — but it must never drift up a tier.
    const hq = reg.tiers["3"].find((s) => s.domain === "scamwatchhq.com");
    expect(hq, "scamwatchhq.com should stay in tier 3 as a documented lookalike").toBeTruthy();
    expect(hq!.trust).toBe("low");
    expect(hq!.note).toMatch(/NOT Scamwatch/i);
    expect(hq!.note).toMatch(/do not cite/i);
  });

  it("keeps the real Scamwatch in tier 1", () => {
    expect(reg.tiers["1"].some((s) => s.domain === "scamwatch.gov.au")).toBe(true);
  });

  it("explains every expect: blocked source", () => {
    // `expect: blocked` suppresses the DEAD verdict for a source, so it can hide
    // real rot. It must always carry a reason.
    for (const s of allSources) {
      if (s.expect !== "blocked") continue;
      expect(s.note, `${s.domain} is expect: blocked without a note`).toBeTruthy();
      expect(s.note).toMatch(/block|bot|403|protection/i);
    }
  });

  it("does not let expect: blocked spread widely", () => {
    // A handful is bot protection; many would mean the checker has stopped
    // actually checking anything.
    //
    // Raised from 5 to 7 on 2026-09-09 when tier-1 sources were registered for
    // GB, NZ, CA, IE and SG: four of the new national authorities (Action
    // Fraud, Ofcom, Netsafe, An Garda Síochána) sit behind WAFs that 403
    // automated requests. Each was probed by hand and carries a note saying so.
    // The cap exists to stop the flag being reached for casually, so it tracks
    // the number actually justified — 7 — rather than leaving headroom that
    // would let the next one in unexamined.
    const blocked = allSources.filter((s) => s.expect === "blocked");
    expect(blocked.length).toBeLessThanOrEqual(7);
  });

  it("keeps retired sources marked and explained", () => {
    for (const s of allSources) {
      if (s.retired !== "true") continue;
      expect(s.note, `${s.domain} is retired without a note explaining why`).toBeTruthy();
      expect(s.name).toMatch(/DEFUNCT|RETIRED/i);
    }
  });
});

describe("waybackFreshness (fallback-ladder liveness)", () => {
  // Fixed "now" so the age window is deterministic.
  const NOW = Date.parse("2026-08-19T00:00:00Z");
  const snap = (timestamp: string, available = true) => ({
    archived_snapshots: { closest: { available, timestamp, url: `https://web.archive.org/web/${timestamp}/x` } },
  });

  it("accepts a recent snapshot and reports its age in days", () => {
    const r = waybackFreshness(snap("20260801000000"), NOW);
    expect(r).toBeTruthy();
    expect(r!.ageDays).toBe(18);
    expect(r!.snapshotUrl).toContain("web.archive.org");
  });

  it("rejects a snapshot older than the window (stale evidence is not liveness)", () => {
    // ~961 days old, well past the 365-day default.
    expect(waybackFreshness(snap("20240101000000"), NOW)).toBeNull();
  });

  it("respects a custom max-age window", () => {
    expect(waybackFreshness(snap("20260101000000"), NOW, 365)).toBeTruthy();
    expect(waybackFreshness(snap("20260101000000"), NOW, 30)).toBeNull();
  });

  it("rejects an unavailable or missing snapshot", () => {
    expect(waybackFreshness(snap("20260801000000", false), NOW)).toBeNull();
    expect(waybackFreshness({ archived_snapshots: {} }, NOW)).toBeNull();
    expect(waybackFreshness({}, NOW)).toBeNull();
    expect(waybackFreshness(null, NOW)).toBeNull();
  });

  it("rejects a malformed or future timestamp", () => {
    expect(waybackFreshness(snap("2026"), NOW)).toBeNull();
    expect(waybackFreshness(snap("not-a-date"), NOW)).toBeNull();
    expect(waybackFreshness(snap("20270101000000"), NOW)).toBeNull(); // future → negative age
  });
});

describe("5xx corroboration (ANP Tech / HTTP 520)", () => {
  // A 5xx used to be a terminal SERVER_ERROR with no corroboration and no
  // retry — unlike the 403 and hang paths, which both consult the ladder. That
  // gap is what reported ANP Tech (Cloudflare 520) as needing attention while
  // the site served 200 to an ordinary client.
  const entry = {
    domain: "anptech.com.au",
    url: "https://www.anptech.com.au",
    tier: "3",
    name: "ANP Tech",
  };

  afterEach(() => { vi.unstubAllGlobals(); });

  // Routes each URL the ladder may try to a caller-supplied status. Rungs now
  // validate the BODY too, so a corroborating path must return a plausible one.
  const stub = (route: (url: string) => number) => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const status = route(url);
      const body = url.endsWith("/robots.txt") ? "User-agent: *\nDisallow:" : "";
      return {
        status,
        ok: status >= 200 && status < 300,
        url,
        text: async () => body,
        json: async () => ({}),
      } as Response;
    });
  };

  it("corroborates a 520 via robots.txt instead of crying rot", async () => {
    stub((url) => (url.endsWith("/robots.txt") ? 200 : 520));
    const r = await checkOne(entry);
    expect(r.state).toBe("LIVE_FALLBACK");
    expect(r.via).toBe("robots");
    expect(r.error).toContain("520");
  });

  it("still reports SERVER_ERROR when nothing corroborates", async () => {
    stub(() => 520);
    const r = await checkOne(entry);
    expect(r.state).toBe("SERVER_ERROR");
    expect(r.status).toBe(520);
  });

  it("leaves a plain 200 as OK", async () => {
    stub(() => 200);
    const r = await checkOne(entry);
    expect(r.state).toBe("OK");
  });
});

describe("ladder corroboration discipline", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  // Route by URL to a [status, body] pair. Bodies matter now: a parked host
  // answers 200 to everything, so the rungs check shape, not just status.
  const stub = (route: (url: string) => [number, string]) => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const [status, body] = route(url);
      return {
        status,
        ok: status >= 200 && status < 300,
        url,
        text: async () => body,
        json: async () => JSON.parse(body || "{}"),
      } as Response;
    });
  };

  const ROBOTS = "User-agent: *\nDisallow: /tmp";
  const SITEMAP = '<?xml version="1.0"?><urlset xmlns="x"><url><loc>u</loc></url></urlset>';
  const FEED = '<?xml version="1.0"?><rss version="2.0"><channel/></rss>';

  it("rejects a third-party feed as corroboration (FeedBurner outlives the site)", async () => {
    const entry = {
      domain: "thehackernews.com",
      url: "https://thehackernews.com",
      feed: "https://feeds.feedburner.com/TheHackersNews",
      tier: "2",
    };
    // The cached third-party feed is healthy; the site itself is gone.
    stub((url) => (url.includes("feedburner") ? [200, FEED] : [403, ""]));
    const r = await checkOne(entry);
    expect(r.via).not.toBe("feed");
    expect(r.state).toBe("DEAD");
  });

  it("accepts a feed on the source's own host", async () => {
    const entry = {
      domain: "bleepingcomputer.com",
      url: "https://www.bleepingcomputer.com",
      feed: "https://www.bleepingcomputer.com/feed/",
      tier: "2",
    };
    stub((url) => (url.endsWith("/feed/") ? [200, FEED] : [403, ""]));
    const r = await checkOne(entry);
    expect(r.state).toBe("LIVE_FALLBACK");
    expect(r.via).toBe("feed");
  });

  it("rejects a parked host whose catch-all 200s every path", async () => {
    // Decommissioned domain: every request, including /robots.txt and
    // /sitemap.xml, returns a for-sale HTML page.
    const parked = "<html><body>This domain is for sale</body></html>";
    stub((url) => (url.includes("archive.org") ? [200, "{}"] : [200, parked]));
    const r = await checkOne({ domain: "gone.example", url: "https://gone.example/x", tier: "3" });
    expect(r.state).not.toBe("LIVE_FALLBACK");
  });

  it("records that a robots/sitemap hit proves the host, not the path", async () => {
    stub((url) => (url.endsWith("/robots.txt") ? [200, ROBOTS] : [403, ""]));
    const r = await checkOne({ domain: "ato.gov.au", url: "https://www.ato.gov.au/deep/page", tier: "1" });
    expect(r.state).toBe("LIVE_FALLBACK");
    expect(r.via).toBe("robots");
    expect(r.error).toContain("path not itself confirmed");
  });

  it("accepts a real sitemap body", async () => {
    stub((url) => (url.endsWith("/sitemap.xml") ? [200, SITEMAP] : [403, ""]));
    const r = await checkOne({ domain: "x.example", url: "https://x.example/p", tier: "3" });
    expect(r.via).toBe("sitemap");
  });

  it("honours expect: blocked on a 5xx, as the 403 and hang paths do", async () => {
    stub(() => [503, ""]);
    const r = await checkOne({
      domain: "acma.gov.au", url: "https://www.acma.gov.au/x", tier: "1", expect: "blocked",
    });
    expect(r.state).toBe("BLOCKED");
    expect(r.error).toContain("expected");
  });
});

describe("wayback snapshot must match the requested URL", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const wb = (snapshotUrl: string) => JSON.stringify({
    archived_snapshots: {
      closest: { available: true, timestamp: "20260819001716", url: snapshotUrl },
    },
  });

  const stubWayback = (snapshotUrl: string) => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const body = url.includes("archive.org") ? wb(snapshotUrl) : "";
      const status = url.includes("archive.org") ? 200 : 403;
      return {
        status, ok: status === 200, url,
        text: async () => body, json: async () => JSON.parse(body || "{}"),
      } as Response;
    });
  };

  it("rejects an ancestor snapshot standing in for a 404'd child", async () => {
    // Asked about /deep/page; archive.org answers with the site root.
    stubWayback("http://web.archive.org/web/20260819001716/https://x.example/");
    const r = await checkOne({ domain: "x.example", url: "https://x.example/deep/page", tier: "3" });
    expect(r.state).not.toBe("LIVE_FALLBACK");
  });

  it("accepts a snapshot of the exact page", async () => {
    stubWayback("http://web.archive.org/web/20260819001716/https://x.example/deep/page");
    const r = await checkOne({ domain: "x.example", url: "https://x.example/deep/page", tier: "3" });
    expect(r.state).toBe("LIVE_FALLBACK");
    expect(r.via).toBe("wayback");
  });
});
