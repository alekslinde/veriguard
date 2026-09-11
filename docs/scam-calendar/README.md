# Scam calendar — maintenance

The scam calendar (`lib/scamCalendar.ts`) teaches people what's *likely* at this
time of year: tax season, the Christmas parcel rush, romance scams around
Valentine's Day. It is the seasonal companion to the threat radar
(`lib/threatRadar.ts`, promoted from `docs/threat-intel/`), and it follows the
same discipline.

**It is educational only. Nothing here touches scoring.** A verdict must never
change because of the date — a tax scam in March is still a tax scam, and a
legitimate ATO email in July is still legitimate. Seasonality raises the *base
rate* of a campaign, which is useful for a person to know and dangerous for a
scorer to assume. See the header comment in `lib/scamCalendar.ts`.

---

## What belongs here

A **recurring, seasonal** pattern a person could plausibly meet — something that
spikes in a predictable window every year and that they might receive, click, or
be phoned about. If it doesn't recur on the calendar, it belongs on the threat
radar instead; if a person can't act on it, it belongs in `docs/threat-intel/`
as research.

Every season names the same campaigns the detector already knows about (the
region packs in `lib/regions/`) rather than inventing a parallel taxonomy. Where
`au.ts` carries a keyword group, the AU season names the same campaign.

Regions are authored independently. An unauthored region renders **nothing** —
it never borrows another country's tax dates. Adding a region means adding both
its seasons **and** its timezone to `REGION_TIMEZONE` (the type enforces this: a
missing zone is a compile error, not a silent revert to the server clock).

---

## Provenance and freshness — the two required fields

Every `ScamSeason` carries two fields that make the calendar maintainable rather
than a pile of magic strings that rot into folklore:

- **`sources`** — at least one authoritative citation (`{ label, url }`). A
  regulator or consumer-protection body: it dates the claim and gives a reader
  somewhere independent to check it. This is the calendar's answer to the radar's
  `roadmap` link, and to the same reasoning that keeps the detector's keyword
  lists open (see `CLAUDE.md`). An unsourced season is a claim with no evidence.

- **`reviewed`** — the ISO date (`YYYY-MM-DD`) the entry was last checked against
  its sources. `lastReviewed()` derives the calendar's "Reviewed &lt;date&gt;"
  line from the maximum across a region, so it can never drift from the data —
  the same contract as the radar's `lastUpdated()`. A stale date on a page about
  what's current is worse than no date.

Prefer a body's **scam hub / landing page** over a dated press release: the hub
outlives any one alert, so it rots less and stays the right place for a reader to
check *now*.

---

## Review cadence

1. **Quarterly**, walk the calendar for the current and next season: are the
   windows still right, are the lures current, do the sources still resolve? Bump
   `reviewed` on anything you re-confirm.
2. **Fold into the weekly threat-intel sweep.** The sweeps in
   `docs/threat-intel/` already surface seasonal patterns as they build. When a
   sweep records a campaign that recurs annually — a new tax-time lure, a new
   parcel-fee variant — promote it to (or refresh it in) the calendar the same
   way radar entries are promoted, and cite the sweep or the underlying source.
3. **When a source 404s** (flagged by the weekly check below), find the
   replacement page, update the source, and bump `reviewed`.

   A **403 is not automatically rot.** The checker already retries with a
   browser user-agent and reports `BLOCKED` when the host answers one, so a
   403 that survives that is either a dead page or a WAF refusing every agent.
   Tell them apart by asking for the site's **root**: if the root answers and
   the path does not, the page moved (Garda, 2026-09-11); if the root refuses
   too, it is edge protection (Action Fraud). Only in the second case set
   `expect: "blocked"` on the citation — after opening it in a real browser —
   and write the verification down next to it. A test requires that comment,
   because the flag creates the one thing this archive exists to prevent: a
   citation nothing checks.

---

## What CI enforces

Two layers, mirroring the threat-intel setup:

- **Structure + provenance — every push.** `__tests__/scamCalendar.test.ts`
  iterates *every* authored region and fails the build if any season has an
  impossible window, a duplicate id, empty teaching content, **no source**, a
  non-`https`/unparseable source URL, or a malformed `reviewed` date. It also
  enforces a **floor of five seasons per region**, so "too few entries" fails CI
  rather than lingering.

- **Link rot — weekly.** `scripts/check-calendar-sources.ts` probes every unique
  source URL and reports what rotted, run by
  `.github/workflows/calendar-check.yml` (Tuesdays ~07:30 AEST, and on PRs
  touching the calendar in offline `--validate` mode). It flags; it never edits
  the data. Reachability only — whether a body published something new is
  research, not a cron job.

```bash
npm run check-calendar              # human-readable reachability report
npm run check-calendar -- --validate   # structure only, no network
npm run check-calendar -- --markdown   # issue/summary format
```

---

## Adding or refreshing a season

1. Add the entry to the region's array in `lib/scamCalendar.ts` (reuse the
   region's shared source constants; add a new one only for a genuinely new
   body).
2. Give it `sources` (≥1, https) and today's `reviewed` date.
3. Run `npm test` (structure, provenance, coverage floor) and
   `npm run check-calendar -- --validate` (source shape offline).
4. If you added a source URL, run `npm run check-calendar` once to confirm it
   resolves before committing.

That's it — no schema changes, and the UI (`components/ScamCalendar.tsx`) picks
up the new season, its source links, and the refreshed "Reviewed" date
automatically.
