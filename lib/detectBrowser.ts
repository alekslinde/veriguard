// Which browser family a user agent string belongs to.
//
// Used for ONE thing: putting the reader's own store first in the extension's
// list of install links. Nothing is hidden on a wrong guess and nothing is
// scored on it — every store stays listed and reachable, so the cost of being
// wrong is that someone reads two lines instead of one. That is the only
// reason sniffing the user agent is acceptable here; it would not be for
// anything that changed what a person can do.
//
// Deliberately NOT userAgentData. That API is Chromium-only, so a feature
// detect on it would answer "is this Chrome" by asking whether Chrome's API
// exists — and every other browser would fall through to the same default the
// string parse already handles, for an async call and a second code path.

import type { InstallTarget } from "@/lib/extensionInstalls";

/**
 * Maps a user agent to the browser the reader is using, or null when it is not
 * one we list.
 *
 * ORDER IS LOAD-BEARING. Every one of these browsers lies about being the
 * others: Edge's UA contains "Chrome" and "Safari", Chrome's contains "Safari",
 * and Firefox forks keep "Firefox". So the checks run most-specific first and
 * the generic names are only reached once the impostors are ruled out.
 *
 * Opera resolves to "chrome" rather than to a target of its own. It installs
 * from the Chrome Web Store like Edge does, but unlike Edge it is not listed as
 * a button — so the honest promotion is the one that actually serves it. An
 * Opera reader sees Chrome first, which is where their install comes from.
 */
export function browserForUserAgent(ua: string): InstallTarget["id"] | null {
  const s = ua.toLowerCase();

  // Firefox first: its forks (LibreWolf, Waterfox) keep the token, and nothing
  // else claims it.
  if (s.includes("firefox") || s.includes("fxios")) return "firefox";

  // Edge before Chrome, because its string contains both. "edg/" not "edge":
  // the legacy EdgeHTML browser used "Edge/" and cannot run this extension,
  // while the Chromium one uses "Edg/".
  if (s.includes("edg/") || s.includes("edgios") || s.includes("edga")) return "edge";

  // Opera is a Chromium browser with no button of its own; the Chrome listing
  // is what serves it.
  if (s.includes("opr/") || s.includes("opera")) return "chrome";

  // Real Safari is what is left once every Chromium browser is excluded — all
  // of them carry "safari" in the string.
  if (s.includes("chrome") || s.includes("chromium") || s.includes("crios")) return "chrome";
  if (s.includes("safari")) return "safari";

  return null;
}

/**
 * The reader's browser, or null when it cannot be determined.
 *
 * Returns null during server rendering, which is the correct answer rather than
 * a fallback: the page is rendered once and served to everyone, so there is no
 * current browser at that moment. The caller renders the unordered list and
 * reorders after hydration.
 */
export function currentBrowser(): InstallTarget["id"] | null {
  if (typeof navigator === "undefined") return null;
  return browserForUserAgent(navigator.userAgent);
}
