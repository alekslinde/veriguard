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
  create(props: { id: string; title: string; contexts: string[] }): void;
  onClicked: { addListener(cb: (info: { menuItemId: string; selectionText?: string }) => void): void };
}

interface Runtime {
  lastError?: { message?: string };
  openOptionsPage?: () => void;
}

interface ExtensionApi {
  storage: { local: StorageArea };
  contextMenus: ContextMenus;
  runtime: Runtime;
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
    const done = (value: T) => {
      if (settled) return;
      settled = true;
      // Chrome reports failure by setting `runtime.lastError` and calling the
      // callback anyway. Unread, it becomes an unchecked-error warning and the
      // caller silently receives `undefined`.
      const err = api().runtime.lastError;
      if (err) reject(new Error(err.message ?? "Extension API error"));
      else resolve(value);
    };

    const returned = invoke(done) as Promise<T> | undefined;
    if (returned && typeof (returned as Promise<T>).then === "function") {
      (returned as Promise<T>).then(
        (v) => {
          settled = true;
          resolve(v);
        },
        (e) => {
          settled = true;
          reject(e);
        },
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

/** Register the right-click entry point. */
export function createContextMenu(id: string, title: string): void {
  api().contextMenus.create({ id, title, contexts: ["selection"] });
}

/** Listen for clicks on our context-menu item. */
export function onContextMenuClicked(
  cb: (info: { menuItemId: string; selectionText?: string }) => void,
): void {
  api().contextMenus.onClicked.addListener(cb);
}
