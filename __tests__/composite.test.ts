import { describe, it, expect } from "vitest";
import {
  sampleComposites,
  weakestRelation,
  applyStack,
  mulberry32,
} from "@/eval/composite";
import { formatCompositeSummary, type CompositeResult } from "@/eval/metamorphicRunner";
import { TRANSFORMS } from "@/eval/metamorphic";
import type { EvalCase } from "@/eval/schema";

// Unit tests for the composite harness, for the same reason metamorphic.test.ts
// and evalHarness.test.ts exist: a sampler that returned nothing, or a stack
// runner that silently shortened a stack, would report a clean run while
// checking far less than its output claims. The suite itself runs via
// `npm run eval:metamorphic`, outside vitest.

const c = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: "t-1", type: "sms", region: "AU", content: "hello", label: "scam",
  source: "test", addedAt: "2026-09-09", ...over,
});

const byId = (id: string) => {
  const t = TRANSFORMS.find((x) => x.id === id);
  if (!t) throw new Error(`no transform ${id}`);
  return t;
};

describe("weakestRelation", () => {
  it("keeps equal only when every member is equal", () => {
    expect(weakestRelation([byId("host-case"), byId("defanged")])).toBe("equal");
  });

  it("relaxes to noWeaker if any member is noWeaker", () => {
    expect(weakestRelation([byId("host-case"), byId("zero-width")])).toBe("noWeaker");
    expect(weakestRelation([byId("zero-width"), byId("host-case")])).toBe("noWeaker");
  });
});

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sampleComposites", () => {
  it("is reproducible for a seed", () => {
    const a = sampleComposites(20, [2, 3], 5).map((x) => x.id);
    const b = sampleComposites(20, [2, 3], 5).map((x) => x.id);
    expect(a).toEqual(b);
  });

  it("produces distinct stacks", () => {
    const ids = sampleComposites(40, [2, 3], 1).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("respects the requested depths", () => {
    for (const comp of sampleComposites(40, [2, 3], 3)) {
      expect([2, 3]).toContain(comp.members.length);
    }
  });

  it("never repeats a transform within a stack", () => {
    for (const comp of sampleComposites(60, [2, 3, 4], 9)) {
      const ids = comp.members.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("terminates when the space is smaller than the request", () => {
    // Two transforms admit exactly two ordered depth-2 stacks. Asking for 50
    // must return 2 rather than spinning.
    const pool = [byId("host-case"), byId("defanged")];
    const got = sampleComposites(50, [2], 1, pool);
    expect(got.length).toBe(2);
  });

  it("records the order in the id, since order changes the string", () => {
    const pool = [byId("host-case"), byId("defanged")];
    const ids = sampleComposites(50, [2], 1, pool).map((x) => x.id).sort();
    expect(ids).toEqual(["defanged+host-case", "host-case+defanged"]);
  });
});

describe("applyStack", () => {
  const url = "Pay now at http://auspost-redelivery.tk/pay before 5pm.";

  it("applies members in order and reports the steps", () => {
    const comp = {
      id: "x", members: [byId("host-case"), byId("url-tracking-params")],
      relation: "equal" as const,
    };
    const out = applyStack(c({ content: url, type: "url" }), comp);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.steps).toEqual(["host-case", "url-tracking-params"]);
      expect(out.content).not.toBe(url);
      expect(out.content).toContain("utm_source");
    }
  });

  it("abandons the stack when a step does not apply", () => {
    // No phone number in the content, so the phone reformatter cannot run.
    const comp = {
      id: "x", members: [byId("host-case"), byId("phone-e164")],
      relation: "equal" as const,
    };
    const out = applyStack(c({ content: url, type: "url" }), comp);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("not-applicable");
      expect(out.failedAt).toBe("phone-e164");
    }
  });

  it("abandons rather than shortening when a step no-ops", () => {
    // Applying the same transform twice: the second finds nothing left to do.
    const comp = {
      id: "x", members: [byId("host-trailing-dot"), byId("host-trailing-dot")],
      relation: "equal" as const,
    };
    const out = applyStack(c({ content: url, type: "url" }), comp);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("no-op");
  });

  it("re-checks applicability against the running content, not the original", () => {
    // The regression this guards: benign-padding excludes cases carrying email
    // headers, but an SMS case acquires them mid-stack once forwarded-prefix
    // has run. Checking `applies` against the ORIGINAL case would wave that
    // through and pad above a From: line — which drops the header-derived
    // impersonation signal and reports an evasion that never happened.
    const fwd = byId("forwarded-prefix");
    const pad = byId("benign-padding");
    const sms = c({ content: "Scan the QR code to verify your myGov account" });

    // Both apply to the untransformed case...
    expect(fwd.applies(sms)).toBe(true);
    expect(pad.applies(sms)).toBe(true);

    // ...but padding must not apply once the forward wrapper is on.
    const forwarded = fwd.apply(sms.content);
    expect(forwarded).not.toBeNull();
    expect(pad.applies({ ...sms, content: forwarded as string })).toBe(false);

    const out = applyStack(sms, {
      id: "x", members: [fwd, pad], relation: "noWeaker" as const,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failedAt).toBe("benign-padding");
  });
});

describe("benign-padding header guard", () => {
  const pad = byId("benign-padding");

  it("excludes headers wherever they start, not only at index 0", () => {
    for (const header of ["From", "Reply-To", "Return-Path", "Sender"]) {
      expect(pad.applies(c({ content: `${header}: a@b.tk\n\nhi` }))).toBe(false);
      expect(
        pad.applies(c({ content: `----- Forwarded message -----\n${header}: a@b.tk\n\nhi` })),
      ).toBe(false);
    }
  });

  it("still applies to ordinary prose that merely contains a colon", () => {
    expect(pad.applies(c({ content: "Reminder: your parcel is held." }))).toBe(true);
  });
});

describe("formatCompositeSummary", () => {
  /** A result with `violating` violating stacks and `clean` clean ones. */
  const build = (violating: number, clean: number): CompositeResult => {
    const violations = Array.from({ length: violating }, (_, i) => ({
      caseId: `c-${i}`, stack: `v-${i}`, steps: [], relation: "noWeaker" as const,
      region: "AU",
      before: { prediction: "flagged", score: 80, verdict: "likely_scam", coverage: "full" },
      after: { prediction: "clean", score: 10, verdict: "safe", coverage: "full" },
      transformed: "x", original: "y",
    })) as unknown as CompositeResult["violations"];
    const applied = new Map<string, number>();
    for (let i = 0; i < violating; i++) applied.set(`v-${i}`, 3);
    for (let i = 0; i < clean; i++) applied.set(`ok-${i}`, 3);
    return { violations, applied, abandoned: new Map(), seed: 1, stacks: violating + clean };
  };

  it("never describes a truncated violating stack as clean", () => {
    // 30 violating > the 25-row cap, so 5 fall past the cut. Counting those in
    // a "no violation" tail contradicts the TOTAL row, and the weekly
    // --stacks=400 --depth=2,3,4 run is exactly where the cap is exceeded.
    const out = formatCompositeSummary(build(30, 5));
    expect(out).toContain("5 further VIOLATING stack(s) not shown");
    expect(out).toContain("5 exercised stack(s) with no violation");
    expect(out).not.toContain("10 further stack(s) with no violation");
  });

  it("reports the clean tail alone when nothing is truncated", () => {
    const out = formatCompositeSummary(build(2, 7));
    expect(out).not.toContain("VIOLATING stack(s) not shown");
    expect(out).toContain("7 exercised stack(s) with no violation");
  });

  it("says so plainly when no stack violated", () => {
    const out = formatCompositeSummary(build(0, 4));
    expect(out).toContain("(no stack violated)");
    expect(out).toContain("4 exercised stack(s) with no violation");
  });

  it("keeps the shown violations consistent with the total", () => {
    const out = formatCompositeSummary(build(30, 5));
    const shown = out.split("\n").filter((l) => l.trimEnd().endsWith("←")).length;
    const hidden = Number(/(\d+) further VIOLATING/.exec(out)?.[1] ?? 0);
    expect(shown + hidden).toBe(30);
  });
});
