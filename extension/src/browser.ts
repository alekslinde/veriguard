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
}

interface Tabs {
  create(props: { url: string }): unknown;
}

interface ExtensionApi {
  storage: { local: StorageArea };
  contextMenus: ContextMenus;
  runtime: Runtime;
  tabs?: Tabs;
  action?: { openPopup?: () => Promise<void> };
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
  const menus = api().contextMenus;
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

/** Listen for clicks on our context-menu item. */
export function onContextMenuClicked(
  cb: (info: { menuItemId: string; selectionText?: string }) => void,
): void {
  api().contextMenus.onClicked.addListener(cb);
}
