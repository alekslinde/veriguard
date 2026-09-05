// Step 0 of the i18n plan's "Next steps": read per-region report demand.
//
// This is the signal the Phase 6 deferral is conditioned on — meaningful
// non-AU/GB volume argues for more locales or regions; volume concentrated in
// the packs we already cover argues for spending the effort on detection depth
// instead. Read-only: it runs SELECTs and nothing else.
//
// Usage (needs prod credentials — the local SQLite fallback has no real data):
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/region-demand.ts
//
// Two schema details worth knowing, both of which skew the naive query:
//   - `region` was added by Phase 2 with DEFAULT '' — rows predating it are the
//     empty string, NOT NULL, and must be reported separately rather than
//     folded in as an unknown region.
//   - the timestamp column is `submitted_at` (epoch ms), not `created_at`.

import { getDb } from "../lib/db";
import { REGION_OPTIONS } from "@veriguard/engine/regions";

const isProd = Boolean(process.env.TURSO_DATABASE_URL);

function bar(n: number, max: number, width = 32): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((n / max) * width)));
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0.0%";
}

async function main() {
  const db = await getDb();

  if (!isProd) {
    console.log(
      "\n⚠️  TURSO_DATABASE_URL is unset — reading the local SQLite fallback.\n" +
        "   The local seed has no real region data; this run proves the query\n" +
        "   works but answers nothing. Set prod credentials for the real signal.\n",
    );
  }

  const total = Number(
    (await db.execute("SELECT COUNT(*) AS n FROM reports")).rows[0].n,
  );
  console.log(`\nTotal reports: ${total}`);
  if (total === 0) {
    console.log("No rows — nothing to report.\n");
    return;
  }

  // 1. Headline: volume by region, empty (pre-Phase-2) rows kept distinct.
  const byRegion = await db.execute(`
    SELECT CASE WHEN region = '' THEN '(unset)' ELSE region END AS region,
           COUNT(*) AS n
    FROM reports
    GROUP BY 1
    ORDER BY n DESC
  `);

  const rows = byRegion.rows.map((r) => ({
    region: String(r.region),
    n: Number(r.n),
  }));
  const max = Math.max(...rows.map((r) => r.n));

  console.log("\nBy region");
  console.log("─".repeat(60));
  for (const r of rows) {
    const label = r.region.padEnd(8);
    const count = String(r.n).padStart(6);
    console.log(`${label} ${count}  ${pct(r.n, total).padStart(6)}  ${bar(r.n, max)}`);
  }

  // 2. The `(unset)` bucket is pre-Phase-2 backfill, not a coverage gap. Excluding
  //    it is what makes the remaining split meaningful.
  const attributed = rows
    .filter((r) => r.region !== "(unset)")
    .reduce((s, r) => s + r.n, 0);
  const unset = total - attributed;
  console.log("─".repeat(60));
  console.log(
    `Attributed: ${attributed} (${pct(attributed, total)})   ` +
      `Pre-Phase-2 / unset: ${unset} (${pct(unset, total)})`,
  );

  if (attributed > 0) {
    console.log("\nShare of attributed reports only");
    console.log("─".repeat(60));
    for (const r of rows.filter((x) => x.region !== "(unset)")) {
      console.log(
        `${r.region.padEnd(8)} ${String(r.n).padStart(6)}  ${pct(r.n, attributed).padStart(6)}`,
      );
    }
  }

  // 3. Split by month: the region column only started being populated in
  //    Phase 2, so a flat lifetime count understates recent non-AU demand.
  //
  //    Bucketing timezone matters here. Plain 'unixepoch' is UTC, which pushes
  //    AU submissions from the first ~10-11 hours of a month into the previous
  //    one — precisely the trend this script exists to read. SQLite's
  //    'localtime' is not the fix either: it resolves against whichever machine
  //    runs the script, so the same data would bucket differently for different
  //    people. Instead we declare the offset explicitly and print it, so the
  //    numbers mean the same thing wherever they're produced.
  //
  //    Default is +10:00 (AEST, the primary market). Override for another
  //    reference point, e.g. REGION_DEMAND_UTC_OFFSET=+00:00 for plain UTC.
  const offset = process.env.REGION_DEMAND_UTC_OFFSET ?? "+10:00";
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) {
    throw new Error(
      `REGION_DEMAND_UTC_OFFSET must look like "+10:00" or "-05:00", got "${offset}"`,
    );
  }

  const byMonth = await db.execute({
    sql: `
      SELECT strftime('%Y-%m', datetime(submitted_at / 1000, 'unixepoch', ?)) AS month,
             CASE WHEN region = '' THEN '(unset)' ELSE region END AS region,
             COUNT(*) AS n
      FROM reports
      GROUP BY 1, 2
      ORDER BY month DESC, n DESC
    `,
    args: [offset],
  });

  if (byMonth.rows.length) {
    console.log(`\nBy month (most recent first; buckets cut at UTC${offset})`);
    console.log("─".repeat(60));
    let current = "";
    for (const r of byMonth.rows) {
      const month = String(r.month);
      if (month !== current) {
        console.log(`\n  ${month}`);
        current = month;
      }
      console.log(`    ${String(r.region).padEnd(8)} ${String(Number(r.n)).padStart(6)}`);
    }
  }

  // 4. Uncovered regions are the one thing that would justify jumping the queue
  //    ahead of detection depth. Authoring a full region pack is expensive and
  //    every one so far has surfaced cross-region defects, so breadth is only
  //    worth buying against demonstrated demand — which is what this measures.
  //
  //    Derived from the engine's own pack list rather than hand-kept: this set
  //    was written when six packs existed and silently went stale when SG
  //    shipped, which would have counted a real SG report as evidence for
  //    adding a pack that already exists. ZZ is "assessed with base signals
  //    only" — a deliberate tier, not a gap.
  const COVERED = new Set<string>(REGION_OPTIONS.map((r) => r.code));
  const uncovered = rows.filter(
    (r) => r.region !== "(unset)" && !COVERED.has(r.region),
  );
  console.log("\n" + "─".repeat(60));
  if (attributed === 0) {
    // The uncovered-region check is computed over attributed rows, so with none
    // it is vacuous — it cannot see an uncovered region either. Saying "all
    // clear" here reads as reassurance about coverage when it is really a
    // statement that we know nothing at all, so say the latter.
    console.log(
      "⚠️  No attributed reports — this check is vacuous, NOT a clean bill of health.",
    );
    console.log(
      `   All ${total} row(s) are pre-migration '(unset)'. With zero attributed rows`,
    );
    console.log(
      "   an uncovered region is undetectable, so draw no coverage conclusion from",
    );
    console.log("   this run. Confirm a real submission writes `region` first.");
  } else if (uncovered.length) {
    const n = uncovered.reduce((s, r) => s + r.n, 0);
    console.log(
      `⚠️  ${n} report(s) (${pct(n, attributed)} of attributed) from regions with no pack:`,
    );
    for (const r of uncovered) console.log(`      ${r.region}: ${r.n}`);
    console.log("   Significant volume here is the one argument for authoring a");
    console.log("   new region pack ahead of further detection depth.");
  } else {
    console.log(
      `✅ No reports from uncovered regions — all ${attributed} attributed report(s)`,
    );
    console.log(`   fall inside the ${COVERED.size} packs the engine ships.`);
  }
  console.log();
}

main().catch((err) => {
  console.error("\nregion-demand failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
