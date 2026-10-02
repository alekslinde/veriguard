// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// The feed's shape at a glance: how much has been reported, how much of it is
// recent, and what kinds.
//
// Three figures then a breakdown, rather than the previous single "N reports
// total" line beside a sparkline. The old layout had a structural fault: the
// sparkline and the type breakdown were two grid columns, so a feed with no
// activity in the last 30 days — which is any quiet week, not just an edge case
// — rendered the breakdown in the left column and left the right half of the
// card visibly empty. Figures that are always present carry the top row now,
// and the chart appears below only when there is something to plot.

import { useEffect, useRef, useState } from "react";
import { FeedStats, countRecent, smoothPath, axisTicks } from "@/lib/reportStore";
import { useLang, MessageKey } from "@/lib/lang";
import { fmt, formatDayLabel } from "@/lib/formatters";

// Minimum reports before the trend chart is worth drawing. Below this the line
// carries no information and just looks broken.
const SPARKLINE_MIN = 10;

const TYPE_META: Record<string, { labelKey: MessageKey }> = {
  url:    { labelKey: "subs.type.url"    },
  sms:    { labelKey: "subs.type.sms"    },
  email:  { labelKey: "subs.type.email"  },
  phone:  { labelKey: "subs.type.phone"  },
  qr:     { labelKey: "subs.type.qr"     },
  custom: { labelKey: "subs.type.custom" },
};

/** One headline figure. Mono, because these are numbers to compare, not prose. */
function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--ink-2)] px-4 py-3.5">
      <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
        {label}
      </p>
      <p
        className={`font-[family-name:var(--font-mono-ui)] text-[26px] leading-tight tabular-nums mt-1 ${
          // Amber marks the recent figure — it's the one that says "this is
          // live". Never red: red is the verdict colour. A zero is deliberately
          // not accented: amber is an attention colour, and colouring "0" with
          // it draws the eye to the one number that has nothing to say.
          accent ? "text-[var(--caution)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Daily report counts over the last 30 days, as a smoothed area chart.
 *
 * Three things this is not, and why:
 *
 * It is not a stretched viewBox. The previous version drew into a fixed 200×36
 * box with preserveAspectRatio="none", which scales x and y by different
 * factors — that distorts stroke width, and it makes any curve look wrong,
 * because the smoothing is computed in one space and displayed in another. The
 * chart is measured and drawn in real pixels instead.
 *
 * It is not straight lines. A hard corner at every day reads as jitter on a
 * 30-point series; the curve passes exactly through every point (see
 * smoothPath) so no count is misreported, and is clamped so it cannot bulge
 * past a value between two days.
 *
 * It is not decoration, so it is not aria-hidden. The figures beside it say how
 * many reports there are; only this says when they arrived. Keyboard users get
 * the same readout as pointer users via a focusable region and arrow keys, and
 * the whole series is also available as a table to a screen reader.
 */
function ActivityChart({ byDay }: { byDay: FeedStats["byDay"] }) {
  const { t } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Which day the reader is inspecting. null when they aren't.
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(...byDay.map((d) => d.count), 0);
  const ticks = axisTicks(max);
  const axisMax = ticks[ticks.length - 1];

  // Room for the axis labels themselves. Without this the y labels sit on top
  // of the plot and the last x label runs off the right edge.
  const PAD = { top: 6, right: 8, bottom: 16, left: 22 };
  const plotW = Math.max(0, size.w - PAD.left - PAD.right);
  const plotH = Math.max(0, size.h - PAD.top - PAD.bottom);

  const points = byDay.map((d, i) => ({
    x: PAD.left + (byDay.length === 1 ? plotW / 2 : (i / (byDay.length - 1)) * plotW),
    y: PAD.top + (1 - (axisMax === 0 ? 0 : d.count / axisMax)) * plotH,
  }));

  const line = smoothPath(points);
  // The area is the same curve, closed down to the baseline — reusing the path
  // rather than recomputing it guarantees the fill can never drift from the
  // stroke it sits under.
  const area = line
    ? `${line} L${points[points.length - 1].x.toFixed(2)},${(PAD.top + plotH).toFixed(2)} L${points[0].x.toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`
    : "";

  /** Nearest day to a pointer position, in element coordinates. */
  function nearest(clientX: number): number | null {
    const el = wrapRef.current;
    if (!el || byDay.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setActive((prev) => {
      const next = (prev ?? (step > 0 ? -1 : byDay.length)) + step;
      return Math.min(byDay.length - 1, Math.max(0, next));
    });
  }

  const day = active === null ? null : byDay[active];
  const ready = plotW > 0 && plotH > 0;

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
      {/* The readout sits above the chart in its own fixed-height line rather
          than floating over the plot: a tooltip that appears on hover shifts
          the layout under the reader's cursor, and one that overlays the curve
          hides the very shape they are pointing at. */}
      <p
        className="font-[family-name:var(--font-mono-ui)] text-[11px] text-[var(--text-dim)] h-4 leading-4 tabular-nums"
        aria-live="polite"
      >
        {day &&
          t(day.count === 1 ? "subs.stats.reportOn" : "subs.stats.reportsOn", {
            n: fmt(day.count),
            date: formatDayLabel(day.date),
          })}
      </p>

      <div
        ref={wrapRef}
        className="relative flex-1 min-h-[64px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] rounded"
        tabIndex={0}
        role="img"
        aria-label={t("subs.stats.chartLabel")}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {ready && (
          <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible">
            <defs>
              <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--clear)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--clear)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Y grid and labels. The count axis is what turns "the line went
                up" into "it went up to nine", which is the difference between
                a decoration and a chart. */}
            {ticks.map((value) => {
              const y = PAD.top + (1 - (axisMax === 0 ? 0 : value / axisMax)) * plotH;
              return (
                <g key={value}>
                  <line
                    x1={PAD.left} x2={PAD.left + plotW} y1={y} y2={y}
                    stroke="var(--rule)" strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 6} y={y + 3} textAnchor="end"
                    className="font-[family-name:var(--font-mono-ui)] fill-[var(--faint)]"
                    fontSize="9"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            <path d={area} fill="url(#spark-fill)" />
            <path
              d={line}
              fill="none"
              stroke="var(--clear)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* The inspected day: a rule down to the axis, then a dot on the
                curve. The rule is what ties the readout above to a position on
                the x axis. */}
            {active !== null && points[active] && (
              <g>
                <line
                  x1={points[active].x} x2={points[active].x}
                  y1={PAD.top} y2={PAD.top + plotH}
                  stroke="var(--clear)" strokeOpacity="0.35" strokeWidth="1"
                />
                <circle
                  cx={points[active].x} cy={points[active].y} r="3.5"
                  fill="var(--ink-2)" stroke="var(--clear)" strokeWidth="1.75"
                />
              </g>
            )}

            {/* X axis: first and last day only. Thirty dated ticks would be
                unreadable at this width, and the span is the thing that needs
                stating — the points between are read off the hover readout. */}
            {byDay.length > 1 && (
              <>
                <text
                  x={PAD.left} y={size.h - 4} textAnchor="start"
                  className="font-[family-name:var(--font-mono-ui)] fill-[var(--faint)]" fontSize="9"
                >
                  {formatDayLabel(byDay[0].date)}
                </text>
                <text
                  x={PAD.left + plotW} y={size.h - 4} textAnchor="end"
                  className="font-[family-name:var(--font-mono-ui)] fill-[var(--faint)]" fontSize="9"
                >
                  {formatDayLabel(byDay[byDay.length - 1].date)}
                </text>
              </>
            )}
          </svg>
        )}
      </div>

      {/* The same series as text. A screen reader gets every day and count
          rather than the single aria-label a graphic would otherwise carry. */}
      <table className="sr-only">
        <caption>{t("subs.stats.chartLabel")}</caption>
        <tbody>
          {byDay.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatDayLabel(d.date)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeBars({ byType }: { byType: FeedStats["byType"] }) {
  const { t } = useLang();
  if (byType.length === 0) return null;

  const max = byType[0].count; // already sorted desc
  if (max === 0) return null;

  return (
    // Capped: six bars stretched across 1100px turn a compact comparison into a
    // set of very long lines whose differences are harder to read, not easier.
    <ul className="space-y-1.5 list-none max-w-[440px]" aria-label={t("subs.stats.breakdown")}>
      {byType.map(({ type, count }) => {
        const meta = TYPE_META[type];
        if (!meta) return null;
        const pct = Math.round((count / max) * 100);
        return (
          <li key={type} className="flex items-center gap-2.5 text-xs">
            <span className="w-24 shrink-0 text-[var(--text-dim)] truncate">{t(meta.labelKey)}</span>
            <div className="flex-1 bg-[var(--ink-3)] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[var(--clear)] rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-7 text-right tabular-nums text-[var(--faint)] shrink-0 font-[family-name:var(--font-mono-ui)]">
              {fmt(count)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function SubmissionsStats() {
  const { t } = useLang();
  const [stats, setStats] = useState<FeedStats | null>(null);
  // The clock is read once, when the data lands, rather than on every render:
  // reading it during render makes the output depend on when React happened to
  // re-run, which is both a hydration hazard and impossible to test.
  const [thisWeek, setThisWeek] = useState(0);

  useEffect(() => {
    fetch("/api/feed-stats")
      .then((r) => r.json())
      .then((data: FeedStats) => {
        setStats(data);
        setThisWeek(countRecent(data.byDay ?? [], Date.now()));
      })
      .catch(() => {});
  }, []);

  // Render nothing until data arrives or if the feed is completely empty.
  if (!stats || stats.total === 0) return null;

  const showChart = stats.total >= SPARKLINE_MIN && stats.byDay.length >= 2;

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)]">
      {/* Always three figures, always the same width: a row that changes shape
          with the data is harder to read across visits than one that sometimes
          shows a zero. A quiet week is information, not a gap to hide. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--rule)]">
        <Figure label={t("subs.stats.reports")} value={fmt(stats.total)} />
        <Figure label={t("subs.stats.week")} value={fmt(thisWeek)} accent={thisWeek > 0} />
        <Figure label={t("subs.stats.types")} value={fmt(stats.byType.length)} />
      </div>

      {stats.byType.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--rule)]">
          {stats.byType.length > 0 && (
            <div className="bg-[var(--ink-2)] px-4 py-3.5 space-y-2">
              <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
                {t("subs.stats.breakdown")}
              </p>
              <TypeBars byType={stats.byType} />
            </div>
          )}
          {/* The activity panel always renders, and says so when there is no
              trend to draw. An empty half of a card reads as something that
              failed to load; "nothing reported in the last 30 days" is the same
              fact stated deliberately, and it is a real thing to know about a
              feed of scam reports. */}
          <div className="bg-[var(--ink-2)] px-4 pt-3.5 pb-2.5 flex flex-col space-y-1.5">
            <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
              {t("subs.stats.activity")}
            </p>
            {showChart ? (
              // The chart sizes itself from this box, so the box needs a floor:
              // the panel's natural height comes from the type breakdown beside
              // it, and on a feed with two or three types that is shorter than a
              // chart with axes can usefully be.
              <div className="flex-1 min-h-[104px] flex">
                <ActivityChart byDay={stats.byDay} />
              </div>
            ) : (
              <p className="text-[13px] text-[var(--faint)] leading-relaxed">
                {t("subs.stats.quiet")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
