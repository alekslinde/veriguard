/**
 * The navigation model, shared by the desktop header and the mobile tab bar.
 *
 * THREE DESTINATIONS, and that is the whole design. Check is the tool, Learn is
 * everything that teaches, About is what we store and how it works.
 *
 * It was six, which is where the More sheet came from: six destinations do not
 * fit four tab slots, so Reports, About and Report-a-scam hid behind a seventh
 * control that had to be opened to find out what was in it. The sheet was a
 * symptom — the information architecture was too wide for the frame, and the
 * fix belongs here rather than in a better sheet.
 *
 * What moved, and why:
 *   - Radar and Calendar are Learn. Both answer "what is happening now", both
 *     are reading material, and both were competing for a tab with the tool
 *     itself. They keep their routes and are reached from Learn.
 *   - Reports is Learn too: what people are reporting is the same question as
 *     what is circulating.
 *   - Report-a-scam was never a place. It is an errand reached from a verdict,
 *     and it stays reachable from exactly there.
 *
 * One list, two shapes: the header renders all three inline, the tab bar
 * renders all three as tabs. Nothing is hidden at either width, which is the
 * property the sheet cost and this buys back.
 */
import type { MessageKey } from "@/lib/i18n";

export interface NavLink {
  href: string;
  /** Typed against the bundle, so a renamed string breaks the build here
      rather than rendering the raw key in the nav. */
  key: MessageKey;
  /** Present on tab-bar items only: the rest are reached through More. */
  icon?: TabIcon;
  /**
   * Set false for a destination the mobile sheet offers but the desktop header
   * does not. Defaults to true, so a new entry appears in both unless it says
   * otherwise — the safer default, since a missing link is harder to notice
   * than an extra one.
   */
  inHeader?: boolean;
}

export type TabIcon = "check" | "learn" | "about";

export const LINKS: readonly NavLink[] = [
  { href: "/", key: "nav.check", icon: "check" },
  { href: "/learn", key: "nav.learn", icon: "learn" },
  { href: "/about", key: "nav.about", icon: "about" },
] as const;

/**
 * The sections each destination owns.
 *
 * A route listed here lights its section's tab without being a tab itself.
 * Radar, Calendar and Reports are Learn: they keep their own addresses — a
 * link to /radar must not break, and "what is circulating" is worth linking to
 * directly — but a reader who follows one is in Learn and the bar has to say
 * so.
 *
 * This is the shared model rather than a check inside a component for the
 * reason the /report bug taught: a destination the model does not know about
 * lights no tab at all, and every test that walks the nav list passes while it
 * happens. The test that catches it walks the ROUTES.
 */
const SECTION_PATHS: Record<string, readonly string[]> = {
  "/learn": ["/radar", "/calendar", "/submissions"],
  // The reporting errand. Never a tab — it is reached from a verdict, not
  // browsed to — but a reader who is on it is in the Check flow they started,
  // and a bar with nothing lit reads as broken.
  "/": ["/share", "/report"],
};

/**
 * Every owned route, as a flat set.
 *
 * "/" must never appear in a section's list. It is the home page, matched
 * exactly by isCurrentPath precisely because `startsWith("/")` is true of every
 * path — so listing it as a section's owned route would make that section's tab
 * light on every page of the site. The lists hold routes a section BORROWS,
 * and no section borrows the root.
 *
 * Filtered here rather than trusted, because the failure is silent: nothing
 * throws, every unit test that walks the nav list still passes, and the bar
 * simply lights two tabs at once. A test asserts this stays empty of "/".
 */
const OWNED = new Set(
  Object.values(SECTION_PATHS)
    .flat()
    .filter((p) => p !== "/"),
);

/** Every destination gets a tab. Nothing is hidden behind a More sheet. */
export const TAB_LINKS = LINKS.filter((l) => l.icon);

/** What the desktop header shows inline — the same three. */
export const HEADER_LINKS = LINKS.filter((l) => l.inHeader !== false);

/**
 * Whether `href` is the section the reader is currently in.
 *
 * "/" has to match exactly — `startsWith("/")` is true of every path — while
 * every other entry matches its subtree so a nested page still highlights its
 * section. Beyond that, a section owns the routes listed against it in
 * SECTION_PATHS: /radar lights Learn, /share lights Check.
 */
export function isCurrentPath(href: string, pathname: string): boolean {
  // The root's exact match runs FIRST and unconditionally. Ordering was what
  // protected it before — the owned-route check came first and happened not to
  // contain "/" — which made a correct result depend on the contents of a data
  // structure edited elsewhere. Now the root is decided before any list is
  // consulted, and OWNED cannot contain "/" in any case.
  if (href === "/") return pathname === "/" || isOwnedBy("/", pathname);
  if (isOwnedBy(href, pathname)) return true;
  return pathname.startsWith(href);
}

/** Whether `pathname` is one of the routes `href`'s section borrows. */
function isOwnedBy(href: string, pathname: string): boolean {
  const owned = SECTION_PATHS[href];
  if (!owned) return false;
  return owned.some(
    (p) => OWNED.has(p) && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}
