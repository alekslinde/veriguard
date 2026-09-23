// Background: the right-click entry point, and where a right-click check runs.
//
// **The check moved here, and that is the substantive change over stashing the
// selection for the popup.** A badge and a notification have to appear before
// the popup is opened — that is their whole purpose — so the verdict has to
// exist before then. Running it here and storing the result means one check per
// click; leaving it in the popup would mean either no signal until the popup
// opened, or checking twice.
//
// What that costs, and why it is acceptable: an MV3 event page can be torn down
// mid-await. The engine is local and synchronous-ish, so the window is small,
// and a teardown loses a result the user can recover by opening the popup and
// pressing Check — the input is stashed before the check starts, precisely so a
// lost check leaves the text behind rather than nothing. The blocklist fetch is
// the one genuinely async step, and it already resolves from cache without
// waiting on the network.
//
// It deliberately does NOT open the popup programmatically. `action.openPopup()`
// is unavailable or gesture-restricted depending on browser and version, and a
// call that silently fails would leave the user with a menu item that appears to
// do nothing. The badge, the tooltip and the notification are what close that
// gap instead — three signals, because each can be absent: a badge needs a
// pinned (or at least visible) toolbar button, a tooltip needs a deliberate
// hover, and a notification can be switched off at the OS level.

import {
  createContextMenu,
  onContextMenuClicked,
  storageSet,
  storageGet,
  setBadge,
  setActionTitle,
  notify,
  clearNotification,
  onNotificationClicked,
  onInstalled,
  extensionUrl,
  openTab,
} from "./browser";
import { runCheck } from "./check";
import { getBlocklist } from "./blocklist";
import { BADGE, ACTION_TITLE, NOTIFY, NOTIFY_NOTHING } from "./copy";

const MENU_ID = "veriguard-check-selection";
const PENDING_KEY = "pendingSelection";
/** Where a completed right-click check waits for the popup to collect it. */
const PENDING_RESULT_KEY = "pendingResult";
const REGION_KEY = "region";
/** One id, reused: a second check should replace the first box, not stack one. */
const NOTIFICATION_ID = "veriguard-result";
const ONBOARDING_PAGE = "onboarding.html";

/**
 * Upper bound on stashed selection text.
 *
 * The same reasoning as the API route's own limit, for the same reason: analysis
 * is superlinear in input length, and a user can select an entire page. Truncating
 * rather than rejecting is right here — unlike the server, this is a selection the
 * user made by dragging, so the plausible cause is an over-broad drag rather than
 * an attack, and the popup shows the text so what was kept is visible.
 *
 * **What the cap actually bounds is token length, not input length, and the two
 * come apart badly.** Measured 2026-09-20: 20,000 characters of ordinary prose
 * check in about 9ms, while 20,000 characters with no whitespace in them take
 * around 6.7 seconds — the cost is quadratic in the longest unbroken run, not
 * in the total. A page containing a long base64 blob or a minified script is
 * enough to produce one by selecting it.
 *
 * That matters more here than it did when the check ran in the popup: an event
 * page can be torn down mid-await, so a pathological selection is one that can
 * finish with no badge, no notification and no stored result. The stash above
 * is what makes that recoverable — the popup opens with the text still in the
 * box and can re-run it — but a shorter cap, or a token-length guard in the
 * engine, would be the real fix.
 */
const MAX_SELECTION = 20_000;

/**
 * The shape handed to the popup.
 *
 * The whole `ExtensionCheck` is stored rather than re-derived, so the popup
 * renders the result the notification already described. Two checks of the same
 * text would almost always agree, but "almost always" is not a property worth
 * having when the blocklist can refresh between them and change a verdict the
 * user was already told.
 */
export interface PendingResult {
  content: string;
  /** Structurally an ExtensionCheck; stored and read back through JSON. */
  check: unknown;
}

// The listener goes first, and the ordering is load-bearing rather than
// stylistic. A background worker is revived and re-evaluated repeatedly across
// its life, so everything at this level runs many times; registering the
// listener before anything that can fail means a menu item can never exist
// without something listening to it. `createContextMenu` also completes
// asynchronously on the runtime that returns a promise, so a listener
// registered after it would be registered after the item is already clickable.
onContextMenuClicked((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText ?? "").slice(0, MAX_SELECTION);
  if (!text.trim()) return;
  // Floated rather than awaited: the listener signature is synchronous on both
  // runtimes, and there is nothing useful to do with a failure beyond not
  // crashing the worker.
  void handleSelection(text).catch(() => {});
});

/**
 * Check a selection, then tell the user about it three ways.
 *
 * Order matters here. The text is stashed *first*, so that a worker teardown
 * part-way through leaves the popup able to re-run the check rather than
 * opening empty. The result is stored *before* the notification, so that a user
 * who acts on the notification immediately finds the result already waiting.
 */
async function handleSelection(text: string): Promise<void> {
  await storageSet(PENDING_KEY, text).catch(() => {});

  // A previous result is now stale — clear it before the check rather than
  // after, so a teardown cannot leave the popup showing an older verdict
  // alongside newer text.
  await storageSet(PENDING_RESULT_KEY, null).catch(() => {});

  // The stored region is passed to the engine unvalidated, which the popup
  // does not do — there an unknown code would select nothing in a dropdown, so
  // it is checked against the live list first. Here the engine already falls
  // back on a code it does not know, so the check would only duplicate one.
  let region: string | undefined;
  try {
    region = (await storageGet<string>(REGION_KEY)) ?? undefined;
  } catch {
    // Engine default applies. A missing region costs coverage, not a check.
  }

  let check;
  try {
    const blocklist = await getBlocklist(__API_BASE__);
    check = await runCheck(text, region, blocklist);
  } catch {
    // The engine is local, so a throw is a defect rather than a network
    // failure. Leave the stashed text in place: the popup will re-check it and
    // surface its own error if the defect is reproducible.
    return;
  }

  if (!check) {
    // Nothing checkable in the selection — no link, number or scorable text.
    // Say so rather than badging a verdict that does not exist, and clear the
    // stashed text so the popup does not open onto a box it cannot check.
    await storageSet(PENDING_KEY, null).catch(() => {});
    setBadge("");
    await notify(NOTIFICATION_ID, {
      ...NOTIFY_NOTHING,
      iconUrl: extensionUrl("icons/icon-128.png"),
    });
    return;
  }

  const result: PendingResult = { content: text, check };
  await storageSet(PENDING_RESULT_KEY, result).catch(() => {});

  const badge = BADGE[check.verdict];
  setBadge(badge.text, badge.color);
  setActionTitle(ACTION_TITLE[check.verdict]);

  await notify(NOTIFICATION_ID, {
    ...NOTIFY[check.verdict],
    iconUrl: extensionUrl("icons/icon-128.png"),
  });
}

// Clicking the notification dismisses it. It cannot open the popup — no runtime
// allows that from a notification click — so the honest behaviour is to get out
// of the way rather than to open something the user did not ask for.
onNotificationClicked((id) => {
  if (id === NOTIFICATION_ID) clearNotification(id);
});

/**
 * First run: open the page that explains where results appear.
 *
 * Only on `install`. Firing on `update` too would open a tab on every patch
 * release, which is the behaviour stores treat as a dark pattern and users
 * treat as a reason to uninstall — and the thing this page teaches does not
 * change between versions.
 *
 * The page is packaged, not remote. A tab pointed at our site on install would
 * be a request to our server carrying an IP and an install time, from an
 * extension whose listing says it sends nothing.
 */
onInstalled((reason) => {
  if (reason !== "install") return;
  openTab(extensionUrl(ONBOARDING_PAGE));
});

// Idempotent — see createContextMenu. A re-evaluated worker must not stack a
// duplicate id, which on one runtime throws and on the other logs.
createContextMenu(MENU_ID, "Check this with Veriguard");
