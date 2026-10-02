// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/lang";
import { TAB_LINKS, isCurrentPath, isChildCurrent, type TabIcon } from "./navLinks";

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

  // The children of whichever tab the reader is currently in, if it has any.
  //
  // Radar and Calendar belong to Learn, and folding them in took them out of
  // every menu — reachable only by scrolling Learn or typing the URL. A fourth
  // and fifth tab is not the answer: five targets is where the labels start
  // truncating at 390px, and it is the crowding that forced the More sheet.
  //
  // So they appear as a row above the bar, and ONLY while the reader is in the
  // section that owns them. On Check or About the bar is exactly as it was;
  // enter Learn and the section's own pages appear with it, which is also the
  // moment they are worth offering.
  const section = TAB_LINKS.find((l) => isCurrentPath(l.href, pathname));
  const children = section?.children ?? [];

  return (
    <nav
      aria-label={t("a11y.mainNav")}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--rule)] bg-[var(--ink)] pb-[env(safe-area-inset-bottom)]"
    >
      {children.length > 0 && (
        // Scrolls rather than wraps: three labels fit a 390px screen, but a
        // fourth child would wrap the row and change the bar's height under
        // the reader. A horizontal scroller keeps the bar one known height
        // whatever the section holds.
        // data-subnav is what tells the page to reserve room for this row:
        // globals.css raises --subnav-h via :has(), so --tabbar-h and the
        // bar's real height stay one number. Without it the footer renders
        // under the bar — measured at 52px of overlap.
        <ul
          data-subnav
          className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-[var(--rule)] bg-[var(--ink-2)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children.map((c) => {
            const current = isCurrentPath(c.href, pathname);
            return (
              <li key={c.href} className="shrink-0">
                <Link
                  href={c.href}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    current
                      ? "border-[var(--clear)] bg-[var(--clear)]/12 text-[var(--clear)]"
                      : "border-[var(--rule)] text-[var(--text-dim)]"
                  }`}
                >
                  {t(c.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="flex items-stretch">
        {TAB_LINKS.map((l) => {
          const current = isCurrentPath(l.href, pathname);
          return (
            <li key={l.href} className="flex-1">
              <Link
                href={l.href}
                // The tab stays lit on a child's page — the reader IS in that
                // section — but only one element may claim to BE the page, and
                // on /radar that is the Radar chip above, not the Learn tab.
                aria-current={current && !isChildCurrent(l, pathname) ? "page" : undefined}
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
