// The extension's central claim, asserted against the built artifact.
//
// "The bundled engine makes no network call" is the property the whole
// WebExtension rests on: it is what lets the popup run offline, what keeps the
// user's IP away from a scammer's shortener, and what the store listing tells
// users in as many words. Every other test in this repo checks source. This one
// checks the file that ships, because the bundle is what a user installs and a
// reviewer reads — and a dependency, a transform or a config change could put a
// `fetch` into it without any source file in this repo mentioning one.
//
// Requires a build. `npm run ext` produces it; the suite skips rather than fails
// when `dist/` is absent, so a fresh clone running `npm test` is not blocked on
// a build step. The skip is visible in the output, which is the honest failure
// mode — a silent pass would make this test evidence of something it never
// checked.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildManifest } from "../extension/src/manifest";

const DIST = path.join(process.cwd(), "extension/dist");
const CHROME = path.join(DIST, "chrome");
const built = existsSync(path.join(CHROME, "popup.js"));

/**
 * Network primitives that must not appear at all.
 *
 * `fetch` is deliberately absent from this list and asserted separately below:
 * the extension makes exactly one network call, to fetch the blocklist, so the
 * claim worth enforcing is not "no fetch" but "one fetch, to one place".
 * Everything here has no legitimate use in this bundle.
 *
 * Matched as substrings against the unminified bundle — which is exactly why
 * the build does not minify. A mangler would rename nothing here (these are all
 * global property accesses) but could reformat them past a naive match, and the
 * point of this test is that it is simple enough to trust.
 */
const NETWORK_PRIMITIVES = [
  "XMLHttpRequest",
  "sendBeacon",
  "new WebSocket",
  "EventSource",
  "navigator.connection",
];

const INJECTION_SINKS = ["innerHTML", "outerHTML", "document.write", "eval(", "new Function("];

/**
 * Every entry that ships, read whole.
 *
 * Each is built separately and is self-contained — see the note on
 * `rollupOptions` — so the blocklist fetch appears once *per entry* rather than
 * once in total. That is why the call-count assertion below is per file: a
 * count over the concatenation would grow with every new entry and say nothing
 * about whether any one of them gained a second call site.
 */
const ENTRIES = ["popup.js", "background.js", "onboarding.js"] as const;

describe.skipIf(!built)("built extension bundle", () => {
  const read = (file: string) => readFileSync(path.join(CHROME, file), "utf8");
  const everything = () => ENTRIES.map(read).join("\n");

  it("ships every entry the manifest and pages reference", () => {
    // A missing entry is a silent failure: the onboarding page would open as
    // unstyled markup with a dead script tag, on first run, which is the one
    // impression that cannot be retaken.
    for (const file of [...ENTRIES, "popup.html", "popup.css", "onboarding.html", "onboarding.css"]) {
      expect(existsSync(path.join(CHROME, file)), `${file} missing from the build`).toBe(true);
    }
  });

  it("contains no network primitive besides the one fetch", () => {
    const bundle = everything();
    for (const primitive of NETWORK_PRIMITIVES) {
      expect(bundle, `${primitive} reached the extension bundle`).not.toContain(primitive);
    }
  });

  it("calls fetch at most once per entry, and only to the configured API base", () => {
    // The whole network surface, asserted rather than described. A second fetch
    // — or one built from a computed URL — is the change this catches, and it is
    // the change that would quietly break the privacy claim.
    //
    // Per entry rather than in total: each is bundled self-contained, so an
    // entry that checks anything carries its own copy of the one blocklist
    // call. What must stay true is that no single entry has two.
    //
    // At most, not exactly: an entry that never checks makes no call at all.
    // The onboarding page is one — it is three columns of prose and a button —
    // and an entry with zero is strictly better than one with one, so requiring
    // exactly one would fail a page for being more private than the claim.
    for (const file of ENTRIES) {
      const bundle = read(file);
      const calls = bundle.match(/\bfetch\(/g) ?? [];
      expect(
        calls.length,
        `${file}: expected at most one fetch call site, found ${calls.length}`,
      ).toBeLessThanOrEqual(1);

      if (calls.length === 0) continue;

      // The URL is a template over the build-time constant, so the literal origin
      // appears in the bundle. A fetch to anything else would not match this.
      expect(bundle, file).toMatch(/fetch\(`\$\{[A-Za-z_$][\w$]*\}\/api\/blocklist`/);

      // The request must not carry credentials: the endpoint is unauthenticated,
      // and a cookie would tie a client's refresh to a browsing session.
      expect(bundle, file).toContain('credentials: "omit"');
    }
  });

  it("keeps the first-run page off the network entirely", () => {
    // Stronger than the bound above, and worth pinning separately because it is
    // a property of this page rather than of the extension: it runs on install,
    // before the user has decided anything, and a request from it would be the
    // closest thing to a phone-home this product could have. The page is
    // packaged prose — nothing it shows requires the network or the engine.
    expect(read("onboarding.js")).not.toMatch(/\bfetch\(/);
  });

  it("sends nothing to the server — the blocklist request has no body or query", () => {
    // The one call must stay a plain GET of a static path. A body or a query
    // parameter is how "fetch a list" quietly becomes "ask about this host",
    // which would disclose exactly what running the engine locally avoids.
    const bundle = everything();
    expect(bundle).not.toMatch(/fetch\(`\$\{[A-Za-z_$][\w$]*\}\/api\/blocklist\?/);
    const fetchCall = bundle.slice(bundle.indexOf("fetch(`"), bundle.indexOf("fetch(`") + 400);
    expect(fetchCall).not.toContain("method:");
    expect(fetchCall).not.toContain("body:");
  });

  it("hands the report to the site rather than submitting one", () => {
    // The report button opens the site's form with the identifiers prefilled.
    // It must never POST: that would be a second network call carrying the
    // user's pasted content, which is the exact claim this extension makes
    // about itself. The one-fetch assertion above already bounds the call
    // count; this names the path that would most plausibly add one, so the
    // failure message points at the reason rather than just the count.
    const bundle = everything();
    expect(bundle).toContain("/report?");
    expect(bundle, "the report path must not POST").not.toMatch(/method:\s*"POST"/i);
    expect(bundle, "a report must not be submitted from the extension").not.toContain(
      "/api/report",
    );
  });

  it("stamps each build with its own report label", () => {
    // The `source` param on a report link is the extension's ONLY measurable
    // outcome — it scores on-device and never calls the API, so an unlabelled
    // report is indistinguishable from someone who typed the URL.
    //
    // Asserted against the built files because the value comes from a Vite
    // `define` keyed on TARGET: a source test sees whatever vitest.config
    // injects and would pass for both builds no matter what the real build
    // did. Reading the Firefox output is the point — a mistake here ships two
    // bundles claiming to be Chromium, and the failure is invisible until the
    // numbers are read months later.
    // No early return on a missing Firefox build. Skipping would make this
    // pass while asserting nothing about the build it exists to check — the
    // failure shape this whole file is written against. `npm run ext` builds
    // both, so an absent one is a broken build, not a valid state.
    const firefoxPopup = path.join(DIST, "firefox", "popup.js");
    expect(
      existsSync(firefoxPopup),
      "the firefox build is missing — run `npm run ext`, which builds both targets",
    ).toBe(true);

    expect(read("popup.js"), "the chrome build is mislabelled").toContain('=== "ext-chromium"');
    expect(
      readFileSync(firefoxPopup, "utf8"),
      "the firefox build is mislabelled",
    ).toContain('=== "ext-firefox"');
  });

  it("keeps the report label free of anything identifying", () => {
    // It names a build, never a person or a session. The allowlist in
    // lib/reportPrefill.ts is what enforces that, and this pins the property
    // at the artifact: no id, timestamp or random value may ride along.
    // Asserted, not guarded on. An early return here would pass silently if
    // the label were removed altogether, which is the change most likely to
    // happen by accident and the one nothing else in this file would notice.
    const bundle = everything();
    expect(bundle, "the report link no longer carries a source label").toMatch(
      /params\.set\("source"/,
    );
    expect(bundle, "a report link must not carry a generated id").not.toMatch(
      /params\.set\("(uid|cid|sid|session|install)/i,
    );
  });

  it("contains no markup-execution sink", () => {
    // The popup and the onboarding page both render attacker-controlled text —
    // the scam message itself, and engine signal strings that quote it, through
    // the shared `verdictView`. innerHTML here would be a script injection fed
    // by the input most likely to carry one.
    const bundle = everything();
    for (const sink of INJECTION_SINKS) {
      expect(bundle, `${sink} reached the extension bundle`).not.toContain(sink);
    }
  });

  it("emits self-contained entries, so none needs a module manifest", () => {
    // Safari does not support `"type": "module"` on a background service
    // worker. It drops the key with a warning, the worker then fails on its
    // first import, and the context menu is never registered — nothing errors
    // visibly, the entry point just does not exist.
    //
    // The build therefore emits each entry alone rather than letting Rollup
    // hoist shared code into a chunk the entries import. This asserts the
    // output property that makes that true, because the failure it prevents is
    // silent and only shows up in Safari.
    for (const file of ENTRIES) {
      const source = read(file);
      expect(source, `${file} carries a bare import`).not.toMatch(/^\s*import\s/m);
      expect(source, `${file} carries a re-export`).not.toMatch(/^\s*export\s+\{/m);
    }
  });

  it("declares no module type on the background script", () => {
    // The other half of the same property: even with self-contained output, a
    // stray `type: "module"` would break Safari for no benefit.
    const manifest = JSON.parse(readFileSync(path.join(CHROME, "manifest.json"), "utf8")) as {
      background: Record<string, unknown>;
    };
    expect(manifest.background.type).toBeUndefined();
  });

  it("ships the Safari wrapper's app icon", () => {
    // The generated Xcode project references Resources/Icon.png and does not
    // create it. Without it the Safari build FAILS, where Chrome and Firefox
    // would merely render a placeholder — so its absence is a broken release,
    // not a cosmetic gap.
    expect(existsSync(path.join(CHROME, "Icon.png"))).toBe(true);
  });

  it("bundles the engine rather than importing it at runtime", () => {
    // A bare import surviving into the bundle would mean the engine is expected
    // at load time from somewhere else, which in an extension resolves to
    // nothing. Checked by looking for a scoring artefact that could only come
    // from the engine's own source.
    expect(read("popup.js")).toContain("URL shortener detected");
  });
});

describe("extension manifest", () => {
  const opts = {
    version: "9.9.9",
    geckoId: "test@example.invalid",
    apiBase: "https://api.example.invalid",
  };

  it("asks for no host permissions on either target", () => {
    // Host permissions are the difference between "checks text you give it" and
    // "can read every page you visit". Nothing in this extension reads a page.
    //
    // The permission list is pinned exactly rather than merely checked for
    // absences, because the list is what a store shows a user at install time
    // and what AMO reviews line by line. Every entry here grants no read access
    // to browsing: `contextMenus` adds a menu item, `storage` writes locally,
    // `notifications` shows a box. A permission that reads anything about where
    // the user has been is the change this is here to make visible.
    for (const target of ["chrome", "firefox"] as const) {
      const m = buildManifest(target, opts) as Record<string, unknown>;
      expect(m.host_permissions).toBeUndefined();
      expect(m.content_scripts).toBeUndefined();
      expect(m.permissions).toEqual(["contextMenus", "storage", "notifications"]);
    }
  });

  it("uses each browser's own background form", () => {
    const chrome = buildManifest("chrome", opts) as { background: Record<string, unknown> };
    expect(chrome.background.service_worker).toBe("background.js");
    expect(chrome.background.scripts).toBeUndefined();

    const firefox = buildManifest("firefox", opts) as { background: Record<string, unknown> };
    expect(firefox.background.scripts).toEqual(["background.js"]);
    expect(firefox.background.service_worker).toBeUndefined();
  });

  it("keeps the Chrome build installable in Edge", () => {
    // Edge is Chromium, so it takes the Chrome build unmodified — there is no
    // separate target, and this is what keeps that true rather than a thing
    // someone remembers. What would break it is a Firefox-only manifest key
    // reaching the Chrome variant: Edge rejects the manifest outright, and the
    // extension simply fails to install.
    const chrome = buildManifest("chrome", opts) as Record<string, unknown>;
    for (const geckoOnly of ["browser_specific_settings", "applications"]) {
      expect(chrome[geckoOnly], `${geckoOnly} would break the Edge install`).toBeUndefined();
    }
    // MV2 has been unsupported in Edge's store since 2024.
    expect(chrome.manifest_version).toBe(3);
  });

  it("declares a gecko id on Firefox only", () => {
    // Firefox needs it to sign and to keep storage stable across updates;
    // Chrome rejects the key outright, so it cannot simply be sent to both.
    const firefox = buildManifest("firefox", opts) as {
      browser_specific_settings: { gecko: { id: string } };
    };
    expect(firefox.browser_specific_settings.gecko.id).toBe("test@example.invalid");
    expect(buildManifest("chrome", opts)).not.toHaveProperty("browser_specific_settings");
  });

  it("declares to Firefox that it collects no data", () => {
    // AMO requires this key on new add-ons and rejects a submission without it.
    // More than a formality: `none` is the manifest saying the same thing as the
    // description, the CSP and the store listings — nothing derived from what a
    // user pastes leaves the device.
    //
    // `none` is exclusive by specification: it cannot appear alongside any other
    // data type. So a change that started collecting something could not just
    // add to this list, it would have to remove `none` — and Firefox would then
    // prompt every existing user for data consent on update. That is why this is
    // pinned exactly rather than merely checked for presence.
    const firefox = buildManifest("firefox", opts) as {
      browser_specific_settings: {
        gecko: { data_collection_permissions: { required: string[] } };
      };
    };
    const declared = firefox.browser_specific_settings.gecko.data_collection_permissions;
    expect(declared).toEqual({ required: ["none"] });
    expect(declared).not.toHaveProperty("optional");
  });

  it("sets a minimum version that actually supports the keys it declares", () => {
    // AMO's linter compares `strict_min_version` against the version each
    // manifest key was introduced in, and warns per key when the floor is older.
    // `data_collection_permissions` landed in Firefox 140 on desktop and 142 on
    // Android, which is the only reason these particular numbers are here — so
    // they are asserted next to the key that forces them.
    //
    // Nothing is lost by the floor: Firefox ESR 115 went end-of-life in March
    // 2026, so every version still receiving security updates is well past both.
    const firefox = buildManifest("firefox", opts) as {
      browser_specific_settings: {
        gecko: { strict_min_version: string };
        gecko_android: { strict_min_version: string };
      };
    };
    const { gecko, gecko_android } = firefox.browser_specific_settings;
    expect(Number.parseFloat(gecko.strict_min_version)).toBeGreaterThanOrEqual(140);
    expect(Number.parseFloat(gecko_android.strict_min_version)).toBeGreaterThanOrEqual(142);
  });

  it("locks extension pages to their own scripts", () => {
    for (const target of ["chrome", "firefox"] as const) {
      const m = buildManifest(target, opts) as {
        content_security_policy: { extension_pages: string };
      };
      expect(m.content_security_policy.extension_pages).toContain("script-src 'self'");
      expect(m.content_security_policy.extension_pages).not.toContain("unsafe-eval");
      expect(m.content_security_policy.extension_pages).not.toContain("unsafe-inline");
    }
  });

  it("bounds connect-src to the one origin it fetches from", () => {
    // This is the browser-enforced bound on the extension's single network
    // call. A wildcard here would let any code path — including one added
    // later — reach anywhere, which is precisely what the offline claim rules
    // out. The CSP is the enforcement; the comment in blocklist.ts is not.
    for (const target of ["chrome", "firefox"] as const) {
      const m = buildManifest(target, opts) as {
        content_security_policy: { extension_pages: string };
      };
      const csp = m.content_security_policy.extension_pages;
      expect(csp).toContain(`connect-src ${opts.apiBase}`);
      expect(csp).not.toContain("connect-src *");
      expect(csp).not.toMatch(/connect-src[^;]*\shttps:(\s|;|$)/);
    }
  });
});
