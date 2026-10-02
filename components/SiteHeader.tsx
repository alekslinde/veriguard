// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/lang";
import { HEADER_LINKS, isCurrentPath, isChildCurrent } from "./navLinks";

/**
 * The top bar.
 *
 * Two jobs on two widths. On desktop it is the navigation: the mark on the left,
 * every destination inline on the right. On a phone it is a title bar and
 * nothing else — navigation moved to MobileTabBar at the bottom of the screen,
 * where a thumb reaches it. The hamburger and its drop panel are gone with it;
 * keeping both would have given a phone two ways to reach the same six pages and
 * two places to look for the one it wanted.
 *
 * It stays sticky at both widths. On a phone that leaves the shell framed top
 * and bottom, which is what a native app looks like, and it keeps the mark — the
 * only thing on the page that says which app this is — on screen while reading.
 */
export default function SiteHeader() {
  const { t } = useLang();
  const pathname = usePathname();

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--ink)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 flex items-center justify-between gap-4 min-h-[52px] md:min-h-[58px]">
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

        {/* Desktop: the links sit inline. Below md they are not hidden here so
            much as somewhere else — see MobileTabBar.

            A section's children render inline beside it rather than in a hover
            dropdown. A dropdown would put Radar and Calendar back behind an
            interaction someone has to discover, which is the problem folding
            them into Learn created in the first place; it also needs keyboard
            and touch handling to not be a trap. Six flat links fit this bar
            with room to spare, and the only cost is that the children are
            smaller and dimmer than their parent — which is the information,
            not a compromise. */}
        <nav aria-label={t("a11y.mainNav")} className="hidden md:flex items-center gap-1 min-w-0">
          {HEADER_LINKS.map((l) => {
            const current = isCurrentPath(l.href, pathname);
            const onChild = isChildCurrent(l, pathname);
            return (
              <div key={l.href} className="flex items-center">
                <Link
                  href={l.href}
                  aria-current={current && !onChild ? "page" : undefined}
                  // The filled pill marks the page you are ON, so it moves to
                  // the child when you are on one — two filled pills side by
                  // side read as a single blob and stop saying which is which.
                  // The parent keeps the brighter text, which is what says
                  // "you are still in this section".
                  className={`min-h-[44px] flex items-center px-2.5 text-sm rounded-[7px] transition-colors ${
                    current && !onChild
                      ? "text-[var(--foreground)] bg-[var(--ink-2)] font-medium"
                      : current
                        ? "text-[var(--foreground)] font-medium hover:bg-[var(--ink-2)]"
                        : "text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--ink-2)]"
                  }`}
                >
                  {t(l.key)}
                </Link>

                {l.children?.map((c) => {
                  const childCurrent = isCurrentPath(c.href, pathname);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      aria-current={childCurrent ? "page" : undefined}
                      className={`min-h-[44px] flex items-center px-2 text-[13px] rounded-[7px] transition-colors ${
                        childCurrent
                          ? "text-[var(--foreground)] bg-[var(--ink-2)] font-medium"
                          : "text-[var(--faint)] hover:text-[var(--foreground)] hover:bg-[var(--ink-2)]"
                      }`}
                    >
                      {t(c.key)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
