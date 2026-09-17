// The cross-browser compatibility layer.
//
// This is four methods over two runtimes that disagree about how they answer,
// and every other file in the extension is written against it — so a defect
// here is a defect everywhere, and it surfaces as silence rather than an error.
// The two behaviours worth pinning are the ones that produce no visible failure:
//
//   1. A call that never settles hangs popup startup with no error to explain
//      an empty panel.
//   2. A duplicate context-menu id throws on one runtime and logs on the other,
//      and the throw aborts module evaluation before the click listener binds.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** A settable stand-in for the `chrome`/`browser` global. */
type Api = Record<string, unknown>;

function install(api: Api) {
  vi.stubGlobal("chrome", api);
}

/** The minimum a runtime must expose for the module to reach its own logic. */
function baseApi(over: Partial<Api> = {}): Api {
  return {
    runtime: {},
    storage: { local: { get: () => {}, set: () => {} } },
    contextMenus: { create: () => {}, removeAll: () => {}, onClicked: { addListener: () => {} } },
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

describe("storage calls settle on every runtime shape", () => {
  it("resolves from a returned promise (Firefox, newer Chrome)", async () => {
    install(
      baseApi({
        runtime: {},
        storage: { local: { get: async () => ({ region: "AU" }), set: async () => {} } },
      }),
    );
    const { storageGet } = await import("../extension/src/browser");
    expect(await storageGet<string>("region")).toBe("AU");
  });

  it("resolves from a callback (older Chrome)", async () => {
    install(
      baseApi({
        storage: {
          local: {
            get: (_k: string, cb: (v: unknown) => void) => cb({ region: "GB" }),
            set: (_i: unknown, cb: () => void) => cb(),
          },
        },
      }),
    );
    const { storageGet } = await import("../extension/src/browser");
    expect(await storageGet<string>("region")).toBe("GB");
  });

  it("rejects when Chrome reports failure through lastError", async () => {
    // Chrome signals failure by setting lastError and invoking the callback
    // anyway. Unread, the caller silently receives undefined.
    install(
      baseApi({
        runtime: { lastError: { message: "quota exceeded" } },
        storage: { local: { get: (_k: string, cb: (v: unknown) => void) => cb({}), set: () => {} } },
      }),
    );
    const { storageGet } = await import("../extension/src/browser");
    await expect(storageGet("region")).rejects.toThrow("quota exceeded");
  });

  it("rejects rather than hanging when a runtime never answers", async () => {
    // The failure this prevents: a runtime that returns a non-thenable and never
    // calls back leaves the promise pending forever. Every caller is awaited
    // during popup init, so one such call hangs startup with an empty region
    // select, no verdict, and nothing on screen to explain either.
    vi.useFakeTimers();
    install(
      baseApi({
        storage: { local: { get: () => undefined, set: () => undefined } },
      }),
    );
    const { storageGet } = await import("../extension/src/browser");

    const pending = storageGet("region");
    const assertion = expect(pending).rejects.toThrow(/did not respond/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("rejects when the call throws synchronously", async () => {
    install(
      baseApi({
        storage: {
          local: {
            get: () => {
              throw new Error("no such API");
            },
            set: () => {},
          },
        },
      }),
    );
    const { storageGet } = await import("../extension/src/browser");
    await expect(storageGet("region")).rejects.toThrow("no such API");
  });
});

describe("openTab", () => {
  it("opens through the tabs API when the runtime has one", async () => {
    const create = vi.fn();
    install(baseApi({ tabs: { create } }));
    const { openTab } = await import("../extension/src/browser");

    openTab("https://veriguard.app/report?type=url");
    expect(create).toHaveBeenCalledWith({ url: "https://veriguard.app/report?type=url" });
  });

  it("needs no permission to do it", async () => {
    // `tabs.create` with a plain URL is available to every extension. What the
    // `tabs` permission buys is READING tab URLs and titles, which nothing here
    // does — so the report link costs the user nothing at the install prompt.
    const { buildManifest } = await import("../extension/src/manifest");
    for (const target of ["chrome", "firefox"] as const) {
      const m = buildManifest(target, {
        version: "9.9.9",
        geckoId: "t@example.invalid",
        apiBase: "https://api.example.invalid",
      }) as { permissions: string[] };
      expect(m.permissions, "opening a tab must not have added a permission").not.toContain("tabs");
    }
  });

  it("falls back to window.open when the runtime exposes no tabs API", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    install(baseApi());
    const { openTab } = await import("../extension/src/browser");

    openTab("https://veriguard.app/report");
    expect(open).toHaveBeenCalledWith("https://veriguard.app/report", "_blank");
  });

  it("does not throw when both paths fail", async () => {
    // The caller is a button whose whole job is opening a page. A popup that
    // throws while trying is worse than one where the click did nothing.
    vi.stubGlobal("open", () => {
      throw new Error("blocked");
    });
    install(
      baseApi({
        tabs: {
          create: () => {
            throw new Error("no");
          },
        },
      }),
    );
    const { openTab } = await import("../extension/src/browser");
    expect(() => openTab("https://veriguard.app/report")).not.toThrow();
  });
});

describe("createContextMenu is idempotent", () => {
  // A background worker is torn down when idle and re-evaluated on the next
  // event, so this runs many times over a session with the same id.

  it("clears before creating, so a re-evaluation cannot stack a duplicate", async () => {
    const create = vi.fn((_p: unknown, cb?: () => void) => cb?.());
    const removeAll = vi.fn((cb?: () => void) => cb?.());
    install(baseApi({ contextMenus: { create, removeAll, onClicked: { addListener: () => {} } } }));

    const { createContextMenu } = await import("../extension/src/browser");
    createContextMenu("id", "Title");
    createContextMenu("id", "Title");

    expect(removeAll).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({ id: "id", contexts: ["selection"] });
  });

  it("creates via the promise when the runtime ignores the callback", async () => {
    // Firefox returns a promise from removeAll and never invokes the callback,
    // so the create has to be driven from whichever the runtime honours.
    const create = vi.fn();
    const removeAll = vi.fn(() => Promise.resolve());
    install(baseApi({ contextMenus: { create, removeAll, onClicked: { addListener: () => {} } } }));

    const { createContextMenu } = await import("../extension/src/browser");
    createContextMenu("id", "Title");
    await Promise.resolve();
    await Promise.resolve();

    expect(create).toHaveBeenCalledOnce();
  });

  it("does not throw when the runtime rejects a duplicate id", async () => {
    // Firefox throws here. A throw during module evaluation aborts the rest of
    // background.ts, so the click listener never binds and the menu item does
    // nothing for the rest of the session — silently.
    const create = vi.fn(() => {
      throw new Error("duplicate id");
    });
    install(
      baseApi({
        contextMenus: { create, removeAll: (cb?: () => void) => cb?.(), onClicked: { addListener: () => {} } },
      }),
    );

    const { createContextMenu } = await import("../extension/src/browser");
    expect(() => createContextMenu("id", "Title")).not.toThrow();
    expect(create).toHaveBeenCalledOnce();
  });

  it("still creates when removeAll itself throws", async () => {
    const create = vi.fn((_p: unknown, cb?: () => void) => cb?.());
    install(
      baseApi({
        contextMenus: {
          create,
          removeAll: () => {
            throw new Error("unsupported");
          },
          onClicked: { addListener: () => {} },
        },
      }),
    );

    const { createContextMenu } = await import("../extension/src/browser");
    createContextMenu("id", "Title");
    expect(create).toHaveBeenCalledOnce();
  });

  it("reads lastError so Chrome logs no unchecked error", async () => {
    const runtime: { lastError?: { message: string } } = { lastError: { message: "duplicate id" } };
    const reads: boolean[] = [];
    // A getter records that the property was actually read — the whole point of
    // handling a collision this way rather than ignoring it.
    const tracked = {
      get lastError() {
        reads.push(true);
        return runtime.lastError;
      },
    };
    install(
      baseApi({
        runtime: tracked,
        contextMenus: {
          create: (_p: unknown, cb?: () => void) => cb?.(),
          removeAll: (cb?: () => void) => cb?.(),
          onClicked: { addListener: () => {} },
        },
      }),
    );

    const { createContextMenu } = await import("../extension/src/browser");
    createContextMenu("id", "Title");
    expect(reads.length).toBeGreaterThan(0);
  });
});
