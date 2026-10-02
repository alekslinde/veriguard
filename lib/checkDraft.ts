// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Carrying the checked message across a browser Back.
//
// Next 16.3's App Router serves a same-document `pushState` entry by fully
// reloading the document when the user goes Back to it. That is not something
// this app does to itself: it reproduces in a twenty-line page with a plain
// pushState and no other code, in both `next dev` and a production build. The
// reload replaces the window, so no amount of React state, refs, or careful
// reconciliation survives it.
//
// The check flow uses history for a *view* transition rather than a navigation,
// and it relies on going back: "Edit & check again" calls history.back() so the
// in-app control and the browser's own button behave identically. With the tree
// torn down, both returned an empty textarea — the reader was sent back to
// amend what they had checked and handed a blank box instead.
//
// So the message is written down before the transition and read back when the
// flow mounts. The storage is doing one job: surviving one reload.
//
// On lifetime, deliberately: this is a scam message someone has pasted and it
// may quote their name, their address, or an amount they were about to pay.
//   · sessionStorage, never localStorage — it dies with the tab and is never
//     shared with another one.
//   · deleted as soon as it has been restored, so it is gone the moment it has
//     done its job — see readCheckDraft/clearCheckDraft for why those are two
//     steps rather than one.
//   · never sent anywhere. Nothing in this module touches the network.
// It is not a convenience store for drafts, and it should not grow into one.

// No legacy fallback, unlike the vg_* preference keys: this is transient
// sessionStorage state that lives for one Back navigation, so an orphaned
// jcm:check-draft entry dies with the tab it was written in.
const KEY = "vg:check-draft";

/**
 * Every access is wrapped: storage throws outright in Safari's private mode and
 * wherever site data is blocked, and a failure to stash a draft must never take
 * the check down with it. Losing the draft degrades to today's behaviour.
 */
function withStorage<T>(fn: (s: Storage) => T, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    return fn(window.sessionStorage);
  } catch {
    return fallback;
  }
}

/** Remember what a check was run against, so Back can restore the box. */
export function saveCheckDraft(content: string): void {
  withStorage((s) => {
    // An empty draft is the same as no draft, and writing one would only leave
    // a key behind for something else to read.
    if (content.trim()) s.setItem(KEY, content);
    else s.removeItem(KEY);
  }, undefined);
}

/**
 * Read the stored message without consuming it.
 *
 * Split from the clearing deliberately: a read that also deleted would make
 * this unrepeatable, and it is called from places that must be able to run more
 * than once — React re-runs render work during hydration and under Strict Mode.
 * Clearing is a separate, explicit step.
 */
export function readCheckDraft(): string {
  return withStorage((s) => s.getItem(KEY) ?? "", "");
}

/**
 * Drop the stored message once it has been restored.
 *
 * Called from an effect, which runs after the render has been committed and
 * exactly once for a given mount, so it is safe to destroy state here.
 */
export function clearCheckDraft(): void {
  withStorage((s) => s.removeItem(KEY), undefined);
}
