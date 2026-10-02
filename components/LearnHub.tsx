// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import Link from "next/link";
import { useLang, type MessageKey } from "@/lib/lang";
import type { RegionCode } from "@veriguard/detect/regions";
import { circulatingLures } from "@/lib/threatRadar";

/**
 * The entry cards at the top of Learn.
 *
 * Learn owns Radar, Calendar and Reports now — they all answer "what is
 * happening now", and they used to be top-level tabs competing with the check
 * itself. Owning them means presenting them, not linking to them in a
 * paragraph: a reader who lands on Learn should see that the section holds live
 * regional data before they see the first heading of an essay.
 *
 * WHY CARDS AND NOT THE INDEX. The page already had a nine-anchor table of
 * contents, which is a book affordance — it presumes the reader will move
 * through one long document and want to jump within it. These three are
 * destinations, not anchors, so an index cannot carry them: a chip saying
 * "Radar" tells you a word, where a card can say four campaigns are circulating
 * in your region right now. The index stays for the essay below, which is what
 * it is actually for.
 *
 * Each card carries a LIVE number, and that is the point of the component. The
 * data is real — scraped from official sources, dated, cited — and the strongest
 * argument for reading it is what it currently says. A card reading "4
 * circulating now" is an invitation; one reading "Threat radar" is a menu item.
 */

interface Card {
  href: string;
  titleKey: MessageKey;
  blurbKey: MessageKey;
  /** The live figure, already resolved. Null renders the card without one. */
  count: number | null;
  /** Omitted on a card that has no figure to label. */
  countKey?: MessageKey;
}

function ArrowIcon() {
  return (
    <svg
      className="w-[15px] h-[15px] shrink-0 text-[var(--faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--clear)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function LearnHub({
  region,
  activeSeasonCount,
}: {
  region: RegionCode;
  /**
   * How many calendar windows are open today, RESOLVED SERVER-SIDE.
   *
   * Passed in rather than computed here, and that is not a preference. This is
   * a client component, so calling regionToday() in it reads the browser's
   * clock — which reflects the device's timezone, not the region the page is
   * being served for. The page already resolves this correctly for
   * LearnContent (see app/learn/page.tsx, which says exactly this), so
   * recomputing it here would both duplicate the work and get a different
   * answer on a device whose zone straddles a date boundary from its region:
   * the server renders one count, the client hydrates to another, and the
   * number visibly flips.
   */
  activeSeasonCount: number;
}) {
  const { t } = useLang();

  // Safe to read here: the radar is static data keyed by region, with no clock
  // involved. It is the DATE that cannot be read on the client, not the data.
  const lures = circulatingLures(region, 99);

  const cards: Card[] = [
    {
      href: "/radar",
      titleKey: "learn.hub.radar.title",
      blurbKey: "learn.hub.radar.blurb",
      // Null rather than 0 where the region has no radar authored — "0
      // circulating" is a claim we cannot support, and it reads as reassurance.
      // Only some regions are authored; an absent count says nothing, where a
      // zero says something false.
      count: lures.length || null,
      countKey: "learn.hub.radar.count",
    },
    {
      href: "/calendar",
      titleKey: "learn.hub.calendar.title",
      blurbKey: "learn.hub.calendar.blurb",
      // Zero IS meaningful here: it is a real statement that nothing peaks
      // today, and the card says so rather than hiding the figure.
      count: activeSeasonCount,
      countKey: "learn.hub.calendar.count",
    },
    {
      href: "/submissions",
      titleKey: "learn.hub.reports.title",
      blurbKey: "learn.hub.reports.blurb",
      // No count: the figure lives behind the database and this component is
      // rendered inside a client page. StatsBar already carries that number on
      // the home page, and fetching it twice for a card would spend an
      // invocation per Learn view to repeat something.
      count: null,
    },
  ];

  return (
    <section aria-labelledby="learn-hub-heading" className="space-y-2.5">
      <h2 id="learn-hub-heading" className="sr-only">
        {t("learn.hub.heading")}
      </h2>
      {/* A rail on a phone, a grid from sm.
          Three columns at 390px gives each card ~110px, which turns every
          title into a ladder — "Scam / calendar", "4 / CIRCULATING / NOW" —
          and makes the block 245px tall to say three short things. Stacking
          them instead costs three screen-heights for what is meant to be a
          glance. A rail is the third option: full-size cards, two visible at
          a time, the third peeking to say it is there. Same affordance as the
          tactic deck, and for the same reason. */}
      {/* `scroll-pl-5` is not decoration — without it the rail lands scrolled
          20px in and the first card sits hard against the screen edge, outside
          the gutter every other element on the page respects.

          The cause: `snap-start` snaps a card to the scrollport's SNAP edge,
          which defaults to the padding box. The `px-5` that restores the
          bleed is therefore an offset the browser scrolls away to satisfy the
          snap. scroll-padding moves the snap edge back to where the content
          starts, so resting position is scrollLeft 0 and the first card lines
          up with the heading above it. */}
      <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0 sm:scroll-pl-0">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            // w-[62%] on the rail: two cards fill the screen and the third
            // shows its edge, which is what says the row continues. shrink-0
            // stops flex compressing them back to the ladder this replaced.
            className="group shrink-0 w-[62%] snap-start sm:w-auto sm:shrink rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-3.5 hover:border-[var(--ink-3)] transition-colors"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-[13.5px] sm:text-[14px] leading-snug text-[var(--foreground)]">
                {t(c.titleKey)}
              </span>
              {/* Dropped on a phone, where three cards share the width and the
                  arrow costs a fifth of each title's room. The card is a link
                  and looks like one; the arrow is an affordance for a wider
                  layout, not information. */}
              <span className="hidden sm:block">
                <ArrowIcon />
              </span>
            </span>

            {/* The live figure, in mono because it is a value the reader is
                meant to register as measured rather than written. Rendered
                before the blurb: it is the reason to open the card, and the
                blurb explains what they will find once they have decided. */}
            {c.count !== null && c.countKey && (
              <span className="mt-1.5 block font-[family-name:var(--font-mono-ui)] text-[11px] uppercase tracking-[0.07em] text-[var(--clear)]">
                {t(c.countKey, { n: c.count })}
              </span>
            )}

            {/* The blurb is what gives way at a narrow width: clamped to three
                lines so no card can grow taller than its neighbours, and the
                title plus the figure carry the card on their own if it is
                truncated. */}
            <span className="mt-1 block text-[12px] sm:text-[12.5px] leading-snug text-[var(--text-dim)] line-clamp-3">
              {t(c.blurbKey)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
