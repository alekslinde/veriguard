// One promise-based handle on the extension APIs, for both browsers.
//
// Firefox exposes `browser.*` returning promises; Chrome exposes `chrome.*`
// whose older methods take callbacks. Chrome's MV3 build does return promises
// from most methods now, but "most" is the problem — the set differs by method
// and by Chrome version, and code that awaits the wrong one gets `undefined`
// rather than an error.
//
// So: use `browser` where it exists, fall back to `chrome`, and promisify the
// two storage calls explicitly rather than trusting either runtime's shape.
// This is the whole compatibility layer; everything else in the extension is
// written against it and never touches a global directly.

/**
 * Minimal structural types for the surface actually used.
 *
 * Hand-written rather than pulled from `@types/chrome` or `webextension-polyfill`
 * — two type packages and a runtime shim to call four methods, in a bundle whose
 * reviewability is a feature. AMO reads this source.
 */
interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  get(keys: string | string[] | null, cb: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>): Promise<void>;
  set(items: Record<string, unknown>, cb: () => void): void;
}

interface ContextMenus {
  create(props: { id: string; title: string; contexts: string[] }, cb?: () => void): void;
  removeAll(cb?: () => void): unknown;
  onClicked: { addListener(cb: (info: { menuItemId: string; selectionText?: string }) => void): void };
}

interface Runtime {
  lastError?: { message?: string };
  openOptionsPage?: () => void;
  getURL?: (path: string) => string;
  onInstalled?: { addListener(cb: (details: { reason: string }) => void): void };
}

interface Tabs {
  create(props: { url: string }): unknown;
}

/**
 * The toolbar button.
 *
 * `action` on MV3 everywhere, but every method is optional here because Safari
 * and Firefox for Android each omit parts of it, and a badge is a nicety — the
 * popup still shows the result without one, so nothing may throw for its sake.
 */
interface Action {
  openPopup?: () => Promise<void>;
  setBadgeText?: (details: { text: string }) => unknown;
  setBadgeBackgroundColor?: (details: { color: string }) => unknown;
  setTitle?: (details: { title: string }) => unknown;
}

/**
 * OS notifications.
 *
 * Optional throughout: the `notifications` permission is declared, but Firefox
 * for Android does not implement the API, and on every desktop platform the
 * user can switch notifications off at the OS level — in which case `create`
 * fails rather than being absent. Both are the same thing to a caller, and
 * neither is worth an error.
 */
interface Notifications {
  create(
    id: string,
    options: {
      type: string;
      iconUrl: string;
      title: string;
      message: string;
      priority?: number;
    },
    cb?: (id: string) => void,
  ): unknown;
  onClicked?: { addListener(cb: (id: string) => void): void };
  clear?: (id: string, cb?: (wasCleared: boolean) => void) => unknown;
}

interface ExtensionApi {
  storage: { local: StorageArea };
  /**
   * Optional because Firefox for Android does not implement `menus` at all —
   * the type says so, so that a new call site has to decide what to do about it
   * rather than inheriting a crash on a runtime the author never had in mind.
   */
  contextMenus?: ContextMenus;
  runtime: Runtime;
  tabs?: Tabs;
  action?: Action;
  notifications?: Notifications;
}

/**
 * The live API object.
 *
 * Resolved lazily rather than at module load: the popup's tests import this
 * module in a plain Node environment where neither global exists, and a
 * top-level throw there would make the module unimportable.
 */
function api(): ExtensionApi {
  const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
  const found = g.browser ?? g.chrome;
  if (!found) throw new Error("No extension API available (not running as an extension)");
  return found;
}

/** Whether an extension API is present at all — false under test and in a plain page. */
export function hasExtensionApi(): boolean {
  const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
  return Boolean(g.browser ?? g.chrome);
}

/**
 * How long to wait on an extension API call before giving up on it.
 *
 * These are local IPC calls that normally settle in single-digit milliseconds,
 * so this bound is not a performance tuning — it is there so a runtime that
 * neither returns a thenable nor calls back cannot hang the popup open forever.
 * Generous enough that a slow machine never trips it.
 */
const API_TIMEOUT_MS = 5_000;

/**
 * Call a method that may return a promise (Firefox, newer Chrome) or may take a
 * callback (older Chrome), and get a promise either way.
 *
 * The check is on the returned value, not on which global was found: a runtime
 * that returns a thenable is used as one, and only a runtime that returns
 * `undefined` gets the callback treatment. Branching on the browser instead
 * would be a claim about versions this cannot verify.
 */
function callMaybeAsync<T>(invoke: (cb: (value: T) => void) => unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const done = (value: T) =>
      finish(() => {
        // Chrome reports failure by setting `runtime.lastError` and calling the
        // callback anyway. Unread, it becomes an unchecked-error warning and the
        // caller silently receives `undefined`.
        const err = api().runtime.lastError;
        if (err) reject(new Error(err.message ?? "Extension API error"));
        else resolve(value);
      });

    // The third settle path, and the reason it exists: a runtime that returns
    // something non-thenable and then never invokes the callback leaves this
    // promise pending forever. That is not hypothetical bookkeeping — every
    // caller is awaited during popup `init`, so one such call hangs startup with
    // an empty region select, no verdict and no error to explain either. A
    // rejection instead surfaces as the popup's existing error path.
    const timer = setTimeout(
      () => finish(() => reject(new Error("Extension API did not respond"))),
      API_TIMEOUT_MS,
    );

    let returned: unknown;
    try {
      returned = invoke(done);
    } catch (e) {
      finish(() => reject(e));
      return;
    }

    const thenable = returned as Promise<T> | undefined;
    if (thenable && typeof thenable.then === "function") {
      thenable.then(
        (v) => finish(() => resolve(v)),
        (e) => finish(() => reject(e)),
      );
    }
  });
}

/** Read one key from local extension storage. Returns null when unset. */
export async function storageGet<T>(key: string): Promise<T | null> {
  const items = await callMaybeAsync<Record<string, unknown>>((cb) =>
    api().storage.local.get(key, cb),
  );
  const value = items?.[key];
  return value === undefined ? null : (value as T);
}

/** Write one key to local extension storage. */
export async function storageSet(key: string, value: unknown): Promise<void> {
  await callMaybeAsync<void>((cb) => api().storage.local.set({ [key]: value }, cb));
}

/**
 * Register the right-click entry point, idempotently.
 *
 * **Creating a duplicate id is the failure this guards against, and the two
 * browsers fail differently.** A background worker is revived repeatedly over
 * its life — MV3 tears it down when idle and re-evaluates the module on the
 * next event — so a bare `create` runs many times with the same id. Chrome
 * reports the collision through `runtime.lastError`, which unread is a console
 * warning; Firefox's event page *throws*, and a throw during module evaluation
 * aborts the rest of the module, so the click listener below it never registers
 * and the menu item does nothing for the rest of the session.
 *
 * `removeAll` first makes the registration unconditional rather than dependent
 * on what a previous evaluation left behind. `lastError` is read either way, so
 * neither runtime is left holding an unchecked error, and a failure to remove
 * (nothing to remove, on a first run) does not stop the create.
 */
export function createContextMenu(id: string, title: string): void {
  // Absent on Firefox for Android, which has no `menus` API. Returning here
  // rather than letting the calls below throw into their own catches: they
  // would survive it, but by accident, and a reader cannot tell a handled case
  // from an unhandled one when the difference is which catch happens to fire.
  const menus = api().contextMenus;
  if (!menus) return;

  const create = () => {
    try {
      menus.create({ id, title, contexts: ["selection"] }, () => {
        // Read so Chrome does not log an unchecked error. A collision here is
        // survivable — the item exists, which is the outcome we wanted.
        void api().runtime.lastError;
      });
    } catch {
      // Firefox throws on a duplicate id instead. Swallowed for the same
      // reason: the menu item is present either way, and letting this escape
      // would abort the caller's module before it registers its listener.
    }
  };

  try {
    const returned = menus.removeAll(() => {
      void api().runtime.lastError;
      create();
    }) as Promise<void> | undefined;
    // Firefox returns a promise and ignores the callback, so the create has to
    // be driven from whichever one this runtime actually honours.
    if (returned && typeof returned.then === "function") returned.then(create, create);
  } catch {
    create();
  }
}

/**
 * Open a URL in a new tab.
 *
 * **Needs no permission, and that is the point.** `tabs.create` with a plain
 * URL is available to every extension; what the `tabs` permission buys is
 * *reading* tab URLs and titles, which this never does. So the report link
 * costs the user nothing in the install prompt.
 *
 * Falls back to `window.open` when the API is absent — under test, and in any
 * runtime that does not expose it. Failure is swallowed: the caller is a button
 * whose whole job is opening a page, and a popup that throws while trying is
 * worse than one where the click did nothing visible.
 */
export function openTab(url: string): void {
  try {
    const tabs = api().tabs;
    if (tabs) {
      tabs.create({ url });
      return;
    }
  } catch {
    // Fall through to window.open.
  }
  try {
    globalThis.open?.(url, "_blank");
  } catch {
    // Nothing further to try.
  }
}

/**
 * Listen for clicks on our context-menu item.
 *
 * Guarded because the API is not everywhere. Firefox for Android has no `menus`
 * at all, and this is the background script's **first statement** — an
 * unguarded dereference there throws during module evaluation, which aborts the
 * rest of the module, so everything registered below it silently never happens.
 * That is the same failure `createContextMenu` above is written to avoid, and
 * the reason both are defensive rather than only the one that is known to throw.
 *
 * Absent API is a no-op, not an error: on a runtime with no context menu there
 * is no click to hear about, and the toolbar popup is unaffected. Returning
 * quietly is what keeps the popup working on a surface where the menu cannot.
 */
export function onContextMenuClicked(
  cb: (info: { menuItemId: string; selectionText?: string }) => void,
): void {
  try {
    api().contextMenus?.onClicked?.addListener(cb);
  } catch {
    // No context-menu API on this runtime. Nothing to listen to, and nothing
    // the caller can do about it.
  }
}

/**
 * Set the toolbar badge, or clear it with an empty string.
 *
 * **Every call here is best-effort and swallows its failure, deliberately.**
 * The badge is a hint that a result is waiting; the result itself is in
 * storage and the popup renders it regardless. So a runtime that omits
 * `setBadgeText` (Safari has shipped without parts of the action API, and
 * Firefox for Android has no toolbar badge at all) must degrade to the
 * pre-badge behaviour rather than take the check down with it — the background
 * script's whole job at that moment is to have stored a verdict.
 *
 * Colour is passed separately from text because they are separate calls on
 * both runtimes, and a runtime can honour one and not the other.
 */
export function setBadge(text: string, color?: string): void {
  const action = (() => {
    try {
      return api().action;
    } catch {
      return undefined;
    }
  })();
  if (!action) return;

  try {
    action.setBadgeText?.({ text });
  } catch {
    // No badge on this runtime.
  }
  if (color) {
    try {
      action.setBadgeBackgroundColor?.({ color });
    } catch {
      // Text without colour is still legible; the default background is used.
    }
  }
}

/**
 * Set the toolbar button's tooltip.
 *
 * The badge can hold about four characters, so it says *that* something was
 * found; the title is where the verdict is spelled out. Together they are the
 * no-permission half of the "a result is ready" signal, which matters because
 * the notification half can be switched off by the user at the OS level and
 * this cannot.
 */
export function setActionTitle(title: string): void {
  try {
    api().action?.setTitle?.({ title });
  } catch {
    // Tooltip unavailable. The badge still carries the signal.
  }
}

/**
 * Raise an OS notification. Resolves false when none was shown.
 *
 * Returning a boolean rather than throwing, because "the user has notifications
 * switched off" is an ordinary outcome and not an error — every caller's
 * response to it is the same as its response to success: nothing. The return
 * exists so a caller *can* distinguish them, not because one must.
 *
 * `iconUrl` is resolved through `runtime.getURL` by the caller, since a bare
 * relative path resolves against the wrong base in a service worker.
 */
export function notify(
  id: string,
  options: { title: string; message: string; iconUrl: string },
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let notifications: Notifications | undefined;
    try {
      notifications = api().notifications;
    } catch {
      resolve(false);
      return;
    }
    if (!notifications) {
      resolve(false);
      return;
    }

    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Read so Chrome does not log an unchecked error when the user has
      // notifications disabled — which is a preference, not a fault.
      try {
        void api().runtime.lastError;
      } catch {
        // Nothing to read.
      }
      resolve(ok);
    };

    // Same reasoning as `callMaybeAsync`: a runtime that neither returns a
    // thenable nor calls back would otherwise leave this pending forever, and
    // this promise is awaited on the path that stores the verdict.
    const timer = setTimeout(() => done(false), API_TIMEOUT_MS);

    try {
      const returned = notifications.create(
        id,
        { type: "basic", priority: 2, ...options },
        () => done(true),
      ) as Promise<unknown> | undefined;
      if (returned && typeof returned.then === "function") {
        returned.then(
          () => done(true),
          () => done(false),
        );
      }
    } catch {
      done(false);
    }
  });
}

/** Dismiss a notification we raised, if the runtime supports clearing one. */
export function clearNotification(id: string): void {
  try {
    const cleared = api().notifications?.clear?.(id, () => {
      void api().runtime.lastError;
    }) as Promise<unknown> | undefined;
    // Firefox returns a promise and ignores the callback; an unhandled
    // rejection here would be logged for a dismissal nobody is waiting on.
    if (cleared && typeof cleared.then === "function") cleared.then(undefined, () => {});
  } catch {
    // Nothing to clear.
  }
}

/** Listen for a notification being clicked. No-op where unsupported. */
export function onNotificationClicked(cb: (id: string) => void): void {
  try {
    api().notifications?.onClicked?.addListener(cb);
  } catch {
    // No notifications on this runtime, so no clicks to hear about.
  }
}

/**
 * Resolve a packaged file to an absolute extension URL.
 *
 * Needed for both the notification icon and the onboarding tab: a relative path
 * resolves against the document base, and a background service worker has no
 * document. Falls back to the input so a test environment gets something
 * usable rather than a throw.
 */
export function extensionUrl(path: string): string {
  try {
    return api().runtime.getURL?.(path) ?? path;
  } catch {
    return path;
  }
}

/**
 * Listen for the extension being installed or updated.
 *
 * The callback receives the raw reason string rather than a parsed enum,
 * because the set differs by browser ("install", "update", "browser_update",
 * "chrome_update", "shared_module_update") and a caller that only acts on
 * "install" should not have to know the rest.
 */
export function onInstalled(cb: (reason: string) => void): void {
  try {
    api().runtime.onInstalled?.addListener((details) => cb(details?.reason ?? ""));
  } catch {
    // No lifecycle events here — under test, and in a plain page.
  }
}
