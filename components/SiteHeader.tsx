"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang";

// Every destination, in one list. The old header progressively hid Calendar
// (below sm) and Radar (below md) because six items wouldn't fit, which meant
// the two most time-sensitive pages were the ones a phone couldn't reach. The
// menu below carries all of them at every width, so nothing needs hiding.
const LINKS = [
  { href: "/", key: "nav.check" },
  { href: "/learn", key: "nav.learn" },
  { href: "/radar", key: "nav.radar" },
  { href: "/calendar", key: "nav.calendar" },
  { href: "/submissions", key: "nav.reports" },
  // Before About, because it is a way to use the tool rather than background
  // about it. The check box is the first entry and this is where someone goes
  // once they want the checker somewhere other than this page.
  { href: "/ways", key: "nav.ways" },
  { href: "/about", key: "nav.about" },
] as const;

export default function SiteHeader() {
  const { t } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the control that opened it.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // A resize past the breakpoint would otherwise strand an open panel with no
  // visible toggle to close it.
  useEffect(() => {
    if (!open) return;
    function onResize() {
      if (window.innerWidth >= 768) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // The panel overlays the page, so the page behind it must not scroll under
  // the reader's finger.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--ink)]">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 flex items-center justify-between gap-4 min-h-[58px]">
        <Link
          href="/"
          className="flex items-center gap-[9px] font-bold text-[17px] tracking-[-0.01em] shrink-0 min-w-0 py-3 font-[family-name:var(--font-display)] text-[var(--foreground)]"
        >
          <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
            <path
              d="M10 1.5 2.8 4.4v5.1c0 4.1 2.9 7.6 7.2 9 4.3-1.4 7.2-4.9 7.2-9V4.4L10 1.5Z"
              stroke="var(--clear)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="m6.9 9.9 2.2 2.2 4.2-4.4"
              stroke="var(--clear)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="truncate">Veriguard</span>
        </Link>

        {/* Desktop: the links sit inline. */}
        <nav className="hidden md:flex items-center gap-1 min-w-0">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(l.href) ? "page" : undefined}
              className={`min-h-[44px] flex items-center px-2.5 text-sm rounded-[7px] transition-colors ${
                isCurrent(l.href)
                  ? "text-[var(--foreground)] bg-[var(--ink-2)] font-medium"
                  : "text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--ink-2)]"
              }`}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        {/* Mobile: one control, and everything behind it. */}
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? t("a11y.closeMenu") : t("a11y.openMenu")}
          className={`md:hidden inline-flex items-center gap-2 rounded-lg border border-[var(--rule)] px-3 py-2 text-sm transition-colors ${
            open
              ? "text-[var(--foreground)] bg-[var(--ink-2)]"
              : "text-[var(--text-dim)]"
          }`}
        >
          <span aria-hidden="true" className="grid gap-[3.5px] w-[15px]">
            <span
              className={`h-[1.5px] bg-current rounded-sm transition-transform ${
                open ? "translate-y-[5px] rotate-45" : ""
              }`}
            />
            <span className={`h-[1.5px] bg-current rounded-sm transition-opacity ${open ? "opacity-0" : ""}`} />
            <span
              className={`h-[1.5px] bg-current rounded-sm transition-transform ${
                open ? "-translate-y-[5px] -rotate-45" : ""
              }`}
            />
          </span>
          {open ? t("nav.close") : t("nav.menu")}
        </button>
      </div>

      {/* Scrim: dims the page and is itself the tap-to-close target. */}
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 top-[58px] z-40 bg-[rgba(3,7,18,0.62)] backdrop-blur-[2px] border-0 p-0 cursor-default"
        />
      )}

      {/* The panel drops from the header and overlays the page rather than
          pushing it down, so the content underneath keeps its position. */}
      <nav
        id="site-menu"
        hidden={!open}
        className="md:hidden absolute left-0 right-0 top-full z-50 flex flex-col gap-0.5 bg-[var(--ink)] border-b border-[var(--rule)] px-5 sm:px-8 pt-2 pb-3.5 shadow-[0_18px_34px_-18px_rgba(0,0,0,0.85)]"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isCurrent(l.href) ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between min-h-[44px] px-3 py-3 rounded-lg text-[15.5px] transition-colors ${
              isCurrent(l.href)
                ? "text-[var(--foreground)] bg-[var(--ink-2)] font-medium"
                : "text-[var(--text-dim)]"
            }`}
          >
            {t(l.key)}
            {isCurrent(l.href) && (
              <span className="font-[family-name:var(--font-mono-ui)] text-[10px] tracking-[0.08em] uppercase text-[var(--clear)]">
                {t("nav.here")}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}
