"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang";
import { useBugReport, BugIcon } from "./BugReportProvider";
import {
  MORE_LINKS,
  TAB_LINKS,
  isCurrentPath,
  isMoreCurrent,
  type TabIcon,
} from "./navLinks";

/**
 * The mobile navigation, as a bottom tab bar.
 *
 * Why the bottom, and why this replaces the hamburger: a phone reader holds the
 * device one-handed and their thumb rests at the bottom of the screen, not the
 * top corner. The hamburger this replaces cost two taps to reach any page (open,
 * then choose) and hid which sections existed until you opened it — so Radar and
 * Calendar, the two time-sensitive pages, were invisible by default on the one
 * device most likely to be holding the suspicious message. Four tabs are always
 * visible and always one tap away.
 *
 * Labels stay under the icons rather than being dropped for icons alone. None of
 * these four is a universally understood glyph — a radar dish does not say
 * "what's circulating right now" to anyone who hasn't been told — and an
 * unlabelled icon bar is a guessing game for exactly the less-confident reader
 * this tool is for.
 */
export default function MobileTabBar() {
  const { t } = useLang();
  const pathname = usePathname();
  const { openManual } = useBugReport();
  const moreRef = useRef<HTMLButtonElement>(null);

  // The sheet's open state is stored as the path it was opened on, not a
  // boolean, so a route change closes it by definition rather than by an effect
  // that syncs one piece of state to another. Tapping a link inside the sheet
  // does set it to null directly, but back/forward navigation changes the path
  // with no handler of ours running — and that is the case a boolean would need
  // a setState-in-effect to catch.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === pathname;

  // Closing is `setOpenedOn(null)` throughout rather than a boolean setter that
  // closes over `pathname` — the state setter is stable, so the effects below
  // depend only on whether the sheet is open.
  const closeMore = useCallback(() => setOpenedOn(null), []);

  // Escape closes and returns focus to the tab that opened it.
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMore();
        moreRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen, closeMore]);

  // A resize past the breakpoint would strand an open sheet with no visible tab
  // bar to close it.
  useEffect(() => {
    if (!moreOpen) return;
    function onResize() {
      if (window.innerWidth >= 768) closeMore();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [moreOpen, closeMore]);

  // The page behind the sheet must not scroll under the reader's finger.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const moreCurrent = isMoreCurrent(pathname);

  return (
    <>
      {/* Scrim: dims the page and is itself the tap-to-close target. */}
      {moreOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={closeMore}
          className="md:hidden fixed inset-0 z-40 bg-[rgba(3,7,18,0.62)] backdrop-blur-[2px] border-0 p-0 cursor-default"
        />
      )}

      {/* The More sheet rises from the bar it belongs to, so the tap and the
          thing that appears are in the same place. */}
      <div
        id="tab-more"
        hidden={!moreOpen}
        className="md:hidden fixed left-0 right-0 z-50 bg-[var(--ink-2)] border-t border-[var(--rule)] rounded-t-2xl px-3 pt-2.5 pb-3 shadow-[0_-18px_34px_-18px_rgba(0,0,0,0.85)] motion-safe:animate-[tabsheet-in_0.22s_cubic-bezier(0.16,1,0.3,1)_both]"
        // Sits exactly on the bar rather than at bottom:0 behind it. Both read
        // the same custom property, so the two can't drift apart.
        style={{ bottom: "var(--tabbar-h)" }}
      >
        <nav className="flex flex-col gap-0.5">
          {MORE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrentPath(l.href, pathname) ? "page" : undefined}
              onClick={closeMore}
              className={`flex items-center justify-between min-h-[46px] px-3 rounded-lg text-[15.5px] transition-colors ${
                isCurrentPath(l.href, pathname)
                  ? "text-[var(--foreground)] bg-[var(--ink-3)] font-medium"
                  : "text-[var(--text-dim)]"
              }`}
            >
              {t(l.key)}
              {isCurrentPath(l.href, pathname) && (
                <span className="font-[family-name:var(--font-mono-ui)] text-[10px] tracking-[0.08em] uppercase text-[var(--clear)]">
                  {t("nav.here")}
                </span>
              )}
            </Link>
          ))}

          {/* Report a scam lives here rather than taking a tab of its own: it is
              a deliberate errand, not somewhere you browse to, and the check
              flow already offers it at the point a verdict makes it relevant. */}
          <Link
            href="/report"
            aria-current={isCurrentPath("/report", pathname) ? "page" : undefined}
            onClick={closeMore}
            className={`flex items-center justify-between min-h-[46px] px-3 rounded-lg text-[15.5px] transition-colors ${
              isCurrentPath("/report", pathname)
                ? "text-[var(--foreground)] bg-[var(--ink-3)] font-medium"
                : "text-[var(--text-dim)]"
            }`}
          >
            {t("nav.report")}
            {isCurrentPath("/report", pathname) && (
              <span className="font-[family-name:var(--font-mono-ui)] text-[10px] tracking-[0.08em] uppercase text-[var(--clear)]">
                {t("nav.here")}
              </span>
            )}
          </Link>

          <div className="h-px bg-[var(--rule)] my-1.5 mx-3" />

          {/* The footer is off-screen behind the bar on a phone, so its one
              interactive item is reachable here instead. */}
          <button
            type="button"
            onClick={() => {
              closeMore();
              openManual();
            }}
            aria-haspopup="dialog"
            className="flex items-center gap-2 min-h-[46px] px-3 rounded-lg text-[15.5px] text-[var(--text-dim)] transition-colors text-left"
          >
            <BugIcon />
            {t("bug.button")}
          </button>
        </nav>
      </div>

      {/* role=navigation on the bar, not the sheet: the sheet is part of the
          same landmark and announcing two would imply two navigations. */}
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

          <li className="flex-1">
            <button
              ref={moreRef}
              type="button"
              onClick={() => setOpenedOn(moreOpen ? null : pathname)}
              aria-expanded={moreOpen}
              aria-controls="tab-more"
              className={`w-full flex flex-col items-center justify-center gap-[3px] min-h-[54px] px-1 pt-1.5 pb-1 transition-colors ${
                moreOpen || moreCurrent ? "text-[var(--clear)]" : "text-[var(--faint)]"
              }`}
            >
              <MoreGlyph active={moreOpen || moreCurrent} />
              <span className="text-[10.5px] leading-none tracking-[0.005em] font-medium">
                {t("nav.more")}
              </span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

/**
 * Tab glyphs, inline rather than from an icon package.
 *
 * Five small shapes do not justify a dependency, and these are drawn on one
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
    // Concentric sweep arcs with a contact dot — a radar, without a dish that
    // would need more strokes than the rest of the set.
    case "radar":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 5.4a6.6 6.6 0 016.6 6.6" />
          <path d="M12 2.2A9.8 9.8 0 0121.8 12" />
          <circle cx="7.2" cy="16.8" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    // A calendar page.
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5.5" width="16" height="14" rx="2.2" />
          <path d="M4 10h16M8.5 3.5v3.6M15.5 3.5v3.6" />
        </svg>
      );
  }
}

function MoreGlyph({ active }: { active: boolean }) {
  return (
    <svg
      width={21}
      height={21}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
      fill="currentColor"
    >
      {/* Dots grow rather than the stroke thickening, which is how the other
          four mark active — a three-dot glyph has no stroke to thicken. */}
      <circle cx="5.6" cy="12" r={active ? 1.85 : 1.5} />
      <circle cx="12" cy="12" r={active ? 1.85 : 1.5} />
      <circle cx="18.4" cy="12" r={active ? 1.85 : 1.5} />
    </svg>
  );
}
