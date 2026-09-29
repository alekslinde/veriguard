"use client";

import { useLang } from "@/lib/lang";
import { accent } from "@/lib/richText";
import StatsBar from "./StatsBar";

/**
 * `stats` is passed straight through to StatsBar. This component is a client
 * component (it uses useLang), so it cannot fetch server-side itself — the
 * homepage resolves the counters during its own render and hands them down.
 *
 * Required rather than optional, and deliberately so: an optional prop would
 * let a future caller render `<HomeHero />`, type-check cleanly, and silently
 * lose the invocation saving with nothing failing. `null` says the server tried
 * and could not.
 */
export default function HomeHero({ stats }: { stats: { checks: number; reports: number } | null }) {
  const { t } = useLang();
  return (
    // Left-aligned rather than centred: the page reads as a tool with a job to
    // do, and centred text sets a different, more brochure-like expectation.
    // The headline carries its own line break, so it is capped generously
    // rather than relied on to wrap.
    <div className="space-y-3">
      {/* The headline breaks where the meaning does, so the line break is part
          of the copy rather than a width accident: the question, then the
          promise. "exactly" takes the accent because it is the differentiator —
          plenty of tools say whether something is a scam, few show why. */}
      <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(28px,5vw,50px)] leading-[1.06] tracking-[-0.02em] text-[var(--foreground)] max-w-[22ch]">
        {t("home.title").split("\n").map((line, i) => (
          <span key={i} className="block">
            {accent(line)}
          </span>
        ))}
      </h1>
      {/* Carries the privacy promise inline — privacy is the core of this tool,
          so it is read up front, not buried in small print on the card.

          The counters render inside this paragraph rather than as a bar beneath
          it: they qualify the claim the sentence just made, and as their own row
          they wrapped to two lines on a phone and stranded a separator dot. The
          subtitle no longer opens by listing what you can paste — the textarea's
          own placeholder said the same four things a few hundred pixels below,
          and saying them twice was most of the preamble between the headline and
          the box. */}
      <p className="text-base sm:text-[17px] text-[var(--text-dim)] max-w-[58ch] leading-relaxed">
        {t("home.subtitle")}
        <StatsBar initial={stats} />
      </p>
    </div>
  );
}
