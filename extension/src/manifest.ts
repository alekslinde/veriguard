// The manifest, as one source with two targets.
//
// Chrome/Edge and Firefox differ in ways that are cheap to decide now and
// invasive to retrofit, so both variants are generated from this file rather
// than maintained as two hand-edited JSON blobs that drift.
//
// The differences that actually matter here:
//
//   · MV3 background — Chrome takes `service_worker`, Firefox takes a `scripts`
//     array. Firefox does support `service_worker` in newer releases but event
//     pages remain the compatible choice, and this extension's background work
//     is a context-menu listener, which an event page serves fine.
//   · `browser_specific_settings` — Firefox requires an explicit add-on id to
//     sign and to keep storage stable across updates, and, for new add-ons, a
//     `data_collection_permissions` declaration. Chrome rejects the key
//     outright, so it cannot simply be left in both.
//
// Not varied, deliberately: permissions. Both browsers get the same, minimal
// set, so a review of one is a review of the other.

export type Target = "chrome" | "firefox";

/**
 * Permissions, each with the reason it is requested.
 *
 * AMO reviews source and asks why each permission exists; so should we. Anything
 * that cannot be justified in one line here does not belong in the manifest.
 *
 *   · contextMenus — the entire entry point: right-click selected text → check.
 *   · storage      — remembers the region choice between popups. Local only.
 *
 * Deliberately absent, and each absence is a property worth keeping:
 *
 *   · No host permissions. The engine is bundled, so a text check reads nothing
 *     from the page and talks to no server. An extension that can read every
 *     site is a different product with a different risk profile.
 *   · No `tabs`. The context menu passes the selected text directly; knowing the
 *     URL of every tab is not needed to score a string.
 *   · No `<all_urls>` content script. Nothing is injected into pages at all.
 */
const PERMISSIONS = ["contextMenus", "storage"] as const;

interface ManifestOptions {
  version: string;
  /** Firefox add-on id. Required for signing; ignored on Chrome. */
  geckoId: string;
  /**
   * Origin the blocklist is fetched from, and the only origin the popup may
   * contact. Named in the CSP below rather than left to the default so the one
   * network call this extension makes is declared, reviewable, and bounded to a
   * single host.
   */
  apiBase: string;
}

export function buildManifest(
  target: Target,
  { version, geckoId, apiBase }: ManifestOptions,
): object {
  const base = {
    manifest_version: 3,
    name: "Veriguard — scam check",
    // Reads as the sentence a user sees in the store listing, not as a feature
    // list. The offline claim is the differentiator and is literally true for
    // the text check this ships with.
    description:
      "Right-click any suspicious message to check it for scam signals. Runs entirely on your device — nothing is sent anywhere.",
    version,
    permissions: [...PERMISSIONS],
    action: {
      default_title: "Veriguard",
      default_popup: "popup.html",
    },
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    // The popup is the only page, and it loads one local script. Spelling the
    // policy out rather than relying on the MV3 default means a later change
    // that would loosen it shows up as an edit to this line.
    //
    // `connect-src` names exactly one origin. The extension makes one network
    // call — fetching the blocklist — and this is what stops any other code
    // path, present or added later, from reaching anywhere else. The browser
    // enforces it, so it is a real bound rather than a convention.
    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'none'; connect-src ${apiBase}`,
    },
  };

  // No `type: "module"` on either variant, and that is deliberate.
  //
  // Safari does not support the key on a background service worker — it warns,
  // drops it, and the worker then fails to load, so the context menu never
  // registers and nothing errors visibly. Rather than carry a third manifest
  // variant for that one difference, the build emits each entry as a
  // self-contained classic script with no imports at all (see
  // `rollupOptions` in vite.config.mts), which every browser loads the same way.
  //
  // This is what makes the Chrome build convert to Safari unmodified.
  if (target === "firefox") {
    return {
      ...base,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          id: geckoId,
          // 140 because that is where `data_collection_permissions` below was
          // introduced. Declaring an older floor is not a runtime problem —
          // Firefox ignores manifest keys it does not know — but AMO's linter
          // cross-checks the floor against each key's introduction version and
          // warns on every submission, and a warning nobody can action is one
          // that trains people to skim the list that also carries real errors.
          //
          // The floor costs nothing real: it was 115, whose ESR reached
          // end-of-life in March 2026. Every Firefox still receiving security
          // updates is 140 or newer, so this excludes no one who is not already
          // running an unpatched browser.
          strict_min_version: "140.0",
          // Required by AMO for new extensions since 2025-11-03; a submission
          // without it is rejected outright.
          //
          // `none` is the declaration that the add-on collects and transmits no
          // personal data. It is a special value: it cannot be combined with any
          // other type, required or optional, which is precisely the claim here
          // and the reason no other key is listed.
          //
          // This says the same thing as the description above, the CSP below and
          // the store listings — the engine is bundled, so nothing derived from
          // what a user pastes is sent anywhere. The single network call fetches
          // the blocklist with an empty body and no query string, so it carries
          // no user content. **A change that made that untrue would have to
          // change this key**, and Firefox would then show the user a data
          // consent prompt on update. That is the point of declaring it.
          //
          // Left off the Chrome variant: Chrome rejects unknown
          // `browser_specific_settings` keys, and the equivalent disclosure
          // there is the dashboard's data-use form, not the manifest.
          data_collection_permissions: { required: ["none"] },
        },
        // Opts the add-on into Firefox for Android — without this key it is not
        // offered there at all — with its own floor, because Android gained
        // `data_collection_permissions` in 142 rather than 140.
        //
        // The floor is the only thing this key asserts. It does not claim the UI
        // is adapted: the popup is a fixed 380px panel, and the toolbar button
        // is the whole way in on Android, because that runtime implements no
        // `menus` API at all — not a degraded context menu, none.
        //
        // That absence is handled rather than assumed away. `browser.ts` guards
        // both menu helpers, since they run at the top of the background script
        // where a throw aborts module evaluation and takes every listener below
        // it with it. `extensionBrowser.test.ts` pins that by importing the real
        // background module against a runtime with no `contextMenus`.
        //
        // Still worth exercising on a device before the listing leans on
        // Android: no crash is not the same as a good small-screen experience.
        gecko_android: { strict_min_version: "142.0" },
      },
    };
  }

  return {
    ...base,
    background: { service_worker: "background.js" },
  };
}
