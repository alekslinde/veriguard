// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

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
 * **Both labels carry a "here" qualifier, and it is load-bearing on each.**
 * These counters come from `/api/check` and the inbound mail path, which are
 * the only two places a check is reported to us. The WebExtension scores on the
 * user's own device and never calls the API, so none of its checks are in this
 * number and none ever can be — the alternative would be the extension phoning
 * home about the thing it promises never to send. Shortening either to "checks
 * run" or "scams reported" makes it a claim about the whole product while
 * measuring one part of it, and the gap grows with every install. See
 * lib/extensionInstalls.ts, which carries the reach figures these counters
 * deliberately exclude.
 *
 * This is worth restating because it has already been lost once: a copy pass
 * trimmed both labels to their unqualified form, which reads better and is not
 * true. Brevity is not a reason to widen a measured claim.
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

  // Renders inline, as the tail of the subtitle sentence rather than a row of
  // its own.
  //
  // It was a separate 28px bar under the hero, which on a phone wrapped to two
  // lines and stranded its own separator dot ("411 scams checked on this / site
  // · 14 reports / submitted"). Two counters are a clause, not a section: they
  // qualify the claim the subtitle just made, and reading as part of that
  // sentence is both shorter and truer to what they are.
  //
  // A fragment, so nothing renders at all when there is nothing to say — the
  // old wrapper reserved its height unconditionally to stop the hero shifting,
  // and inline there is no shift to prevent: the subtitle occupies the line
  // whether or not this follows it.
  if (empty) return null;

  return (
    <>
      {" "}
      <span className="text-[var(--foreground)]">
        <span className="font-semibold">{fmt(stats.checks)}</span>{" "}
        {t(stats.checks === 1 ? "stats.checked.one" : "stats.checked.many")}
        {", "}
        <span className="font-semibold">{fmt(stats.reports)}</span>{" "}
        {t(stats.reports === 1 ? "stats.reported.one" : "stats.reported.many")}.
      </span>
    </>
  );
}
