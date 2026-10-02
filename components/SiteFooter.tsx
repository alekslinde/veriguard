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
    >
      {/* ONE ROW: who made it on the left, what you can reach on the right.
          It was six items in a single middot-separated run, which is the shape
          a footer takes when nothing has been decided about it — the reader
          scans a list of equals and finds no edge to start from.

          Two of the six are gone rather than restyled. "What we store" pointed
          at /about, which is a header link and a tab; "For developers" pointed
          at /packages, which the about colophon and the ways-in shelf both
          reach. A footer link to a destination already in the nav is a second
          copy to keep in step, not a convenience.

          What is left is what lives nowhere else: authorship, the §13 source
          offer, and the bug report. */}
      {/* A declared height rather than padding around a line box, so the row is
          one known number whatever the copy does. Nothing computes against it —
          the home page's centring grows into whatever is left rather than
          subtracting a list of heights — but a footer whose height depends on
          its longest string is still a footer that moves when copy changes. */}
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 h-[41px] flex items-center justify-between gap-6 text-[12.5px] leading-relaxed">
        {/* The reach claim is a sentence, not a link, so it sits with the
            authorship as one statement about the project rather than being
            punctuated into the list of destinations beside it. Truncated rather
            than wrapped: the footer is one row, and a second line here is the
            thing that makes it a block again. */}
        <span className="min-w-0 truncate text-[var(--faint)]">
          <span className="text-[var(--text-dim)]">
            {t("footer.built")}{" "}
            <ExternalLink href="https://alekslinde.com" variant="strong">
              Aleks Linde
            </ExternalLink>
          </span>
          <span className="hidden lg:inline"> · {t("footer.scope")}</span>
        </span>

        <span className="shrink-0 flex items-center gap-4 text-[var(--text-dim)]">
          {/* The developer docs. Back here after being cut with "What we store"
              — that one pointed at a destination already in the nav, but
              /packages is in no menu at all, so dropping this left one row on
              the home page as its only route. This is where someone looking for
              an API goes first. */}
          <Link href="/packages" className="hover:text-[var(--foreground)] transition-colors">
            {t("footer.packages")}
          </Link>
          {/* The AGPL offer of source (§13): anyone using the hosted app can
              reach the code that runs it. Names the app's licence; the README
              lists the other parts'.

              Also on /about, deliberately — this footer is desktop-only, and an
              offer that disappears at 767px is not an offer. */}
          <ExternalLink href="https://github.com/alekslinde/veriguard">
            {t("footer.source")}
          </ExternalLink>
          {/* Same modal as everywhere else, through the shared context. */}
          <button
            type="button"
            onClick={openManual}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors"
          >
            <BugIcon />
            {t("bug.button")}
          </button>
        </span>
      </div>
    </footer>
  );
}
