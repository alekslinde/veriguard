"use client";

import { useLang } from "@/lib/lang";
import type { CheckFeedback } from "@/lib/checkFeedback";
import { REGION_OPTIONS } from "@veriguard/detect/regions";

/**
 * Explicit region choice for a scam check.
 *
 * Rendered on both the input step (decides the first check) and the result
 * step (re-runs the same content elsewhere). Null = auto: nothing is sent and
 * the server resolves from the geo header, falling back to the default.
 *
 * The recheck status lives here rather than on the coverage warning because
 * the picker is now always visible — the warning only renders under partial
 * coverage, so a re-check driven from this control used to run, and fail,
 * with nothing on screen when coverage was full.
 */
export type RecheckState = CheckFeedback["recheck"];

export default function CheckRegionPicker({
  id,
  value,
  onChange,
  disabled,
  recheck,
  compact,
  onPaper,
  prefix,
  selectClassName,
  small,
}: {
  id: string;
  /** Explicit choice, or null for auto. */
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  recheck?: RecheckState;
  /**
   * Single-row layout for tight surfaces (e.g. inside the check card): the
   * label and select share one line and the hint is omitted (kept as the
   * select's title tooltip).
   */
  compact?: boolean;
  /**
   * Paper-surface styling for use inside the light check card. Defaults to
   * the dark styling used on page and sheet backgrounds.
   */
  onPaper?: boolean;
  /**
   * Compact visible label rendered in place of the default one (e.g. "region"
   * for a header slot reading "…region [Auto]"). It is the select's real
   * associated label, not a preposition. Localised by the caller when the
   * prototype graduates — hardcoded English is fine until then.
   */
  prefix?: string;
  /** Extra classes appended to the select (e.g. a max-width for tight slots). */
  selectClassName?: string;
  /**
   * Compact sizing for header slots: tighter padding and smaller type so the
   * row keeps its height. No `!`-prefixed overrides — Tailwind v4 no longer
   * honours the v3 prefix syntax, so sizing branches explicitly instead.
   */
  small?: boolean;
}) {
  const { t } = useLang();
  const busy = disabled || recheck?.state === "loading";
  const regionName = (code: string) =>
    REGION_OPTIONS.find((o) => o.code === code)?.name ?? code;
  const labelCls = onPaper ? "text-[#5D6675]" : "text-[var(--faint)]";
  const selectCls = onPaper
    ? "border-[#D9D5CC] bg-white text-[#3D4654]"
    : "border-[var(--ink-3)] bg-[var(--ink)] text-[var(--foreground)]";
  const hintCls = onPaper ? "text-[#8A93A1]" : "text-[var(--faint)]";
  const sizeCls = small ? "px-2 py-1.5 text-[13px]" : "px-2.5 py-2 text-[13.5px]";

  return (
    <div className={compact ? undefined : "space-y-1.5"}>
      <div className="flex flex-wrap items-center gap-2">
        {prefix ? (
          <label
            htmlFor={id}
            className={`font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.09em] ${labelCls}`}
          >
            {prefix}
          </label>
        ) : (
          <label
            htmlFor={id}
            className={`font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.09em] ${labelCls}`}
          >
            {t("check.region.label")}
          </label>
        )}
        <select
          id={id}
          value={value ?? ""}
          disabled={busy}
          title={compact ? t("check.region.hint") : undefined}
          onChange={(e) => onChange(e.target.value ? e.target.value : null)}
          className={`rounded-lg border cursor-pointer disabled:opacity-60 disabled:cursor-progress ${sizeCls} ${selectCls}${selectClassName ? ` ${selectClassName}` : ""}`}
        >
          <option value="">{t("check.region.auto")}</option>
          {REGION_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {!compact && <p className={`text-xs ${hintCls}`}>{t("check.region.hint")}</p>}
      {recheck && (
        <div role="status" aria-live="polite">
          {recheck.state === "loading" && (
            <p className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0 rounded-full border-[1.5px] border-[var(--caution)] border-t-transparent motion-safe:animate-spin"
              />
              {t("verdict.coverage.rechecking", { region: regionName(recheck.region) })}
            </p>
          )}
          {recheck.state === "done" && (
            <p className="text-[13px] text-[var(--text-dim)]">
              {t("verdict.coverage.recheckDone", { region: regionName(recheck.region) })}
            </p>
          )}
          {recheck.state === "error" && (
            <p role="alert" className="text-[13px] leading-relaxed text-[var(--scam-text)]">
              {t(
                recheck.kind === "rate_limited"
                  ? "verdict.coverage.recheckRateLimited"
                  : "verdict.coverage.recheckError",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
