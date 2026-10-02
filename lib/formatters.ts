// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + "…";
}

export function fmt(n: number): string {
  return n.toLocaleString("en-AU");
}

/**
 * Short day label for a chart axis or tooltip, e.g. "3 Sep".
 *
 * Takes an ISO `YYYY-MM-DD` string and parses the parts directly rather than
 * going through Date, so the label can't shift a day in a timezone behind UTC —
 * `new Date("2026-09-03")` is parsed as UTC midnight and renders as 2 September
 * in Sydney. Returns the input unchanged if it isn't well-formed, so a bad value
 * shows as itself rather than "NaN undefined".
 */
export function formatDayLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return iso;
  return `${Number(match[3])} ${MONTHS[month]}`;
}
