"use client";

import { useLang } from "@/lib/lang";
import type { RegionCoverage } from "@veriguard/detect/regions";

/**
 * What this check could and couldn't see, when the region pack that ran has
 * less than full detection coverage.
 *
 * Warning only: the region picker lives in CheckRegionPicker, which renders on
 * both the input and result steps. Folding the picker in here hid it whenever
 * coverage was full — exactly when a wrong geo guess most needs correcting —
 * because this notice returns null on full coverage.
 *
 * The point is honesty about what we did and didn't check: a low score under
 * partial coverage can mean "no rule matched because no rule exists". The
 * checkers already downgrade "safe" to "unknown" in that case; this explains
 * why, and — per the project's teach-don't-just-block value — hands the user
 * the patterns to judge it themselves.
 *
 * Amber, not sky-blue, and no emoji. The colour system has one rule about this
 * exact case (see VerdictBadge): red is the verdict's, and amber is reserved
 * for statements about our own coverage. This is that statement, so it takes
 * that colour instead of a third hue used nowhere else — and the emoji went for
 * the reason VerdictBadge gives for having none, that it renders differently on
 * every platform and carries a tone the notice has to set in words.
 *
 * Deliberately still not styled as an alarm: this is a statement about our
 * coverage, not a finding about their message.
 */
export default function CoverageNotice({
  coverage,
}: {
  coverage: RegionCoverage;
}) {
  const { t } = useLang();
  if (coverage === "full") return null;

  const tips = [
    t("verdict.coverage.tip1"),
    t("verdict.coverage.tip2"),
    t("verdict.coverage.tip3"),
    t("verdict.coverage.tip4"),
  ];

  return (
    <div className="rounded-lg border border-[var(--caution)]/40 bg-[var(--caution)]/[0.07] p-4 space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-bold text-[var(--caution)]">{t("verdict.coverage.title")}</p>
        <p className="text-sm text-[var(--text-dim)]">{t("verdict.coverage.body")}</p>
        <p className="text-sm font-medium text-[var(--foreground)]">{t("verdict.coverage.advice")}</p>
      </div>

      <div className="border-t border-[var(--caution)]/25 pt-3 space-y-1.5">
        <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wide">
          {t("verdict.coverage.learn")}
        </p>
        <ul className="space-y-1">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-dim)]">
              <span className="shrink-0 text-[var(--caution)] mt-0.5" aria-hidden="true">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
