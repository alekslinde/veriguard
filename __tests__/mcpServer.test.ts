// The MCP server's behaviour and its privacy property.
//
// This is a second surface on the same engine, so what needs testing here is
// not the scoring — __tests__/scamDetector.test.ts and the eval corpus own that
// — but the three things the server adds:
//
//   1. The tools are wired to the right entry points and return a verdict.
//   2. The privacy invariant holds for THIS process. The engine's version of
//      this property is enforced in __tests__/privacyInvariant.test.ts, but
//      that test does not know what this server passes to it, and the server is
//      the thing that decides whether a fetcher and a blocklist exist at all.
//      A regression here means a scam URL gets visited, which is the one
//      failure this project most needs to not have.
//   3. The flags that turn the two network capabilities off actually do.
//
// Run against source, not the built bundle. The publish surface is covered in
// __tests__/mcpPublish.test.ts, which needs a build and skips without one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { createServer, DEFAULT_OPTIONS, regionArg, type ServerOptions } from "../packages/mcp/src/server";
import { UrlhausBlocklist } from "../packages/mcp/src/blocklist";
import { parseArgs } from "../packages/mcp/src/cli";
import { formatResult, formatAnalysis } from "../packages/mcp/src/format";
import { checkPhone, analyzeContent } from "@veriguard/detect/scamDetector";
import { SHORTENER_HOSTS } from "@veriguard/detect/urlExpander";

/**
 * Hosts that appear in the fixtures and must never be contacted.
 *
 * Mirrors the list in privacyInvariant.test.ts deliberately rather than
 * importing it: these are two independent statements of the same property, and
 * a shared constant would let one edit weaken both at once.
 */
const USER_SUPPLIED_HOSTS = [
  "ato-refund-portal.xyz",
  "commbank-secure-login.tk",
  "mygov-verify.monster",
  "evil-final.tk",
];

const SCAM_SMS =
  "ATO: your refund of $842.10 is pending. Confirm at http://ato-refund-portal.xyz/claim";

/**
 * Record every outbound call instead of making one.
 *
 * Does not throw on contact: the expander catches its own errors, so a throwing
 * stub would stop the redirect walk at hop one and hide a leak on a later hop.
 * Returning a benign response lets the code run to completion with every
 * attempt still recorded — the same reasoning as privacyInvariant.test.ts.
 */
function interceptNetwork(): string[] {
  const contacted: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      contacted.push(String(input instanceof URL ? input : (input as { url?: string })?.url ?? input));
      return new Response(null, { status: 200 });
    }),
  );
  return contacted;
}

function hostsIn(urls: string[]): string[] {
  return urls.map((u) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  });
}

/**
 * Call a tool the way a client does, through the server's own registry.
 *
 * Reaching into the private `_registeredTools` map is deliberate: the
 * alternative is standing up a transport pair per assertion, which tests the
 * SDK's plumbing rather than our handlers. The cast is contained here so a
 * change in the SDK's internals breaks one helper rather than every test.
 */
async function callTool(
  options: ServerOptions,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const server = createServer(options);
  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (a: unknown, e: unknown) => Promise<{ content: { text: string }[] }> }>;
  })._registeredTools;

  const tool = tools[name];
  expect(tool, `tool "${name}" is not registered`).toBeTruthy();
  // Asserted rather than assumed: this is a private SDK field, so an upgrade
  // that renames it must fail here with a clear reason rather than as
  // "undefined is not a function" in sixteen unrelated tests.
  expect(typeof tool.handler, `SDK's registered-tool shape changed — no handler on "${name}"`)
    .toBe("function");

  const result = await tool.handler(args, {});
  return result.content[0].text;
}

/** Every tool, with an argument set that exercises it. */
const TOOLS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "check_message", args: { content: SCAM_SMS, region: "AU" } },
  { name: "check_url", args: { url: "http://commbank-secure-login.tk/auth", region: "AU" } },
  { name: "check_phone", args: { phone: "+252612345678", region: "AU" } },
  { name: "check_email", args: { email: "service@mygov-verify.monster", region: "AU" } },
];

/** No network at all: the configuration both flags produce. */
const OFFLINE: ServerOptions = { expandLinks: false, blocklist: false, region: "AU" };

describe("MCP server — tool surface", () => {
  it("registers exactly the four documented tools", () => {
    const server = createServer(DEFAULT_OPTIONS);
    const names = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    ).sort();
    // Named explicitly rather than counted: a renamed tool is a breaking change
    // for every client config that references it, and should fail here.
    expect(names).toEqual(["check_email", "check_message", "check_phone", "check_url"]);
  });

  it("every tool describes itself and its arguments", () => {
    const server = createServer(DEFAULT_OPTIONS);
    const tools = (server as unknown as {
      _registeredTools: Record<string, { description?: string; title?: string }>;
    })._registeredTools;

    for (const [name, tool] of Object.entries(tools)) {
      // A tool description is the only thing an assistant has to decide whether
      // this tool applies. An empty or placeholder one is a functional defect,
      // not a documentation lapse.
      expect(tool.description, `${name} has no description`).toBeTruthy();
      expect(tool.description!.length, `${name}'s description is too short to guide a caller`)
        .toBeGreaterThan(80);
      expect(tool.title, `${name} has no title`).toBeTruthy();
    }
  });

  it.each(TOOLS)("$name returns a verdict with evidence", async ({ name, args }) => {
    const text = await callTool(OFFLINE, name, args);
    expect(text).toMatch(/Likely scam|Suspicious|Safe|Unknown/);
    expect(text).toMatch(/\d+\/100/);
  });

  it("check_message scores each identifier it finds, not just the text", async () => {
    const text = await callTool(OFFLINE, "check_message", { content: SCAM_SMS, region: "AU" });
    // The SMS carries a URL as well as scam wording, so the engine returns two
    // cards. Collapsing them to one would drop the per-identifier verdicts that
    // make the result actionable.
    expect(text).toMatch(/Found 2 things to check/);
    expect(text).toContain("url:");
  });

  it("names the worst verdict first when identifiers disagree", async () => {
    const text = await callTool(OFFLINE, "check_message", { content: SCAM_SMS, region: "AU" });
    const worst = text.indexOf("Worst verdict:");
    expect(worst).toBe(0);
    // The guidance line must be adjacent to the verdict, not buried after the
    // per-card list — a model summarising this should not have to find it.
    expect(text.slice(0, 200)).toMatch(/Do not click, reply, or pay/);
  });

  it("falls back to text analysis for input that is not a recognisable URL", async () => {
    // check_url routes through analyzeContent to get link expansion, which
    // yields no url card for input the extractor does not recognise. The tool
    // must still answer about what it was sent.
    const text = await callTool(OFFLINE, "check_url", { url: "not a url at all", region: "AU" });
    expect(text).toMatch(/\d+\/100/);
  });
});

describe("MCP server — privacy invariant", () => {
  let contacted: string[];

  beforeEach(() => {
    contacted = interceptNetwork();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(TOOLS)("$name never contacts a host from the input", async ({ name, args }) => {
    await callTool({ ...DEFAULT_OPTIONS, blocklist: false }, name, args);
    const reached = hostsIn(contacted);
    for (const host of USER_SUPPLIED_HOSTS) {
      expect(reached, `contacted user-supplied host ${host}`).not.toContain(host);
    }
  });

  it("only ever contacts allowlisted shorteners, even with expansion on", async () => {
    await callTool({ ...DEFAULT_OPTIONS, blocklist: false }, "check_message", {
      // A unique URL: the expander's module-level cache cannot be cleared, so a
      // URL another test already expanded would return from cache and leave
      // `contacted` empty, making the loop below vacuous.
      content: `Confirm at https://bit.ly/mcp-${Date.now()} and http://commbank-secure-login.tk/auth`,
      region: "AU",
    });

    expect(contacted.length, "expansion path was not exercised").toBeGreaterThan(0);
    for (const host of hostsIn(contacted)) {
      expect(SHORTENER_HOSTS.has(host), `contacted non-shortener ${host}`).toBe(true);
    }
  });

  it("makes no network call whatsoever with both capabilities off", async () => {
    for (const { name, args } of TOOLS) {
      await callTool(OFFLINE, name, args);
    }
    // This is the claim --no-blocklist --no-expand makes in --help and in the
    // README. It is the strongest promise the server offers and the easiest to
    // break by adding a convenience fetch somewhere.
    expect(contacted).toEqual([]);
  });

  it("does not expand a shortened link when expansion is off", async () => {
    // The test above is necessary and not sufficient: none of the TOOLS
    // fixtures contains a shortener, so nothing attempts expansion whatever
    // the flag says, and it passes with the flag ignored entirely. Verified by
    // mutation — hardcoding a fetcher in place of the flag left all 31 tests
    // green until this case existed.
    //
    // A shortener URL is what makes the flag load-bearing, and it must be
    // unique: the expander's module-level cache cannot be cleared, so a URL
    // another test already expanded returns from cache without touching the
    // fetcher and this goes vacuous again.
    await callTool(OFFLINE, "check_message", {
      content: `Parcel held: https://bit.ly/mcp-offline-${Date.now()}`,
      region: "AU",
    });
    expect(contacted).toEqual([]);
  });

  it("does expand a shortened link when expansion is on", async () => {
    // The other half of the pair: proves the assertion above fails for the
    // right reason — expansion genuinely off — rather than because the fixture
    // never reached the expander at all.
    await callTool({ ...DEFAULT_OPTIONS, blocklist: false }, "check_message", {
      content: `Parcel held: https://bit.ly/mcp-online-${Date.now()}`,
      region: "AU",
    });
    expect(contacted.length, "expansion was on but nothing was contacted").toBeGreaterThan(0);
  });

  it("contacts only the blocklist feed when expansion is off", async () => {
    await callTool({ expandLinks: false, blocklist: true, region: "AU" }, "check_url", {
      url: "http://commbank-secure-login.tk/auth",
      region: "AU",
    });
    for (const host of hostsIn(contacted)) {
      expect(host, `unexpected host ${host}`).toBe("urlhaus.abuse.ch");
    }
  });

  it("still produces a verdict with no network access", async () => {
    // The trivially safe way to satisfy every assertion above is to stop
    // analysing. Assert the server still does its job offline.
    for (const { name, args } of TOOLS) {
      const text = await callTool(OFFLINE, name, args);
      expect(text, `${name} produced nothing offline`).toMatch(/\d+\/100/);
    }
    expect(contacted).toEqual([]);
  });
});

describe("MCP server — blocklist refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not re-fetch a feed that just failed", async () => {
    // The bug this covers: only a SUCCESSFUL refresh advanced the clock, so
    // once the copy was stale and abuse.ch unreachable, every tool call
    // re-issued the fetch and waited up to the 10s timeout before answering.
    // A third-party feed being down longer than the TTL is ordinary, and the
    // cost landed on whoever was waiting for a verdict.
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const blocklist = new UrlhausBlocklist();
    for (let i = 0; i < 5; i++) await blocklist.refreshIfStale();

    expect(fetchMock.mock.calls.length, "a failed feed was retried on every call").toBe(1);
  });

  it("retries after the backoff window has passed", async () => {
    // The other half: backing off must not become giving up. A transient
    // failure should not cost a six-hour TTL of blocklist coverage.
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const blocklist = new UrlhausBlocklist();
    await blocklist.refreshIfStale();
    expect(fetchMock.mock.calls.length).toBe(1);

    vi.advanceTimersByTime(61_000);
    await blocklist.refreshIfStale();
    expect(fetchMock.mock.calls.length, "did not retry after the backoff elapsed").toBe(2);
  });

  it("treats a 200 carrying an unparseable body as a failure", async () => {
    // An error page served with a 200 would otherwise replace the blocklist
    // with an empty set and record it as a success, silently dropping the
    // signal for the whole TTL.
    const fetchMock = vi.fn(async () => new Response("<html>nope</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const blocklist = new UrlhausBlocklist();
    await blocklist.refreshIfStale();

    expect(blocklist.ready, "an unparseable body was accepted as a copy").toBe(false);
    expect(blocklist.size).toBe(0);
  });

  it("serves the previous copy when a later refresh fails", async () => {
    // Losing contact with the feed is not evidence that its entries became
    // safe, so a failed refresh must not empty a good list.
    vi.useFakeTimers();
    // A numeric id, not the literal "id": the parser skips a line starting
    // with '"id"' as the CSV header, so a fixture using it is silently dropped.
    const csv = '"123","2026-01-01","http://known-bad.tk/x","online","","","","",""';

    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        return attempt === 1
          ? new Response(csv, { status: 200 })
          : new Response(null, { status: 503 });
      }),
    );

    const blocklist = new UrlhausBlocklist();
    await blocklist.refreshIfStale();
    expect(blocklist.has("known-bad.tk"), "the first copy did not load").toBe(true);

    // Past the TTL, so the next call refreshes — and fails.
    vi.advanceTimersByTime(7 * 60 * 60 * 1000);
    await blocklist.refreshIfStale();

    expect(blocklist.has("known-bad.tk"), "a failed refresh discarded a good copy").toBe(true);
  });

  it("shares one request across concurrent callers", async () => {
    // Every tool call asks for the blocklist, so a burst of calls must not
    // become a burst of requests to abuse.ch.
    const fetchMock = vi.fn(
      async () =>
        new Response(String.raw`"123","2026-01-01","http://x.tk/","online","","","","",""`, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blocklist = new UrlhausBlocklist();
    await Promise.all([
      blocklist.refreshIfStale(),
      blocklist.refreshIfStale(),
      blocklist.refreshIfStale(),
    ]);

    expect(fetchMock.mock.calls.length).toBe(1);
  });
});

describe("MCP server — region validation", () => {
  // resolveRegionPack never throws: an unknown code resolves to DEFAULT_REGION,
  // which is AU, whose coverage is "full". So a near-miss code does not degrade
  // to a cautious answer — it scores against the wrong country's bank and
  // government rules and presents the result with full confidence. The CLI
  // already refused these; the tool argument did not.
  const schema = z.object({ region: regionArg });

  it.each(["UK", "USA", "AUS", "England", "GBR", ""])(
    "rejects %o rather than silently scoring against the default pack",
    (code) => {
      expect(schema.safeParse({ region: code }).success, `accepted ${code}`).toBe(false);
    },
  );

  it.each(["AU", "GB", "US", "NZ"])("accepts the real code %s", (code) => {
    expect(schema.safeParse({ region: code }).success, `rejected ${code}`).toBe(true);
  });

  it("still accepts a lowercase code, which worked before", () => {
    // The engine uppercases internally, so "au" was always a working call.
    // Validation must not turn it into an error.
    const parsed = schema.safeParse({ region: "au" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.region).toBe("AU");
  });

  it("treats an omitted region as the default, not as invalid", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("names the confusable codes in its error, since those are the likely input", () => {
    const parsed = schema.safeParse({ region: "UK" });
    expect(parsed.success).toBe(false);
    const message = parsed.success ? "" : JSON.stringify(parsed.error.issues);
    expect(message).toMatch(/GB/);
  });
});

describe("MCP server — result formatting", () => {
  it("reports coverage when a region has no rules, so a low score is not read as safe", () => {
    // The failure this prevents: a model relaying "12/100" from a region with
    // no rules as "this looks fine". The engine downgrades the verdict; the
    // text has to say why.
    const formatted = formatResult({
      verdict: "unknown",
      score: 12,
      flags: [],
      details: "",
      coverage: "none",
    });
    expect(formatted).toMatch(/no detection rules for this region/i);
  });

  it("flags partial coverage too", () => {
    const formatted = formatResult({
      verdict: "safe",
      score: 0,
      flags: [],
      details: "",
      coverage: "partial",
    });
    expect(formatted).toMatch(/partial/i);
  });

  it("never presents a safe verdict as a guarantee", () => {
    const formatted = formatResult({
      verdict: "safe",
      score: 0,
      flags: [],
      details: "",
      coverage: "full",
    });
    expect(formatted).toMatch(/not a guarantee/i);
  });

  it("does not repeat a phone note that the evidence rows already carry", () => {
    // phoneIntel.spoofingNotes overlaps the scorer's phone signals by design.
    // Printing both verbatim repeated whole sentences a few lines apart, which
    // reads as two findings rather than one and overstates what was found.
    const result = checkPhone("+252612345678", "AU");
    const formatted = formatResult(result, "+252612345678");

    for (const note of result.phoneIntel?.spoofingNotes ?? []) {
      const occurrences = formatted.split(note).length - 1;
      expect(occurrences, `note appears ${occurrences} times: ${note}`).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the real destination of a shortened link defanged", async () => {
    // A live URL in a chat transcript is a link somebody can click by accident.
    // The engine defangs it; this asserts the formatter does not undo that.
    const formatted = formatResult({
      verdict: "likely_scam",
      score: 85,
      flags: [],
      details: "",
      expandedUrl: "hxxp://evil-final[.]tk/landing",
    });
    expect(formatted).toContain("hxxp://evil-final[.]tk/landing");
    expect(formatted).not.toContain("http://evil-final.tk");
  });

  it("says so when there is nothing to check, rather than returning an empty verdict", async () => {
    const cards = await analyzeContent("");
    expect(formatAnalysis(cards)).toMatch(/Nothing to check/i);
  });

  it("names the tactics behind a verdict, for continuity with the Learn page", async () => {
    const text = await callTool(OFFLINE, "check_message", { content: SCAM_SMS, region: "AU" });
    expect(text).toMatch(/Tactics used:/);
  });
});

describe("MCP server — CLI arguments", () => {
  it("defaults both network capabilities on", () => {
    expect(parseArgs([])).toEqual(DEFAULT_OPTIONS);
    expect(DEFAULT_OPTIONS.blocklist).toBe(true);
    expect(DEFAULT_OPTIONS.expandLinks).toBe(true);
  });

  it("turns each capability off independently", () => {
    expect(parseArgs(["--no-blocklist"])).toMatchObject({ blocklist: false, expandLinks: true });
    expect(parseArgs(["--no-expand"])).toMatchObject({ blocklist: true, expandLinks: false });
    expect(parseArgs(["--no-blocklist", "--no-expand"])).toMatchObject({
      blocklist: false,
      expandLinks: false,
    });
  });

  it("accepts a region case-insensitively", () => {
    expect(parseArgs(["--region", "gb"])).toMatchObject({ region: "GB" });
  });

  it("rejects an unknown region instead of silently using the default", () => {
    // The engine falls back to the default pack for an unrecognised code. That
    // is right for a web request carrying a stale cookie and wrong for a flag
    // someone typed: it would score every check against AU rules while the
    // operator believed their region was active, with no warning and a
    // plausible-looking verdict.
    expect(() => parseArgs(["--region", "XX"])).toThrow(/unknown region/i);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--definitely-not-a-flag"])).toThrow(/unknown option/i);
  });

  it("rejects --region with no value", () => {
    expect(() => parseArgs(["--region"])).toThrow(/needs a value/i);
  });

  it("returns help for both spellings", () => {
    expect(parseArgs(["--help"])).toBe("help");
    expect(parseArgs(["-h"])).toBe("help");
  });
});
