// Background: the right-click entry point.
//
// Does as little as possible. It registers one context-menu item, and on click
// stashes the selected text where the popup will find it. The check itself runs
// in the popup, not here, for two reasons: the result needs somewhere to be
// displayed, and an event page can be torn down mid-await.
//
// It deliberately does NOT open the popup programmatically. `action.openPopup()`
// is unavailable or gesture-restricted depending on browser and version, and a
// call that silently fails would leave the user with a menu item that appears to
// do nothing. Instead the selection is stashed, and the next popup open picks it
// up and checks it immediately. One extra click, and it behaves the same
// everywhere.
//
// The cost of that trade is real and worth naming: after right-clicking, nothing
// visible happens until the user opens the popup. Badging the toolbar icon would
// close that gap and needs the `action` permission surface to differ per browser,
// so it is left for the follow-up that adds the icons.

import { createContextMenu, onContextMenuClicked, storageSet } from "./browser";

const MENU_ID = "veriguard-check-selection";
const PENDING_KEY = "pendingSelection";

/**
 * Upper bound on stashed selection text.
 *
 * The same reasoning as the API route's own limit, for the same reason: analysis
 * is superlinear in input length, and a user can select an entire page. Truncating
 * rather than rejecting is right here — unlike the server, this is a selection the
 * user made by dragging, so the plausible cause is an over-broad drag rather than
 * an attack, and the popup shows the text so what was kept is visible.
 */
const MAX_SELECTION = 20_000;

createContextMenu(MENU_ID, "Check this with Veriguard");

onContextMenuClicked((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText ?? "").slice(0, MAX_SELECTION);
  if (!text.trim()) return;
  // Floated rather than awaited: an event page may be suspended before a
  // returned promise settles, and there is nothing useful to do with a failure
  // beyond not crashing the worker.
  void storageSet(PENDING_KEY, text).catch(() => {});
});
