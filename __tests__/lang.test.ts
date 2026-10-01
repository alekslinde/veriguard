import { describe, it, expect } from "vitest";
import {
  translate,
  parseMode,
  serialiseMode,
  DEFAULT_MODE,
  type LangMode,
  type MessageKey,
} from "@/lib/i18n";
import {
  readStoredLangRaw,
  LANG_STORAGE_KEY,
  LEGACY_LANG_STORAGE_KEY,
} from "@/lib/lang";
import enNormal from "@/messages/en.normal.json";
import { checkUrl } from "@veriguard/detect/scamDetector";

const NORMAL: LangMode = { locale: "en", tone: "normal" };

describe("translate", () => {
  it("returns the base-tone string", () => {
    expect(translate(NORMAL, "check.report")).toBe("Report this scam");
  });

  it("resolves every key from the base bundle", () => {
    // The regional register is retired, so the base bundle is the only dictionary
    // and must answer every key on its own. Asserted against the bundle rather
    // than copy literals: the claim is about lookup, not wording.
    expect(translate(NORMAL, "check.uploadImage")).toBe(enNormal["check.uploadImage"]);
  });

  it("falls back to the raw key when it exists in no dictionary", () => {
    const missing = "totally.unknown.key" as MessageKey;
    expect(translate(NORMAL, missing)).toBe("totally.unknown.key");
  });

  it("interpolates {placeholder} tokens from vars", () => {
    // No shipped message has tokens yet, so exercise interpolation via the
    // raw-key fallback path (translate interpolates whatever string resolves).
    const key = "Hi {name}, you have {count} alerts" as MessageKey;
    expect(translate(NORMAL, key, { name: "Alex", count: 3 })).toBe(
      "Hi Alex, you have 3 alerts",
    );
  });

  it("leaves token-free strings untouched when vars are passed", () => {
    expect(translate(NORMAL, "check.submit", { unused: "x" })).toBe(
      translate(NORMAL, "check.submit"),
    );
  });

  it("resolves an unknown tone via the base tone rather than the raw key", () => {
    // Still load-bearing after the retirement: a returning user can hold
    // "en:regional" in storage, and a stale cached bundle can ask for a tone
    // this build no longer ships. Either must land on real copy, not a raw key.
    const odd = { locale: "en", tone: "shouty" } as unknown as LangMode;
    expect(translate(odd, "check.report")).toBe("Report this scam");
    const retired = { locale: "en", tone: "regional" } as unknown as LangMode;
    expect(translate(retired, "check.report")).toBe("Report this scam");
  });
});

describe("parseMode", () => {
  it("resolves the legacy 'aussie' value to the one shipped tone", () => {
    // Returning users have this literal string in localStorage from before the
    // locale/tone split. The register it selected is retired, so it resolves to
    // the default rather than to a tone that no longer exists — a read, not a
    // rewrite, so the stored string itself is left alone.
    expect(parseMode("aussie")).toEqual(DEFAULT_MODE);
  });

  it("migrates the legacy 'normal' value to the default mode", () => {
    expect(parseMode("normal")).toEqual(DEFAULT_MODE);
  });

  it("parses the serialised locale:tone form", () => {
    expect(parseMode("en:normal")).toEqual(NORMAL);
    expect(parseMode("en:normal")).toEqual(NORMAL);
  });

  it("defaults when the stored value is absent", () => {
    expect(parseMode(null)).toEqual(DEFAULT_MODE);
    expect(parseMode(undefined)).toEqual(DEFAULT_MODE);
    expect(parseMode("")).toEqual(DEFAULT_MODE);
  });

  it("degrades an unknown tone to the base tone, keeping the locale", () => {
    expect(parseMode("en:shouty")).toEqual(NORMAL);
  });

  it("discards the tone too when the locale is unknown", () => {
    // Tone is only meaningful relative to its locale: someone returning with a
    // stored "fr:regional" after French is withdrawn should get plain English,
    // not English in a regional register they never picked for this language.
    expect(parseMode("fr:regional")).toEqual(DEFAULT_MODE);
    expect(parseMode("de:normal")).toEqual(DEFAULT_MODE);
  });

  it("degrades malformed values rather than throwing", () => {
    expect(parseMode("garbage")).toEqual(DEFAULT_MODE);
    expect(parseMode("::::")).toEqual(DEFAULT_MODE);
  });

  it("never rewrites storage on read, so a withdrawn locale can come back", () => {
    // parseMode is pure — the stored string is untouched, so if that locale
    // ships again the user's original preference resumes working.
    const stored = "fr:regional";
    expect(parseMode(stored)).toEqual(DEFAULT_MODE);
    expect(stored).toBe("fr:regional");
  });

  it("round-trips every shipped mode through serialise → parse", () => {
    for (const mode of [NORMAL]) {
      expect(parseMode(serialiseMode(mode))).toEqual(mode);
    }
  });
});

describe("stored language — legacy jcm_ migration", () => {
  // Mirrors the checkRegion migration suite. readStoredLangRaw takes the storage
  // it reads, so these exercise the real fallback without a DOM: the provider is
  // a client component and this suite runs under `environment: "node"`.
  function fakeStorage(entries: Record<string, string> = {}) {
    const map = new Map(Object.entries(entries));
    return {
      map,
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    };
  }

  it("uses a storage key in the vg_ namespace", () => {
    expect(LANG_STORAGE_KEY.startsWith("vg_")).toBe(true);
  });

  it("keeps the pre-rename key in the jcm_ namespace for legacy reads", () => {
    expect(LEGACY_LANG_STORAGE_KEY.startsWith("jcm_")).toBe(true);
    expect(LEGACY_LANG_STORAGE_KEY).not.toBe(LANG_STORAGE_KEY);
  });

  it("reads the new key when it is present", () => {
    const s = fakeStorage({ [LANG_STORAGE_KEY]: "en:regional" });
    expect(readStoredLangRaw(s)).toBe("en:regional");
  });

  it("falls back to the legacy key when the new one is absent", () => {
    const s = fakeStorage({ [LEGACY_LANG_STORAGE_KEY]: "en:regional" });
    expect(readStoredLangRaw(s)).toBe("en:regional");
  });

  it("does not write the value forward — the legacy key survives a read", () => {
    const s = fakeStorage({ [LEGACY_LANG_STORAGE_KEY]: "en:regional" });

    readStoredLangRaw(s);

    // The no-write-back guarantee: an older cached bundle that only knows
    // jcm_lang must still find the preference where it left it.
    expect(s.map.get(LEGACY_LANG_STORAGE_KEY)).toBe("en:regional");
    expect(s.map.has(LANG_STORAGE_KEY)).toBe(false);
  });

  it("prefers the new key when both are present", () => {
    const s = fakeStorage({
      [LANG_STORAGE_KEY]: "en:normal",
      [LEGACY_LANG_STORAGE_KEY]: "en:regional",
    });
    expect(readStoredLangRaw(s)).toBe("en:normal");
  });

  it("reads null when neither key is set", () => {
    expect(readStoredLangRaw(fakeStorage())).toBeNull();
  });

  it("hands the pre-split legacy value through to parseMode", () => {
    // The two migrations compose: an old key holding an older-still value.
    // "aussie" predates the locale/tone split and selected a register that has
    // since been retired, so a user who set it before any of this lands on the
    // one shipped tone — with real copy, not a raw key.
    const s = fakeStorage({ [LEGACY_LANG_STORAGE_KEY]: "aussie" });
    const mode = parseMode(readStoredLangRaw(s));
    expect(mode).toEqual(DEFAULT_MODE);
    expect(translate(mode, "check.report")).toBe("Report this scam");
  });
});

// ── The retired register must not survive outside the message bundles ────────
//
// The locale/tone split (e5ee74b) retired the regional register and deleted
// en.regional.json, but four strings in the engine's scoreToResult still read
// "Crikey", "scam vibes" and "keep your wits about ya" — they went unnoticed
// because CheckResult.details is deliberately not rendered by VerdictBadge,
// so the copy was live in the engine's public output and invisible on screen.
//
// lang.test.ts already guards the bundles; nothing guarded copy the engine
// emits directly, which is precisely why that was the place it survived.
describe("retired regional register", () => {
  const RETIRED = [
    /\bcrikey\b/i,
    /\bmate\b/i,
    /\bdodgy\b/i,
    /\bsus\b/i,
    /scam vibes/i,
    /wits about ya/i,
    /she'?s apples/i,
    /\bsquiz\b/i,
  ];

  // Every band of scoreToResult, reached through the public entrypoints.
  const cases: Array<[string, () => { details: string }]> = [
    ["safe", () => checkUrl("https://www.commbank.com.au")],
    ["suspicious", () => checkUrl("https://bit.ly/safe")],
    ["likely_scam", () => checkUrl("https://commbank-phish.net")],
    ["high", () => checkUrl("http://commbank-secure-login.tk/verify")],
  ];

  it.each(cases)("%s verdict details carry no regional slang", (_band, run) => {
    const { details } = run();
    for (const pattern of RETIRED) {
      expect(details).not.toMatch(pattern);
    }
  });

  it("the shipped message bundle carries none either", () => {
    const bundle = JSON.stringify(enNormal);
    for (const pattern of RETIRED) {
      expect(bundle).not.toMatch(pattern);
    }
  });
});
