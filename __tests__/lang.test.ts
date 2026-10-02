import { describe, it, expect } from "vitest";
import {
  translate,
  parseLocale,
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";
import {
  readStoredLangRaw,
  LANG_STORAGE_KEY,
  LEGACY_LANG_STORAGE_KEY,
} from "@/lib/lang";
import enMessages from "@/messages/en.json";
import { checkUrl } from "@veriguard/detect/scamDetector";

describe("translate", () => {
  it("returns the base-locale string", () => {
    expect(translate("en", "check.report")).toBe("Report this scam");
  });

  it("resolves every key from the base bundle", () => {
    // en.json is the only bundle and must answer every key on its own.
    // Asserted against the bundle rather than copy literals: the claim is
    // about lookup, not wording.
    expect(translate("en", "check.uploadImage")).toBe(enMessages["check.uploadImage"]);
  });

  it("falls back to the raw key when it exists in no dictionary", () => {
    const missing = "totally.unknown.key" as MessageKey;
    expect(translate("en", missing)).toBe("totally.unknown.key");
  });

  it("interpolates {placeholder} tokens from vars", () => {
    // No shipped message has tokens yet, so exercise interpolation via the
    // raw-key fallback path (translate interpolates whatever string resolves).
    const key = "Hi {name}, you have {count} alerts" as MessageKey;
    expect(translate("en", key, { name: "Alex", count: 3 })).toBe(
      "Hi Alex, you have 3 alerts",
    );
  });

  it("leaves token-free strings untouched when vars are passed", () => {
    expect(translate("en", "check.submit", { unused: "x" })).toBe(
      translate("en", "check.submit"),
    );
  });

  it("resolves an unknown locale via the base locale rather than the raw key", () => {
    // A stale cached bundle can ask for a locale this build no longer ships.
    // It must land on real copy, not a raw key.
    const odd = "fr" as unknown as Locale;
    expect(translate(odd, "check.report")).toBe("Report this scam");
  });
});

describe("parseLocale", () => {
  it("reads a stored locale", () => {
    expect(parseLocale("en")).toBe("en");
  });

  it("reads the legacy locale:tone form as its locale", () => {
    // Returning users hold "en:normal" (or the retired "en:regional") from
    // when the copy was keyed on a second, tone axis.
    expect(parseLocale("en:normal")).toBe("en");
    expect(parseLocale("en:regional")).toBe("en");
  });

  it("resolves the legacy single-axis values to the default", () => {
    // "aussie" and "normal" predate the locale/tone split. Neither names a
    // locale, so both resolve to the default — a read, not a rewrite.
    expect(parseLocale("aussie")).toBe(DEFAULT_LOCALE);
    expect(parseLocale("normal")).toBe(DEFAULT_LOCALE);
  });

  it("defaults when the stored value is absent", () => {
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
    expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(parseLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("defaults when the locale is not shipped", () => {
    expect(parseLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(parseLocale("de:normal")).toBe(DEFAULT_LOCALE);
  });

  it("degrades malformed values rather than throwing", () => {
    expect(parseLocale("garbage")).toBe(DEFAULT_LOCALE);
    expect(parseLocale("::::")).toBe(DEFAULT_LOCALE);
  });

  it("never rewrites storage on read, so a withdrawn locale can come back", () => {
    // parseLocale is pure — the stored string is untouched, so if that locale
    // ships again the user's original preference resumes working.
    const stored = "fr";
    expect(parseLocale(stored)).toBe(DEFAULT_LOCALE);
    expect(stored).toBe("fr");
  });

  it("round-trips every shipped locale, which is stored as-is", () => {
    for (const locale of ["en"] as const) {
      expect(parseLocale(locale)).toBe(locale);
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

  it("hands the pre-split legacy value through to parseLocale", () => {
    // The two migrations compose: an old key holding an older-still value.
    // "aussie" predates the locale/tone split and selected a register that has
    // since been retired, so a user who set it before any of this lands on the
    // default locale — with real copy, not a raw key.
    const s = fakeStorage({ [LEGACY_LANG_STORAGE_KEY]: "aussie" });
    const locale = parseLocale(readStoredLangRaw(s));
    expect(locale).toBe(DEFAULT_LOCALE);
    expect(translate(locale, "check.report")).toBe("Report this scam");
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
    const bundle = JSON.stringify(enMessages);
    for (const pattern of RETIRED) {
      expect(bundle).not.toMatch(pattern);
    }
  });
});
