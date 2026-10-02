// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";
import ExternalLink from "@/components/ExternalLink";
import { useBugReport, BugIcon } from "./BugReportProvider";

/**
 * The site footer — DESKTOP ONLY.
 *
 * On a phone this is the shape that gives a web app away: a strip of chrome
 * under every screen, above a tab bar that already owns the bottom edge. So it
 * is hidden below md, and everything it carries is reachable without it —
 * which is the condition that makes hiding it safe rather than lossy:
 *
 *   - Report a bug → the about page's "Bug reports & tracking" section, beside
 *     the prose explaining what sending one includes (ReportBugButton).
 *   - Source code (AGPL) → the about page's colophon, which states the §13
 *     offer in full. That offer must survive on every surface, so it lives
 *     somewhere a phone can reach rather than only here.
 *   - What we store, For developers → /about is a tab; /packages is linked
 *     from the colophon and the ways-in shelf.
 *
 * On a desktop there is no tab bar, the bottom edge is free, and a footer is
 * what a reader expects to find there — so it stays.
 */
export default function SiteFooter() {
  const { t } = useLang();
  const { openManual } = useBugReport();
  return (
    <footer
      className="hidden md:block border-t border-[var(--rule)] bg-[var(--ink)] mt-auto"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
        <span className="text-[var(--foreground)]">
          {t("footer.built")}{" "}
          <ExternalLink href="https://alekslinde.com" variant="strong">
            Aleks Linde
          </ExternalLink>
        </span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        {/* The reach claim, stated honestly: universal checks everywhere, full
            rule packs only where the groundwork exists. */}
        <span className="hidden sm:inline text-[var(--faint)]">{t("footer.scope")}</span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        <Link
          href="/about"
          className="underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          {t("footer.about")}
        </Link>
        <span aria-hidden="true" className="text-[var(--ink-3)]">
          ·
        </span>
        {/* The developer docs. In the footer because that is where someone
            looks for them, and because the WaysGrid row on the home page is
            one line a reader scrolls past — it was the only route to this page
            and the page was effectively unreachable. */}
        <Link
          href="/packages"
          className="underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          {t("footer.packages")}
        </Link>
        <span aria-hidden="true" className="text-[var(--ink-3)]">
          ·
        </span>
        {/* The AGPL offer of source (§13): anyone using the hosted app can
            reach the code that runs it. Names the app's licence; the README
            lists the other parts'. */}
        <ExternalLink href="https://github.com/alekslinde/veriguard">{t("footer.source")}</ExternalLink>
        <span aria-hidden="true" className="text-[var(--ink-3)]">
          ·
        </span>
        {/* Bug reporting is an inline footer item now, not a floating chip that
            sat over the check input on a phone. Same modal, reached through the
            shared context's openManual. */}
        <button
          type="button"
          onClick={openManual}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          <BugIcon />
          {t("bug.button")}
        </button>
      </div>
    </footer>
  );
}
