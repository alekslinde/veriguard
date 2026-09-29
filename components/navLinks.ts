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
}

export type TabIcon = "check" | "learn" | "radar" | "calendar";

export const LINKS: readonly NavLink[] = [
  { href: "/", key: "nav.check", icon: "check" },
  { href: "/learn", key: "nav.learn", icon: "learn" },
  { href: "/radar", key: "nav.radar", icon: "radar" },
  { href: "/calendar", key: "nav.calendar", icon: "calendar" },
  { href: "/submissions", key: "nav.reports" },
  { href: "/about", key: "nav.about" },
] as const;

/** The four that get their own tab. */
export const TAB_LINKS = LINKS.filter((l) => l.icon);

/** Everything the tab bar reaches through More instead. */
export const MORE_LINKS = LINKS.filter((l) => !l.icon);

/**
 * Whether `href` is the section the reader is currently in.
 *
 * "/" has to match exactly — `startsWith("/")` is true of every path — while
 * every other entry matches its subtree so a nested page still highlights its
 * section.
 */
export function isCurrentPath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * True when the reader is on a page the tab bar reaches through More, so the
 * More tab can show itself as current. Without this, navigating to About from
 * the sheet leaves no tab lit and the bar looks broken.
 */
export function isMoreCurrent(pathname: string): boolean {
  return MORE_LINKS.some((l) => isCurrentPath(l.href, pathname));
}
