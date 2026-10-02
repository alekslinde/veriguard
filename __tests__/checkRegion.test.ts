// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, afterEach } from "vitest";
import {
  normaliseCheckRegion,
  readStoredCheckRegion,
  writeStoredCheckRegion,
  CHECK_REGION_STORAGE_KEY,
  LEGACY_CHECK_REGION_STORAGE_KEY,
} from "@/lib/checkRegion";
import { supportedRegions } from "@veriguard/detect/regions";

describe("normaliseCheckRegion", () => {
  it("accepts every supported region code, case-insensitively", () => {
    for (const code of supportedRegions()) {
      expect(normaliseCheckRegion(code)).toBe(code);
      expect(normaliseCheckRegion(code.toLowerCase())).toBe(code);
    }
  });

  it("degrades anything else to auto (null)", () => {
    expect(normaliseCheckRegion(null)).toBeNull();
    expect(normaliseCheckRegion(undefined)).toBeNull();
    expect(normaliseCheckRegion("")).toBeNull();
    expect(normaliseCheckRegion("  ")).toBeNull();
    expect(normaliseCheckRegion("XX")).toBeNull();
    expect(normaliseCheckRegion("UK")).toBeNull();
    expect(normaliseCheckRegion(42)).toBeNull();
  });

  it("uses a storage key in the vg_ namespace", () => {
    expect(CHECK_REGION_STORAGE_KEY.startsWith("vg_")).toBe(true);
  });

  it("keeps the pre-rename key in the jcm_ namespace for legacy reads", () => {
    expect(LEGACY_CHECK_REGION_STORAGE_KEY.startsWith("jcm_")).toBe(true);
    expect(LEGACY_CHECK_REGION_STORAGE_KEY).not.toBe(CHECK_REGION_STORAGE_KEY);
  });
});

describe("stored check region — persistence round-trip", () => {
  // Node environment has no window; install a minimal localStorage mock so the
  // read/write paths (not just the pure normaliser) are exercised.
  const hadWindow = "__JCM_HAD_WINDOW__";
  let store: Map<string, string>;

  function installMockStorage() {
    store = new Map<string, string>();
    (globalThis as Record<string, unknown>)[hadWindow] =
      "window" in globalThis ? (globalThis as Record<string, unknown>).window : undefined;
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
          setItem: (k: string, v: string) => void store.set(k, v),
          removeItem: (k: string) => void store.delete(k),
        },
      },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    const prev = (globalThis as Record<string, unknown>)[hadWindow];
    if (prev === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prev;
    delete (globalThis as Record<string, unknown>)[hadWindow];
  });

  it("reads auto when nothing is stored", () => {
    installMockStorage();
    expect(readStoredCheckRegion()).toBeNull();
  });

  it("round-trips an explicit choice", () => {
    installMockStorage();
    writeStoredCheckRegion("gb");
    expect(store.get(CHECK_REGION_STORAGE_KEY)).toBe("GB");
    expect(readStoredCheckRegion()).toBe("GB");
  });

  it("removes the key when returning to auto", () => {
    installMockStorage();
    writeStoredCheckRegion("AU");
    writeStoredCheckRegion(null);
    expect(store.has(CHECK_REGION_STORAGE_KEY)).toBe(false);
    expect(readStoredCheckRegion()).toBeNull();
  });

  it("degrades a stale stored code to auto rather than pinning it", () => {
    installMockStorage();
    store.set(CHECK_REGION_STORAGE_KEY, "XX");
    expect(readStoredCheckRegion()).toBeNull();
  });
});

describe("stored check region — legacy jcm_ migration", () => {
  const hadWindow = "__VG_HAD_WINDOW__";
  let store: Map<string, string>;

  function installMockStorage() {
    store = new Map<string, string>();
    (globalThis as Record<string, unknown>)[hadWindow] =
      "window" in globalThis ? (globalThis as Record<string, unknown>).window : undefined;
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
          setItem: (k: string, v: string) => void store.set(k, v),
          removeItem: (k: string) => void store.delete(k),
        },
      },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    const prev = (globalThis as Record<string, unknown>)[hadWindow];
    if (prev === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prev;
    delete (globalThis as Record<string, unknown>)[hadWindow];
  });

  it("falls back to the legacy key when the new one is absent", () => {
    installMockStorage();
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "GB");
    expect(readStoredCheckRegion()).toBe("GB");
  });

  it("does not write the value forward — the legacy key survives a read", () => {
    installMockStorage();
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "GB");

    readStoredCheckRegion();

    // The no-write-back guarantee: a read must not migrate the value, so an
    // older cached bundle that only knows jcm_region still finds it.
    expect(store.get(LEGACY_CHECK_REGION_STORAGE_KEY)).toBe("GB");
    expect(store.has(CHECK_REGION_STORAGE_KEY)).toBe(false);
  });

  it("prefers the new key when both are present", () => {
    installMockStorage();
    store.set(CHECK_REGION_STORAGE_KEY, "AU");
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "GB");
    expect(readStoredCheckRegion()).toBe("AU");
  });

  it("degrades a stale legacy code to auto", () => {
    installMockStorage();
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "XX");
    expect(readStoredCheckRegion()).toBeNull();
  });

  it("clearing to auto also clears the legacy key, so it cannot resurface", () => {
    installMockStorage();
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "GB");

    writeStoredCheckRegion(null);

    expect(store.has(LEGACY_CHECK_REGION_STORAGE_KEY)).toBe(false);
    expect(readStoredCheckRegion()).toBeNull();
  });

  it("an explicit choice wins over a legacy value on the next read", () => {
    installMockStorage();
    store.set(LEGACY_CHECK_REGION_STORAGE_KEY, "GB");

    writeStoredCheckRegion("AU");

    expect(readStoredCheckRegion()).toBe("AU");
  });
});
