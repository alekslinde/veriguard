"use client";

// Home-page threat radar — what is circulating right now, in the words it
// actually arrives in.
//
// This was a one-line strip of campaign titles: "Circulating right now: AU
// crypto exchange impersonation · Food delivery platform impersonation · NBN
// and telco disconnection threats and 3 more". Six names and a count, none of
// which a reader can do anything with. The titles are OUR categories — what we
// call a campaign when filing it — and nobody has ever received a text that
// said "food delivery platform impersonation".
//
// So the section quotes the lures instead. Those are authored for every entry
// and were rendered nowhere: the radar page drops them for length (see the note
// on ThreatCard), which is what makes them the right content here rather than a
// second printing of that page. "Your NBN service will be disconnected today"
// is the thing someone reads at 9pm, and recognising it is the whole point.
//
// Coverage is stated per quote, including where we DON'T catch it. That is the
// uncomfortable half and it is deliberate — lib/threatRadar.ts argues the case
// at length, and the short version is that a gap we admit teaches someone to
// check by hand, while a gap we hide gets read as "the tool said fine, so it's
// fine". A voice call marked "nothing to catch in text" is not a failure; it is
// outside what a text checker can ever see, and saying so is more honest than
// an empty badge.
//
// Last on the page, after the ways-in rows, and it SURVIVES a check — unlike
// the strip it replaces, which retired when a verdict arrived. A reader who
// just got "looks clean" is precisely who should see what is going around;
// retiring it at that moment removed it exactly when it became useful.

import Link from "next/link";
import { useLang, type MessageKey } from "@/lib/lang";
import { circulatingLures, type RadarLure } from "@/lib/threatRadar";
import type { RegionCode } from "@veriguard/scam-detect/regions";

/**
 * How many quotes to show.
 *
 * Four fills the section without turning it into the page — the failure mode
 * the old strip's hard cap also existed to prevent, since an unbounded list
 * grows with every sweep. AU currently has six active campaigns, so this is a
 * genuine selection rather than a limit that never binds.
 */
const MAX_SHOWN = 4;

/** Mono chips, matching the radar page's vocabulary rather than inventing one. */
const CHANNEL_KEY: Record<RadarLure["channel"], MessageKey> = {
  sms: "radar.channel.sms",
  email: "radar.channel.email",
  phone: "radar.channel.phone",
  web: "radar.channel.web",
  mixed: "radar.channel.mixed",
};

const COVERAGE_KEY: Record<RadarLure["coverage"], MessageKey> = {
  covered: "radar.coverage.covered",
  partial: "radar.coverage.partial",
  none: "radar.coverage.none",
  "n/a": "radar.coverage.na",
};

function Quote({ lure }: { lure: RadarLure }) {
  const { t } = useLang();
  // A gap is amber, never red: red is the verdict colour and belongs to a
  // judgement about the reader's own message. A detection gap is a statement
  // about us. `n/a` is neither — nothing is missing, so it stays neutral.
  const isGap = lure.coverage === "partial" || lure.coverage === "none";

  return (
    <li className="px-4 py-3">
      {/* The quote carries the emphasis, because it is the thing worth
          remembering. Everything else on the row is a label for it. */}
      <p className="text-[14.5px] text-[var(--foreground)] leading-snug">
        &ldquo;{lure.text}&rdquo;
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.07em]">
        <span className="text-[var(--faint)]">{t(CHANNEL_KEY[lure.channel])}</span>
        <span aria-hidden="true" className="text-[var(--rule)]">
          ·
        </span>
        <span
          className={
            isGap
              ? "text-[var(--caution)]"
              : lure.coverage === "n/a"
                ? "text-[var(--faint)]"
                : "text-[var(--clear)]"
          }
        >
          {t(COVERAGE_KEY[lure.coverage])}
        </span>
      </p>
    </li>
  );
}

export default function RadarTeaser({ region }: { region: RegionCode }) {
  const { t } = useLang();
  const lures = circulatingLures(region, MAX_SHOWN);

  // No radar for this region, or nothing active in it. Render nothing rather
  // than an empty shell — only AU is authored today, and a heading over a blank
  // list would read as a failure rather than an absence.
  if (lures.length === 0) return null;

  return (
    <section aria-labelledby="radar-heading" className="pt-2">
      <h2
        id="radar-heading"
        className="flex items-center gap-2 text-[15px] font-semibold text-[var(--foreground)]"
      >
        <span
          aria-hidden="true"
          className="w-[7px] h-[7px] rounded-full bg-[var(--caution)] shrink-0 shadow-[0_0_0_3px_rgba(232,163,61,0.16)]"
        />
        {t("home.radar.heading")}
      </h2>

      {/* Says these are quotations before the reader meets one, so a scam line
          is never mistaken for the site talking to them. */}
      <p className="mt-1 mb-3 max-w-[68ch] text-[13.5px] text-[var(--text-dim)] leading-relaxed">
        {t("home.radar.lede")}
      </p>

      <ul className="rounded-xl border border-[var(--rule)] divide-y divide-[var(--rule)] overflow-hidden">
        {lures.map((lure) => (
          <Quote key={lure.id} lure={lure} />
        ))}
      </ul>

      {/* The link sits after the quotes rather than beside the heading. Up
          there it competed with the heading for a narrow row and pushed
          "Circulating right now" onto two lines on a phone; down here it is
          what a reader wants once they have read the four and want the rest.

          The neutrality note is the one the radar page also carries. Being
          listed here must never be read as changing how a message scores —
          nothing in that module is an input to the detector, and saying so in
          one line costs less than leaving the inference open. */}
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <p className="min-w-0 flex-1 basis-[30ch] text-[12px] text-[var(--faint)] leading-relaxed">
          {t("home.radar.neutrality")}
        </p>
        <Link
          href="/radar"
          className="shrink-0 text-[13px] font-semibold text-[var(--clear)] hover:underline underline-offset-2"
        >
          {t("home.radar.cta")}
        </Link>
      </div>
    </section>
  );
}
