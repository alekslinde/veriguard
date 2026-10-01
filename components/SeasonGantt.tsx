"use client";

// The year, with every season drawn as a labelled bar on a twelve-month axis.
//
// This replaces the thin YearRibbon, which drew the same windows as unlabelled
// slivers. Both answer "where am I in the year"; only this one also answers
// "which season is that band", which is the question a reader actually has when
// they see a crowded November. Naming the bars is what turns the graphic from
// decoration into something you can read.
//
// The lane packing is not done here — packSeasonBands() in lib/scamCalendar.ts
// already solves it, including the awkward case of a window that wraps the year
// end (20 Nov – 15 Jan), which it emits as two bands sharing one season. That
// means a season can legitimately appear twice on this chart, and the two legs
// are drawn with a flat, dashed edge where they run off the axis so the reader
// sees one campaign continuing rather than two unrelated windows.
//
// Accessibility: the chart is aria-hidden and the season list below it is the
// accessible content. Every bar here is also a row there, with its dates in
// text — labelling the bars for a screen reader would read the whole calendar
// twice. The legend buttons are the exception: they are real controls, so they
// sit outside the hidden region and carry their own pressed state.

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang";
import {
  seasonBands,
  yearFraction,
  isActiveOn,
  formatWindow,
  labelPlacement,
  labelSpan,
  type CivilDate,
} from "@/lib/scamCalendar";
import type { RegionCode } from "@veriguard/detect/regions";

// Short month names, January-first. Deliberately not localised, for the same
// reason the ribbon's initials weren't: these are axis ticks on a glance-level
// graphic, and a locale that needs different ones needs a different chart.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LANE_HEIGHT = 24;
const LANE_GAP = 4;

/** Which bars the legend is currently showing. Both start on. */
type Shown = { now: boolean; rest: boolean };

export default function SeasonGantt({
  region,
  today,
}: {
  region: RegionCode;
  today: CivilDate;
}) {
  const { t } = useLang();
  // Filtering dims rather than removes, so the year keeps its shape while you
  // narrow it — bars vanishing would make the chart appear to have less data
  // rather than a filter applied.
  const [shown, setShown] = useState<Shown>({ now: true, rest: true });

  // The chart's own width, needed to tell whether a bar's label would clip.
  // 0 until measured, which is deliberate: on the server and on first paint no
  // label fits, so the chart renders bars-only and labels appear once the width
  // is known. The alternative — assuming a desktop width — would render labels
  // server-side that then vanish on a phone, which is a visible flash of the
  // wrong thing rather than a quiet fill-in.
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bands = seasonBands(region);
  if (bands.length === 0) return null;

  const lanes = Math.max(...bands.map((b) => b.lane)) + 1;
  const now = yearFraction(today);

  const key = (active: boolean) =>
    `font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.06em] font-medium inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] leading-[1.2] transition-colors ${
      active
        ? "bg-[var(--ink-3)] text-[var(--foreground)] border-[var(--ink-3)]"
        : "bg-transparent text-[var(--text-dim)] border-[var(--rule)] hover:text-[var(--foreground)] hover:border-[var(--ink-3)]"
    }`;

  const swatch = (inSeason: boolean) =>
    `w-[9px] h-[9px] rounded-[2px] shrink-0 border ${
      inSeason
        ? "bg-[var(--caution)]/45 border-[var(--caution)]"
        : "bg-[var(--ink-3)] border-[var(--rule)]"
    }`;

  return (
    // mx-0 only, never m-0: a <figure> carries a default margin on all four
    // sides that has to go, but the parent spaces its children with space-y,
    // which works by setting margin-top on the siblings. A blanket m-0 has the
    // same specificity and lands later in the cascade, so it silently wins and
    // the figure ends up flush against the heading below it.
    <figure className="mx-0 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] px-3.5 pt-3.5 pb-2.5 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <figcaption className="font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--text-dim)]">
          {t("calendar.ribbon.label")}
        </figcaption>
        {/* The legend doubles as the filter, so both entries are real buttons
            and identical in size and weight — only the swatch and the pressed
            state differ. A legend that looks like a legend but clicks like a
            control is worse than either on its own. */}
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label={t("calendar.gantt.filter")}>
          <button
            type="button"
            aria-pressed={shown.now}
            onClick={() => setShown((s) => ({ ...s, now: !s.now }))}
            className={key(shown.now)}
          >
            <span className={swatch(true)} aria-hidden="true" />
            {t("calendar.active.heading")}
          </button>
          <button
            type="button"
            aria-pressed={shown.rest}
            onClick={() => setShown((s) => ({ ...s, rest: !s.rest }))}
            className={key(shown.rest)}
          >
            <span className={swatch(false)} aria-hidden="true" />
            {t("calendar.gantt.rest")}
          </button>
        </div>
      </div>

      <div
        ref={chartRef}
        className="relative"
        style={{ height: lanes * LANE_HEIGHT + (lanes - 1) * LANE_GAP }}
        aria-hidden="true"
      >
        {/* Month gridlines, so a bar's position reads as a month rather than an
            arbitrary offset. Eleven internal dividers, not twelve. */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className="absolute inset-y-0 w-px bg-[var(--rule)] opacity-50"
              style={{ left: `${((i + 1) / 12) * 100}%` }}
            />
          ))}
        </div>

        {bands.map((band, i) => {
          const active = isActiveOn(band.season, today);
          const dim = active ? !shown.now : !shown.rest;
          // A leg that starts at the very left or runs to the very right is the
          // continuation of a wrapping window. Squaring off that edge and
          // dashing its border says "this carries on past here" — a rounded end
          // would claim the season stops at the year boundary, which it doesn't.
          const contLeft = band.start === 0 && band.length < 1;
          const contRight = band.start + band.length >= 1;
          // Where the title can go. Inside the bar if it fits; otherwise in
          // whichever gutter beside the bar is actually empty. A clipped label
          // ("Black Frida") is noise — it reads as a rendering fault and still
          // doesn't say which season it is — and a label overlapping the next
          // bar is worse than none, so a bar with no room on either side simply
          // goes unlabelled and relies on its hover title and its row in the
          // list below, where the name is legible anyway.
          //
          // The fit is estimated rather than measured: measuring would mean a
          // layout pass per bar on every resize, for a graphic whose labels are
          // a convenience. CHAR_EM is a conservative average advance for Inter
          // at this size, so the estimate errs towards moving a label out or
          // dropping it rather than leaving one that clips. Before the chart is
          // measured chartWidth is 0 and nothing is labelled.
          const placement = labelPlacement(band, bands, labelSpan(band.season.title, chartWidth));
          return (
            // The bar and its label are siblings inside a positioned wrapper
            // rather than text inside the bar, so a label too wide for its bar
            // can sit beside it instead of being clipped by it. The wrapper is
            // zero-width at the bar's start; the bar takes the window's width
            // and the label is placed relative to that.
            <span
              key={`${band.season.id}-${i}`}
              title={`${band.season.title} — ${formatWindow(band.season.window)}`}
              className={`absolute transition-opacity ${dim ? "opacity-[0.18]" : "opacity-100"}`}
              style={{
                left: `${band.start * 100}%`,
                width: `${Math.max(band.length * 100, 1)}%`,
                top: band.lane * (LANE_HEIGHT + LANE_GAP),
                height: LANE_HEIGHT,
              }}
            >
              <span
                className={[
                  "absolute inset-0 flex items-center overflow-hidden",
                  "whitespace-nowrap px-[7px] text-[11px] leading-none border",
                  contLeft ? "rounded-l-none border-l-dashed" : "rounded-l-[5px]",
                  contRight ? "rounded-r-none border-r-dashed" : "rounded-r-[5px]",
                  active
                    ? "bg-[var(--caution)]/[0.22] border-[var(--caution)]/50 text-[var(--foreground)] font-semibold"
                    : "bg-[var(--ink-3)] border-[var(--rule)] text-[var(--text-dim)]",
                ].join(" ")}
              >
                {placement === "inside" && band.season.title}
              </span>
              {/* Outside the bar, and therefore not clipped by it. Placed to
                  the right where there is room, otherwise to the left, so a
                  December window's label doesn't run off the chart. */}
              {(placement === "right" || placement === "left") && (
                <span
                  className={[
                    "absolute top-0 flex items-center whitespace-nowrap text-[11px] leading-none",
                    active ? "text-[var(--foreground)] font-semibold" : "text-[var(--text-dim)]",
                    placement === "right" ? "left-full pl-[6px]" : "right-full pr-[6px]",
                  ].join(" ")}
                  style={{ height: LANE_HEIGHT }}
                >
                  {band.season.title}
                </span>
              )}
            </span>
          );
        })}

        {/* Today. Drawn last so it sits above every bar, and extended slightly
            past the lanes so it reads as an axis marker rather than a bar. */}
        <span
          className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-sm bg-[var(--clear)] z-[3]"
          style={{ left: `${now * 100}%` }}
        >
          <span className="absolute -top-[15px] left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono-ui)] text-[9px] tracking-[0.06em] text-[var(--clear)] whitespace-nowrap">
            {t("calendar.ribbon.today")}
          </span>
        </span>
      </div>

      {/* The scale sits under a rule so the chart reads as plotted against an
          axis. Alternate labels drop out on a narrow screen rather than
          overlapping into an unreadable smear. */}
      <div
        className="flex mt-2.5 pt-[7px] border-t border-[var(--rule)] font-[family-name:var(--font-mono-ui)] text-[9.5px] tracking-[0.04em] text-[var(--faint)] select-none"
        aria-hidden="true"
      >
        {MONTHS.map((m, i) => (
          <span key={m} className={`flex-1 ${i % 2 === 1 ? "max-[560px]:text-transparent" : ""}`}>
            {m}
          </span>
        ))}
      </div>
    </figure>
  );
}
