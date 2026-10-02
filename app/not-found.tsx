// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import Link from "next/link";

// Matches app/error.tsx: same head shape as every content page, design tokens
// rather than the raw Tailwind palette this used to carry, and no green
// headline — see the colour note there for why a verdict hue is wrong on a page
// about our own plumbing.
//
// A server component, unlike the error boundary, so nothing here is guarding
// against a broken render. The copy is still hardcoded rather than read from
// the message bundle: a 404 is reachable by definition on a URL that matched no
// route, and keeping it independent of the language context means it renders
// the same whatever went wrong upstream.
export default function NotFound() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <header className="max-w-[60ch]">
        <p className="font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.1em] uppercase text-[var(--faint)] mb-2.5">
          Not found
        </p>
        <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(30px,4.6vw,44px)] leading-[1.07] tracking-[-0.022em] text-[var(--foreground)] text-balance">
          That page doesn&apos;t exist
        </h1>
        {/* The second sentence is the useful one and belongs to this product
            rather than to a generic 404: someone who arrived here from a link in
            a message is holding the exact thing this site checks. */}
        <p className="mt-3.5 text-[clamp(15px,1.6vw,17px)] text-[var(--text-dim)] leading-relaxed">
          If a link or message sent you here, that link is worth checking.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center min-h-[44px] rounded-lg bg-[var(--clear)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:brightness-110 transition-[filter]"
          >
            Check a message
          </Link>
          <Link
            href="/submissions"
            className="inline-flex items-center min-h-[44px] rounded-lg border border-[var(--rule)] px-4 py-2.5 text-sm font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
          >
            Browse reported scams
          </Link>
        </div>
      </header>
    </main>
  );
}
