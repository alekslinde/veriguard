// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";
import { REGION_OPTIONS, type RegionCode } from "@veriguard/detect/regions";

/**
 * Says which region's data is on screen, and lets the reader change it.
 *
 * The radar and calendar are regional by nature, and until now the region was
 * decided entirely by a geo-IP guess the reader could neither see nor correct.
 * That guess misfires for anyone travelling, on a VPN, or behind a privacy
 * proxy — and when it does, the page quietly shows the wrong country's scams
 * with nothing to indicate it. Naming the guess is what makes it correctable.
 *
 * The choice goes in the URL rather than component state: it survives a refresh,
 * it can be linked to someone in that region, and the page reading it stays a
 * server component. `resolveRegion` already takes an explicit override ahead of
 * the geo header, so the query param feeds a path that existed before this.
 *
 * The privacy line is not decoration. This bar is the one place the app admits
 * to deriving anything from the connection, so it says in the same breath what
 * is actually read — the country the network reports, never the IP itself.
 */
export default function RegionBar({ region }: { region: RegionCode }) {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = REGION_OPTIONS.find((o) => o.code === region);
  // Whether this region was guessed or picked. Saying "detected from your
  // connection" about a value the reader just chose from the dropdown is a false
  // claim about where the data came from, and this bar's whole job is being
  // straight about that.
  const chosen = searchParams.get("region") !== null;

  function change(code: string) {
    const next = new URLSearchParams(searchParams);
    next.set("region", code);
    // scroll:false — the reader is looking at the bar, and jumping them to the
    // top of the page to show a changed list underneath it is disorienting.
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] px-3.5 py-3">
      <span className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
        {t("radar.region.label")}
      </span>
      <span className="text-[13px] text-[var(--text-dim)] min-w-0">
        {t(chosen ? "radar.region.chosen" : "radar.region.detected")}{" "}
        <b className="font-semibold text-[var(--foreground)]">{current?.name ?? region}</b>
        {/* The privacy note explains the geo guess, so it only belongs where a
            guess actually happened. */}
        {!chosen && <span className="text-[var(--faint)]"> {t("radar.region.privacy")}</span>}
      </span>
      <label htmlFor="radar-region" className="sr-only">
        {t("radar.region.change")}
      </label>
      <select
        id="radar-region"
        value={region}
        onChange={(e) => change(e.target.value)}
        className="sm:ml-auto w-full sm:w-auto rounded-lg border border-[var(--ink-3)] bg-[var(--ink)] px-2.5 py-2 text-[16px] sm:text-[13.5px] text-[var(--foreground)] cursor-pointer"
      >
        {REGION_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
