// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// Scam calendar — "what's in season right now", plus the year ahead.
//
// A client component so it can read the user's language preference, which lives in
// localStorage and is therefore unavailable on the server (see lib/lang.tsx).
// The *date* is not decided here: `today` is resolved server-side and passed in,
// because the browser clock is the user's device setting rather than their
// region, and a traveller or a device with a wrong clock would otherwise see the
// wrong season. Server decides when, client decides how it reads.
//
// Educational only — nothing here influences a verdict. The copy is deliberately
// careful not to imply the tool scores messages differently by date: a season
// tells you what's *likely*, and likelihood is context for a person, not a
// reason for the detector to move a number.
//
// Structurally the radar's sibling, and deliberately so: page header, freshness
// stamp, region bar, then capped hairline lists. The two pages answer the same
// shape of question — "what should I expect, where I am" — and a reader who
// learns one should not have to learn the other.

import Link from "next/link";
import { useRef, useState } from "react";
import { useLang, type MessageKey } from "@/lib/lang";
import ExternalLink from "@/components/ExternalLink";
import SeasonGantt from "@/components/SeasonGantt";
import FreshnessStamp from "@/components/FreshnessStamp";
import PageHeader from "@/components/PageHeader";
import RegionBar from "@/components/RegionBar";
import {
  activeSeasons,
  upcomingSeasons,
  calendarForRegion,
  daysUntilStart,
  daysUntilEnd,
  formatWindow,
  lastReviewed,
  formatReviewedDate,
  type ScamSeason,
  type CivilDate,
} from "@/lib/scamCalendar";
import type { RegionCode } from "@veriguard/detect/regions";

// Matches the card styling used across Learn, About and the radar.
const CARD = "bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl p-6 space-y-6";
const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]";

// Section heading, matching the radar's group headings so the two pages read as
// one system rather than two designs.
const H3 =
  "font-[family-name:var(--font-display)] font-semibold text-[clamp(18px,2.2vw,22px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]";

// How many rows a section shows before the "show more" cap, matching the radar's
// GROUP_CAP. Five is what fits on a phone without the next section's heading
// being pushed out of reach, which is what makes the page's shape scannable.
const SECTION_CAP = 5;

/**
 * The "starts in N" label, chosen by day count.
 *
 * Thresholds switch on the raw days rather than on each unit's rounded value:
 * rounding independently is what made 59 days read as "about 8 weeks" and 60 as
 * "about 2 months", a seam where the same gap described itself two ways.
 */
function startsInLabel(days: number, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  if (days === 0) return t("calendar.starts.today");
  if (days === 1) return t("calendar.starts.tomorrow");
  if (days < 14) return t("calendar.starts.days", { count: days });
  if (days < 60) return t("calendar.starts.weeks", { count: Math.round(days / 7) });
  const months = Math.round(days / 30);
  return t(months === 1 ? "calendar.starts.month" : "calendar.starts.months", { count: months });
}

/**
 * The "N left" label for an active season, on the same thresholds as
 * startsInLabel so a gap of 40 days describes itself as "about 6 weeks" in both
 * directions rather than switching units by which end of the window it names.
 *
 * The small counts do *not* mirror startsInLabel, because the two functions
 * count different things. daysUntilStart is exclusive — 1 means the season
 * begins tomorrow — while daysUntilEnd is inclusive of the end day, so 1 means
 * it runs today *and* tomorrow: two days left, not one. Copying the "tomorrow"
 * branch across is what made a season with two days left announce "1 day left".
 */
function endsInLabel(days: number, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  if (days === 0) return t("calendar.ends.today");
  // Inclusive throughout: `remaining` is how many days the season still covers,
  // today included, which is what "N left" means to a reader.
  const remaining = days + 1;
  if (remaining < 14) return t("calendar.ends.days", { count: remaining });
  if (remaining < 60) return t("calendar.ends.weeks", { count: Math.round(remaining / 7) });
  const months = Math.round(remaining / 30);
  return t(months === 1 ? "calendar.ends.month" : "calendar.ends.months", { count: months });
}

/**
 * One season, as an always-open row.
 *
 * Previously everything except the active seasons was a collapsed <details>,
 * which solved a real problem — the page ran six phone screens — at the cost of
 * making the whole year a list of titles nothing could be read from. The cap
 * solves that problem better: five rows per section keeps the page short while
 * leaving every row readable.
 *
 * Unlike the radar's rows, these keep their lures and advice. The radar folded
 * those away because 28 entries at full weight measured 17,000px; a region here
 * has a dozen seasons and shows at most ten, and the lures *are* the content —
 * a season the reader can't act on is a horoscope.
 *
 * Rows are separated by hairlines rather than being individually bordered
 * cards, matching the radar: a dozen bordered boxes read as a dozen competing
 * objects, while a ruled list reads as one list.
 */
function SeasonRow({
  season,
  badge,
  live,
}: {
  season: ScamSeason;
  /** The timing pill: how long an active season has left, or when it starts. */
  badge: string;
  /** Active now. Drives the amber pill — never red, which is the verdict colour. */
  live: boolean;
}) {
  const { t } = useLang();

  return (
    <li className="bg-[var(--ink-2)] px-4 py-3.5 space-y-[7px]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* h4, one level below the section heading — the rows nest inside "In
            season right now", and matching its level would flatten the two in a
            screen reader's outline. */}
        <h4 className="font-semibold text-[15px] text-[var(--foreground)]">{season.title}</h4>
        <span
          className={`font-[family-name:var(--font-mono-ui)] text-[10.5px] uppercase tracking-[0.07em] rounded-full px-2 py-0.5 border ${
            live
              ? "text-[var(--caution)] border-[var(--caution)]/40 bg-[var(--caution)]/10"
              : "text-[var(--text-dim)] border-[var(--rule)]"
          }`}
        >
          {badge}
        </span>
      </div>

      {/* Window, confidence and this season's own review date on one mono line.
          The per-season date is what makes the page-level "Reviewed" claim
          inspectable: a reader can see that most seasons were checked on one
          date and a few more recently, rather than taking the newest date as
          covering everything. */}
      <p className="font-[family-name:var(--font-mono-ui)] text-[11px] leading-relaxed tracking-[0.02em] text-[var(--faint)]">
        {formatWindow(season.window)} · {t(`calendar.confidence.${season.confidence}` as MessageKey)} ·{" "}
        <span className="whitespace-nowrap">
          {t("freshness.label")} {formatReviewedDate(season.reviewed)}
        </span>
      </p>

      <p className="text-[13.5px] text-[var(--text-dim)] leading-relaxed max-w-[92ch]">{season.why}</p>

      {/* Lures and advice as prose rather than a bulleted block with icons and
          section labels. The old version spent five heading-sized elements per
          season on structure; at a dozen seasons that structure was most of the
          page. A bolded lead-in carries the same distinction in one line. */}
      <p className="text-[13.5px] text-[var(--text-dim)] leading-relaxed max-w-[92ch]">
        <b className="font-semibold text-[var(--foreground)]">{t("calendar.lures.heading")}:</b>{" "}
        {season.lures.join("; ")}
      </p>

      <p className="text-[13.5px] leading-relaxed max-w-[92ch] text-[var(--text-dim)] border-l-2 border-l-[var(--clear)] pl-3">
        {season.advice}
      </p>

      {/* Provenance, mirroring the radar's evidence link. Every season traces to
          a named authority — without this the "expect this now" claim is
          asserted rather than checkable, which is the whole difference from a
          horoscope. */}
      <p className="font-[family-name:var(--font-mono-ui)] text-[11px] leading-relaxed tracking-[0.02em] text-[var(--faint)]">
        {t("calendar.sources")}:{" "}
        {season.sources.map((source, i) => (
          <span key={source.url}>
            {i > 0 && " · "}
            {/* Arrowed, like every other outbound link. I had suppressed it
                here as noise in a middot-separated run; main's reasoning is
                better and wins — this product's whole subject is noticing
                where a link goes, so a citation that opens a tab silently
                teaches the opposite of what the page teaches. */}
            <ExternalLink href={source.url}>
              {source.label}
            </ExternalLink>
          </span>
        ))}
      </p>
    </li>
  );
}

/**
 * One section of seasons, capped until asked to show the rest.
 *
 * The cap is per-section rather than per-page: without it "in season now" can
 * run long enough that "coming up" is off-screen, and that heading is what tells
 * the reader the page has a shape at all.
 *
 * Collapsing scrolls the section's own heading back into view — otherwise the
 * page shortens under the reader and leaves them somewhere further down than
 * where they clicked. Same behaviour as the radar's groups.
 */
function SeasonSection({
  heading,
  seasons,
  badgeFor,
  live = false,
}: {
  heading: string;
  seasons: ScamSeason[];
  badgeFor: (season: ScamSeason) => string;
  live?: boolean;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (seasons.length === 0) return null;

  const shown = expanded ? seasons : seasons.slice(0, SECTION_CAP);
  const hiddenCount = seasons.length - shown.length;

  return (
    <section className="space-y-3">
      <h3 ref={headingRef} className={`${H3} flex items-center gap-2.5 scroll-mt-24`}>
        {heading}
        {/* The count belongs with the heading, not in prose below it: "how many"
            is the first thing asked of a list like this. */}
        <span
          className={`font-[family-name:var(--font-mono-ui)] text-[12px] font-medium rounded-full px-2 py-0.5 tabular-nums ${
            live
              ? "text-[var(--caution)] bg-[var(--caution)]/12"
              : "text-[var(--text-dim)] bg-[var(--ink-3)]"
          }`}
        >
          {seasons.length}
        </span>
      </h3>
      {/* The hairline list: a 1px gap over a rule-coloured ground gives every
          row a divider without each one drawing its own border. */}
      <ul className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] list-none">
        {shown.map((season) => (
          <SeasonRow key={season.id} season={season} badge={badgeFor(season)} live={live} />
        ))}
      </ul>
      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            const collapsing = expanded;
            setExpanded(!expanded);
            if (collapsing) headingRef.current?.scrollIntoView({ block: "start" });
          }}
          className="w-full font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.07em] uppercase text-[var(--text-dim)] border border-[var(--rule)] rounded-lg px-3.5 py-2.5 hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
        >
          {expanded ? t("calendar.fewer") : t("calendar.more", { n: hiddenCount })}
        </button>
      )}
    </section>
  );
}

/**
 * The honest empty state for a region with no authored calendar.
 *
 * Rendering nothing would be a dead end, so this says plainly that we have no
 * data rather than substituting another country's seasons, and points somewhere
 * useful. The region bar renders here too, and has to: picking a region we have
 * no data for is a normal thing to do.
 */
function EmptyState({ region }: { region: RegionCode }) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      {/* The region bar renders here too, and it has to: picking a region we
          have no calendar for is a normal thing to do, and without the control
          still on screen it would be a dead end with no way back. */}
      <RegionBar region={region} />
      <article className={CARD}>
        <section className="space-y-2">
          <h2 className={H2}>{t("calendar.empty.heading")}</h2>
          <p className="text-sm text-[var(--text-dim)]">{t("calendar.empty.body")}</p>
        </section>
        <Link
          href="/learn"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("calendar.learnCta")}
        </Link>
      </article>
    </div>
  );
}

export default function ScamCalendar({
  region,
  today,
}: {
  region: RegionCode;
  /**
   * The region's civil date, resolved server-side via regionToday(). A plain
   * month/day pair rather than a Date so it means the same thing after crossing
   * the RSC boundary — a Date would be re-read in the *browser's* timezone.
   */
  today: CivilDate;
}) {
  const { t } = useLang();
  const all = calendarForRegion(region);

  // A region with no authored calendar never borrows another's seasons — it
  // says so instead.
  if (all.length === 0) return <EmptyState region={region} />;

  // Freshness signal, derived from the seasons' own review dates so it can't
  // drift — the same contract as the radar's "as at" line.
  const reviewed = lastReviewed(region);
  const active = activeSeasons(region, today);
  // Everything not currently active, in the order it arrives. The old three-way
  // split (active / next two / "rest of the year") put the same rows in two
  // shapes for no reason a reader could see; one capped list is the same
  // information with one rule instead of two.
  const upcoming = upcomingSeasons(region, today, all.length);

  return (
    <article className="space-y-6" id="scam-calendar">
      {/* The neutrality line rides with the lede rather than floating below the
          header: it qualifies what the lede just promised, and a gap between
          them reads as a new section starting. */}
      <PageHeader
        eyebrow={t("calendar.eyebrow")}
        title={t("calendar.headline")}
        lede={`${t("calendar.intro")} ${t("calendar.neutrality")}`}
      />

      {/* Order: how fresh, then whose, then the year. Matches the radar — the
          freshness stamp leads because it is the claim the page is making, and
          everything below is only worth reading if the review is current. */}
      {reviewed && (
        <FreshnessStamp
          date={formatReviewedDate(reviewed)}
          note={t("calendar.freshness.note", { n: String(all.length) })}
        />
      )}

      <RegionBar region={region} />

      <SeasonGantt region={region} today={today} />

      <SeasonSection
        heading={t("calendar.active.heading")}
        seasons={active}
        live
        badgeFor={(s) => `${t("calendar.badge.active")} · ${endsInLabel(daysUntilEnd(s, today), t)}`}
      />

      <SeasonSection
        heading={t("calendar.upcoming.heading")}
        seasons={upcoming}
        badgeFor={(s) => startsInLabel(daysUntilStart(s, today), t)}
      />

      <div className="border-t border-[var(--rule)] pt-4 space-y-3">
        <p className="text-xs text-[var(--faint)] leading-relaxed max-w-[70ch]">{t("calendar.outro")}</p>
        <Link
          href="/learn"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("calendar.learnCta")}
        </Link>
      </div>
    </article>
  );
}
