// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Adding the app to a phone's home screen — what each platform actually
// allows, and what we are therefore allowed to offer.
//
// There is no "install" here in the app-store sense, and the copy never says
// there is: this is the PWA already described in app/manifest.ts (standalone
// display, icons, the share-sheet entry) being added to the home screen. What
// differs per platform is not the result but the ROUTE to it, and the route is
// the whole problem:
//
//   Chromium (Android, desktop) fires `beforeinstallprompt`, which we keep and
//   fire later from a button. One tap, native dialog, done.
//
//   iOS Safari has no such API — Apple has never shipped beforeinstallprompt —
//   so the only route is Share → Add to Home Screen, performed by hand in
//   browser chrome no web page can reach or point at. A button there can only
//   instruct.
//
//   Firefox and iOS Chrome/Firefox/Edge sit between: either an obscure menu
//   route or, on iOS, none at all, because every iOS browser is WebKit and only
//   Safari's share sheet carries the item.
//
// This module holds no JSX and no React import, same rule as lib/waysIn.ts.
//
// The honesty rule it encodes is the one lib/detectBrowser.ts already states
// for the extension — do not promote an install that cannot happen on the
// device reading the page. Offering an "Install" button to an iOS Chrome reader
// who has no route at all is exactly that failure, so this returns "none" and
// the UI renders nothing.

/**
 * How the reader can add the app, if at all.
 *
 * - `prompt`  — a deferred `beforeinstallprompt` is in hand; a button can fire it.
 * - `manual`  — no API, but a real route exists; the UI must teach the steps.
 * - `none`    — no route on this platform, or already installed. Show nothing.
 */
export type InstallRoute = "prompt" | "manual" | "none";

/** Which set of manual steps to show, when the route is `manual`. */
export type ManualPlatform = "ios-safari" | "ios-other" | "firefox" | "generic";

export interface InstallState {
  route: InstallRoute;
  /** Set only when route is "manual". */
  platform?: ManualPlatform;
}

/**
 * Whether the page is already running as an installed app.
 *
 * Two checks because the platforms disagree. `display-mode: standalone` is the
 * standard and covers Android and desktop Chromium; iOS Safari predates it and
 * sets the non-standard `navigator.standalone` instead. A reader who has
 * already added the app must not be shown a button offering to add it — that
 * is the clearest possible signal the page does not know what it is talking
 * about.
 *
 * Both are guarded: matchMedia is absent in some embedded webviews, and
 * `standalone` is iOS-only, so neither can be assumed to exist.
 */
export function isInstalled(nav: Navigator, win: Window): boolean {
  try {
    if (typeof win.matchMedia === "function") {
      // `minimal-ui` is Safari's; both mean "not in a browser tab".
      if (
        win.matchMedia("(display-mode: standalone)").matches ||
        win.matchMedia("(display-mode: minimal-ui)").matches
      ) {
        return true;
      }
    }
  } catch {
    // matchMedia unavailable or threw on an unknown feature. Fall through to
    // the iOS check rather than treating the uncertainty as installed — a
    // false "installed" hides the button from someone who could have used it.
  }
  return (nav as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Which manual route a user agent has, given that no prompt event arrived.
 *
 * Only reached when `beforeinstallprompt` did not fire, so every Chromium
 * browser that supports the API has already been handled and is not considered
 * here.
 *
 * The iOS split is the one that matters. iOS Safari has a genuine route — the
 * share sheet carries "Add to Home Screen" — while Chrome, Firefox and Edge on
 * iOS are WebKit wrappers whose own share sheets do not, so there is nothing to
 * instruct and we say so rather than teaching steps that dead-end. That is the
 * same call detectBrowser.ts makes when it returns null for every iOS browser.
 */
export function manualPlatformFor(ua: string, touchPoints = 0): ManualPlatform | null {
  const s = ua.toLowerCase();
  const isMac = s.includes("macintosh");

  // iPadOS 13 and later send a Macintosh UA by default — Apple's "request
  // desktop site" is the iPad's default, not an opt-in — so the string alone
  // reports a Mac. Those iPads have a real Add to Home Screen route and were
  // being offered nothing.
  //
  // Multi-touch is what separates them: a desktop Mac reports
  // maxTouchPoints 0, and no Mac ships a touchscreen. Used only to tell two
  // Apple platforms apart, never to gate a capability, so a wrong answer costs
  // the right steps rather than access to anything.
  const isIpadOs = isMac && touchPoints > 1;

  const isIos =
    s.includes("iphone") || s.includes("ipad") || s.includes("ipod") || isIpadOs;

  if (isIos) {
    // A non-Safari iOS browser identifies itself with a vendor token; real
    // Safari carries none. Checked first for the same reason detectBrowser
    // orders its cases: on iOS every one of these strings also contains
    // "safari".
    const wrapped =
      s.includes("crios") ||
      s.includes("fxios") ||
      s.includes("edgios") ||
      s.includes("opios");
    return wrapped ? "ios-other" : "ios-safari";
  }

  // Desktop Safari can add to the Dock in Sonoma and later, but the route
  // differs by OS version and we cannot tell which from a UA string. Nothing
  // is offered rather than steps that may not match the reader's menus.
  if (s.includes("android") && s.includes("firefox")) return "firefox";

  return null;
}

/**
 * The whole decision, from what the page knows about itself.
 *
 * `hasPrompt` is whether a `beforeinstallprompt` event was captured. It wins
 * over any UA reasoning: an event that actually fired is proof the route
 * exists, where a string parse is a guess.
 */
export function resolveInstallState(args: {
  hasPrompt: boolean;
  installed: boolean;
  userAgent: string;
  /**
   * Whether the viewport is handheld-sized. Required, not optional: this offer
   * is worded for a handheld device ("Keep it one tap away", a home-screen
   * icon), and desktop Chromium fires `beforeinstallprompt` just as readily —
   * where accepting it installs a desktop app window, not a home-screen icon.
   * An optional flag would let a caller omit it, type-check, and ship that
   * mismatch silently.
   */
  isHandheldViewport: boolean;
  /** `navigator.maxTouchPoints`, which is how an iPadOS Safari is told from a Mac. */
  touchPoints?: number;
}): InstallState {
  // Already added. Nothing to offer, on any platform.
  if (args.installed) return { route: "none" };

  const platform = manualPlatformFor(args.userAgent, args.touchPoints ?? 0);

  // An iPad is a home-screen device at any width, including the wide landscape
  // viewport that fails the handheld check. It is identified by platform
  // rather than size for exactly that reason — the offer is true there, and
  // gating it on width would withhold a route the device really has.
  const isHomeScreenDevice = args.isHandheldViewport || platform === "ios-safari";

  // Not a handheld. The prompt may well be available — this is the desktop
  // Chromium case — but what it installs is not what the copy describes, so
  // the honest move is to say nothing rather than reword a handheld offer for
  // a desktop that did not ask.
  if (!isHomeScreenDevice) return { route: "none" };

  if (args.hasPrompt) return { route: "prompt" };
  if (!platform) return { route: "none" };

  // Known to have no route. Listed explicitly rather than folded into the null
  // case above, because "we checked and there is genuinely no way" is a
  // different fact from "we did not recognise this browser" — and a future
  // reader of this code deserves to see that it was decided rather than missed.
  if (platform === "ios-other") return { route: "none" };

  return { route: "manual", platform };
}
