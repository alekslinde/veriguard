"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/lang";
import { TAB_LINKS, isCurrentPath, type TabIcon } from "./navLinks";

/**
 * The mobile navigation, as a bottom tab bar.
 *
 * Why the bottom: a phone reader holds the device one-handed and their thumb
 * rests at the bottom of the screen, not the top corner. Every destination is
 * visible and one tap away.
 *
 * THE MORE SHEET IS GONE, and so is everything it needed — the scrim, the
 * scroll lock, the focus return, the resize guard, the open-state-as-pathname
 * trick that closed it on a back navigation. None of that was complexity for
 * its own sake; it was all load-bearing for a sheet that existed because six
 * destinations did not fit four slots. There are three destinations now (see
 * navLinks), so there is nothing to hide and nothing to manage.
 *
 * What the sheet also held has moved to where it belongs rather than being
 * dropped: Add to Home Screen is a card in the check flow, and the bug report
 * is in the footer — which a phone now reaches, because there is no sheet
 * covering it.
 *
 * Labels stay under the icons rather than being dropped for icons alone. None
 * of these is a universally understood glyph, and an unlabelled icon bar is a
 * guessing game for exactly the less-confident reader this tool is for.
 */
export default function MobileTabBar() {
  const { t } = useLang();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("a11y.mainNav")}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--rule)] bg-[var(--ink)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch">
        {TAB_LINKS.map((l) => {
          const current = isCurrentPath(l.href, pathname);
          return (
            <li key={l.href} className="flex-1">
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-[3px] min-h-[54px] px-1 pt-1.5 pb-1 transition-colors ${
                  current ? "text-[var(--clear)]" : "text-[var(--faint)]"
                }`}
              >
                <TabGlyph name={l.icon as TabIcon} active={current} />
                <span className="text-[10.5px] leading-none tracking-[0.005em] font-medium">
                  {t(l.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Tab glyphs, inline rather than from an icon package.
 *
 * Three small shapes do not justify a dependency, and these are drawn on one
 * grid with one stroke weight so they read as a set — which a mix of any two
 * icon libraries does not. The active tab fills its shape rather than only
 * changing colour: colour alone is not a state indicator for a reader who
 * cannot distinguish these two greys, and the label's own weight change is too
 * subtle at 10.5px to carry it.
 */
function TabGlyph({ name, active }: { name: TabIcon; active: boolean }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.1 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };

  switch (name) {
    // A shield with a tick: the check itself, and the same idea the product
    // mark carries.
    case "check":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z" />
          <path d="M9 11.8l2.2 2.2L15.2 10" />
        </svg>
      );
    // An open book.
    case "learn":
      return (
        <svg {...common}>
          <path d="M12 6.5S10.2 5 6.8 5H4v12.5h2.8c3.4 0 5.2 1.5 5.2 1.5s1.8-1.5 5.2-1.5H20V5h-2.8C13.8 5 12 6.5 12 6.5z" />
          <path d="M12 6.5V19" />
        </svg>
      );
    // An outlined "i": what we store and how this works. A shield would
    // collide with Check, and a cog says settings — which this is not.
    case "about":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 11.2v5.2" />
          <circle cx="12" cy="7.9" r="0.95" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
