// The first-run page's behaviour: tick off the steps, then dismiss the tab.
//
// Small on purpose. The page is three columns of prose and three diagrams; the
// only moving parts are the checkboxes and the button that closes the tab.
//
// **Nothing here is persisted, and that is a decision rather than an omission.**
// A tick is a reading aid for one sitting — it marks where someone got to while
// they detoured into browser chrome to actually do the step. Writing it to
// storage would mean the extension keeps a record of how far through the
// instructions a user read, which is behavioural data this product has no use
// for and no business holding. The page is shown once; if it is reopened, an
// unticked list is the right starting state anyway.

import { hasExtensionApi } from "./browser";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const gotIt = $<HTMLButtonElement>("ob-got-it");
const closeNote = $<HTMLParagraphElement>("ob-close-note");
const siteLink = $<HTMLAnchorElement>("ob-site");

/**
 * Close the tab, or say so when the browser will not.
 *
 * `window.close()` is only honoured for a tab that script opened. This one was
 * opened by `tabs.create` on install, so it normally is — but "normally" is not
 * a guarantee: a user who bookmarked the page, reopened it from history, or
 * restored it with the session gets a tab the browser considers theirs, and the
 * call is then ignored with no error to catch.
 *
 * So the failure is handled by observing that nothing happened rather than by
 * trusting a return value. If the page is still here a moment later, it says
 * what to do instead — which is better than a button that silently does
 * nothing, the exact failure the context menu was built to avoid.
 */
function dismiss(): void {
  // The button shows the confirmation and disables itself immediately —
  // clicking it is what the user is confirming, not the tab actually going
  // away a moment later.
  gotIt.classList.add("is-done");
  gotIt.disabled = true;

  // The close itself is deliberately delayed: when the tab is one the browser
  // lets script close, doing that on the same tick as the class change means
  // the tab is gone before the checkmark ever paints. A brief pause lets the
  // confirmation actually be seen.
  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      // Some runtimes throw rather than ignoring it. Handled the same way.
    }

    // Still here? Then the close was refused. Tell the user rather than
    // leaving them looking at a button that did nothing.
    window.setTimeout(() => {
      closeNote.hidden = false;
      closeNote.focus?.();
    }, 250);
  }, 500);
}

gotIt.addEventListener("click", dismiss);

// Built at runtime from the same constant the manifest's `connect-src` names,
// so the page cannot link somewhere the extension is not allowed to reach. The
// href is set here rather than written into the HTML because the origin is a
// build-time value.
//
// Guarded because the constant is injected by the build: a page opened outside
// a built bundle should still render rather than throwing on an undefined
// global before the checkboxes work.
if (hasExtensionApi() || typeof __API_BASE__ === "string") {
  siteLink.href = __API_BASE__;
}
