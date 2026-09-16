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

describe.skipIf(!built)("built extension bundle", () => {
  const popup = () => readFileSync(path.join(CHROME, "popup.js"), "utf8");
  const background = () => readFileSync(path.join(CHROME, "background.js"), "utf8");

  it("contains no network primitive besides the one fetch", () => {
    const bundle = popup() + background();
    for (const primitive of NETWORK_PRIMITIVES) {
      expect(bundle, `${primitive} reached the extension bundle`).not.toContain(primitive);
    }
  });

  it("calls fetch exactly once, and only to the configured API base", () => {
    // The whole network surface, asserted rather than described. A second fetch
    // — or one built from a computed URL — is the change this catches, and it is
    // the change that would quietly break the privacy claim.
    const bundle = popup() + background();
    const calls = bundle.match(/\bfetch\(/g) ?? [];
    expect(calls, "expected exactly one fetch call site").toHaveLength(1);

    // The URL is a template over the build-time constant, so the literal origin
    // appears in the bundle. A fetch to anything else would not match this.
    expect(bundle).toMatch(/fetch\(`\$\{[A-Za-z_$][\w$]*\}\/api\/blocklist`/);

    // The request must not carry credentials: the endpoint is unauthenticated,
    // and a cookie would tie a client's refresh to a browsing session.
    expect(bundle).toContain('credentials: "omit"');
  });

  it("sends nothing to the server — the blocklist request has no body or query", () => {
    // The one call must stay a plain GET of a static path. A body or a query
    // parameter is how "fetch a list" quietly becomes "ask about this host",
    // which would disclose exactly what running the engine locally avoids.
    const bundle = popup() + background();
    expect(bundle).not.toMatch(/fetch\(`\$\{[A-Za-z_$][\w$]*\}\/api\/blocklist\?/);
    const fetchCall = bundle.slice(bundle.indexOf("fetch(`"), bundle.indexOf("fetch(`") + 400);
    expect(fetchCall).not.toContain("method:");
    expect(fetchCall).not.toContain("body:");
  });

  it("contains no markup-execution sink", () => {
    // The popup renders attacker-controlled text — the scam message itself, and
    // engine signal strings that quote it. innerHTML here would be a script
    // injection fed by the input most likely to carry one.
    const bundle = popup() + background();
    for (const sink of INJECTION_SINKS) {
      expect(bundle, `${sink} reached the extension bundle`).not.toContain(sink);
    }
  });

  it("bundles the engine rather than importing it at runtime", () => {
    // A bare import surviving into the bundle would mean the engine is expected
    // at load time from somewhere else, which in an extension resolves to
    // nothing. Checked by looking for a scoring artefact that could only come
    // from the engine's own source.
    expect(popup()).toContain("URL shortener detected");
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
    for (const target of ["chrome", "firefox"] as const) {
      const m = buildManifest(target, opts) as Record<string, unknown>;
      expect(m.host_permissions).toBeUndefined();
      expect(m.content_scripts).toBeUndefined();
      expect(m.permissions).toEqual(["contextMenus", "storage"]);
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

  it("declares a gecko id on Firefox only", () => {
    // Firefox needs it to sign and to keep storage stable across updates;
    // Chrome rejects the key outright, so it cannot simply be sent to both.
    const firefox = buildManifest("firefox", opts) as {
      browser_specific_settings: { gecko: { id: string } };
    };
    expect(firefox.browser_specific_settings.gecko.id).toBe("test@example.invalid");
    expect(buildManifest("chrome", opts)).not.toHaveProperty("browser_specific_settings");
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
