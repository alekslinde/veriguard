// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared "one long-lived digest issue" plumbing for the weekly checkers.
//
// Three scripts publish a maintenance digest to a single labelled issue rather
// than opening a new one per run (52 issues a year reads as noise):
//
//   · check-sources.mjs             → 🔗 Threat-intel source check
//   · check-promotion-freshness.ts  → 📡 Radar / calendar promotion freshness
//   · dependabot-triage.mjs         → 🔒 Dependabot alert triage
//
// They had drifted into three near-identical copies of the same upsert. This is
// that logic, once.
//
// ── Close-on-clean ───────────────────────────────────────────────────────────
//
// A digest issue that stays open forever stops meaning "something needs doing",
// and an issue list you have learned to ignore is worse than no issue list. So
// callers pass `clean`, and a clean run closes the issue with a short comment
// instead of refreshing it with a green body. The next unclean run reopens the
// SAME issue, so one thread carries the whole history.
//
// The check's own liveness — previously the argument for keeping the issue open
// — is better served by the workflow run and its job summary, which every one of
// these callers already writes to unconditionally.
//
// Callers pass `clean` explicitly rather than having it inferred from the body:
// "nothing to report" is a judgement each checker makes differently, and
// dependabot-triage deliberately never closes (see its call site).

const GH_API = "https://api.github.com";

/**
 * Minimal GitHub REST wrapper. Throws on non-2xx with the status in the
 * message, which callers pattern-match (e.g. dependabot-triage's 401/403
 * access-denied detection), so keep the `-> <status>` shape.
 */
export async function ghFetch(path, token, init = {}, userAgent = "veriguard-digest") {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": userAgent,
      // Unconditional, matching what check-sources and promotion-freshness sent
      // before this was shared. Every caller posts a JSON string body; sending
      // the header on a bodyless GET is harmless, whereas omitting it on a write
      // is not, so the stricter of the two prior behaviours wins.
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Create the digest's label if it does not exist yet.
 *
 * Creating an issue with a label that does not exist fails the request outright,
 * so without this the digest could never be published on a fresh repo.
 * Idempotent: a 422 means it already exists.
 */
export async function ensureLabel(repo, token, name, color, description, deps = {}) {
  const fetchFn = deps.ghFetch ?? ghFetch;
  try {
    await fetchFn(`/repos/${repo}/labels`, token, {
      method: "POST",
      body: JSON.stringify({ name, color, description }),
    });
  } catch (err) {
    if (!/->\s*422\b/.test(String(err?.message ?? ""))) throw err;
  }
}

/**
 * Find this digest's issue, open or closed.
 *
 * Searching `state=all` is load-bearing for close-on-clean: once a clean run has
 * closed the issue, an `state=open` search would find nothing and the next
 * unclean run would open a duplicate — a fresh issue every time the checker
 * flipped state. Sorted newest-first so that if duplicates already exist from
 * before this change, we converge on the most recent one.
 *
 * `GET /issues` also returns pull requests — GitHub models a PR as an issue, and
 * the endpoint does not filter them out. A PR carrying the digest's label (these
 * workflows also run on PRs touching their data files, so the label is plausible
 * there) would otherwise be picked up as `existing`, and the digest would be
 * PATCHed over the PR body — or, on a clean run, the PR closed with a "nothing
 * to report" comment. Items with a `pull_request` key are dropped, and enough
 * are fetched that a run of labelled PRs cannot hide the real issue behind them.
 */
async function findDigestIssue(repo, token, label, deps = {}) {
  const fetchFn = deps.ghFetch ?? ghFetch;
  const found = await fetchFn(
    `/repos/${repo}/issues?state=all&labels=${encodeURIComponent(label)}&sort=created&direction=desc&per_page=30`,
    token,
  );
  if (!Array.isArray(found)) return null;
  return found.find((item) => item && !item.pull_request) ?? null;
}

/**
 * Publish a digest to its single long-lived issue.
 *
 * @param {object}  opts
 * @param {string}  opts.repo        "owner/name"
 * @param {string}  opts.token       GitHub token with issues: write
 * @param {string}  opts.label       Digest's own label; identifies its issue
 * @param {string}  opts.title       Issue title, used only on first creation
 * @param {string}  opts.body        Rendered digest markdown
 * @param {boolean} opts.clean       True when the run found nothing to act on
 * @param {string[]} [opts.extraLabels]  Applied alongside `label` at creation
 * @param {string}  [opts.labelColor]
 * @param {string}  [opts.labelDescription]
 * @param {string}  [opts.closeComment]  Posted when a clean run closes the issue
 * @param {boolean} [opts.closeOnClean=true]  False keeps the issue open always
 * @returns {Promise<{number: number|null, action: string}>}
 *
 * `action` is one of: "created", "updated", "reopened", "closed",
 * "already-closed", "skipped-clean" (clean, and no issue has ever existed —
 * nothing to close, and opening one just to close it would be noise), or
 * "updated-while-closed" (a closeOnClean:false digest refreshed the body of an
 * issue a maintainer had closed, leaving it closed).
 */
export async function publishDigestIssue(opts, deps = {}) {
  const {
    repo,
    token,
    label,
    title,
    body,
    clean,
    extraLabels = [],
    labelColor = "1d76db",
    labelDescription = "",
    closeComment = "Resolved — this check is clean as of the latest run. Reopened automatically if it regresses.",
    closeOnClean = true,
  } = opts;

  const fetchFn = deps.ghFetch ?? ghFetch;
  const ensure = deps.ensureLabel ?? ensureLabel;

  // Ensure the label before looking anything up, not just on the create path.
  // The label IS the identity of the digest's issue: if it is deleted while the
  // issue lives on, GitHub also strips it from that issue, the lookup misses,
  // and a duplicate is opened — orphaning the thread's history. Recreating it
  // first cannot restore the association, but it does mean the label exists for
  // the issue that gets opened, so the split happens at most once rather than
  // every run. Idempotent, so this costs one 422 on the normal path.
  await ensure(repo, token, label, labelColor, labelDescription, deps);

  const existing = await findDigestIssue(repo, token, label, deps);

  // ── Clean run ──────────────────────────────────────────────────────────────
  if (clean && closeOnClean) {
    if (!existing) return { number: null, action: "skipped-clean" };
    if (existing.state === "closed") return { number: existing.number, action: "already-closed" };

    // Refresh the body before closing so the thread's final state shows WHY it
    // closed, not the stale list of problems that have since been fixed.
    await fetchFn(`/repos/${repo}/issues/${existing.number}`, token, {
      method: "PATCH",
      body: JSON.stringify({ body, state: "closed", state_reason: "completed" }),
    });
    await fetchFn(`/repos/${repo}/issues/${existing.number}/comments`, token, {
      method: "POST",
      body: JSON.stringify({ body: closeComment }),
    });
    return { number: existing.number, action: "closed" };
  }

  // ── Something to report ────────────────────────────────────────────────────
  if (existing) {
    // Reopen only when this digest also closes itself. For a closeOnClean:false
    // digest, a closed issue can only have been closed by a person — that is the
    // documented way to silence deps-triage ("edit labels/close to silence") —
    // and reopening it would override that. Such a digest never touches issue
    // state in either direction; it only refreshes the body, exactly as it did
    // when the pre-shared lookup searched state=open and simply never found a
    // closed issue.
    const needsReopen = existing.state === "closed" && closeOnClean;
    await fetchFn(`/repos/${repo}/issues/${existing.number}`, token, {
      method: "PATCH",
      body: JSON.stringify(needsReopen ? { body, state: "open" } : { body }),
    });
    if (existing.state === "closed" && !closeOnClean) {
      return { number: existing.number, action: "updated-while-closed" };
    }
    return { number: existing.number, action: needsReopen ? "reopened" : "updated" };
  }

  const created = await fetchFn(`/repos/${repo}/issues`, token, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [label, ...extraLabels] }),
  });
  return { number: created.number, action: "created" };
}
