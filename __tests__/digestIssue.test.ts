// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Tests for the shared digest-issue publisher.
//
// The thing worth protecting here is the close-on-clean state machine. Three
// weekly checkers publish into a single long-lived issue, and the transitions
// between "something to report" and "clean" are where duplicates and lost
// history come from:
//
//   · a clean run must CLOSE, not open a green issue
//   · a later unclean run must REOPEN the same issue, not open a second one
//   · dependabot-triage opts out of closing entirely and must keep refreshing
//
// Network is never touched: publishDigestIssue takes an injectable ghFetch.

import { describe, it, expect } from "vitest";
// Plain .mjs helper with no type declarations; `allowJs` infers its shape.
import { publishDigestIssue } from "../scripts/lib/digestIssue.mjs";

type Call = { path: string; method: string; body: Record<string, unknown> | null };

/**
 * Fake GitHub. `issue` is the one the search returns (null = none exists yet).
 * Records every call so the assertions can read the resulting state transition.
 */
type SearchItem = { number: number; state: string; pull_request?: object };

function fakeGh(issue: SearchItem | SearchItem[] | null) {
  const calls: Call[] = [];
  const results = issue === null ? [] : Array.isArray(issue) ? issue : [issue];
  const ghFetch = async (path: string, _token: string, init: RequestInit = {}) => {
    calls.push({
      path,
      method: (init.method as string) ?? "GET",
      body: init.body ? JSON.parse(init.body as string) : null,
    });
    if (path.includes("/issues?")) return results;
    if (path.endsWith("/labels")) return { name: "x" };
    if (path.endsWith("/issues")) return { number: 999 };
    return null;
  };
  return { ghFetch, calls };
}

const base = {
  repo: "o/r",
  token: "t",
  label: "source-check",
  title: "🔗 Digest",
  body: "current body",
};

describe("publishDigestIssue — something to report", () => {
  it("creates the issue when none exists", async () => {
    const { ghFetch, calls } = fakeGh(null);
    const res = await publishDigestIssue({ ...base, clean: false, extraLabels: ["threat-intel"] }, { ghFetch });

    expect(res).toEqual({ number: 999, action: "created" });
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/issues"));
    expect(post).toBeDefined();
    expect(post?.body).toMatchObject({ title: "🔗 Digest", labels: ["source-check", "threat-intel"] });
  });

  it("refreshes in place when one is already open", async () => {
    const { ghFetch, calls } = fakeGh({ number: 42, state: "open" });
    const res = await publishDigestIssue({ ...base, clean: false }, { ghFetch });

    expect(res).toEqual({ number: 42, action: "updated" });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ body: "current body" });
    // An already-open issue must not be sent a redundant state change.
    expect(patch?.body).not.toHaveProperty("state");
    // The label POST is idempotent bookkeeping; no issue-level write.
    expect(calls.some((c) => c.method === "POST" && !c.path.endsWith("/labels"))).toBe(false);
  });

  it("reopens the SAME issue after a previous clean run closed it", async () => {
    const { ghFetch, calls } = fakeGh({ number: 42, state: "closed" });
    const res = await publishDigestIssue({ ...base, clean: false }, { ghFetch });

    // The regression this guards: opening a second issue every time the
    // checker flips from clean back to unclean.
    expect(res).toEqual({ number: 42, action: "reopened" });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ body: "current body", state: "open" });
    expect(calls.some((c) => c.path.endsWith("/issues") && c.method === "POST")).toBe(false);
  });
});

describe("publishDigestIssue — clean run", () => {
  it("closes an open issue and comments why", async () => {
    const { ghFetch, calls } = fakeGh({ number: 42, state: "open" });
    const res = await publishDigestIssue({ ...base, clean: true, closeComment: "all good" }, { ghFetch });

    expect(res).toEqual({ number: 42, action: "closed" });
    // Body is refreshed as part of closing, so the final state of the thread
    // shows why it closed rather than a stale list of fixed problems.
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      body: "current body",
      state: "closed",
      state_reason: "completed",
    });
    expect(calls.find((c) => c.path.endsWith("/comments"))?.body).toEqual({ body: "all good" });
  });

  it("is a no-op when the issue is already closed", async () => {
    const { ghFetch, calls } = fakeGh({ number: 42, state: "closed" });
    const res = await publishDigestIssue({ ...base, clean: true }, { ghFetch });

    // Without this, every clean week would post another closing comment.
    expect(res).toEqual({ number: 42, action: "already-closed" });
    expect(calls.every((c) => c.method === "GET" || c.path.endsWith("/labels"))).toBe(true);
  });

  it("does not create an issue just to close it", async () => {
    const { ghFetch, calls } = fakeGh(null);
    const res = await publishDigestIssue({ ...base, clean: true }, { ghFetch });

    expect(res).toEqual({ number: null, action: "skipped-clean" });
    expect(calls.every((c) => c.method === "GET" || c.path.endsWith("/labels"))).toBe(true);
  });
});

describe("publishDigestIssue — closeOnClean: false (dependabot-triage)", () => {
  it("refreshes rather than closing, even on a clean run", async () => {
    const { ghFetch, calls } = fakeGh({ number: 7, state: "open" });
    const res = await publishDigestIssue({ ...base, clean: true, closeOnClean: false }, { ghFetch });

    expect(res).toEqual({ number: 7, action: "updated" });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ body: "current body" });
    expect(calls.some((c) => c.path.endsWith("/comments"))).toBe(false);
  });

  it("does not reopen an issue a maintainer closed to silence it", async () => {
    // deps-triage's footer invites "close to silence", and before the shared
    // helper the state=open lookup honoured that by never finding a closed
    // issue at all. state=all finds it, so the reopen must be gated on
    // closeOnClean or every weekly run would undo the maintainer's close.
    const { ghFetch, calls } = fakeGh({ number: 7, state: "closed" });
    const res = await publishDigestIssue({ ...base, clean: false, closeOnClean: false }, { ghFetch });

    expect(res).toEqual({ number: 7, action: "updated-while-closed" });
    // Body still refreshed, but no state change smuggled into the PATCH.
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ body: "current body" });
  });
});

describe("publishDigestIssue — issue lookup", () => {
  it("ignores labelled pull requests", async () => {
    // GET /issues returns PRs too. These workflows also run on PRs touching
    // their data files, so a PR carrying the digest label is plausible — and
    // being newest, it would sort first. Writing the digest over a PR body (or
    // closing the PR on a clean run) is the regression this pins.
    const { ghFetch } = fakeGh([
      { number: 500, state: "open", pull_request: { url: "https://example/pr" } },
      { number: 42, state: "open" },
    ]);
    const res = await publishDigestIssue({ ...base, clean: false }, { ghFetch });
    expect(res).toEqual({ number: 42, action: "updated" });
  });

  it("creates a fresh issue when every labelled item is a pull request", async () => {
    const { ghFetch } = fakeGh([{ number: 500, state: "open", pull_request: {} }]);
    const res = await publishDigestIssue({ ...base, clean: false }, { ghFetch });
    expect(res).toEqual({ number: 999, action: "created" });
  });

  it("ensures the label before looking up, not only when creating", async () => {
    // The label is the issue's identity. If it is deleted the lookup misses and
    // the thread is orphaned, so it is recreated on every path.
    const { ghFetch, calls } = fakeGh({ number: 42, state: "open" });
    await publishDigestIssue({ ...base, clean: false }, { ghFetch });

    const labelCall = calls.findIndex((c) => c.path.endsWith("/labels"));
    const lookup = calls.findIndex((c) => c.path.includes("/issues?"));
    expect(labelCall).toBeGreaterThanOrEqual(0);
    expect(labelCall).toBeLessThan(lookup);
  });

  it("searches closed issues too, so close-on-clean can find its issue", async () => {
    const { ghFetch, calls } = fakeGh({ number: 42, state: "open" });
    await publishDigestIssue({ ...base, clean: false }, { ghFetch });

    // state=all is load-bearing: a state=open search would miss the issue a
    // clean run closed and open a duplicate on the next regression.
    const search = calls.find((c) => c.path.includes("/issues?"));
    expect(search?.path).toContain("state=all");
    expect(search?.path).toContain("labels=source-check");
  });
});
