// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  manualPlatformFor,
  resolveInstallState,
  isInstalled,
} from "@/lib/installPrompt";
import { translate } from "@/lib/i18n";


// Real strings, because the whole module is a parse of these and a paraphrase
// would test the paraphrase. Trimmed to the parts that carry the vendor tokens.
const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iosFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iosEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.0 Mobile/15E148 Safari/604.1",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

// iPadOS 13+ Safari sends this by default — identical to a desktop Mac's, which
// is the whole difficulty. Only maxTouchPoints separates them.
const IPADOS_UA = UA.macSafari;

describe("manualPlatformFor", () => {
  it("gives iOS Safari the share-sheet route", () => {
    expect(manualPlatformFor(UA.iosSafari)).toBe("ios-safari");
    expect(manualPlatformFor(UA.ipad)).toBe("ios-safari");
  });

  it("separates the iOS browsers that have no route from Safari", () => {
    // Every one of these contains "safari" in its UA, so a naive check would
    // teach them Safari's share-sheet steps — which their own share sheets do
    // not carry.
    for (const ua of [UA.iosChrome, UA.iosFirefox, UA.iosEdge]) {
      expect(manualPlatformFor(ua)).toBe("ios-other");
    }
  });

  it("offers nothing on desktop Safari", () => {
    // Add-to-Dock exists on recent macOS but the route differs by OS version,
    // and the UA cannot say which. No steps beat wrong steps.
    expect(manualPlatformFor(UA.macSafari, 0)).toBeNull();
  });

  it("finds an iPad behind the Macintosh UA it now sends", () => {
    // iPadOS 13+ requests desktop sites BY DEFAULT, so the string says
    // Macintosh and the device was being offered nothing despite having a real
    // Add to Home Screen route. Touch is what tells them apart: no Mac has a
    // touchscreen.
    expect(manualPlatformFor(IPADOS_UA, 5)).toBe("ios-safari");
    expect(manualPlatformFor(IPADOS_UA, 0)).toBeNull();
  });

  it("gives Firefox on Android its menu route", () => {
    expect(manualPlatformFor(UA.androidFirefox)).toBe("firefox");
  });
});

describe("resolveInstallState", () => {
  it("prefers a real prompt event over any UA guess", () => {
    expect(
      resolveInstallState({ hasPrompt: true, installed: false, userAgent: UA.androidChrome, isHandheldViewport: true }),
    ).toEqual({ route: "prompt" });
  });

  it("offers nothing once the app is installed", () => {
    // The clearest way to look broken: offering to add something already added.
    for (const ua of Object.values(UA)) {
      expect(
        resolveInstallState({ hasPrompt: true, installed: true, userAgent: ua, isHandheldViewport: true }),
        ua,
      ).toEqual({ route: "none" });
    }
  });

  it("teaches the manual route on iOS Safari, where no API exists", () => {
    expect(
      resolveInstallState({ hasPrompt: false, installed: false, userAgent: UA.iosSafari, isHandheldViewport: true }),
    ).toEqual({ route: "manual", platform: "ios-safari" });
  });

  it("offers nothing on an iOS browser that cannot do it at all", () => {
    // The honesty rule this shares with detectBrowser.ts: never promote
    // something the device reading the page cannot do.
    for (const ua of [UA.iosChrome, UA.iosFirefox, UA.iosEdge]) {
      expect(
        resolveInstallState({ hasPrompt: false, installed: false, userAgent: ua, isHandheldViewport: true }),
        ua,
      ).toEqual({ route: "none" });
    }
  });

  it("offers nothing on a desktop, even holding a real prompt event", () => {
    // Desktop Chromium fires beforeinstallprompt too, and accepting it installs
    // a desktop app window — not the home-screen icon this copy describes. The
    // event being genuine is exactly why this needs its own gate.
    expect(
      resolveInstallState({
        hasPrompt: true,
        installed: false,
        userAgent: UA.androidChrome,
        isHandheldViewport: false,
      }),
    ).toEqual({ route: "none" });
  });

  it("still offers an iPad at a desktop-width viewport", () => {
    // The width gate must not swallow the one tablet that genuinely has the
    // route; it is identified by platform rather than size.
    expect(
      resolveInstallState({
        hasPrompt: false,
        installed: false,
        userAgent: IPADOS_UA,
        isHandheldViewport: false,
        touchPoints: 5,
      }),
    ).toEqual({ route: "manual", platform: "ios-safari" });
  });

  it("offers nothing on Chromium until its prompt event actually arrives", () => {
    // Android Chrome has a route, but only via the event. Guessing "manual"
    // from the UA would print generic menu steps over a browser about to offer
    // one-tap install.
    expect(
      resolveInstallState({ hasPrompt: false, installed: false, userAgent: UA.androidChrome, isHandheldViewport: true }),
    ).toEqual({ route: "none" });
  });
});

describe("isInstalled", () => {
  const nav = (standalone?: boolean) => ({ standalone }) as unknown as Navigator;
  const win = (matches: boolean) =>
    ({ matchMedia: () => ({ matches }) }) as unknown as Window;

  it("reads the standard display-mode", () => {
    expect(isInstalled(nav(), win(true))).toBe(true);
    expect(isInstalled(nav(), win(false))).toBe(false);
  });

  it("reads iOS's non-standard flag, which predates display-mode", () => {
    expect(isInstalled(nav(true), win(false))).toBe(true);
  });

  it("treats a throwing matchMedia as not installed", () => {
    // Failing towards showing the button: an unusable offer is a smaller
    // problem than hiding it from someone who could have used it.
    const throwing = {
      matchMedia: () => {
        throw new Error("unsupported");
      },
    } as unknown as Window;
    expect(isInstalled(nav(), throwing)).toBe(false);
  });

  it("survives a window with no matchMedia at all", () => {
    expect(isInstalled(nav(), {} as unknown as Window)).toBe(false);
  });
});

describe("copy", () => {
  it("resolves every string the component renders", () => {
    for (const key of [
      "install.action",
      "install.how",
      "install.title",
      "install.blurb",
      "install.ios.step1",
      "install.ios.step2",
      "install.ios.step3",
      "install.menu.step1",
      "install.menu.step2",
      "install.menu.step3",
    ] as const) {
      expect(translate("en", key), key).toBeTruthy();
    }
  });

  it("never calls this an app-store install", () => {
    // The app is a PWA — there is nothing to download and no store involved.
    // Copy that implied otherwise would be the exact kind of claim this tool
    // exists to teach people to distrust.
    const blurb = translate("en", "install.blurb").toLowerCase();
    expect(blurb).toContain("no app store");
    expect(translate("en", "install.action").toLowerCase()).not.toContain("download");
  });
});
