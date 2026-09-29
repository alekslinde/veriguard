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
          <svg width="19" height="19" viewBox="0 0 400 400" aria-hidden="true" className="shrink-0">
            <path d="M347.652 155.562C347.652 193.362 341.087 226.684 328.132 254.598C317.444 277.64 302.471 296.998 283.627 312.122C251.832 337.654 220.49 342.237 217.021 342.673L214.469 343.001L211.917 342.673C208.454 342.237 177.107 337.659 145.313 312.122C136.93 305.391 129.314 297.822 122.499 289.466H152.835C159.907 289.466 165.641 283.733 165.641 276.66V257.607H195.001C195.653 257.607 196.304 257.558 196.948 257.459C204.689 256.268 215.954 252.652 225.61 245.284C235.619 237.646 244.351 225.506 244.351 208.257V157.658C244.351 150.585 238.617 144.852 231.545 144.852H192.276C191.15 139.843 189.288 134.509 186.383 129.533C180.34 119.181 169.491 110.182 152.835 110.182H81.2881V77C81.2881 65.9543 90.2424 57 101.288 57H327.652C338.698 57 347.652 65.9543 347.652 77V155.562Z" fill="var(--clear)"/>
            <path d="M43.1999 124.6H87.3999V211.266H43.1999V124.6Z" fill="var(--clear)"/>
            {/* Negative space is --foreground, not --ink: the header ground IS
                --ink, so filling the mark's interior with it erased the shield's
                detail into the bar. --paper, not --foreground: icon-dark.svg
                fills these same paths with #FBFAF7 for the same reason on every
                other dark surface, and --foreground is #F4F3EF — close enough
                to look right and wrong enough that the mark did not match
                itself across surfaces. */}
            <path d="M25 139.122C25.0001 120.382 42.5683 109 57.9757 109H153.097C170.006 109 181.019 118.135 187.154 128.644C190.103 133.695 191.993 139.11 193.136 144.195H233C240.18 144.195 246 150.015 246 157.195V208.561C246 226.071 237.136 238.395 226.975 246.148C217.173 253.628 205.737 257.299 197.879 258.508C197.225 258.608 196.564 258.658 195.903 258.658H166.097V278C166.097 285.18 160.277 291 153.097 291H94.1217C86.9421 291 81.1217 285.18 81.1217 278C81.1217 270.82 86.9421 265 94.1217 265H140.097V245.658C140.098 238.479 145.918 232.658 153.097 232.658H194.813C199.329 231.814 205.905 229.521 211.202 225.479C216.499 221.437 220 216.163 220 208.561V170.195H181.634C174.454 170.195 168.634 164.374 168.634 157.195C168.634 152.931 167.511 146.567 164.7 141.752C162.274 137.596 159.018 135 153.097 135H106.17V199.049C106.17 214.183 92.5131 231.073 64.6339 231.073C51.147 231.073 40.7911 227.234 33.8216 220.222C27.0233 213.382 25.0001 205.07 25 199.049V139.122ZM51 199.049L51.0135 199.313C51.0771 199.983 51.3855 201.012 52.2619 201.893C53.0923 202.729 56.0529 205.073 64.6339 205.073C73.1898 205.073 76.9981 202.725 78.4989 201.38C80.2128 199.843 80.1705 198.568 80.1704 199.049V135H57.9757C55.8145 135 53.7744 135.816 52.4176 136.954C51.0864 138.071 51.0001 138.919 51 139.122V199.049Z" fill="var(--paper)"/>
            <path d="M152.147 157.195C152.147 163.499 147.036 168.61 140.732 168.61C134.428 168.61 129.317 163.499 129.317 157.195C129.317 150.891 134.428 145.78 140.732 145.78C147.036 145.78 152.147 150.891 152.147 157.195Z" fill="var(--paper)"/>
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
