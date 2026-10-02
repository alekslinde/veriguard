// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { accent } from "@/lib/richText";

/**
 * The standard head for a content page: eyebrow, headline, lede.
 *
 * Three parts because they answer three different questions, and collapsing them
 * costs one of the answers. The eyebrow says where you are (it matches the nav
 * label, so arriving from the menu confirms the click landed); the headline says
 * what the page is about; the lede says what you'll get from it. The old head
 * used the nav label *as* the headline — "Learn" — which named the section twice
 * and told a first-time reader nothing about the content.
 *
 * The headline takes `**markers**` for an accented word, same convention as the
 * home hero, so a page can emphasise the word that distinguishes it.
 */
export default function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    // Capped at a reading measure rather than the container: a lede running the
    // full width of a wide page is hard to track back from line to line.
    <header className="max-w-[60ch] mb-7 sm:mb-9">
      <p className="font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.1em] uppercase text-[var(--faint)] mb-2.5">
        {eyebrow}
      </p>
      <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(30px,4.6vw,44px)] leading-[1.07] tracking-[-0.022em] text-[var(--foreground)] text-balance">
        {accent(title)}
      </h1>
      {lede && (
        <p className="mt-3.5 text-[clamp(15px,1.6vw,17px)] text-[var(--text-dim)] leading-relaxed">
          {lede}
        </p>
      )}
    </header>
  );
}
