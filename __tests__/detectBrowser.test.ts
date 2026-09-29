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
  });

  it("promotes nothing on iOS, where no browser can install an extension", () => {
    // Chrome and Firefox for iOS are WebKit with a badge and support no
    // extensions at all; the Safari build is macOS-only and unshipped. A
    // promoted store link would offer an install that cannot happen on the
    // device reading the page.
    expect(browserForUserAgent(UA.chromeIos)).toBeNull();
    expect(browserForUserAgent(UA.edgeIos)).toBeNull();
    expect(browserForUserAgent(UA.firefoxIos)).toBeNull();
    expect(browserForUserAgent(UA.safariIos)).toBeNull();
  });

  it("still recognises Firefox for Android, which does ship", () => {
    // Popup only — that runtime implements no menus API — but it is a real
    // install from the real listing, so it is promoted like any other.
    expect(browserForUserAgent(UA.firefoxAndroid)).toBe("firefox");
  });

  it("sends Opera to Chrome, which is the listing that serves it", () => {
    // Opera is Chromium but has no button of its own, so the honest promotion
    // is the one its install actually comes from.
    expect(browserForUserAgent(UA.opera)).toBe("chrome");
  });

  it("reads Firefox and its forks", () => {
    expect(browserForUserAgent(UA.firefox)).toBe("firefox");
    expect(browserForUserAgent(UA.librewolf)).toBe("firefox");
  });

  it("reads desktop Safari only once every Chromium browser is excluded", () => {
    // This is the check that breaks if the order is rearranged: every string
    // above except Firefox's also contains "safari".
    expect(browserForUserAgent(UA.safari)).toBe("safari");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(browserForUserAgent(UA.bot)).toBeNull();
    expect(browserForUserAgent("")).toBeNull();
  });

  it("never mistakes a Chromium browser for Safari", () => {
    // The regression this ordering exists to prevent: promoting a Safari entry
    // that cannot be installed to someone running Chrome.
    for (const ua of [UA.chrome, UA.edge, UA.opera]) {
      expect(browserForUserAgent(ua)).not.toBe("safari");
    }
  });

  it("never promotes a browser that cannot run the extension", () => {
    // The rule, stated once over every agent in the table: anything this
    // resolves must be a browser the extension actually installs on.
    const installable = new Set(["chrome", "edge", "firefox", "safari"]);
    for (const [name, ua] of Object.entries(UA)) {
      const id = browserForUserAgent(ua);
      if (name.toLowerCase().includes("ios")) {
        expect(id, `${name} must promote nothing`).toBeNull();
      } else if (id) {
        expect(installable.has(id), `${name} -> ${id}`).toBe(true);
      }
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
  it("gives Chrome and Edge separate listings", () => {
    // They shared one while only branding separated them. The extension is on
    // the Chrome Web Store and has not been submitted to Edge Add-ons, so the
    // two now differ in the one way a reader cares about: whether they can
    // install it today.
    const chrome = INSTALL_TARGETS.find((t) => t.id === "chrome");
    const edge = INSTALL_TARGETS.find((t) => t.id === "edge");
    expect(chrome?.url).toBeTruthy();
    expect(edge?.url).toBeNull();
    expect(edge?.store).not.toBe(chrome?.store);
  });

  it("keeps an unpublished browser listed", () => {
    // Opposite of dropping it: a browser missing from a list of four reads as
    // "not supported" rather than "not yet". The component renders a target
    // with no url as text, never as a link.
    for (const id of ["edge", "safari"] as const) {
      const target = INSTALL_TARGETS.find((t) => t.id === id);
      expect(target, id).toBeDefined();
      expect(target?.url, id).toBeNull();
    }
  });
});

describe("installsForBrowser", () => {
  const authored = INSTALL_TARGETS.map((t) => t.id);
  // What the page actually renders with no browser known: installable first,
  // each group in authored order.
  const grouped = [
    ...INSTALL_TARGETS.filter((t) => t.url).map((t) => t.id),
    ...INSTALL_TARGETS.filter((t) => !t.url).map((t) => t.id),
  ];

  it("puts the reader's own browser first without dropping the others", () => {
    const ordered = installsForBrowser("firefox");
    expect(ordered[0].id).toBe("firefox");
    expect(ordered).toHaveLength(INSTALL_TARGETS.length);
  });

  it("promotes Chrome for a Chrome reader", () => {
    expect(installsForBrowser("chrome")[0].id).toBe("chrome");
  });

  it("does not promote Edge, which has no listing yet", () => {
    // Same rule as Safari: promotion is for a browser you can install on.
    // Leading an Edge reader with a button that does nothing would bury the
    // ones that work. Their row is still there, still marked, at the end.
    expect(installsForBrowser("edge").map((t) => t.id)).toEqual(grouped);
    expect(installsForBrowser("edge")[0].url).toBeTruthy();
  });

  it("does not promote Safari either", () => {
    expect(installsForBrowser("safari").map((t) => t.id)).toEqual(grouped);
    expect(installsForBrowser("safari")[0].url).toBeTruthy();
  });

  it("groups every unpublished browser at the end", () => {
    // Interleaved, the "soon" buttons broke the row of real choices in half.
    // Whatever the reader is on, the list is installable-first.
    for (const first of [...authored, null]) {
      const urls = installsForBrowser(first).map((t) => Boolean(t.url));
      const firstPending = urls.indexOf(false);
      if (firstPending === -1) continue;
      expect(
        urls.slice(firstPending).every((u) => !u),
        `${first}: a working button follows a pending one`,
      ).toBe(true);
    }
  });

  it("keeps the authored order inside each group", () => {
    // Grouping decides which half a button lands in; the authored order still
    // decides Chrome before Firefox, and Edge before Safari.
    const ids = installsForBrowser(null).map((t) => t.id);
    const available = authored.filter((id) =>
      INSTALL_TARGETS.find((t) => t.id === id)?.url,
    );
    const pending = authored.filter(
      (id) => !INSTALL_TARGETS.find((t) => t.id === id)?.url,
    );
    expect(ids).toEqual([...available, ...pending]);
  });

  it("groups on the server render too, so hydration only promotes", () => {
    // Null is what getServerSnapshot returns. If grouping happened only once a
    // browser was known, the first paint would reorder under the reader.
    expect(installsForBrowser(null).map((t) => t.id)).toEqual(grouped);
  });

  it("never lists a browser twice", () => {
    for (const first of [...authored, null]) {
      const ids = installsForBrowser(first).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(INSTALL_TARGETS.length);
    }
  });
});
