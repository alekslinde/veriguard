import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { analyzeContent, checkUrl, checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";
import { SHORTENER_HOSTS } from "@veriguard/detect/urlExpander";

// The app's core promise to users is that submitting a suspicious link does not
// visit it. Fetching a scam URL tells the scammer's infrastructure their link is
// live and under investigation, and can burn a victim's one chance at a takedown
// — so this is a safety property, not a nicety.
//
// Until now it was enforced by a comment in app/api/check/route.ts and a CSP
// header, with nothing asserting it. These tests execute the real engine over
// real scam inputs with the network intercepted, so a future change that adds a
// fetch on a user-supplied host fails here rather than in production.
//
// Two outbound calls ARE legitimate and must keep working:
//   · the URLhaus blocklist, to a fixed abuse.ch endpoint
//   · urlExpander, to allowlisted shortener hosts only (never the destination)
// Both are to hosts we chose, never to a host that arrived in user input.

/**
 * The host a redirect chain resolves to inside interceptNetwork(). It is
 * user-supplied in exactly the sense that matters: it arrives from a redirect
 * the submission led us to, not from anything we chose.
 */
const CHAIN_DESTINATION = "chain-final-destination.tk";

/** Hosts that appear in the fixtures below and must never be contacted. */
const USER_SUPPLIED_HOSTS = [
  CHAIN_DESTINATION,
  "commbank-secure-login.tk",
  "ato-refund-portal.xyz",
  "mygov-verify.monster",
  "paypal-resolution-centre.shop",
  "192.168.44.7",
  "evil-final.tk",
  "nab-alert.duckdns.org",
];

/** Realistic submissions, each carrying at least one hostile host above. */
const HOSTILE_INPUTS = [
  "ATO: your refund of $842.10 is pending. Confirm at http://ato-refund-portal.xyz/claim",
  "CommBank: unusual sign-in blocked. Verify now https://commbank-secure-login.tk/auth",
  "Your myGov account is locked — unlock at https://mygov-verify.monster/unlock",
  "PayPal: resolve the dispute at https://paypal-resolution-centre.shop/case/8812",
  "Package held. Pay $2.99 duty: http://192.168.44.7/aupost",
  "NAB security alert https://nab-alert.duckdns.org/verify?id=99",
  [
    "From: service@paypal-resolution-centre.shop",
    "Reply-To: collect@evil-final.tk",
    "Subject: Action required on your account",
    "",
    "Confirm your details at https://paypal-resolution-centre.shop/verify",
  ].join("\n"),
];

/**
 * Replace the network primitives with recorders. Anything the engine tries to
 * contact is captured rather than dialled, so a violation is observable instead
 * of being a silent real request during the test run.
 *
 * Two properties this has to get right, both learned the hard way:
 *
 *  1. It must NOT throw on contact. followRedirects catches its own errors, so
 *     a throwing recorder stops the walk at hop one and a leak on a later hop
 *     goes unseen. Returning a benign redirect-less response lets the engine
 *     run to completion while every attempt is still recorded.
 *
 *  2. It records rather than asserts, so each test decides what "forbidden"
 *     means for the path it exercises.
 *
 * SCOPE. Only global fetch is intercepted here. Module mocking does not reach a
 * dynamic import inside already-loaded production code, so a leak via node:dns,
 * node:net or node:https would pass every test in this file.
 *
 * That half is covered by lint instead: eslint.config.mjs bans those modules
 * from lib/, app/ and components/ — as static imports, dynamic import() and
 * require() — and __tests__/engineNetworkImports.test.ts asserts the rules fire
 * and that the config's globs reach every detector file.
 *
 * Between the two, the three channels the route contract names are covered for
 * FIRST-PARTY code. Two gaps remain, stated plainly rather than papered over:
 *
 *   · A transitive leak through a third-party dependency. Neither mechanism
 *     sees it; catching it needs a network sandbox in CI.
 *   · Indirection that defeats static analysis — a module name assembled at
 *     runtime, or an eslint-disable comment. Lint raises the cost of a leak
 *     and makes it visible in review; it is not a sandbox.
 */
function interceptNetwork() {
  const contacted: string[] = [];

  const urlOf = (input: unknown): string =>
    typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : typeof input === "object" && input !== null && "url" in input
      ? String((input as { url: unknown }).url)
      : String(input);

  // Drive a realistic redirect chain: shortener → shortener → hostile
  // destination. Both properties matter. A flat 200 would end the walk at hop
  // one, so a leak on a later hop would have nowhere to appear; and the chain
  // must actually terminate at a NON-allowlisted host, so that code which
  // "verifies the destination resolves" has a forbidden host available to
  // contact. CHAIN_DESTINATION is in USER_SUPPLIED_HOSTS for exactly that.
  let hop = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    contacted.push(urlOf(input));
    hop += 1;
    if (hop === 1) {
      return new Response(null, {
        status: 301,
        headers: { location: "https://tinyurl.com/pi-second-hop" },
      });
    }
    if (hop === 2) {
      return new Response(null, {
        status: 301,
        headers: { location: `https://${CHAIN_DESTINATION}/landing` },
      });
    }
    return new Response(null, { status: 200 });
  }));

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

describe("Privacy invariant — a submitted URL is never visited", () => {
  let contacted: string[];

  beforeEach(() => {
    contacted = interceptNetwork();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contacts nothing at all when analysing hostile input with no transport", async () => {
    // The default path: analyzeContent without a fetcher does no network work
    // whatsoever, so there is nothing to leak.
    for (const input of HOSTILE_INPUTS) {
      await analyzeContent(input);
    }
    expect(contacted).toEqual([]);
  });

  it("never contacts a host that came from user input", async () => {
    // Even with a transport supplied, expansion may only reach allowlisted
    // shorteners — never a host the submission named.
    for (const input of HOSTILE_INPUTS) {
      await analyzeContent(input, undefined, undefined, { fetcher: fetch as never });
    }

    const reached = hostsIn(contacted);
    for (const hostile of USER_SUPPLIED_HOSTS) {
      expect(reached, `contacted user-supplied host ${hostile}`).not.toContain(hostile);
    }
  });

  it("only ever contacts allowlisted shortener hosts, even when told to expand", async () => {
    // The shortener path must be genuinely exercised here. urlExpander keeps a
    // module-level cache that no test can clear, so a URL another test already
    // expanded returns from cache without touching the fetcher — which would
    // leave `contacted` empty and make the loop below iterate zero times,
    // passing green while checking nothing. A unique URL avoids that, and the
    // assertion after it makes the requirement explicit rather than assumed.
    await analyzeContent(
      `Urgent: confirm at https://bit.ly/pi-allowlist-${Date.now()} and https://commbank-secure-login.tk/auth`,
      undefined,
      undefined,
      { fetcher: fetch as never },
    );

    expect(contacted.length, "expansion path was not exercised").toBeGreaterThan(0);

    for (const host of hostsIn(contacted)) {
      expect(SHORTENER_HOSTS.has(host), `contacted non-shortener ${host}`).toBe(true);
    }
  });

  it("makes no network call from any synchronous checker", () => {
    // checkUrl/checkSms/checkEmail/checkCustom are pure string analysis. They
    // are synchronous, so they *cannot* await a fetch — but a fire-and-forget
    // call would still leak, and that is what this catches.
    for (const input of HOSTILE_INPUTS) {
      checkUrl(input);
      checkSms(input);
      checkEmail(input);
      checkCustom(input);
    }
    expect(contacted).toEqual([]);
  });

  it("does not contact a host recovered from an obfuscated URL", async () => {
    // Normalising an obfuscated host for *analysis* must never turn into
    // visiting it. These three forms are chosen because each really does reach
    // checkUrl — an earlier version of this test used `hxxp://host[.]tk`, which
    // the extractor does not recognise as a URL at all, so it scored 0 as a
    // plain message and the assertion below was vacuous.
    const obfuscated = [
      "Visit http://commbank-secure-login%2Etk/auth now",  // percent-encoded dot
      "http://commbank-secure-login.tk./auth",             // trailing-dot FQDN
      "http://CoMMbank-Secure-Login.TK/auth",              // mixed case
    ];

    for (const input of obfuscated) {
      const cards = await analyzeContent(input, undefined, undefined, { fetcher: fetch as never });
      // Guard against this test silently going vacuous again: each input must
      // actually produce a URL verdict, which is what proves checkUrl ran.
      expect(cards.some((c) => c.kind === "url"), `no url card for: ${input}`).toBe(true);
    }

    expect(hostsIn(contacted)).not.toContain("commbank-secure-login.tk");
  });

  it("does not contact a host recovered by refanging", async () => {
    // Refanging turns "hxxp://evil[.]tk" into a parseable URL so it can be
    // scored — which means text that was previously inert now yields a real
    // host. That must make the URL analysable, never reachable.
    const cards = await analyzeContent(
      "Someone sent me hxxps://commbank-secure-login[.]tk/auth — is it real?",
      undefined,
      undefined,
      { fetcher: fetch as never },
    );

    // Guard against vacuity: the refang path must actually have produced a URL.
    expect(cards.some((c) => c.kind === "url"), "refang produced no url card").toBe(true);
    expect(hostsIn(contacted)).not.toContain("commbank-secure-login.tk");
  });

  it("does not contact a host extracted without a scheme", async () => {
    // Schemeless hosts are a second source of parseable URLs from text that was
    // previously inert. Same rule as refanging: analysable, never reachable.
    const cards = await analyzeContent(
      "Your parcel is held. Pay at commbank-secure-login.tk/fee",
      undefined,
      undefined,
      { fetcher: fetch as never },
    );

    expect(cards.some((c) => c.kind === "url"), "bare host produced no url card").toBe(true);
    expect(hostsIn(contacted)).not.toContain("commbank-secure-login.tk");
  });

  it("still produces a verdict for every hostile input, with nothing contacted", async () => {
    // A trivially safe way to satisfy this invariant would be to stop analysing.
    // Assert the engine still does its job.
    for (const input of HOSTILE_INPUTS) {
      const cards = await analyzeContent(input);
      expect(cards.length, `no verdict for: ${input.slice(0, 40)}`).toBeGreaterThan(0);
    }
    expect(contacted).toEqual([]);
  });
});

describe("Privacy invariant — the route contract stays declared", () => {
  // The behavioural tests above cover the engine. The route is where the
  // contract is written down, and a future edit that quietly deletes it should
  // be visible in review.
  const routeSource = readFileSync(
    path.join(process.cwd(), "app/api/check/route.ts"),
    "utf8",
  );

  it("keeps the no-outbound-request contract documented on the check route", () => {
    expect(routeSource).toMatch(/must NEVER make an outbound HTTP request/i);
  });

  it("keeps connect-src 'self' in the CSP, the browser-layer half of the guarantee", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    // Match the directive as a quoted array entry, not the phrase anywhere in
    // the file — next.config.ts explains connect-src in a comment above the CSP,
    // so a bare substring check passes even if the active directive is deleted.
    const directives = config
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(directives).toMatch(/["'`]connect-src 'self'["'`,]/);
  });
});
