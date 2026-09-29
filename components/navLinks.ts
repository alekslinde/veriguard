/**
 * The navigation model, shared by the desktop header and the mobile tab bar.
 *
 * One list, two shapes. The header renders all six inline; the tab bar renders
 * the first four plus a More sheet holding the rest, because five targets is
 * what fits a narrow phone without the labels truncating. Keeping the order
 * here rather than in either component means the two can never disagree about
 * what exists or what comes first.
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

export type TabIcon = "check" | "learn" | "radar" | "calendar";

export const LINKS: readonly NavLink[] = [
  { href: "/", key: "nav.check", icon: "check" },
  { href: "/learn", key: "nav.learn", icon: "learn" },
  { href: "/radar", key: "nav.radar", icon: "radar" },
  { href: "/calendar", key: "nav.calendar", icon: "calendar" },
  { href: "/submissions", key: "nav.reports" },
  { href: "/about", key: "nav.about" },
  // In the sheet but NOT in the desktop header, which is what `headerOnly:
  // false` buys. Reporting is a deliberate errand reached from a verdict, and
  // the header has six items already.
  //
  // It nonetheless belongs in this list rather than being written into the
  // sheet's markup, which is where it started. A hardcoded row is not in
  // MORE_LINKS, so isMoreCurrent("/report") was false and NO tab lit on that
  // page — the exact failure isMoreCurrent exists to prevent, invisible to
  // tests that iterate this list.
  { href: "/report", key: "nav.report", inHeader: false },
] as const;

/** The four that get their own tab. */
export const TAB_LINKS = LINKS.filter((l) => l.icon);

/** Everything the tab bar reaches through More instead. */
export const MORE_LINKS = LINKS.filter((l) => !l.icon);

/** What the desktop header shows inline. */
export const HEADER_LINKS = LINKS.filter((l) => l.inHeader !== false);

/**
 * Paths that ARE the check, under another address.
 *
 * `/share` is the share-target landing page, and it renders the same CheckFlow
 * the home page does — so someone arriving from their phone's share sheet is on
 * the Check tab in every sense except the URL. Without this the one screen most
 * people reach Veriguard through lights no tab at all, which is the same defect
 * a hardcoded `/report` row produced and the reason both are settled here.
 */
const CHECK_PATHS = ["/share"];

/**
 * Whether `href` is the section the reader is currently in.
 *
 * "/" has to match exactly — `startsWith("/")` is true of every path — while
 * every other entry matches its subtree so a nested page still highlights its
 * section.
 */
export function isCurrentPath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || CHECK_PATHS.includes(pathname);
  return pathname.startsWith(href);
}

/**
 * True when the reader is on a page the tab bar reaches through More, so the
 * More tab can show itself as current. Without this, navigating to About from
 * the sheet leaves no tab lit and the bar looks broken.
 */
export function isMoreCurrent(pathname: string): boolean {
  return MORE_LINKS.some((l) => isCurrentPath(l.href, pathname));
}
