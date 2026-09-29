import { describe, it, expect } from "vitest";
import { storeForUserAgent } from "@/lib/detectBrowser";
import { installsForStore, EXTENSION_LISTINGS } from "@/lib/extensionInstalls";

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

describe("storeForUserAgent", () => {
  it("reads the Chromium family, including the ones carrying other names", () => {
    // Edge and Opera install the Chromium build from the Chrome Web Store, so
    // they resolve to the listing that actually serves them rather than to
    // nothing.
    expect(storeForUserAgent(UA.chrome)).toBe("chromium");
    expect(storeForUserAgent(UA.edge)).toBe("chromium");
    expect(storeForUserAgent(UA.opera)).toBe("chromium");
    expect(storeForUserAgent(UA.chromeIos)).toBe("chromium");
    expect(storeForUserAgent(UA.edgeIos)).toBe("chromium");
  });

  it("reads Firefox and its forks", () => {
    expect(storeForUserAgent(UA.firefox)).toBe("firefox");
    expect(storeForUserAgent(UA.firefoxAndroid)).toBe("firefox");
    expect(storeForUserAgent(UA.firefoxIos)).toBe("firefox");
    expect(storeForUserAgent(UA.librewolf)).toBe("firefox");
  });

  it("reads Safari only once every Chromium browser is excluded", () => {
    // This is the check that breaks if the order is rearranged: every string
    // above except Firefox's also contains "safari".
    expect(storeForUserAgent(UA.safari)).toBe("safari");
    expect(storeForUserAgent(UA.safariIos)).toBe("safari");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(storeForUserAgent(UA.bot)).toBeNull();
    expect(storeForUserAgent("")).toBeNull();
  });

  it("does not mistake a Chromium browser for Safari", () => {
    // The regression this ordering exists to prevent: sending a Chrome user to
    // a Safari listing that does not exist.
    for (const ua of [UA.chrome, UA.edge, UA.opera, UA.chromeIos, UA.edgeIos]) {
      expect(storeForUserAgent(ua)).not.toBe("safari");
    }
  });
});

describe("installsForStore", () => {
  const published = EXTENSION_LISTINGS.filter((l) => l.url);

  it("lists only stores that are actually published", () => {
    // A row you cannot install from is not an install link. Safari is built but
    // unsubmitted, and appears nowhere in this list.
    for (const l of installsForStore(null)) expect(l.url).toBeTruthy();
    expect(installsForStore(null)).toHaveLength(published.length);
  });

  it("puts the reader's own store first without dropping the others", () => {
    const ordered = installsForStore("firefox");
    expect(ordered[0].store).toBe("firefox");
    expect(ordered).toHaveLength(published.length);
  });

  it("leaves the order alone when the browser is unknown", () => {
    // The server render, and any user agent the matcher does not recognise.
    expect(installsForStore(null).map((l) => l.store)).toEqual(
      published.map((l) => l.store),
    );
  });

  it("promotes nothing for a store we do not publish to", () => {
    // Safari today: the reader's browser is known, but there is no listing to
    // lift. Returning the list unchanged beats an empty promotion slot.
    expect(installsForStore("safari").map((l) => l.store)).toEqual(
      published.map((l) => l.store),
    );
  });

  it("never lists a store twice", () => {
    for (const first of ["chromium", "firefox", "safari"] as const) {
      const stores = installsForStore(first).map((l) => l.store);
      expect(new Set(stores).size).toBe(stores.length);
    }
  });
});
