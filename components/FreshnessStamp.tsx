// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useLang } from "@/lib/lang";

/**
 * "Reviewed <date>" — the freshness claim for a dated dataset.
 *
 * This is one of the stronger public claims the project can make, so it gets a
 * component rather than a grey line beside the heading: a reader asking "is
 * this current?" should not have to hunt for the answer.
 *
 * The date always comes from the data's own review dates (lastReviewed() /
 * lastUpdated()), never from today's clock — a freshness signal that reports
 * "now" whenever the page is opened is worse than none, because it is the one
 * number a reader cannot verify but is being asked to trust.
 *
 * `note` says what the date covers. The distinction matters: this is the newest
 * review across the set, not a claim that everything was checked that day, and
 * each entry carries its own date so the claim stays inspectable.
 */
export default function FreshnessStamp({
  date,
  note,
}: {
  /** Pre-formatted date string, e.g. "27 August 2026". */
  date: string;
  note?: string;
}) {
  const { t } = useLang();
  return (
    <div
      className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-1
                 rounded-r-xl border border-l-2 border-[var(--rule)] border-l-[var(--clear)]
                 bg-[var(--clear)]/[0.055] px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="w-[7px] h-[7px] self-center rounded-full bg-[var(--clear)]
                   shadow-[0_0_0_3px_rgba(0,166,118,0.18)]"
      />
      <p className="text-sm text-[var(--foreground)] m-0">
        <span className="font-semibold">{t("freshness.label")}</span>{" "}
        <span className="font-[family-name:var(--font-mono-ui)] text-[13px] font-medium text-[var(--clear)] whitespace-nowrap">
          {date}
        </span>
      </p>
      {/* Sits under the label sharing its left edge. Deliberately not
          right-aligned: a sentence with a ragged left edge makes the eye hunt
          for the start of each line. */}
      {note && (
        <p className="col-start-2 text-[12.5px] text-[var(--faint)] leading-relaxed m-0 max-w-[64ch]">
          {note}
        </p>
      )}
    </div>
  );
}
