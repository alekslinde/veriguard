// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  CHANNELS,
  SIGNALS,
  duplicateIds,
  missingReads,
  registryProblems,
  registryScore,
  runsOn,
  signalInventory,
  undeclaredWeights,
  unsatisfiableReads,
  weightFor,
  type Channel,
  type Context,
  type SignalDef,
} from "@veriguard/detect/signalRegistry";
import { resolveRegionPack } from "@veriguard/detect/regions";
import { parseEmailHeaders } from "@veriguard/detect/emailHeaders";
import { analysePhone } from "@veriguard/detect/phoneIntel";
import { checkPhone, checkSms, checkEmail, checkUrl, checkCustom } from "@veriguard/detect/scamDetector";

// Step 1 of the registry extraction: the types and the scorer exist, and
// nothing consumes them. Two things need asserting at this stage, and they pull
// in opposite directions:
//
//   · The shape behaves — weighting, channel gating and the inventory are what
//     later steps rest on, so they get pinned before anything is converted.
//   · The engine does not move. An empty registry contributing nothing is the
//     property that makes this step safe to ship, and "empty" is only a
//     guarantee while a test says so.
//
// The second is why the registry is empty rather than partly populated: a
// signal present both here and in scamDetector.ts would score twice.

const ctx = (over: Partial<Context> = {}): Context => ({
  channel: "sms",
  pack: resolveRegionPack("AU"),
  original: "Your account has been suspended",
  body: "your account has been suspended",
  words: ["your", "account", "has", "been", "suspended"],
  ...over,
});

/** A signal that always fires, so weighting and gating are what varies. */
const fires = (over: Partial<SignalDef> = {}): SignalDef => ({
  id: "test.fires",
  reads: ["body"],
  channels: "all",
  weight: 10,
  kind: "structural",
  evaluate: () => [{ text: "fired", source: "message" }],
  ...over,
});

describe("the registry holds what has been converted, and only that", () => {
  it("holds the phone channel", () => {
    // Step 1's "is empty" assertion lived here and was deleted by this
    // conversion — deliberately and visibly, as that test's own comment said
    // it would be. What replaces it is the invariant that actually matters
    // from here on: each channel's signals are registered exactly when their
    // inline sites are gone.
    expect(SIGNALS.length).toBeGreaterThan(0);
    expect(SIGNALS.every((d) => d.channels !== "all" && d.channels.includes("phone"))).toBe(true);
  });

  it("scores nothing on a channel not yet converted", () => {
    // url, sms, email and custom are still scored inline, so the registry must
    // contribute nothing there or every signal it holds would score twice —
    // the one way this refactor can silently change a verdict.
    for (const channel of ["url", "sms", "email", "custom"] as const) {
      expect(registryScore(ctx({ channel })), `${channel} is scored inline`).toEqual([]);
    }
  });

  it("has no phone signal left scoring inline", async () => {
    // The other half of the same invariant, asserted against the source: a
    // converted rule deleted from the registry's side but left in the scorer
    // would pass every behavioural test here while scoring from the old path.
    const { readFileSync } = await import("fs");
    const src = readFileSync("packages/detect/src/scamDetector.ts", "utf8");
    const phoneChecker = src.slice(src.indexOf("export function checkPhone"));
    const body = phoneChecker.slice(0, phoneChecker.indexOf("\n}"));
    for (const fragment of [
      "Premium rate number",
      "VoIP / virtual number",
      "Wangiri scam",
      "frequently used as a base for scam operations",
      "Free-call numbers are routinely spoofed",
      "Shared-cost numbers are commonly spoofed",
      "Fixed-line area code",
    ]) {
      expect(body, `checkPhone still scores "${fragment}" inline`).not.toContain(fragment);
    }
  });

  it("leaves every entry point's verdict untouched", () => {
    // A belt-and-braces no-op check against the four surfaces. Fixed inputs
    // with pinned scores, so a future step that changes one of these has to
    // say so here rather than in a diff nobody reads.
    expect(checkPhone("1900 123 456", "AU").score).toBe(95);
    expect(checkSms("Your parcel is held, pay the fee at http://auspost-fee.tk", undefined, "AU").verdict)
      .toBe("likely_scam");
    expect(checkUrl("https://ato.gov.au/mytax", undefined, "AU").verdict).toBe("safe");
    expect(checkEmail("From: a@b.invalid\nSubject: hi\n\nhello there", undefined, "AU").score).toBe(0);
    // Free text carries a deliberate "nothing found" floor, so 10/safe rather
    // than 0 is the pre-registry behaviour here — pinned as found, not as
    // assumed, since the value of this test is that it was read off the engine.
    const custom = checkCustom("hello there", undefined, "AU");
    expect(custom.score).toBe(10);
    expect(custom.verdict).toBe("safe");
  });
});

describe("channel weighting is a per-signal fact", () => {
  it("reads a bare weight as channel-independent", () => {
    const def = fires({ weight: 25 });
    for (const c of CHANNELS) expect(weightFor(def, c)).toBe(25);
  });

  it("lets one channel differ without a multiplier anywhere else", () => {
    // The shape that replaces the blanket 0.7 discount plus its exemption
    // list: a keyword-frequency signal declares the email discount itself, at
    // the point its author is already choosing a number.
    const keyword = fires({ weight: { default: 30, email: 21 } });
    expect(weightFor(keyword, "sms")).toBe(30);
    expect(weightFor(keyword, "email")).toBe(21);
  });

  it("carries a composite at full weight on email, with no exemption list", () => {
    // The defect this is built to make unexpressible: a composite pitched at
    // 25 to clear `suspicious` (20) landed at 17 on the email path, so the
    // channel where the evasion is commonest read as safe. Declared per
    // signal, there is no second place for a multiplier to apply.
    const composite = fires({ id: "test.composite", weight: 25 });
    expect(weightFor(composite, "email")).toBe(25);
    expect(weightFor(composite, "email")).toBeGreaterThanOrEqual(20);
  });

  it("applies the channel weight exactly once", () => {
    // registryScore is the only place a weight is read, so the arithmetic that
    // produced 17-from-25 has nowhere to happen. One scoring pass, one weight.
    const rows = registryScore(ctx({ channel: "email" }), [fires({ weight: { default: 30, email: 21 } })]);
    expect(rows.map((r) => r.points)).toEqual([21]);
  });

  it("scales a signal whose strength varies with what it found", () => {
    const counted = fires({
      weight: 10,
      evaluate: () => [{ text: "three hits", source: "message", scale: 3 }],
    });
    expect(registryScore(ctx(), [counted])[0].points).toBe(30);
  });

  it("never lets a fractional scale sum past the declared weight", () => {
    // Rounded per row, two hits at scale 0.5 against weight 25 gave 13 + 13 =
    // 26 — a signal scoring more than it declared. The evidence list is shown
    // to a reader invited to check that it adds up, so a row belonging to no
    // visible total is the failure mode. Rounded once, with each row taking the
    // running remainder.
    const halves = fires({
      weight: 25,
      evaluate: () => [
        { text: "half", source: "message" as const, scale: 0.5 },
        { text: "other half", source: "message" as const, scale: 0.5 },
      ],
    });
    const rows = registryScore(ctx(), [halves]);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(25);
  });

  it("keeps thirds summing to the declared weight", () => {
    const thirds = fires({
      weight: 10,
      evaluate: () => [0, 1, 2].map((i) => ({ text: `t${i}`, source: "message" as const, scale: 1 / 3 })),
    });
    const rows = registryScore(ctx(), [thirds]);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(10);
    expect(rows).toHaveLength(3);
  });

  it("falls to zero rather than guessing when a channel has no weight", () => {
    // No `default`, so an unlisted channel is unweighted. Zero is the safe
    // direction: every guard here fails toward saying nothing, because a scam
    // card on a real message teaches the user the verdicts are noise.
    expect(weightFor(fires({ weight: { sms: 40 } }), "custom")).toBe(0);
  });

  it("names a channel it runs on with no weight to go with it", () => {
    // Zero is the safe direction but the wrong visibility: a forgotten weight
    // and a deliberate zero-point note are indistinguishable at the call site,
    // and a channel listed in the inventory with 0 against it reads as
    // coverage that does not exist.
    expect(undeclaredWeights(fires({ channels: ["sms", "email"], weight: { sms: 40 } }))).toEqual(["email"]);
  });

  it("accepts a deliberate zero, declared as one", () => {
    expect(undeclaredWeights(fires({ channels: ["sms"], weight: { sms: 0 } }))).toEqual([]);
  });

  it("asks nothing of a bare weight or one carrying a default", () => {
    expect(undeclaredWeights(fires({ channels: "all", weight: 25 }))).toEqual([]);
    expect(undeclaredWeights(fires({ channels: "all", weight: { default: 25, email: 17 } }))).toEqual([]);
  });
});

describe("channel gating", () => {
  it("runs an \"all\" signal everywhere", () => {
    for (const c of CHANNELS) expect(runsOn(fires(), c)).toBe(true);
  });

  it("skips a signal off its declared channels rather than discounting it", () => {
    const smsOnly = fires({ channels: ["sms"] });
    expect(registryScore(ctx({ channel: "sms" }), [smsOnly])).toHaveLength(1);
    expect(registryScore(ctx({ channel: "email" }), [smsOnly])).toEqual([]);
  });
});

describe("a signal cannot score on an input it could not read", () => {
  it("skips a hostname signal when the context carries no URL", () => {
    // Enforced centrally rather than left to each evaluate: otherwise a signal
    // reading `hostname` depends on its own body guarding a field the type
    // says is optional, and "every evaluate checks its own inputs" is the kind
    // of rule stated in a comment that this file exists to make the code
    // enforce. This `fires` always returns a hit, so the skip is the assertion.
    const onHost = fires({ reads: ["hostname"] });
    expect(registryScore(ctx(), [onHost])).toEqual([]);
    expect(registryScore(ctx({ hostname: "evil.tk" }), [onHost])).toHaveLength(1);
  });

  it("skips a headers signal on a message with none parsed", () => {
    const onHeaders = fires({ reads: ["headers"], channels: ["email"] });
    expect(registryScore(ctx({ channel: "email" }), [onHeaders])).toEqual([]);
  });

  it("still runs a signal reading only text", () => {
    expect(registryScore(ctx(), [fires({ reads: ["body", "words", "original"] })])).toHaveLength(1);
  });
});

describe("registryProblems asks every authoring question at once", () => {
  it("finds none in the live registry", () => {
    // What stops step 2 onward registering a broken signal.
    expect(registryProblems()).toEqual([]);
  });

  it("reports a duplicate id, an unreachable read and a missing weight together", () => {
    const problems = registryProblems([
      fires({ id: "dup" }),
      fires({ id: "dup" }),
      fires({ id: "unreachable", reads: ["headers"], channels: ["sms"] }),
      fires({ id: "unweighted", channels: ["sms", "email"], weight: { sms: 10 } }),
    ]);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("dup: registered more than once");
    expect(problems.join("\n")).toContain("unreachable: reads headers");
    expect(problems.join("\n")).toContain("unweighted: runs on email");
  });

  it("passes a well-formed signal", () => {
    expect(registryProblems([fires()])).toEqual([]);
  });
});

describe("reads makes overlap and missing inputs visible", () => {
  it("reports an input this context does not carry", () => {
    expect(missingReads(fires({ reads: ["hostname"] }), ctx())).toEqual(["hostname"]);
    expect(missingReads(fires({ reads: ["hostname"] }), ctx({ hostname: "evil.tk" }))).toEqual([]);
  });

  it("answers from what is present, not from the channel", () => {
    // An SMS carrying a link has a hostname, and an email whose headers failed
    // to parse does not have headers. Inferring either from the channel would
    // be the restated-guard move: a judgement the context already decides
    // properly, approximated somewhere else.
    expect(missingReads(fires({ reads: ["hostname"] }), ctx({ channel: "sms", hostname: "evil.tk" }))).toEqual([]);
    expect(missingReads(fires({ reads: ["headers"] }), ctx({ channel: "email" }))).toEqual(["headers"]);
  });

  it("separates a quiet signal from an authoring error", () => {
    // These were one function and so could express neither. A signal reading
    // `hostname` on a message with no link is correctly silent; a signal
    // reading `headers` on the SMS channel can never fire and will sit in the
    // inventory looking like coverage.
    const quiet = fires({ reads: ["hostname"], channels: ["sms"] });
    expect(missingReads(quiet, ctx())).toEqual(["hostname"]); // nothing to read today
    expect(unsatisfiableReads(quiet)).toEqual([]); // but an SMS can carry a link

    const broken = fires({ reads: ["headers"], channels: ["sms"] });
    expect(unsatisfiableReads(broken)).toEqual(["headers"]);
  });

  it("knows which channels can ever carry which input", () => {
    expect(unsatisfiableReads(fires({ reads: ["headers"], channels: ["email"] }))).toEqual([]);
    expect(unsatisfiableReads(fires({ reads: ["phone"], channels: ["phone"] }))).toEqual([]);
    expect(unsatisfiableReads(fires({ reads: ["phone"], channels: ["sms", "email"] }))).toEqual(["phone"]);
    // A link cannot reach the phone channel, and nothing else is url-free.
    expect(unsatisfiableReads(fires({ reads: ["url"], channels: ["phone"] }))).toEqual(["url"]);
    expect(unsatisfiableReads(fires({ reads: ["url"], channels: "all" }))).toEqual([]);
    // Text is available everywhere, including as a phone number.
    expect(unsatisfiableReads(fires({ reads: ["body", "words", "original"], channels: "all" }))).toEqual([]);
  });

  it("names two signals sharing a tokeniser", () => {
    // The double-scoring defect, as a query over declarations rather than a
    // probe finding: one Cyrillic character scored twice because the body
    // splice rule and the hostname script rule were handed the same token by a
    // shared splitter, and the overlap was in neither rule. With `reads`
    // declared, asking is a filter.
    const defs = [
      fires({ id: "a", reads: ["words"] }),
      fires({ id: "b", reads: ["words", "hostname"] }),
      fires({ id: "c", reads: ["headers"] }),
    ];
    const onWords = defs.filter((d) => d.reads.includes("words")).map((d) => d.id);
    expect(onWords).toEqual(["a", "b"]);
  });
});

describe("the inventory is the registry serialised", () => {
  it("carries every scoring fact without running anything", () => {
    const inv = signalInventory([
      fires({ id: "z.structural", reads: ["original"], weight: { default: 25, email: 25 } }),
      fires({ id: "a.epistemic", kind: "epistemic", channels: ["url"], weight: 30 }),
    ]);
    expect(inv.map((e) => e.id)).toEqual(["a.epistemic", "z.structural"]);
    expect(inv[0]).toEqual({
      id: "a.epistemic",
      reads: ["body"],
      channels: ["url"],
      weights: { url: 30, sms: 0, email: 0, phone: 0, custom: 0 },
      kind: "epistemic",
    });
  });

  it("sorts by id so a diff shows the surface changing, not the file order", () => {
    const ids = signalInventory([fires({ id: "c" }), fires({ id: "a" }), fires({ id: "b" })]).map((e) => e.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("sorts under a pinned collation, not the runtime's locale", () => {
    // The artefact's whole job is to make a real change visible in a diff, so a
    // sort following the runtime's locale reports a change that did not happen
    // whenever a dev machine and CI disagree. Asserted against an explicit
    // comparison rather than by re-sorting, which would just repeat the bug.
    const ids = ["signal.b", "signal-a", "signal_c", "Signal.A"];
    const inv = signalInventory(ids.map((id) => fires({ id })));
    expect(inv.map((e) => e.id)).toEqual([...ids].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("separates claims about the world from rules that cannot go stale", () => {
    // Item 1's split: an epistemic signal (a brand, an agency, an allowlist)
    // needs re-checking against reality on a schedule; a structural one does
    // not. Nothing owns maintaining the epistemic half today, and it is the
    // largest by volume, so the inventory has to be able to name it.
    const inv = signalInventory([fires({ kind: "epistemic" })]);
    expect(inv[0].kind).toBe("epistemic");
  });

  it("omits evaluate, which is not comparable across commits", () => {
    expect(Object.keys(signalInventory([fires()])[0])).not.toContain("evaluate");
  });
});

describe("ids are the inventory's primary key", () => {
  it("reports a duplicate rather than throwing at import time", () => {
    // A throw here would take down every consumer, including the test that
    // would name the problem.
    expect(duplicateIds([fires({ id: "dup" }), fires({ id: "dup" }), fires({ id: "ok" })])).toEqual(["dup"]);
  });

  it("finds none in the live registry", () => {
    expect(duplicateIds()).toEqual([]);
  });
});

describe("evaluate scores nothing", () => {
  it("gives the signal's declared weight to a hit, not the hit's own number", () => {
    // A hit that carried its own points could disagree with the declared
    // weight, which is the inline shape this replaces: a weight changed in one
    // place and a comment describing the old one left in another.
    const def = fires({ weight: 45 });
    const hit = def.evaluate(ctx())[0] as { points?: number };
    expect(hit.points).toBeUndefined();
    expect(registryScore(ctx(), [def])[0].points).toBe(45);
  });

  it("is pure — the same context twice gives the same rows", () => {
    const c = ctx();
    expect(registryScore(c, [fires()])).toEqual(registryScore(c, [fires()]));
  });
});

describe("Context carries both forms of the text", () => {
  it("keeps the original alongside the normalised body", () => {
    // The lossy-normalisation defect class is a missing context object:
    // `new URL()` punycodes a non-ASCII hostname on parse, so a homoglyph
    // domain and an ordinary internationalised one become indistinguishable to
    // anything running after normalisation. Five defects, one root cause,
    // three call sites. Both forms side by side is that fix stated once.
    const c = ctx({ original: "Аccount suspended", body: "account suspended" });
    expect(c.original).not.toBe(c.body);
    expect(c.original).toMatch(/А/); // Cyrillic А, still present
  });

  it("exposes one tokenisation, so no signal re-derives it", () => {
    expect(ctx().words).toContain("account");
  });

  it("carries the inputs every declared Reads names", () => {
    // `Reads` promising an input that `Context` has no field for would make two
    // of seven axes undeclarable — a signal could say it reads headers and
    // never be handed any. checkPhone is the first conversion that needs one.
    const full = ctx({
      channel: "phone",
      hostname: "evil.tk",
      url: "https://evil.tk/x",
      headers: parseEmailHeaders("From: a@b.invalid\nSubject: hi\n\nbody"),
      phone: analysePhone("1900 123 456", "AU"),
    });
    const everyRead = fires({
      reads: ["original", "body", "words", "hostname", "url", "headers", "phone"],
    });
    expect(missingReads(everyRead, full)).toEqual([]);
    expect(full.phone?.lineType).toBeDefined();
    expect(full.headers?.fromAddress).toBe("a@b.invalid");
  });
});

describe("every channel is named", () => {
  it("covers the four published entry points plus free text", () => {
    // checkUrl / checkSms / checkEmail / checkPhone / checkCustom. The
    // published API does not change to suit this design; each becomes a
    // channel preset over one list.
    const expected: Channel[] = ["url", "sms", "email", "phone", "custom"];
    expect([...CHANNELS]).toEqual(expected);
  });
});
