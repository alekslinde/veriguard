"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/formatters";
import { useLang } from "@/lib/lang";

interface Stats {
  checks: number;
  reports: number;
}

/**
 * `initial` is the same data /api/stats returns, resolved during the server
 * render that was happening anyway.
 *
 * The homepage is `force-dynamic` (region comes from request headers), so it
 * already runs a function per visit. Fetching the counters there and passing
 * them down turns two invocations per visit into one — which matters on a free
 * tier where invocations, not correctness, are the binding limit.
 *
 * **Required, not optional.** An optional prop would let a future caller render
 * `<StatsBar />`, type-check cleanly, silently fall back to the client fetch and
 * lose the saving with nothing failing. Making it required means every call site
 * has to decide, and the compiler names any that has not.
 *
 * `null` is the explicit "the server tried and could not" value, and it is
 * distinct from "the server never tried" — which is now unrepresentable.
 *
 * **The label says "on this site", and that qualifier is load-bearing.** These
 * counters come from `/api/check` and the inbound mail path, which are the only
 * two places a check is reported to us. The WebExtension scores on the user's
 * own device and never calls the API, so none of its checks are in this number
 * and none ever can be — the alternative would be the extension phoning home
 * about the thing it promises never to send. Shortening this to "scams checked"
 * would make it a claim about the whole product while measuring one part of it,
 * and the gap grows with every install. See lib/extensionInstalls.ts, which
 * carries the reach figures that this counter deliberately excludes.
 */
export default function StatsBar({ initial }: { initial: Stats | null }) {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(initial);

  // Refresh after a check, so the counter the user just moved actually moves.
  //
  // This component never unmounts during the check flow — the flow is
  // client-side and the hero stays mounted — so seeding state from `initial`
  // and stopping there froze the number for the session. /api/check increments
  // `checks`, so the one person guaranteed to notice a stale counter is the one
  // who just changed it.
  //
  // Deliberately event-driven rather than polled: an interval would reintroduce
  // per-visitor invocations on a timer, which is the cost this component exists
  // to avoid. One refresh per check is bounded by what the user actually does.
  useEffect(() => {
    const refresh = () => {
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    };

    // Not fetched on mount when the server supplied the numbers — that is the
    // whole saving. The failure case is deliberately NOT retried here either:
    // /api/stats calls the same getStats() against the same database, so a
    // render that failed server-side would fail again, spending a second
    // invocation during exactly the outage worth spending least in. An empty
    // bar is the honest outcome, and the page is unaffected.
    if (!initial) return;

    window.addEventListener("veriguard:check-complete", refresh);
    return () => window.removeEventListener("veriguard:check-complete", refresh);
  }, [initial]);

  const empty = !stats || (stats.checks === 0 && stats.reports === 0);

  // The container always renders at full height so the hero doesn't shift
  // when the numbers arrive (or never do).
  return (
    <div className="flex items-center gap-6 text-sm text-[var(--text-dim)] pb-1 min-h-[1.75rem]">
      {!empty && (
        <>
          <span>
            <span className="text-emerald-400 font-bold">{fmt(stats.checks)}</span>
            {" "}{t(stats.checks === 1 ? "stats.checked.one" : "stats.checked.many")}
          </span>
          <span className="text-gray-600" aria-hidden="true">·</span>
          <span>
            <span className="text-emerald-400 font-bold">{fmt(stats.reports)}</span>
            {" "}{t(stats.reports === 1 ? "stats.reported.one" : "stats.reported.many")}
          </span>
        </>
      )}
    </div>
  );
}
