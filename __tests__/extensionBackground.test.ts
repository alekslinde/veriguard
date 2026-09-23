// The background script, driven end to end against a fake runtime.
//
// The check moved here from the popup, which is what lets a badge and a
// notification appear before the popup is ever opened. That makes this module
// the one place a right-click check can now fail silently: it runs with no UI
// attached, in a worker the browser may tear down mid-await, on runtimes that
// variously lack a badge, a notification or a context menu.
//
// So these tests are mostly about **what survives a failure**. The ordering
// assertions are the substance: the selection is stashed before the check
// starts and the result is stored before the user is told about it, so that
// every interruption leaves the user with more than they had, never less.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Api = Record<string, unknown>;
type MenuInfo = { menuItemId: string; selectionText?: string };

/** The fake runtime, plus handles on what the module did to it. */
function harness(over: Partial<Api> = {}) {
  const store = new Map<string, unknown>();
  /** Every storage write in order, so the sequencing can be asserted. */
  const writes: Array<{ key: string; value: unknown }> = [];
  const badges: Array<{ text: string; color?: string }> = [];
  const titles: string[] = [];
  const notifications: Array<{ id: string; title: string; message: string }> = [];
  const tabs: string[] = [];

  let fireMenu: ((info: MenuInfo) => void) | undefined;
  let fireInstalled: ((d: { reason: string }) => void) | undefined;

  const api: Api = {
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onInstalled: {
        addListener: (cb: (d: { reason: string }) => void) => {
          fireInstalled = cb;
        },
      },
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            writes.push({ key, value });
            if (value === null) store.delete(key);
            else store.set(key, value);
          }
        },
      },
    },
    contextMenus: {
      create: () => {},
      removeAll: (cb?: () => void) => cb?.(),
      onClicked: {
        addListener: (cb: (info: MenuInfo) => void) => {
          fireMenu = cb;
        },
      },
    },
    action: {
      setBadgeText: ({ text }: { text: string }) => badges.push({ text }),
      setBadgeBackgroundColor: ({ color }: { color: string }) => {
        const last = badges[badges.length - 1];
        if (last) last.color = color;
      },
      setTitle: ({ title }: { title: string }) => titles.push(title),
    },
    notifications: {
      create: (
        id: string,
        o: { title: string; message: string },
        cb?: (id: string) => void,
      ) => {
        notifications.push({ id, title: o.title, message: o.message });
        cb?.(id);
      },
    },
    tabs: { create: ({ url }: { url: string }) => tabs.push(url) },
    ...over,
  };

  vi.stubGlobal("chrome", api);

  return {
    store,
    writes,
    badges,
    titles,
    notifications,
    tabs,
    menu: (info: MenuInfo) => fireMenu?.(info),
    installed: (reason: string) => fireInstalled?.({ reason }),
  };
}

/**
 * Load the background module and settle everything it floated.
 *
 * The click listener is synchronous on both runtimes, so the handler is started
 * with `void` and there is no promise to await from the outside. Draining the
 * microtask queue a few times is what stands in for that.
 */
async function loadBackground() {
  await import("../extension/src/background");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Let the floated handler run to completion.
 *
 * A macrotask turn rather than only draining microtasks: the blocklist path
 * awaits a rejected `fetch` and its own timers, so a microtask-only drain
 * returns before the handler has stored anything.
 */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A message that scores: lookalike sender, fee lure, artificial deadline. */
const SCAM =
  "AusPost: your parcel is held pending a $1.95 redelivery fee. " +
  "Confirm within 24 hours: http://auspost-redelivery.bond/pay";

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  // The blocklist fetch is the one network call. Failing it is the common case
  // offline and must not stop a check.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a right-click check", () => {
  it("stores a result, badges it and notifies", async () => {
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const result = h.store.get("pendingResult") as { content: string; check: { verdict: string } };
    expect(result, "the popup has nothing to render").toBeTruthy();
    expect(result.content).toBe(SCAM);
    expect(result.check.verdict).toBe("likely_scam");

    expect(h.badges.at(-1)).toMatchObject({ text: "!" });
    expect(h.titles.at(-1)).toMatch(/likely a scam/i);
    expect(h.notifications.at(-1)?.title).toMatch(/scam/i);
  });

  it("stashes the selection before it starts checking", async () => {
    // The ordering that makes a torn-down worker recoverable: if the check never
    // finishes, the popup still opens with the text in the box and can re-run
    // it. Stashing afterwards would mean a teardown loses the selection too.
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const keys = h.writes.map((w) => w.key);
    expect(keys[0]).toBe("pendingSelection");
    expect(h.writes[0].value).toBe(SCAM);
  });

  it("clears a previous result before checking, not after", async () => {
    // Otherwise a teardown mid-check leaves the popup showing an older verdict
    // beside newer text — the one outcome worse than showing nothing.
    const h = harness();
    h.store.set("pendingResult", { content: "old", check: { verdict: "safe" } });
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const cleared = h.writes.findIndex((w) => w.key === "pendingResult" && w.value === null);
    const stored = h.writes.findIndex((w) => w.key === "pendingResult" && w.value !== null);
    expect(cleared, "the stale result was never cleared").toBeGreaterThanOrEqual(0);
    expect(cleared).toBeLessThan(stored);
  });

  it("stores the result before raising the notification", async () => {
    // A user who acts on the notification immediately must find the result
    // already waiting rather than a popup that starts checking again.
    //
    // Both events append to one log at the moment they happen, inside the
    // fakes themselves. Polling for the write between ticks would record it a
    // turn late and invert the order it is meant to be checking.
    const order: string[] = [];
    const h = harness({
      storage: {
        local: {
          get: async () => ({}),
          set: async (items: Record<string, unknown>) => {
            if (items.pendingResult) order.push("stored");
          },
        },
      },
      notifications: {
        create: (id: string, _o: unknown, cb?: (id: string) => void) => {
          order.push("notified");
          cb?.(id);
        },
      },
    });
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(order).toEqual(["stored", "notified"]);
  });

  it("ignores a click on someone else's menu item", async () => {
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "some-other-extension", selectionText: SCAM });
    await settle();

    expect(h.writes).toHaveLength(0);
    expect(h.notifications).toHaveLength(0);
  });

  it("ignores a selection that is only whitespace", async () => {
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: "   \n  " });
    await settle();

    expect(h.writes).toHaveLength(0);
  });

  it("truncates an over-broad selection rather than refusing it", async () => {
    // The plausible cause is a drag that caught the whole page, not an attack,
    // so the selection is capped and checked rather than rejected.
    //
    // Asserted at the stash, which happens before the check starts.
    //
    // The generous timeout is not slack — it is this case's actual cost. A
    // capped selection of ordinary prose checks in single-digit milliseconds,
    // but one unbroken run of 20,000 identical characters takes seconds, and
    // the test cannot finish while the floated handler is still working. That
    // is a property of the engine rather than of this module, and the cap is
    // what bounds it; see the note on MAX_SELECTION.
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: "x".repeat(50_000) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.writes[0].key).toBe("pendingSelection");
    expect((h.writes[0].value as string).length).toBe(20_000);
  }, 20_000);

  it("badges a quiet verdict rather than clearing the badge", async () => {
    // Punctuation and short pleasantries score `safe` rather than returning
    // nothing, so this is the ordinary quiet path — and it still gets a badge.
    // An empty badge here would be indistinguishable from a check that never
    // ran, and "we looked and found nothing" is a different statement from
    // silence.
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: "thanks, see you then" });
    await settle();

    const result = h.store.get("pendingResult") as { check: { verdict: string } };
    expect(result.check.verdict).toBe("safe");
    expect(h.badges.at(-1)?.text).toBe("✓");
    expect(h.notifications.at(-1)?.title).toMatch(/nothing matched/i);
  });
});

describe("the check survives a runtime that cannot signal", () => {
  it("completes with no action API (Firefox for Android has no badge)", async () => {
    const h = harness({ action: undefined });
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(h.store.get("pendingResult"), "no badge cost the user the result").toBeTruthy();
  });

  it("completes with no notifications API", async () => {
    const h = harness({ notifications: undefined });
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(h.store.get("pendingResult")).toBeTruthy();
    expect(h.badges.at(-1)).toMatchObject({ text: "!" });
  });

  it("completes when every signalling call throws", async () => {
    // The whole point: signalling is decoration over a result that must exist
    // regardless. A layer that can take the verdict down with it would be worse
    // than the silence it replaces.
    const boom = () => {
      throw new Error("unsupported");
    };
    const h = harness({
      action: { setBadgeText: boom, setBadgeBackgroundColor: boom, setTitle: boom },
      notifications: { create: boom },
    });
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(h.store.get("pendingResult")).toBeTruthy();
  });

  it("completes when the blocklist cannot be fetched", async () => {
    // Already the default in this file's setup, asserted explicitly: an offline
    // check is a complete check with one fewer source, not a failed one.
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const result = h.store.get("pendingResult") as { check: { blocklistConsulted: boolean } };
    expect(result.check.blocklistConsulted).toBe(false);
  });
});

describe("the toolbar never carries a stale claim", () => {
  it("resets the tooltip when nothing checkable was found", async () => {
    // The tooltip outlives a check. Clearing the badge without it would leave
    // the toolbar asserting the *previous* check's verdict beside a badge and a
    // notification saying nothing was found — two signals contradicting each
    // other, with the stale one sounding the more specific.
    //
    // Driven through the module's own code path by making the check return
    // nothing: whitespace is rejected earlier, so the runCheck null branch is
    // only reachable by stubbing it.
    //
    // Unmocked in a `finally` and followed by `resetModules`, because
    // `doMock` otherwise persists for the rest of the file — every later test
    // would import the same stub, run against a check that returns nothing,
    // and fail for a reason that has nothing to do with what it asserts.
    const h = harness();
    vi.doMock("../extension/src/check", () => ({ runCheck: async () => null }));
    try {
      await loadBackground();

      h.menu({ menuItemId: "veriguard-check-selection", selectionText: "anything at all" });
      await settle();

      expect(h.badges.at(-1)?.text).toBe("");
      expect(h.titles.at(-1), "the tooltip still claims the last verdict").toBe("Veriguard");
    } finally {
      vi.doUnmock("../extension/src/check");
      vi.resetModules();
    }
  });

  it("pairs a badge with a tooltip on every verdict path", async () => {
    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(h.badges).toHaveLength(h.titles.length);
  });
});

describe("a blocklist refresh cut short by a teardown", () => {
  it("does not book a backoff for a request nobody refused", async () => {
    // An MV3 event page can be torn down as soon as the handler that started
    // the refresh settles, which rejects the in-flight fetch with an
    // AbortError. Recorded as an ordinary failure that is a 30-minute lockout
    // for a request nobody refused — and on a worker torn down at the same
    // point every time, the list would never refresh again while every check
    // quietly ran against a copy that only got older.
    //
    // Asserted on what is written to storage, because `failedAt` is the whole
    // mechanism: it is what a later call reads to decide it is backing off.
    const abort = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(abort)));

    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const cached = h.writes.find((w) => w.key === "blocklist")?.value as
      | { failedAt?: number }
      | undefined;
    expect(
      cached?.failedAt,
      "an aborted request booked a backoff, so the list stops refreshing",
    ).toBeUndefined();
  });

  it("still backs off when the server actually refused", async () => {
    // The other direction, and the reason the abort case cannot simply be
    // ignored wholesale: a refusal is exactly what the backoff exists for. A
    // client that trips the rate limit and retries on every check keeps itself
    // locked out for the whole window.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 429 })));

    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    const cached = h.writes.find((w) => w.key === "blocklist")?.value as
      | { failedAt?: number }
      | undefined;
    expect(cached?.failedAt, "a refused request must still back off").toBeTypeOf("number");
  });

  it("checks normally while a refresh is in flight", async () => {
    // Whatever happens to the refresh, it is not on the path the user is
    // waiting on: the result is stored and the badge set from the cached copy,
    // which is the property the float exists to provide.
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(abort)));

    const h = harness();
    await loadBackground();

    h.menu({ menuItemId: "veriguard-check-selection", selectionText: SCAM });
    await settle();

    expect(h.store.get("pendingResult")).toBeTruthy();
    expect(h.badges.at(-1)?.text).toBe("!");
  });
});

describe("first run", () => {
  it("opens the packaged onboarding page on install", async () => {
    const h = harness();
    await loadBackground();

    h.installed("install");
    await settle();

    expect(h.tabs).toEqual(["chrome-extension://test/onboarding.html"]);
  });

  it("opens a packaged page, never a remote one", async () => {
    // A tab pointed at our site on install would be a request to our server
    // carrying an IP and an install time, from an extension whose listing says
    // it sends nothing.
    const h = harness();
    await loadBackground();

    h.installed("install");
    await settle();

    for (const url of h.tabs) {
      expect(url, "the onboarding tab must not be a remote URL").not.toMatch(/^https?:/);
    }
  });

  it("does not open a tab on update", async () => {
    // A tab on every patch release is what stores treat as a dark pattern, and
    // what the page teaches does not change between versions.
    const h = harness();
    await loadBackground();

    h.installed("update");
    h.installed("browser_update");
    await settle();

    expect(h.tabs).toEqual([]);
  });
});
