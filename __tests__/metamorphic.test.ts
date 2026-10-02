// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { TRANSFORMS } from "@/eval/metamorphic";
import { formatSummary, type MetamorphicResult, type Violation } from "@/eval/metamorphicRunner";
import { REGION_NEUTRAL, OPEN_SUFFIX_PROBES } from "@/eval/regionRelations";
import { overallCoverage } from "@/lib/verdictSummary";
import type { EvalCase } from "@/eval/schema";

// The metamorphic suite gates detection changes, so it needs its own coverage
// for the same reason evalHarness.test.ts does: a transform that silently
// no-ops, or a comparison that never fires, would report a clean run while
// checking nothing. These are unit tests of the harness — the suite itself runs
// via `npm run eval:metamorphic`, deliberately outside vitest.

const c = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: "t-1", type: "sms", region: "AU", content: "hello", label: "scam",
  source: "test", addedAt: "2026-09-02", ...over,
});

const byId = (id: string) => {
  const t = TRANSFORMS.find((x) => x.id === id);
  if (!t) throw new Error(`no transform ${id}`);
  return t;
};

describe("transform registry", () => {
  it("has unique ids", () => {
    const ids = TRANSFORMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never returns the input unchanged when it claims to apply", () => {
    // A transform returning its input is indistinguishable from a passing
    // check, which is the failure mode that would quietly hollow out the suite.
    const samples = [
      c({ content: "Call 0412 345 678 about your parcel at https://evil-post.tk/x now" }),
      c({ content: "Your account is suspended, verify at https://bank-secure.cyou/login", type: "url" }),
      c({ content: "Hi Mum, I dropped my phone, can you transfer $850 today?" }),
    ];
    for (const t of TRANSFORMS) {
      for (const s of samples) {
        if (!t.applies(s)) continue;
        const out = t.apply(s.content);
        if (out !== null) expect(out, `${t.id} returned input unchanged`).not.toBe(s.content);
      }
    }
  });
});

describe("meaning-preserving transforms", () => {
  it("phone-e164 rewrites an AU number without touching surrounding text", () => {
    const out = byId("phone-e164").apply("Call 0412 345 678 today");
    expect(out).toBe("Call +61 412 345 678 today");
  });

  it("host-case changes only the host, leaving the path alone", () => {
    const out = byId("host-case").apply("go to https://example.com.au/MyPath now");
    expect(out).toMatch(/\/MyPath now$/);
    expect(out).not.toBe("go to https://example.com.au/MyPath now");
  });

  it("host-trailing-dot does not double an existing trailing dot", () => {
    expect(byId("host-trailing-dot").apply("https://a.com./x")).toBeNull();
  });

  it("url-tracking-params joins with & when a query already exists", () => {
    const out = byId("url-tracking-params").apply("https://a.com/x?id=1");
    expect(out).toContain("?id=1&utm_source=");
  });
});

describe("obfuscation transforms", () => {
  it("cyrillic-homoglyph swaps exactly one character, keeping the host recognisable", () => {
    const out = byId("cyrillic-homoglyph").apply("https://commbank.com/x") ?? "";
    const host = out.split("/")[2];
    expect(host).toMatch(/[Ѐ-ӿ]/);
    // One substitution only — a wholesale swap tests nothing, since no
    // allowlist would match a string sharing no ASCII with the original.
    expect([...host].filter((ch) => /[Ѐ-ӿ]/.test(ch)).length).toBe(1);
  });

  it("cyrillic-homoglyph leaves the path untouched", () => {
    const out = byId("cyrillic-homoglyph").apply("https://commbank.com/pay") ?? "";
    expect(out.endsWith("/pay")).toBe(true);
  });

  it("zero-width inserts an invisible character inside a word", () => {
    const out = byId("zero-width").apply("your account is suspended") ?? "";
    expect(out).toContain("​");
    expect(out.replace(/​/g, "")).toBe("your account is suspended");
  });

  it("benign-padding keeps the original content verbatim", () => {
    const original = "verify now at evil.tk";
    expect(byId("benign-padding").apply(original)).toContain(original);
  });

  it("defanged preserves the scheme's own s", () => {
    // Rewriting http:// as hxxps:// asks refang to restore a URL carrying TLS
    // where the original had none, and the engine is right to score those
    // apart — "No HTTPS" is a real signal about the plain-http original. The
    // relation only holds if both strings mean the same thing.
    expect(byId("defanged").apply("http://a.tk/x")).toBe("hxxp://a[.]tk/x");
    expect(byId("defanged").apply("https://a.tk/x")).toBe("hxxps://a[.]tk/x");
  });

  it("defanged handles mixed schemes in one message", () => {
    expect(byId("defanged").apply("visit http://a.tk and https://b.tk")).toBe(
      "visit hxxp://a[.]tk and hxxps://b[.]tk",
    );
  });

  it("fullwidth-digits rewrites a phone number's digits", () => {
    expect(byId("fullwidth-digits").apply("call 0412 345 678")).toBe("call ０４１２３４５６７８");
  });

  it("fullwidth-digits leaves digits outside a phone number alone", () => {
    // Rewriting every digit also mutated hostnames and paths, so a violation
    // could not be attributed to the transformation under test.
    const out = byId("fullwidth-digits").apply("Track at bit.ly/3xYz9 or call 0412 345 678") ?? "";
    expect(out).toContain("bit.ly/3xYz9");
  });
});

describe("applicability gates", () => {
  it("skips phone transforms on cases with no phone number", () => {
    expect(byId("phone-e164").applies(c({ content: "no numbers here" }))).toBe(false);
  });

  it("matches landline grouping as well as mobile", () => {
    // 0X XXXX XXXX and 04XX XXX XXX are both ordinary AU forms; a pattern that
    // only knows one silently skips half the corpus.
    expect(byId("phone-e164").applies(c({ content: "ring 03 9876 5432 now" }))).toBe(true);
    expect(byId("phone-e164").apply("ring 03 9876 5432 now")).toBe("ring +61 398 765 432 now");
  });

  it("leaves digit runs that are not phone numbers alone", () => {
    expect(byId("phone-e164").apply("order 0000 1111 2222 3333")).toBeNull();
  });

  it("re-tests cleanly, so a global regex's lastIndex cannot leak between cases", () => {
    // AU_LOCAL is a /g regex shared across calls; a stale lastIndex would make
    // applies() alternate true/false on identical input and silently halve the
    // checks that run.
    const withPhone = c({ content: "Call 0412 345 678 now" });
    for (let i = 0; i < 4; i++) expect(byId("phone-e164").applies(withPhone)).toBe(true);
  });

  it("skips body-text transforms on url-typed cases", () => {
    expect(byId("zero-width").applies(c({ type: "url", content: "https://evil.tk/verify" }))).toBe(false);
  });
});

describe("formatSummary", () => {
  const result = (over: Partial<MetamorphicResult> = {}): MetamorphicResult => ({
    violations: [], applied: new Map(), skipped: new Map(), ...over,
  });

  it("marks a transform that never applied rather than showing it as passing", () => {
    const out = formatSummary(result({ skipped: new Map([["phone-e164", 3]]) }));
    expect(out).toContain("never applied");
  });

  it("reports the violation count against the checks that actually ran", () => {
    const v = { transform: "zero-width" } as Violation;
    const out = formatSummary(result({ applied: new Map([["zero-width", 4]]), violations: [v] }));
    expect(out).toMatch(/zero-width.*4.*1.*25\.0%/);
  });
});

// ── Region relations ─────────────────────────────────────────────────────────
//
// Same reasoning as the transform registry above: these relations gate
// detection changes, so a fixture set that quietly emptied out, or a comparison
// that never fires, would report a clean run while checking nothing.

describe("region relation fixtures", () => {
  it("carries region-neutral fixtures", () => {
    expect(REGION_NEUTRAL.length).toBeGreaterThan(0);
  });

  it("has unique fixture ids", () => {
    const ids = [...REGION_NEUTRAL.map((f) => f.id), ...OPEN_SUFFIX_PROBES.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps region-neutral fixtures free of national signal", () => {
    // The fixtures only mean something if they are genuinely neutral. A
    // currency symbol, a national phone number or a country TLD in one of these
    // would make a legitimate regional difference look like a leak — the
    // fixture would be the bug, and it would be reported against the engine.
    const NATIONAL = /[£€$¥]|\+\d{1,3}\s?\d|\.(au|uk|nz|ca|ie|sg)\b/i;
    for (const f of REGION_NEUTRAL) {
      expect(NATIONAL.test(f.content), `${f.id} carries a national signal`).toBe(false);
    }
  });

  it("probes open suffixes, never restricted ones", () => {
    // The probe asserts a pack must NOT exempt the suffix. Pointing one at a
    // genuinely restricted suffix (.gov.uk, .gov.sg) would assert the opposite
    // of the rule and fail on correct packs.
    for (const p of OPEN_SUFFIX_PROBES) {
      expect(p.content, `${p.id} probes a restricted suffix`).not.toMatch(
        /\.(gov|nhs|edu|gc)\./i,
      );
    }
  });

  it("ranks coverage with minimal below partial", () => {
    // Asserted against overallCoverage itself, not a copy of its ranking. An
    // earlier version compared a local constant that mirrored it, which could
    // not detect the drift its own comment claimed to guard against — the real
    // ranking could be reordered and this stayed green.
    const at = (coverage: string) =>
      [{ result: { verdict: "safe", score: 0, flags: [], details: "", category: "SMS", coverage } }] as never;
    const weakest = (a: string, b: string) => overallCoverage([...at(a), ...at(b)] as never);

    expect(weakest("full", "partial")).toBe("partial");
    expect(weakest("partial", "minimal")).toBe("minimal");
    expect(weakest("minimal", "none")).toBe("none");
  });
});
