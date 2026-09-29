import { describe, it, expect } from "vitest";
import { browserForUserAgent } from "@/lib/detectBrowser";
import { installsForBrowser, INSTALL_TARGETS } from "@/lib/extensionInstalls";

// Real user agent strings, not constructed ones. Every browser here lies about
// being the others — Edge's contains "Chrome" and "Safari", Chrome's contains
// "Safari" — so a hand-written string would test the matcher against a shape
// the web never sends.
const UA = {
  chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  opera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0",
  firefoxIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/139.0 Mobile/15E148 Safari/605.1.15",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  edgeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 EdgiOS/140.0.0.0 Mobile/15E148 Safari/605.1.15",
  librewolf: "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0 LibreWolf/142.0",
  bot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
} as const;

describe("browserForUserAgent", () => {
  it("tells Edge apart from Chrome", () => {
    // The reason this returns a browser rather than a store: both install from
    // the same listing, but they are two buttons and an Edge reader should be
    // promoted their own.
    expect(browserForUserAgent(UA.chrome)).toBe("chrome");
    expect(browserForUserAgent(UA.edge)).toBe("edge");
    expect(browserForUserAgent(UA.chromeIos)).toBe("chrome");
    expect(browserForUserAgent(UA.edgeIos)).toBe("edge");
  });

  it("sends Opera to Chrome, which is the listing that serves it", () => {
    // Opera is Chromium but has no button of its own, so the honest promotion
    // is the one its install actually comes from.
    expect(browserForUserAgent(UA.opera)).toBe("chrome");
  });

  it("reads Firefox and its forks", () => {
    expect(browserForUserAgent(UA.firefox)).toBe("firefox");
    expect(browserForUserAgent(UA.firefoxAndroid)).toBe("firefox");
    expect(browserForUserAgent(UA.firefoxIos)).toBe("firefox");
    expect(browserForUserAgent(UA.librewolf)).toBe("firefox");
  });

  it("reads Safari only once every Chromium browser is excluded", () => {
    // This is the check that breaks if the order is rearranged: every string
    // above except Firefox's also contains "safari".
    expect(browserForUserAgent(UA.safari)).toBe("safari");
    expect(browserForUserAgent(UA.safariIos)).toBe("safari");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(browserForUserAgent(UA.bot)).toBeNull();
    expect(browserForUserAgent("")).toBeNull();
  });

  it("never mistakes a Chromium browser for Safari", () => {
    // The regression this ordering exists to prevent: promoting a Safari entry
    // that cannot be installed to someone running Chrome.
    for (const ua of [UA.chrome, UA.edge, UA.opera, UA.chromeIos, UA.edgeIos]) {
      expect(browserForUserAgent(ua)).not.toBe("safari");
    }
  });

  it("resolves to a browser the page actually lists", () => {
    const ids = new Set(INSTALL_TARGETS.map((t) => t.id));
    for (const ua of Object.values(UA)) {
      const id = browserForUserAgent(ua);
      if (id) expect(ids.has(id)).toBe(true);
    }
  });
});

describe("install targets", () => {
  it("gives Chrome and Edge a button each, backed by the same listing", () => {
    // The split is presentational. There is one Chromium artifact on one
    // listing with one user figure, and lib/extensionInstalls holds it that way
    // — "Chrome & Edge" on a button just made an Edge reader hunt for
    // themselves.
    const chrome = INSTALL_TARGETS.find((t) => t.id === "chrome");
    const edge = INSTALL_TARGETS.find((t) => t.id === "edge");
    expect(chrome?.store).toBe("chromium");
    expect(edge?.store).toBe("chromium");
    expect(chrome?.url).toBe(edge?.url);
  });

  it("keeps an unpublished browser listed", () => {
    // Opposite of dropping it: a browser missing from a list of four reads as
    // "not supported" rather than "not yet". The component renders a target
    // with no url as text, never as a link.
    const safari = INSTALL_TARGETS.find((t) => t.id === "safari");
    expect(safari).toBeDefined();
    expect(safari?.url).toBeNull();
  });
});

describe("installsForBrowser", () => {
  const authored = INSTALL_TARGETS.map((t) => t.id);

  it("puts the reader's own browser first without dropping the others", () => {
    const ordered = installsForBrowser("firefox");
    expect(ordered[0].id).toBe("firefox");
    expect(ordered).toHaveLength(INSTALL_TARGETS.length);
  });

  it("promotes Edge over Chrome for an Edge reader", () => {
    expect(installsForBrowser("edge")[0].id).toBe("edge");
    expect(installsForBrowser("chrome")[0].id).toBe("chrome");
  });

  it("leaves the order alone when the browser is unknown", () => {
    // The server render, and any user agent the matcher does not recognise.
    expect(installsForBrowser(null).map((t) => t.id)).toEqual(authored);
  });

  it("does not promote a browser you cannot install on", () => {
    // Safari today. Leading with a button that does nothing, and burying the
    // three that work behind it, is worse for that reader than leaving the
    // order alone — their browser is still listed, still marked "soon".
    expect(installsForBrowser("safari").map((t) => t.id)).toEqual(authored);
    expect(installsForBrowser("safari")[0].url).toBeTruthy();
  });

  it("never lists a browser twice", () => {
    for (const first of [...authored, null]) {
      const ids = installsForBrowser(first).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(INSTALL_TARGETS.length);
    }
  });
});
