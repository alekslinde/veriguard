"use client";

// Threat radar — what's circulating now, grouped by how live it is.
//
// A client component for the same reason ScamCalendar is one: it reads the tone
// preference, which lives in localStorage and is invisible to the server.
//
// Unlike the calendar it takes no date prop. Nothing here is computed against
// "today" — an entry's status is authored by the sweep that reviewed it, not
// derived from how old its lastSeen is. That is deliberate: a campaign quiet for
// three weeks is not automatically dead, and inferring "subsided" from a date
// would silently downgrade live threats between sweeps. A human decides, and the
// "Reviewed <date>" line tells the reader how fresh that judgement is.
//
// Educational only — nothing here influences a verdict.

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useLang, type MessageKey } from "@/lib/lang";
import {
  radarForRegion,
  threatsByStatus,
  lastUpdated,
  formatRadarDate,
  roadmapUrl,
  radarSummary,
  uncoveredThreats,
  filterByChannel,
  channelCounts,
  type ThreatEntry,
  type RadarCoverage,
  type RadarChannel,
  type ChannelFilterValue,
} from "@/lib/threatRadar";
import { resolveRegionPack, type RegionCode } from "@veriguard/scam-detect/regions";
import FreshnessStamp from "./FreshnessStamp";
import PageHeader from "./PageHeader";
import RegionBar from "./RegionBar";

// Matches the card styling used across Learn, About and the calendar.
const CARD = "bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl p-6 space-y-6";
const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]";

// Group heading: the display face with the count carried as a pill, so the shape
// of the board reads at a glance rather than having to be counted by scrolling.
const H3 =
  "font-[family-name:var(--font-display)] font-semibold text-[clamp(18px,2.2vw,22px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]";

// How many rows a group shows before the "show more" cap. Five is what fits on a
// phone without the next group's heading being pushed out of reach, which is
// what makes the board's shape scannable rather than a single long scroll.
const GROUP_CAP = 5;

// The channel filter's options, in the order they are offered. "all" first
// because it is the default; the rest follow the RadarChannel union so a new
// channel is a compile error here rather than a silently missing button.
const CHANNELS = ["sms", "email", "phone", "web", "mixed"] as const satisfies readonly RadarChannel[];

// Coverage is rendered as inline text in the collapsed row rather than as a
// filled badge. A badge on every card put the same "covered" pill on the large
// majority of rows, which read as decoration and crowded out the title; naming
// only the exceptions makes the exceptions visible. Where it is called out, amber is
// deliberate — red is the verdict colour in this app, and a detection gap is a
// statement about us, not about anything the user is holding.
//
// "n/a" is not a valid message-key fragment, so the lookup goes through a map
// rather than being interpolated. Keyed by the union so a new coverage value is
// a compile error here rather than a raw key rendered to the page.
const COVERAGE_KEY: Record<RadarCoverage, MessageKey> = {
  covered: "radar.coverage.covered",
  partial: "radar.coverage.partial",
  none: "radar.coverage.none",
  "n/a": "radar.coverage.na",
};

/**
 * One campaign, as an always-open row.
 *
 * An earlier version rendered every entry at full weight — badge, summary,
 * lures, advice, detection, source, five section labels each — which measured
 * 17,000px on a phone and made scanning impossible. The fix then was to collapse
 * everything behind a <details>; the cost was that nothing could be read without
 * a click, and the page became a list of titles.
 *
 * This is the middle: the row is open, but it carries only what a reader needs
 * to decide "is this the thing I was sent?" — the title, how it reaches you,
 * whether we catch it, the summary, and one line of provenance. The lures and
 * advice, which were the bulk of the 17,000px, live on the entry's own source
 * link rather than being reprinted for all 28 at once.
 *
 * Rows are separated by hairlines rather than being individually bordered
 * cards: 28 bordered boxes read as 28 competing objects, while a ruled list
 * reads as one list that happens to be long.
 */
function ThreatCard({ threat }: { threat: ThreatEntry }) {
  const { t } = useLang();
  const isGap = threat.coverage === "partial" || threat.coverage === "none";

  return (
    <li className="bg-[var(--ink-2)] px-4 py-3.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* h4, one level below the group heading — the rows nest inside
            "Circulating now", and matching its level would flatten the two in a
            screen reader's outline. */}
        <h4 className="font-semibold text-[15px] text-[var(--foreground)]">{threat.title}</h4>
        <span className="font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.07em] text-[var(--faint)] border border-[var(--rule)] rounded px-1.5 py-px">
          {t(`radar.channel.${threat.channel}` as MessageKey)}
        </span>
        {/* Coverage is stated on every row, not only the exceptions. Reading
            "we catch this" is the reassurance the page exists to give, and with
            the rows open there is room to say it rather than relying on silence
            to mean yes. Amber for a gap, never red: red is the verdict colour,
            and a detection gap is a statement about us, not about anything the
            reader is holding. */}
        <span
          className={`font-[family-name:var(--font-mono-ui)] text-[10.5px] uppercase tracking-[0.07em] rounded-full px-2 py-0.5 border ${
            isGap
              ? "text-[var(--caution)] border-[var(--caution)]/40 bg-[var(--caution)]/10"
              : threat.coverage === "n/a"
                ? "text-[var(--faint)] border-[var(--rule)]"
                : "text-[var(--clear)] border-[var(--clear)]/40 bg-[var(--clear)]/10"
          }`}
        >
          {t(COVERAGE_KEY[threat.coverage])}
        </span>
      </div>

      {/* Both this and the meta line below share one measure, so the row reads
          as a single block rather than two paragraphs of different widths. */}
      <p className="text-[13.5px] text-[var(--text-dim)] leading-relaxed max-w-[92ch]">
        {threat.summary}
      </p>

      {/* What we do about it, and when it was last seen, on one mono line. For
          `none` and `n/a` there is no rule to describe, so a fixed line states
          the gap rather than leaving a silent absence the reader would fill in
          optimistically. The date links to the sweep that recorded it — without
          that the provenance is asserted rather than checkable, which is the
          whole difference from a news feed. */}
      <p className="font-[family-name:var(--font-mono-ui)] text-[11px] leading-relaxed text-[var(--faint)] tracking-[0.02em] max-w-[92ch]">
        {threat.detection ??
          t(threat.coverage === "n/a" ? "radar.coverage.na.body" : "radar.coverage.none.body")}
        {" · "}
        <a
          href={roadmapUrl(threat)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[var(--clear)] transition-colors"
        >
          {t("radar.source", { date: formatRadarDate(threat.lastSeen) })}
          <span className="sr-only"> ({t("a11y.newTab")})</span>
        </a>
      </p>
    </li>
  );
}

/**
 * One status group, capped until asked to show the rest.
 *
 * The cap is per-group rather than per-page: without it the first group runs
 * long enough that the second group's heading is off-screen, and the heading is
 * what tells the reader the board has a shape at all. Entries are already
 * ordered most-recently-seen first, so the visible five are the freshest.
 *
 * Collapsing scrolls the group's own heading back into view — otherwise the page
 * shortens under the reader and leaves them somewhere further down than where
 * they clicked.
 */
function ThreatGroup({ heading, threats }: { heading: string; threats: ThreatEntry[] }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (threats.length === 0) return null;

  const shown = expanded ? threats : threats.slice(0, GROUP_CAP);
  const hiddenCount = threats.length - shown.length;

  return (
    <section className="space-y-3">
      <h3 ref={headingRef} className={`${H3} flex items-center gap-2.5 scroll-mt-24`}>
        {heading}
        {/* The count belongs with the heading, not in prose below it: "how many"
            is the first thing asked of a list like this. */}
        <span className="font-[family-name:var(--font-mono-ui)] text-[12px] font-medium text-[var(--text-dim)] bg-[var(--ink-3)] rounded-full px-2 py-0.5 tabular-nums">
          {threats.length}
        </span>
      </h3>
      {/* The hairline list: a 1px gap over a rule-coloured ground gives every
          row a divider without each one drawing its own border. */}
      <ul className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] list-none">
        {shown.map((threat) => (
          <ThreatCard key={threat.id} threat={threat} />
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
          {expanded ? t("radar.fewer") : t("radar.more", { n: hiddenCount })}
        </button>
      )}
    </section>
  );
}

/**
 * Filter by how a scam reaches you — the one axis a reader actually arrives
 * with ("I got a text"). Status and coverage are our categories; the channel is
 * theirs, which is why it is the filter offered rather than the other two.
 */
function ChannelFilter({
  value,
  counts,
  total,
  onChange,
}: {
  value: ChannelFilterValue;
  counts: Record<RadarChannel, number>;
  total: number;
  onChange: (next: ChannelFilterValue) => void;
}) {
  const { t } = useLang();

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-[var(--clear)]/40 bg-[var(--clear)]/12 text-[var(--clear)]"
        : "border-[var(--rule)] text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--ink-3)]"
    }`;

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("radar.filter.heading")}>
      <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")} className={chip(value === "all")}>
        {t("radar.filter.all")} <span className="tabular-nums opacity-70">{total}</span>
      </button>
      {CHANNELS.map((ch) => {
        // A channel with no entries in this region is not offered: a button that
        // can only ever empty the board is a dead end, not a filter.
        if (counts[ch] === 0) return null;
        return (
          <button
            key={ch}
            type="button"
            aria-pressed={value === ch}
            onClick={() => onChange(ch)}
            className={chip(value === ch)}
          >
            {t(`radar.filter.${ch}` as MessageKey)}{" "}
            <span className="tabular-nums opacity-70">{counts[ch]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The honest empty state for a region with no authored radar.
 *
 * Rendering nothing would be a dead end, so this says plainly that we have no
 * data rather than substituting another country's campaigns, and points somewhere
 * useful. The region bar renders here too, and has to: picking a region we have
 * no data for is a normal thing to do.
 */
function EmptyState({ region }: { region: RegionCode }) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      {/* The region bar renders here too, and it has to: picking a region we
          have no radar for is a normal thing to do, and without the control
          still on screen it would be a dead end with no way back. */}
      <RegionBar region={region} />
      <article className={CARD}>
        <section className="space-y-2">
          <h2 className={H2}>{t("radar.empty.heading")}</h2>
          <p className="text-sm text-[var(--text-dim)]">{t("radar.empty.body")}</p>
        </section>
        <Link
          href="/learn"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("radar.learnCta")}
        </Link>
      </article>
    </div>
  );
}

export default function ThreatRadar({ region }: { region: RegionCode }) {
  const { t } = useLang();
  const all = radarForRegion(region);
  const [channel, setChannel] = useState<ChannelFilterValue>("all");
  const counts = useMemo(() => channelCounts(region), [region]);

  if (all.length === 0) return <EmptyState region={region} />;

  const reviewed = lastUpdated(region);
  // Named rather than hardcoded: the intro renders for whichever region has an
  // authored radar, and RADARS is shaped to hold more than one. "circulating in
  // Australia" was correct only for as long as AU stayed the only entry.
  const regionName = resolveRegionPack(region).name;
  const summary = radarSummary(region);
  const gaps = uncoveredThreats(region);
  const byChannel = (entries: ThreatEntry[]) => filterByChannel(entries, channel);

  return (
    <article className="space-y-6" id="threat-radar">
      {/* The neutrality line rides with the lede rather than floating below
          the header: it qualifies what the lede just promised, and a gap
          between them reads as a new section starting. */}
      <PageHeader
        eyebrow={t("radar.eyebrow")}
        title={t("radar.headline")}
        lede={`${t("radar.intro", { region: regionName })} ${t("radar.neutrality")}`}
      />

      {/* Order: how fresh, then whose, then how to narrow it. The freshness
          stamp leads because it is the claim the page is making — everything
          below is only worth reading if the review behind it is current. */}
      {reviewed && (
        <FreshnessStamp
          date={formatRadarDate(reviewed)}
          note={t("radar.freshness.note", { n: String(summary.total) })}
        />
      )}

      <RegionBar region={region} />

      {/* Gaps first, before the full board. They are the handful of entries
          where the reader is genuinely on their own, and burying them among the
          many "we catch this" rows is the one ordering that makes
          the honesty useless. Same cards, so nothing is duplicated in substance
          — they simply also appear in their status group below. */}
      {/* Filter by how it reaches you, then the count line that says what the
          board is currently showing — without it, a filter that hides most of
          the page looks like missing data rather than an applied filter. */}
      <div className="space-y-2.5">
        <ChannelFilter value={channel} counts={counts} total={all.length} onChange={setChannel} />
        <p className="text-[12.5px] text-[var(--faint)]" aria-live="polite">
          {channel === "all"
            ? t("radar.showing.all", { n: all.length })
            : t("radar.showing.filtered", { n: counts[channel], total: all.length })}
        </p>
      </div>

      {/* Every group empty means the filter matched nothing. Saying so beats
          rendering a page of headings with nothing under them, which reads as
          broken rather than filtered. */}
      {channel !== "all" && counts[channel] === 0 && (
        <p className="text-sm text-[var(--text-dim)]">{t("radar.filter.none")}</p>
      )}

      {/* The channel in each key remounts the group when the filter changes, so
          a group left expanded doesn't stay expanded over a different, shorter
          list — the "show fewer" button would then be offering to collapse rows
          the reader never expanded. */}
      {gaps.length > 0 && (
        <ThreatGroup
          key={`gaps-${channel}`}
          heading={t("radar.gaps.heading")}
          threats={byChannel(gaps)}
        />
      )}

      <ThreatGroup
        key={`active-${channel}`}
        heading={t("radar.active.heading")}
        threats={byChannel(threatsByStatus(region, "active"))}
      />
      <ThreatGroup
        key={`watchlist-${channel}`}
        heading={t("radar.watchlist.heading")}
        threats={byChannel(threatsByStatus(region, "watchlist"))}
      />
      <ThreatGroup
        key={`subsided-${channel}`}
        heading={t("radar.subsided.heading")}
        threats={byChannel(threatsByStatus(region, "subsided"))}
      />

      <div className="border-t border-[var(--rule)] pt-4 space-y-3">
        <div className="space-y-1">
          <p className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
            {t("radar.method.heading")}
          </p>
          <p className="text-xs text-[var(--faint)] leading-relaxed max-w-[70ch]">{t("radar.method.body")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/calendar"
            className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
          >
            {t("radar.calendarCta")}
          </Link>
          <Link
            href="/learn"
            className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
          >
            {t("radar.learnCta")}
          </Link>
        </div>
      </div>
    </article>
  );
}
