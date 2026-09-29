// Where the extension is published, and how many people are running it.
//
// **This is a hand-maintained file, and that is the design rather than a gap
// waiting to be automated.** Every other number this project publishes is
// derived from something it observes. This one cannot be: the extension scores
// on-device and never calls our API, so there is no request to count, and the
// one request it does make (the blocklist refresh) is edge-cached — counting it
// at the origin measures cache misses, not clients, by a factor that drifts
// with CDN topology. A number whose denominator we cannot explain is not a
// number we can publish.
//
// So these come from the store dashboards, which are themselves public: anyone
// can open the listing and check the figure against what we claim. `asOf` is
// what makes that possible, and it is why the count and the date are one object
// rather than a number with a date somewhere near it — a count that outlives
// its date silently becomes a claim about today.
//
// Updating: read the figure off each listing, set `users` and `asOf` together,
// and leave a store alone if its dashboard was not checked that day. A stale
// entry that says when it was last read is honest; one backdated to today is
// not.

/**
 * A store we submit to, which is not the same as a browser that can run the
 * build.
 *
 * Chrome and Edge were one entry while the only thing that distinguished them
 * was branding: same artifact, same listing, same figure. They are separate now
 * because their AVAILABILITY differs — the extension is on the Chrome Web Store
 * and has not been submitted to Edge Add-ons, and a single entry cannot say
 * "published" and "not published" at once.
 *
 * Edge can in fact install from the Chrome Web Store, which is a first-class
 * Edge feature. We do not offer that route: it asks the reader to turn on
 * "allow extensions from other stores" and trust a listing their browser warns
 * them about, which is a poor thing to ask of someone who came here about
 * scams. So the row says "soon" and means the Edge Add-ons listing.
 *
 * `extension/STORE.md` still groups the two for the build, correctly — one
 * artifact serves both. That is a statement about what we produce; this is a
 * statement about where it is available, and the two are allowed to differ.
 */
export type ExtensionStore = "chromium" | "edge" | "firefox" | "safari";

export interface ExtensionListing {
  store: ExtensionStore;
  /** What the store calls itself, for display. */
  name: string;
  /** Public listing URL, or null where the extension is not published. */
  url: string | null;
  /**
   * Users the store reported, or null when the store publishes no figure.
   *
   * Null is not zero and must never render as one. AMO and the Chrome Web Store
   * both show a user count; a store that does not is a store we cannot report,
   * which is a different statement from "nobody uses it".
   */
  users: number | null;
  /**
   * When that figure was read off the dashboard, `YYYY-MM-DD`.
   *
   * Null only where there is nothing to date — an unpublished store.
   */
  asOf: string | null;
  /**
   * Why this store has no figure, where that needs saying. Rendered as-is, so
   * it is a sentence rather than a code.
   */
  note?: string;
}

/**
 * The listings, as last read from each dashboard.
 *
 * Ordered by how many people they reach, which is also the order the site
 * offers them in — nothing downstream re-sorts this, so changing the order here
 * changes the order on the page.
 */
export const EXTENSION_LISTINGS: readonly ExtensionListing[] = [
  {
    store: "chromium",
    name: "Chrome",
    url: "https://chromewebstore.google.com/detail/veriguard-%E2%80%94-scam-check/pmhlakhnmgglfaimpdgfencgpboabpnd",
    users: null,
    asOf: null,
    note: "Newly published — the store has not reported a user count yet.",
  },
  {
    store: "edge",
    name: "Edge",
    url: null,
    users: null,
    asOf: null,
    note: "The Chrome build runs on Edge unchanged, but it has not been submitted to Edge Add-ons.",
  },
  {
    store: "firefox",
    name: "Firefox",
    url: "https://addons.mozilla.org/en-GB/firefox/addon/veriguard-scam-check/",
    users: null,
    asOf: null,
    note: "Newly published — the store has not reported a user count yet.",
  },
  {
    store: "safari",
    name: "Safari",
    url: null,
    users: null,
    asOf: null,
    note: "Built for macOS but not yet submitted to the App Store.",
  },
];

/**
 * Total reported users across every store that reports one.
 *
 * Null when no store does — deliberately, rather than 0. A sum over an empty
 * set is zero in arithmetic and "we have no figure" here, and the two must not
 * render as the same sentence.
 *
 * Note this is a sum of *reported* figures, not a count of people: someone
 * running the extension in two browsers is two users, and a store's own figure
 * is itself an estimate over an activity window it defines. It is the honest
 * upper bound on what the dashboards say, which is all it claims to be.
 */
export function totalReportedUsers(): number | null {
  const counted = EXTENSION_LISTINGS.filter(
    (l): l is ExtensionListing & { users: number } => typeof l.users === "number",
  );
  if (counted.length === 0) return null;
  return counted.reduce((sum, l) => sum + l.users, 0);
}

/**
 * The oldest `asOf` among the stores currently reporting a figure, or null.
 *
 * The OLDEST rather than the newest, because this dates the total above, and a
 * total is only as current as its stalest component. Taking the newest would
 * let one freshly-read store make the whole figure look current.
 */
export function reportedAsOf(): string | null {
  const dates = EXTENSION_LISTINGS.filter((l) => typeof l.users === "number" && l.asOf)
    .map((l) => l.asOf as string)
    .sort();
  return dates[0] ?? null;
}

/**
 * A browser as the READER thinks of it.
 *
 * One per store now, and the mapping is the identity — this used to exist
 * because Chrome and Edge shared a listing and the page still wanted a button
 * each. They have their own entries since their availability diverged, so this
 * type is a view with nothing left to translate.
 *
 * It stays anyway, because the two questions remain different ones.
 * EXTENSION_LISTINGS answers "where have we submitted, and what does that
 * dashboard report" — it is the source for the user counts on the About page,
 * and it must not grow a field because a button needed one. This answers "what
 * does the reader pick from". A browser we support but never submit anywhere
 * would appear here and not there; the next store that serves two browsers
 * would appear there once and here twice.
 */
export type InstallTarget = {
  /** Stable key for React, and what browser detection resolves to. */
  id: "chrome" | "edge" | "firefox" | "safari";
  /** The browser's own name, not the store's. */
  name: string;
  /** Where the listing that serves this browser lives, or null if unpublished. */
  url: string | null;
  /** Which listing backs it. */
  store: ExtensionStore;
};

/**
 * Every browser the extension targets, in order of how many people use them.
 *
 * Unpublished targets are kept rather than dropped. A bare list of install
 * links should hold only links you can follow — but this list is the complete
 * set of browsers, and one missing from it reads as "not supported" rather than
 * "not yet". The caller renders a target with no url as text, never a link.
 */
export const INSTALL_TARGETS: readonly InstallTarget[] = [
  { id: "chrome", name: "Chrome", store: "chromium", url: storeUrl("chromium") },
  { id: "edge", name: "Edge", store: "edge", url: storeUrl("edge") },
  { id: "firefox", name: "Firefox", store: "firefox", url: storeUrl("firefox") },
  { id: "safari", name: "Safari", store: "safari", url: storeUrl("safari") },
];

function storeUrl(store: ExtensionStore): string | null {
  return EXTENSION_LISTINGS.find((l) => l.store === store)?.url ?? null;
}

/**
 * The install targets, with the reader's own browser first.
 *
 * `first` is a hint, not a filter: every target stays listed and in its original
 * order behind the promoted one, so a wrong guess costs the reader a glance
 * rather than a link. Passing null — the server render, or an unrecognised user
 * agent — returns the list untouched.
 */
export function installsForBrowser(first: InstallTarget["id"] | null): readonly InstallTarget[] {
  if (!first) return INSTALL_TARGETS;
  const mine = INSTALL_TARGETS.find((t) => t.id === first);
  // Promotion is for a browser you can install on. Lifting an unpublished one
  // to the front — Safari today — leads with a button that does nothing and
  // buries the three that work behind it, which is worse for that reader than
  // leaving the order alone. Their browser is still in the list, still marked
  // "soon", in its usual place.
  if (!mine?.url) return INSTALL_TARGETS;
  return [mine, ...INSTALL_TARGETS.filter((t) => t.id !== first)];
}
