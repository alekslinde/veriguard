// How a right-click check tells the user it finished.
//
// This is the gap the extension shipped with: you selected text, chose the menu
// item, and nothing visible happened until you thought to open the popup. The
// badge, the tooltip and the notification are three answers to that, and the
// reason there are three is that each can be absent — a badge needs a visible
// toolbar button, a tooltip needs a deliberate hover, and a notification can be
// switched off at the OS level or missing from the runtime entirely.
//
// So the property worth pinning is not "the user is told" — no single mechanism
// can promise that — but **the check still completes and the result is still
// waiting in the popup when every one of them fails.** A signalling layer that
// can take the verdict down with it would be worse than the silence it replaces.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Api = Record<string, unknown>;

function install(api: Api) {
  vi.stubGlobal("chrome", api);
}

/** A runtime with every surface the background script reaches for. */
function fullApi(over: Partial<Api> = {}): Api {
  return {
    runtime: { getURL: (p: string) => `chrome-extension://test/${p}`, onInstalled: { addListener: () => {} } },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    contextMenus: { create: () => {}, removeAll: () => {}, onClicked: { addListener: () => {} } },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: () => {} },
    notifications: { create: (_id: string, _o: unknown, cb?: (id: string) => void) => cb?.("id") },
    tabs: { create: () => {} },
    ...over,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("badge and tooltip", () => {
  it("sets text and colour together", async () => {
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();
    install(fullApi({ action: { setBadgeText, setBadgeBackgroundColor, setTitle: () => {} } }));

    const { setBadge } = await import("../extension/src/browser");
    setBadge("!", "#d6453d");

    expect(setBadgeText).toHaveBeenCalledWith({ text: "!" });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#d6453d" });
  });

  it("clears with an empty string and leaves the colour alone", async () => {
    // Clearing is what the popup does on open. Passing no colour means the
    // runtime keeps whatever it had, which is correct for an empty badge and
    // avoids a call that some runtimes reject with an empty text.
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();
    install(fullApi({ action: { setBadgeText, setBadgeBackgroundColor, setTitle: () => {} } }));

    const { setBadge } = await import("../extension/src/browser");
    setBadge("");

    expect(setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("does not throw on a runtime with no action API at all", async () => {
    // Firefox for Android has no toolbar badge. The check must still complete.
    install(fullApi({ action: undefined }));
    const { setBadge, setActionTitle } = await import("../extension/src/browser");
    expect(() => setBadge("!", "#d6453d")).not.toThrow();
    expect(() => setActionTitle("Veriguard")).not.toThrow();
  });

  it("does not throw when a runtime has the API but the call fails", async () => {
    // Safari has shipped with parts of the action API present but unimplemented.
    install(
      fullApi({
        action: {
          setBadgeText: () => {
            throw new Error("unsupported");
          },
          setBadgeBackgroundColor: () => {
            throw new Error("unsupported");
          },
          setTitle: () => {
            throw new Error("unsupported");
          },
        },
      }),
    );
    const { setBadge, setActionTitle } = await import("../extension/src/browser");
    expect(() => setBadge("!", "#d6453d")).not.toThrow();
    expect(() => setActionTitle("Veriguard")).not.toThrow();
  });

  it("still sets text when only the colour call fails", async () => {
    // Text without colour is legible; losing both because one failed is not.
    const setBadgeText = vi.fn();
    install(
      fullApi({
        action: {
          setBadgeText,
          setBadgeBackgroundColor: () => {
            throw new Error("no");
          },
          setTitle: () => {},
        },
      }),
    );
    const { setBadge } = await import("../extension/src/browser");
    setBadge("!", "#d6453d");
    expect(setBadgeText).toHaveBeenCalledWith({ text: "!" });
  });
});

describe("notifications", () => {
  const options = { title: "t", message: "m", iconUrl: "icons/icon-128.png" };

  it("resolves true when one is shown", async () => {
    install(fullApi());
    const { notify } = await import("../extension/src/browser");
    await expect(notify("id", options)).resolves.toBe(true);
  });

  it("resolves from a returned promise (Firefox)", async () => {
    install(
      fullApi({
        notifications: { create: () => Promise.resolve("id") },
      }),
    );
    const { notify } = await import("../extension/src/browser");
    await expect(notify("id", options)).resolves.toBe(true);
  });

  it("resolves false rather than throwing when the runtime has no notifications", async () => {
    // "The user switched notifications off" is an ordinary outcome, not an
    // error, and every caller's response to it is the same as to success.
    install(fullApi({ notifications: undefined }));
    const { notify } = await import("../extension/src/browser");
    await expect(notify("id", options)).resolves.toBe(false);
  });

  it("resolves false when creating one rejects", async () => {
    install(fullApi({ notifications: { create: () => Promise.reject(new Error("denied")) } }));
    const { notify } = await import("../extension/src/browser");
    await expect(notify("id", options)).resolves.toBe(false);
  });

  it("resolves false when creating one throws synchronously", async () => {
    install(
      fullApi({
        notifications: {
          create: () => {
            throw new Error("denied");
          },
        },
      }),
    );
    const { notify } = await import("../extension/src/browser");
    await expect(notify("id", options)).resolves.toBe(false);
  });

  it("resolves rather than hanging when a runtime never answers", async () => {
    // Same failure as the storage layer's: this promise is awaited on the path
    // that stores the verdict, so one that never settles would leave the
    // background handler suspended with the result unwritten.
    vi.useFakeTimers();
    install(fullApi({ notifications: { create: () => undefined } }));
    const { notify } = await import("../extension/src/browser");

    const pending = notify("id", options);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBe(false);
  });

  it("sends a basic notification with the resolved icon", async () => {
    const create = vi.fn((_id: string, _o: unknown, cb?: (id: string) => void) => cb?.("id"));
    install(fullApi({ notifications: { create } }));
    const { notify, extensionUrl } = await import("../extension/src/browser");

    await notify("veriguard-result", { ...options, iconUrl: extensionUrl("icons/icon-128.png") });

    expect(create.mock.calls[0][0]).toBe("veriguard-result");
    expect(create.mock.calls[0][1]).toMatchObject({
      type: "basic",
      iconUrl: "chrome-extension://test/icons/icon-128.png",
    });
  });
});

describe("extensionUrl", () => {
  it("resolves a packaged path through the runtime", async () => {
    install(fullApi());
    const { extensionUrl } = await import("../extension/src/browser");
    expect(extensionUrl("onboarding.html")).toBe("chrome-extension://test/onboarding.html");
  });

  it("falls back to the path when the runtime cannot resolve it", async () => {
    // A relative path resolves against the wrong base in a worker, but
    // returning something usable beats throwing in a test environment.
    install(fullApi({ runtime: {} }));
    const { extensionUrl } = await import("../extension/src/browser");
    expect(extensionUrl("onboarding.html")).toBe("onboarding.html");
  });
});

describe("onInstalled", () => {
  it("passes the raw reason through", async () => {
    let fire: ((d: { reason: string }) => void) | undefined;
    install(
      fullApi({
        runtime: {
          getURL: (p: string) => p,
          onInstalled: { addListener: (cb: (d: { reason: string }) => void) => (fire = cb) },
        },
      }),
    );
    const { onInstalled } = await import("../extension/src/browser");
    const seen: string[] = [];
    onInstalled((reason) => seen.push(reason));

    fire?.({ reason: "install" });
    fire?.({ reason: "update" });
    expect(seen).toEqual(["install", "update"]);
  });

  it("does not throw on a runtime with no lifecycle events", async () => {
    install(fullApi({ runtime: {} }));
    const { onInstalled } = await import("../extension/src/browser");
    expect(() => onInstalled(() => {})).not.toThrow();
  });
});

describe("badge vocabulary", () => {
  it("gives every verdict a badge, a tooltip and a notification", async () => {
    // A verdict with no entry would badge `undefined` — visibly, on the toolbar.
    const { BADGE, ACTION_TITLE, NOTIFY } = await import("../extension/src/copy");
    const { VERDICT_COPY } = await import("../extension/src/copy");

    for (const verdict of Object.keys(VERDICT_COPY)) {
      expect(BADGE, verdict).toHaveProperty(verdict);
      expect(ACTION_TITLE, verdict).toHaveProperty(verdict);
      expect(NOTIFY, verdict).toHaveProperty(verdict);
    }
  });

  it("keeps badge text short enough to render", async () => {
    // A badge shows about four characters before the runtime truncates it, and
    // a truncated badge is a wrong badge rather than a clipped one.
    const { BADGE } = await import("../extension/src/copy");
    for (const [verdict, { text }] of Object.entries(BADGE)) {
      expect([...text].length, `${verdict} badge is too long to render`).toBeLessThanOrEqual(4);
    }
  });

  it("gives a clean verdict a badge rather than an empty one", async () => {
    // A cleared badge is indistinguishable from a check that never ran, and
    // "we looked and found nothing" is a different statement from silence —
    // the same distinction the blocklist notice exists to draw.
    const { BADGE } = await import("../extension/src/copy");
    expect(BADGE.safe.text.trim()).not.toBe("");
  });

  it("does not quote the checked message back in a notification", async () => {
    // A notification renders on the desktop and can persist in a system tray,
    // where whoever is near the screen can read it. The text a user checked is
    // often a private message, so it stays in the popup they chose to open.
    //
    // Asserted as a property of the copy: every notification string is fixed,
    // with no interpolation point for content to reach.
    const { NOTIFY, NOTIFY_NOTHING } = await import("../extension/src/copy");
    for (const entry of [...Object.values(NOTIFY), NOTIFY_NOTHING]) {
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.message).toBe("string");
      expect(entry.message).not.toContain("${");
    }
  });
});
