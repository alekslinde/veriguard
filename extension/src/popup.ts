// Popup controller: paste or arrive with a selection, get a verdict.
//
// A right-click check has already run in the background by the time this opens
// — that is what the badge and the notification were about — so the popup's
// first job is to collect that result rather than to repeat the check. It falls
// back to checking the stashed text itself when only text arrived, which is the
// state a torn-down worker leaves behind.
//
// The verdict card itself is rendered by `verdictView`, shared with the
// onboarding page.

import { runCheck } from "./check";
import { REGION_OPTIONS, DEFAULT_REGION } from "@veriguard/engine/regions";
import { hasExtensionApi, storageGet, storageSet, setBadge, setActionTitle } from "./browser";
import { getBlocklist } from "./blocklist";
import { renderVerdict, renderError, el, isRenderableCheck } from "./verdictView";
import { ACTION_TITLE_IDLE } from "./copy";

const REGION_KEY = "region";
/** Where the background script leaves text from a right-click check. */
const PENDING_KEY = "pendingSelection";
/** Where the background script leaves a completed right-click result. */
const PENDING_RESULT_KEY = "pendingResult";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLTextAreaElement>("input");
const regionSel = $<HTMLSelectElement>("region");
const checkBtn = $<HTMLButtonElement>("check");
const out = $<HTMLElement>("out");

// ── Behaviour ───────────────────────────────────────────────────────────────

let running = false;

async function check() {
  const content = input.value.trim();
  if (!content || running) return;

  running = true;
  checkBtn.disabled = true;
  try {
    const region = regionSel.value || undefined;
    // Remembering the region is a convenience; failing to remember it must not
    // cost the user the check they asked for.
    if (hasExtensionApi()) await storageSet(REGION_KEY, region).catch(() => {});
    // Returns whatever is cached without waiting on the network — a cold start
    // checks without the list rather than making the user wait for it. Carries
    // its own freshness, so the verdict can say whether the list it used was
    // current rather than merely present.
    const blocklist = await getBlocklist(__API_BASE__);
    const result = await runCheck(content, region, blocklist);
    if (result) renderVerdict(out, result, content, __API_BASE__);
    else renderError(out, "Nothing to check in that — paste a message, link or number.");
  } catch {
    // The engine is local, so a throw here is a defect rather than a network
    // failure. Say something true and unalarming rather than surfacing a stack.
    renderError(out, "Something went wrong checking that. Try again.");
  } finally {
    running = false;
    checkBtn.disabled = false;
  }
}

function populateRegions(selected: string) {
  for (const { code, name } of REGION_OPTIONS) {
    const opt = el("option", undefined, name);
    opt.value = code;
    if (code === selected) opt.selected = true;
    regionSel.append(opt);
  }
}

async function init() {
  let region = DEFAULT_REGION as string;
  let pending: string | null = null;
  let pendingResult: { content: string; check: unknown } | null = null;

  if (hasExtensionApi()) {
    // Storage is a convenience here — a remembered region and a handed-over
    // selection — and neither is worth a popup that fails to open. A rejected
    // or timed-out read falls through to the defaults, so the worst case is a
    // usable popup with an empty box rather than a blank panel.
    try {
      // A stored region that the engine no longer knows would select nothing and
      // silently fall back, so it is validated against the live list rather than
      // trusted. Packs come and go; storage outlives them.
      const stored = await storageGet<string>(REGION_KEY);
      if (stored && REGION_OPTIONS.some((r) => r.code === stored)) region = stored;

      pending = await storageGet<string>(PENDING_KEY);
      pendingResult = await storageGet<{ content: string; check: unknown }>(PENDING_RESULT_KEY);
      // Cleared on read: both are one-shot handoffs, and leaving either in
      // storage means the next popup opens showing something the user did not
      // just ask about.
      if (pending) await storageSet(PENDING_KEY, null);
      if (pendingResult) await storageSet(PENDING_RESULT_KEY, null);
    } catch {
      // Defaults already hold. Nothing to tell the user: they asked for a
      // popup, and they are getting one.
    }

    // The badge said a result was waiting; it is being collected now, so the
    // signal has done its job. Left up, it would still be there tomorrow
    // claiming something about a check the user has already read.
    setBadge("");
    setActionTitle(ACTION_TITLE_IDLE);
  }

  populateRegions(region);

  // Three ways in, in order of how much work each saves.
  if (pendingResult && isRenderableCheck(pendingResult.check)) {
    // The background already checked this. Render what the notification
    // described rather than checking again — a second check could consult a
    // blocklist that refreshed in between and quietly contradict what the user
    // was already told.
    input.value = pendingResult.content;
    renderVerdict(out, pendingResult.check, pendingResult.content, __API_BASE__);
  } else if (pending) {
    // Text but no result: the worker was torn down mid-check, or the stored
    // result was written by a version whose shape this one does not recognise.
    // Re-checking is cheap and local.
    input.value = pending;
    await check();
  } else {
    input.focus();
  }
}

checkBtn.addEventListener("click", () => void check());

// Ctrl/Cmd+Enter checks without reaching for the mouse. Plain Enter inserts a
// newline, because the field is a textarea holding a pasted multi-line message.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void check();
  }
});

// Caught rather than floated. `init` renders a stored result, and a throw
// anywhere in it would otherwise escape with no handler above — leaving a popup
// that is blank, silent and, because the handoff is cleared on read, not
// retryable by reopening. The shape guard above makes the known version of that
// unreachable; this is what covers the one nobody predicted.
void init().catch(() => {
  // The advice has to be actionable, so make sure the panel it points at works.
  // `populateRegions` runs before anything that renders, but a throw from it —
  // or from before it — would leave an empty dropdown behind this message.
  if (!regionSel.options.length) populateRegions(DEFAULT_REGION as string);
  renderError(out, "Something went wrong opening that. Paste it again to check it.");
  input.focus();
});
