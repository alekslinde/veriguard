// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PublicReport, SortOption } from "@/lib/reportStore";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { timeAgo, truncate } from "@/lib/formatters";
import { useLang, MessageKey } from "@/lib/lang";
import SafeDisplay from "@/components/SafeDisplay";
import AuthBadges from "@/components/AuthBadges";
import SubmissionsStats from "@/components/SubmissionsStats";
import PageHeader from "@/components/PageHeader";

function CopyId({ id }: { id: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 font-[family-name:var(--font-mono-ui)] text-[11px] text-[var(--faint)] hover:text-[var(--text-dim)] transition-colors py-1"
      title={t("subs.copyId")}
    >
      {copied ? `✓ ${t("subs.copied")}` : id}
    </button>
  );
}

/**
 * A labelled filter dropdown.
 *
 * The native select indicator is suppressed (`appearance-none`) and redrawn as
 * an inline SVG because WebKit on iOS paints its own indicator with light-mode
 * chrome rather than `currentColor` — against the dark panel here that arrow is
 * effectively invisible, while desktop Chrome and Firefox tint it from the text
 * colour and look fine. Drawing it ourselves makes the control identical across
 * platforms and matches the chevron on the radar cards, which was already built
 * to this geometry.
 *
 * The SVG is `pointer-events-none` so taps fall through to the select and still
 * open the native picker.
 */
function FilterSelect({
  id,
  labelKey,
  value,
  options,
  onChange,
}: {
  id: string;
  labelKey: MessageKey;
  value: string;
  options: { value: string; labelKey: MessageKey }[];
  onChange: (value: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="bg-[var(--ink-2)] px-4 py-3 space-y-1">
      <label htmlFor={id} className="block font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--faint)]">
        {t(labelKey)}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-transparent pr-6 text-sm text-[var(--foreground)] focus:outline-none cursor-pointer"
        >
          {options.map((opt) => (
            // The select is transparent to sit on the panel, but the dropdown
            // popup is painted by the OS — without an explicit background the
            // options inherit that transparency and render dark-on-dark.
            <option key={opt.value} value={opt.value} className="bg-[var(--ink-2)] text-[var(--foreground)]">
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--faint)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

const TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "subs.type.all" },
  ...REPORT_TYPES.map((t) => ({
    value: t,
    labelKey: `subs.type.${t}` as MessageKey,
  })),
];

const PERIOD_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "0",  labelKey: "subs.period.all"   },
  { value: "1",  labelKey: "subs.period.today" },
  { value: "7",  labelKey: "subs.period.week"  },
  { value: "30", labelKey: "subs.period.month" },
];

const SORT_OPTIONS: { value: SortOption; labelKey: MessageKey }[] = [
  { value: "desc",  labelKey: "subs.sort.newest" },
  { value: "asc",   labelKey: "subs.sort.oldest" },
  { value: "most",  labelKey: "subs.sort.most"   },
  { value: "least", labelKey: "subs.sort.least"  },
];

const PAGE_SIZE = 25;
const SORT_VALUES = ["desc", "asc", "most", "least"] as const;
const SEARCH_INPUT_ID = "subs-search";

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3)          pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2)  pages.push("…");
  pages.push(total);
  return pages;
}

function SkeletonList() {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)]" aria-hidden="true">
      <ul className="grid gap-px list-none">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="bg-[var(--ink-2)] px-5 py-4 space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 bg-[var(--ink-3)] rounded" />
              <div className="h-3 w-16 bg-[var(--ink-3)] rounded" />
            </div>
            <div className="h-4 w-3/4 bg-[var(--ink-3)] rounded" />
            <div className="h-3 w-1/2 bg-[var(--ink-3)] rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// All filter/search/page state is URL-driven: shareable, survives refresh, and
// browser Back/Forward steps through filter changes. Discrete filter changes
// push a history entry; live search typing replaces (so each keystroke doesn't
// pollute history).
export default function SubmissionsBrowser() {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const typeRaw = params.get("type") ?? "all";
  const type = TYPE_OPTIONS.some((o) => o.value === typeRaw) ? typeRaw : "all";
  const sortRaw = params.get("sort") ?? "desc";
  const sort: SortOption = (SORT_VALUES as readonly string[]).includes(sortRaw) ? (sortRaw as SortOption) : "desc";
  const periodDays = ["0", "1", "7", "30"].includes(params.get("days") ?? "0") ? (params.get("days") ?? "0") : "0";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const search = (params.get("q") ?? "").trim();

  const [reports, setReports] = useState<PublicReport[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(search);
  const searchRef = useRef<HTMLInputElement>(null);

  // Loading is derived: we're loading whenever the current filter signature
  // hasn't been fetched yet (no setState-in-effect needed to flip a flag).
  const filterSig = JSON.stringify([type, sort, periodDays, page, search]);
  const [settledSig, setSettledSig] = useState<string | null>(null);
  const loading = filterSig !== settledSig;

  // Keep the input in sync when q changes via navigation (Back/Forward, links)
  // — adjusted during render, and never clobbering what the user is actively
  // typing in the field.
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    // Identified by id (not ref) — refs can't be read during render.
    if (typeof document === "undefined" || document.activeElement?.id !== SEARCH_INPUT_ID) {
      setSearchInput(search);
    }
  }

  // Defaults are omitted from the URL so the bare /submissions stays canonical.
  const DEFAULTS: Record<string, string> = { type: "all", sort: "desc", days: "0", page: "1", q: "" };

  function update(changes: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === DEFAULTS[key]) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  // Debounce search input into the URL; reset to page 1 on a new term.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) update({ q: searchInput.trim(), page: "" }, true);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  // Fetch whenever any URL-driven filter changes
  useEffect(() => {
    let cancelled = false;

    const offset = (page - 1) * PAGE_SIZE;
    const since  = periodDays !== "0"
      ? Date.now() - parseInt(periodDays, 10) * 24 * 60 * 60 * 1000
      : undefined;

    const fetchParams = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort });
    if (type !== "all") fetchParams.set("type", type);
    if (since)          fetchParams.set("since", String(since));
    if (search)         fetchParams.set("search", search);

    const sig = JSON.stringify([type, sort, periodDays, page, search]);
    fetch(`/api/reports?${fetchParams}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setReports(data.reports ?? []);
        setTotal(data.total ?? 0);
        setSettledSig(sig);
      })
      .catch(() => { if (!cancelled) setSettledSig(sig); });

    return () => { cancelled = true; };
  }, [type, sort, periodDays, page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goTo(p: number) {
    update({ page: String(Math.max(1, Math.min(p, totalPages))) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearSearch() { setSearchInput(""); searchRef.current?.focus(); }

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      {/* The same header every other page uses. The old treatment — a full-bleed
          gradient band holding small emerald caps — was the only one of its kind
          left in the app, and it made this page read as a different product. */}
      <PageHeader
        eyebrow={t("subs.eyebrow")}
        title={t("subs.headline")}
        lede={t("subs.lede")}
      />

      <div className="space-y-4">

        <SubmissionsStats />

        {/* Search */}
        <div className="relative">
          {/* Drawn rather than an emoji: the magnifier glyph renders at a
              different size and colour on every platform, and picks up the
              system's emoji font rather than the page's. */}
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--faint)] pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            id={SEARCH_INPUT_ID}
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("subs.search.placeholder")}
            aria-label={t("subs.search.label")}
            className="w-full bg-[var(--ink-2)] border border-[var(--rule)] rounded-xl pl-9 pr-11 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--clear)] focus:ring-1 focus:ring-[var(--clear)] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              aria-label={t("subs.search.clear")}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--faint)] hover:text-[var(--foreground)] transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter panel */}
        <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl overflow-hidden">

          {/* ── Filter grid ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--ink-3)]">

            <FilterSelect
              id="subs-filter-type"
              labelKey="subs.type.label"
              value={type}
              options={TYPE_OPTIONS}
              onChange={(v) => update({ type: v, page: "" })}
            />

            <FilterSelect
              id="subs-filter-period"
              labelKey="subs.period.label"
              value={periodDays}
              options={PERIOD_OPTIONS}
              onChange={(v) => update({ days: v, page: "" })}
            />

            <FilterSelect
              id="subs-filter-sort"
              labelKey="subs.sort.label"
              value={sort}
              options={SORT_OPTIONS}
              onChange={(v) => update({ sort: v, page: "" })}
            />

            {/* `sort` is a SortOption union; the select hands back a plain
                string, so `update` narrows it at the call site above. */}
          </div>
        </div>

        {/* Results */}
        {loading && reports.length === 0 ? (
          <>
            <p role="status" className="sr-only">{t("subs.loading")}</p>
            <SkeletonList />
          </>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-[var(--foreground)] font-medium">{t("subs.empty.title")}</p>
            <p className="text-sm text-[var(--text-dim)]">
              {search ? t("subs.empty.searchHint") : t("subs.empty.filterHint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)]">
            <ul className="grid gap-px list-none">
              {reports.map((r) => {
                const opt = TYPE_OPTIONS.find((o) => o.value === r.type) ?? TYPE_OPTIONS[TYPE_OPTIONS.length - 1];

                // Email reports carry raw headers — extract subject as the human-readable summary.
                const displayContent = (() => {
                  if (r.type === "email") {
                    const subjectMatch = r.content.match(/^Subject:\s*(.+)$/im);
                    if (subjectMatch) return `Subject: ${subjectMatch[1].trim()}`;
                    return truncate(r.content.replace(/\S+:\s*.+\n?/g, "").trim() || r.content, 120);
                  }
                  return truncate(r.content, 200);
                })();

                // All reporter-supplied scam identifiers, in display priority order.
                // A short text label replaces the former per-row emoji — it reads
                // the same way the "Replies to" row below already does.
                const identifiers: { labelKey: MessageKey; value: string }[] = [
                  r.scamUrl   && { labelKey: "subs.id.link"  as MessageKey, value: r.scamUrl   },
                  r.scamPhone && { labelKey: "subs.id.phone" as MessageKey, value: r.scamPhone },
                  r.scamEmail && { labelKey: "subs.id.email" as MessageKey, value: r.scamEmail },
                ].filter(Boolean) as { labelKey: MessageKey; value: string }[];

                return (
                  <li key={r.id} className="bg-[var(--ink-2)] px-5 py-4 space-y-3">

                    {/* ── Row 1: type label · repetition badge · age ── */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[15px] font-semibold text-[var(--foreground)]">{t(opt.labelKey)}</span>
                        {r.matchCount > 1 && (
                          // Amber, not red. Red is the verdict colour in this
                          // app — it means "this is a scam". A repetition count
                          // says how many people reported the same thing, which
                          // is a fact about the feed, not a stronger verdict.
                          <span className="shrink-0 font-[family-name:var(--font-mono-ui)] text-[10.5px] uppercase tracking-[0.07em] px-2 py-0.5 rounded-full border text-[var(--caution)] border-[var(--caution)]/40 bg-[var(--caution)]/10 tabular-nums">
                            {r.matchCount}×
                          </span>
                        )}
                      </div>
                      <span className="font-[family-name:var(--font-mono-ui)] text-[11px] text-[var(--faint)] shrink-0">{timeAgo(r.submittedAt)}</span>
                    </div>

                    {/* ── Row 2: scam identifiers (reporter-supplied) ──
                        Each field stacks vertically: caption label on top, the
                        defanged value below. break-all keeps long URLs/emails in
                        the card without overflowing. */}
                    {identifiers.length > 0 && (
                      <div className="space-y-2">
                        {identifiers.map(({ labelKey, value }, i) => (
                          <div key={i} className="flex flex-col gap-0.5">
                            <span className="font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.09em] text-[var(--faint)]">{t(labelKey)}</span>
                            <SafeDisplay
                              value={value}
                              className={`font-[family-name:var(--font-mono-ui)] break-all ${i === 0 ? "text-[13px] text-[var(--caution)]" : "text-[12px] text-[var(--caution)]/70"}`}
                            />
                          </div>
                        ))}
                        {r.scamReplyTo && (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.09em] text-[var(--faint)]">{t("subs.repliesTo")}</span>
                            <SafeDisplay value={r.scamReplyTo} className="font-[family-name:var(--font-mono-ui)] text-[12px] text-[var(--caution)]/70 break-all" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Row 3: system-derived forensic auth badges ── */}
                    <AuthBadges emailAuth={r.emailAuth} />

                    {/* ── Row 4: what the scam said · reporter's note ── */}
                    <div className="space-y-1.5">
                      {displayContent && (
                        <SafeDisplay
                          value={displayContent}
                          className="block text-[13px] text-[var(--text-dim)] leading-relaxed break-all border-l-2 border-[var(--rule)] pl-2.5"
                        />
                      )}
                      {r.description && (
                        <p className="text-[12.5px] text-[var(--faint)] italic leading-relaxed">{truncate(r.description, 200)}</p>
                      )}
                    </div>

                    {/* ── Footer: report ID · location ── */}
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <CopyId id={r.id} />
                      {r.location && (
                        <p className="font-[family-name:var(--font-mono-ui)] text-[11px] text-[var(--faint)] shrink-0">
                          {t("subs.reportedFrom", { location: r.location })}
                        </p>
                      )}
                    </div>

                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-1" aria-label={t("subs.pagination.label")}>
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 1 || loading}
              className="px-4 py-2.5 min-h-[44px] text-sm rounded-lg bg-[var(--ink-2)] border border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--rule)] disabled:hover:text-[var(--text-dim)] transition-colors"
            >
              ← {t("subs.pagination.prev")}
            </button>

            {/* Page number buttons — hidden on small screens to prevent overflow */}
            <div className="hidden sm:contents">
              {pageNumbers(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-[var(--faint)] text-sm select-none">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goTo(p)}
                    disabled={loading}
                    aria-current={p === page ? "page" : undefined}
                    className={`min-w-[44px] min-h-[44px] py-2.5 text-sm rounded-lg border transition-colors ${
                      p === page
                        ? "bg-[var(--clear)] border-[var(--clear)] text-[var(--ink)] font-semibold"
                        : "bg-[var(--ink-2)] border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)]"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            {/* Compact page indicator for mobile */}
            <span className="sm:hidden font-[family-name:var(--font-mono-ui)] text-sm text-[var(--text-dim)] px-3 py-2.5 min-h-[44px] flex items-center tabular-nums" aria-live="polite">
              {page} / {totalPages}
            </span>

            <button
              onClick={() => goTo(page + 1)}
              disabled={page === totalPages || loading}
              className="px-4 py-2.5 min-h-[44px] text-sm rounded-lg bg-[var(--ink-2)] border border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--rule)] disabled:hover:text-[var(--text-dim)] transition-colors"
            >
              {t("subs.pagination.next")} →
            </button>
          </nav>
        )}

        <p className="text-center text-sm text-[var(--text-dim)] pb-4">
          {t("subs.footer.note")}{" "}
          <Link href="/" className="text-[var(--clear)] hover:underline underline-offset-2 font-medium">
            {t("subs.footer.cta")}
          </Link>
        </p>
      </div>
    </main>
  );
}
