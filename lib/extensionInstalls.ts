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
 * A browser family, as the stores divide them.
 *
 * Chrome and Edge are one entry deliberately. Edge installs the Chromium build
 * from the Chrome Web Store — there is no separate artifact, no separate
 * listing and no separate figure to report, so splitting them here would invent
 * a precision the source does not have. `extension/STORE.md` groups them the
 * same way, and the two must agree.
 */
export type ExtensionStore = "chromium" | "firefox" | "safari";

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
    name: "Chrome & Edge",
    url: "https://chromewebstore.google.com/detail/veriguard-%E2%80%94-scam-check/pmhlakhnmgglfaimpdgfencgpboabpnd",
    users: null,
    asOf: null,
    note: "Newly published — the store has not reported a user count yet.",
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
 * A browser as the READER thinks of it, which is not how the stores divide
 * them.
 *
 * Edge is the reason this type exists separately from ExtensionStore. There is
 * one Chromium artifact on one listing with one user figure, and the data model
 * above is right to hold it as a single entry — splitting it there would invent
 * a precision the source does not have, and `extension/STORE.md` would stop
 * agreeing with it.
 *
 * But "Chrome & Edge" on a button makes an Edge user scan a compound label to
 * find themselves, and reads as an afterthought when it is their browser. So
 * the split happens here, in presentation, where it costs nothing: two buttons
 * pointing at the same store, which is exactly what installing on Edge is.
 */
export type InstallTarget = {
  /** Stable key for React, and what browser detection resolves to. */
  id: "chrome" | "edge" | "firefox" | "safari";
  /** The browser's own name, not the store's. */
  name: string;
  /** Where the listing that serves this browser lives, or null if unpublished. */
  url: string | null;
  /** Which listing backs it — several targets may share one. */
  store: ExtensionStore;
};

/**
 * Every browser the extension targets, in order of how many people use them.
 *
 * Unpublished targets are kept rather than dropped, which is the opposite of
 * what this did before. A bare list of install links should hold only links you
 * can follow — but this list is now the complete set of browsers, and Safari
 * missing from it reads as "not supported" rather than "not yet". Saying
 * "coming soon" is both truer and more useful than silence, and the caller
 * renders it as text rather than as a link to nowhere.
 */
export const INSTALL_TARGETS: readonly InstallTarget[] = [
  { id: "chrome", name: "Chrome", store: "chromium", url: chromiumUrl() },
  { id: "edge", name: "Edge", store: "chromium", url: chromiumUrl() },
  { id: "firefox", name: "Firefox", store: "firefox", url: storeUrl("firefox") },
  { id: "safari", name: "Safari", store: "safari", url: storeUrl("safari") },
];

function storeUrl(store: ExtensionStore): string | null {
  return EXTENSION_LISTINGS.find((l) => l.store === store)?.url ?? null;
}

/** Chrome and Edge both install from the Chromium listing. */
function chromiumUrl(): string | null {
  return storeUrl("chromium");
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
