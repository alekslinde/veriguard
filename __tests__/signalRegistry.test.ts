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

// The registry's own behaviour, independent of what has been converted into it.
// Two things need asserting, and they pull in opposite directions:
//
//   · The shape behaves — weighting, channel gating, the input gate and the
//     inventory are what every conversion rests on, so they are pinned here
//     against synthetic signals rather than against whatever is registered
//     today. A test that exercised only real signals would stop covering the
//     shape as the real ones changed.
//   · The engine does not move where it has not been converted. A signal
//     scoring from both the registry and an inline site is the one way this
//     refactor silently changes a verdict, so both halves are asserted: the
//     registry contributes nothing on an unconverted channel, and the
//     converted channel has no inline site left.
//
// Converted so far: the phone channel (see phoneSignals.test.ts for those
// signals' own behaviour, and checkPhonePinned.test.ts for the conversion's
// behaviour-preservation pin), and the ClickFix pair on sms, email and custom
// (clickFixPinned.test.ts). url is still entirely scored inline in
// scamDetector.ts.

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
  it("holds the converted signals, and declares its channels explicitly", () => {
    // Step 1's "is empty" assertion lived here and was deleted by the phone
    // conversion — deliberately and visibly, as that test's own comment said it
    // would be. What replaces it is the invariant that matters from here on.
    //
    // `channels: "all"` is rejected while the conversion is partly done, and
    // that is the load-bearing half: a signal claiming every channel would run
    // on `url` too, where nothing has been converted and the inline site is
    // still live, so it would score twice. Until step 4 lands, every signal
    // names the channels it was converted for.
    expect(SIGNALS.length).toBeGreaterThan(0);
    expect(SIGNALS.every((d) => d.channels !== "all")).toBe(true);
  });

  it("scores nothing on a channel not yet converted", () => {
    // `url` is still entirely scored inline, so the registry must contribute
    // nothing there or every signal it holds would score twice — the one way
    // this refactor can silently change a verdict.
    //
    // sms, email and custom have left this list: ClickFix is converted on all
    // three, so "the registry scores nothing here" stopped being true of them.
    // Their equivalent is the pinned characterisation test, which asserts the
    // scores themselves rather than their absence.
    expect(registryScore(ctx({ channel: "url" }))).toEqual([]);
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

  it("forwards tokenisedChannels, so a `words` signal can be vouched for", () => {
    // `unsatisfiableReads` has had the escape hatch for `words` since the field
    // went optional, and its own tests cover it — but for one commit this
    // function did not forward it, and a comment here named an
    // `unsuppliedReads` that was never written as the thing that held callers to
    // it. So the parameter existed with no production route: the first signal
    // declaring `reads: ["words"]` would be reported as unreachable by the one
    // check that is actually asserted, with no way to declare otherwise, and
    // step 4 would have had to discover that rather than read it.
    //
    // Both directions, because a forwarded argument that is ignored and a
    // default that is strict look identical from the passing side alone.
    const reader = fires({ id: "tok", reads: ["words"], channels: ["sms"] });
    expect(registryProblems([reader]).join("\n")).toContain("tok: reads words");
    expect(registryProblems([reader], ["sms"])).toEqual([]);
    // A caller tokenising a different channel vouches for nothing here.
    expect(registryProblems([reader], ["custom"]).join("\n")).toContain("tok: reads words");
  });
});

// `supersedes` is the one field whose effect is on ANOTHER signal's score, so
// it is the one whose authoring errors are silent — a signal that quietly never
// fires, or a pair that silence each other and both stay quiet. Each shape below
// is asserted to be reported rather than merely documented: writing a type is
// not enforcing it, and this file's own history is the reason that sentence is
// here.
describe("supersedes silences a redundant reading of one fact", () => {
  const winner = (over: Partial<SignalDef> = {}): SignalDef =>
    fires({ id: "pair.winner", channels: ["sms"], supersedes: ["pair.loser"], ...over });
  const loser = (over: Partial<SignalDef> = {}): SignalDef =>
    fires({ id: "pair.loser", channels: ["sms"], ...over });

  it("scores only the superseding signal when both would fire", () => {
    const rows = registryScore(ctx(), [winner(), loser()]);
    expect(rows.map((r) => r.id)).toEqual(["pair.winner"]);
  });

  it("scores the superseded signal when the superseding one stays quiet", () => {
    // The direction that matters most, and the one a declaration-only
    // implementation gets wrong: silencing from the declaration alone would
    // delete the macOS reading on every message, including the ones where the
    // Windows cue is absent and macOS is the only reading there is.
    const rows = registryScore(ctx(), [
      winner({ evaluate: () => [] }),
      loser(),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["pair.loser"]);
  });

  it("does not depend on registration order for the outcome", () => {
    // Listed in either order, the superseding signal wins. If this failed, the
    // order of a file would be a scoring rule — the implicit-in-control-flow
    // property the registry exists to remove, re-entering one level down.
    const scored = (defs: SignalDef[]) => registryScore(ctx(), defs).map((r) => r.id);
    expect(scored([loser(), winner()])).toEqual(["pair.winner"]);
    expect(scored([winner(), loser()])).toEqual(["pair.winner"]);
  });

  it("reports a supersedes naming an unregistered id", () => {
    // What a rename produces. Silent at runtime: nothing is silenced, so the
    // pair scores twice.
    const problems = registryProblems([winner({ supersedes: ["pair.renamed"] }), loser()]);
    expect(problems.join("\n")).toContain("supersedes pair.renamed, which is not registered");
  });

  it("reports a cycle of any length, not just a mutual pair", () => {
    // A two-member check was the first version here, and it was the bug rather
    // than a short form of the fix: a three-signal cycle passed clean while
    // every member silenced the one before it, so a lure they ALL fired on
    // scored nothing at all. Both lengths are asserted, in one test, because
    // what matters is that length is not what the check keys off.
    const mutual = registryProblems([winner(), loser({ supersedes: ["pair.winner"] })]);
    expect(mutual.join("\n")).toContain("supersession cycle");

    const three = registryProblems([
      fires({ id: "c.x", channels: ["sms"], supersedes: ["c.y"] }),
      fires({ id: "c.y", channels: ["sms"], supersedes: ["c.z"] }),
      fires({ id: "c.z", channels: ["sms"], supersedes: ["c.x"] }),
    ]);
    expect(three.join("\n")).toContain("supersession cycle");
    // Named by its members, sorted, so a reader is not sent to whichever file
    // happened to be declared first — the fault is the set, not one entry.
    expect(three.join("\n")).toContain("c.x → c.y → c.z");
  });

  it("reports a cycle once, not once per member", () => {
    // Walked from every signal, so the same cycle is reachable three ways.
    const problems = registryProblems([
      fires({ id: "c.x", channels: ["sms"], supersedes: ["c.y"] }),
      fires({ id: "c.y", channels: ["sms"], supersedes: ["c.z"] }),
      fires({ id: "c.z", channels: ["sms"], supersedes: ["c.x"] }),
    ]);
    expect(problems.filter((p) => p.includes("supersession cycle"))).toHaveLength(1);
  });

  it("reports a signal superseding itself, as the cycle it is", () => {
    const problems = registryProblems([winner({ supersedes: ["pair.winner"] })]);
    // Once, and under one name. Reported separately as well, it would be the
    // same fault twice — and the cross-channel check below is vacuously true of
    // a self-loop, so it must not fall through to it either.
    expect(problems.filter((p) => p.includes("pair.winner"))).toHaveLength(1);
    expect(problems.join("\n")).toContain("supersession cycle");
  });

  it.each([
    ["a 3-cycle", [["c.x", "c.y"], ["c.y", "c.z"], ["c.z", "c.x"]]],
    ["a mutual pair", [["c.x", "c.y"], ["c.y", "c.x"]]],
    ["a self-loop", [["c.x", "c.x"]]],
  ] as Array<[string, Array<[string, string]>]>)(
    "silences every member of %s, at any length and in any order",
    (_label, pairs) => {
      // The runtime half of the finding, asserted rather than described, and the
      // reason the answer must not come from cutting a recursion on re-entry:
      // that gives whichever member the walk entered from a pass, so the
      // declaration order would pick the winner. Cycle members are identified
      // before scoring and all silenced — nothing scores rather than something
      // arbitrary scoring, which is the direction every guard here fails in.
      const defs = pairs.map(([id, target]) =>
        fires({ id, channels: ["sms"], supersedes: [target] }),
      );
      expect(registryScore(ctx(), defs)).toEqual([]);
      expect(registryScore(ctx(), [...defs].reverse())).toEqual([]);
    },
  );

  it("revives a signal whose only claimant is itself silenced", () => {
    // The diamond: `a` silences `b` and `c`, both of which claim `d`. With both
    // claimants out, `d` comes back. Asserted because it is the case where
    // "silence everything a silenced signal named" and "silence nothing a
    // silenced signal named" give different answers, and only the second is the
    // rule as written.
    const defs = [
      fires({ id: "d.a", channels: ["sms"], supersedes: ["d.b", "d.c"] }),
      fires({ id: "d.b", channels: ["sms"], supersedes: ["d.d"] }),
      fires({ id: "d.c", channels: ["sms"], supersedes: ["d.d"] }),
      fires({ id: "d.d", channels: ["sms"] }),
    ];
    expect(registryScore(ctx(), defs).map((r) => r.id)).toEqual(["d.a", "d.d"]);
  });

  it("does not let a silenced signal silence its own target", () => {
    // `a supersedes b`, `b supersedes c`, all three firing. Silencing straight
    // from the fired set let `b` suppress `c` while being suppressed itself, so
    // one hit was deduplicated into zero by a signal the reader never sees.
    // A silenced signal is the reading the engine discarded; it gets no say in
    // what else is redundant.
    const chain = [
      fires({ id: "ch.a", channels: ["sms"], supersedes: ["ch.b"] }),
      fires({ id: "ch.b", channels: ["sms"], supersedes: ["ch.c"] }),
      fires({ id: "ch.c", channels: ["sms"] }),
    ];
    expect(registryScore(ctx(), chain).map((r) => r.id)).toEqual(["ch.a", "ch.c"]);
    // And in the other declaration order, since resolution must not depend on it.
    expect(registryScore(ctx(), [...chain].reverse()).map((r) => r.id)).toEqual(["ch.c", "ch.a"]);
  });

  it("reports a supersession across channels that never meet", () => {
    // Two signals that cannot both fire. Either a mistake about what they read,
    // or coverage deleted on a channel where only one was going to speak.
    const problems = registryProblems([
      winner({ channels: ["sms"] }),
      loser({ channels: ["custom"] }),
    ]);
    expect(problems.join("\n")).toContain("shares no channel with it");
  });

  it("serialises supersedes into the inventory", () => {
    // Without it the inventory reads two signals at 50 each as 100 of score
    // available against one lure — a wrong number item 1's margin report would
    // then be built on.
    const inv = signalInventory([winner(), loser()]);
    expect(inv.find((e) => e.id === "pair.winner")?.supersedes).toEqual(["pair.loser"]);
    expect(inv.find((e) => e.id === "pair.loser")?.supersedes).toEqual([]);
  });
});

describe("reads makes overlap and missing inputs visible", () => {
  it("reports an input this context does not carry", () => {
    expect(missingReads(fires({ reads: ["hostname"] }), ctx())).toEqual(["hostname"]);
    expect(missingReads(fires({ reads: ["hostname"] }), ctx({ hostname: "evil.tk" }))).toEqual([]);
  });

  it("treats an unsupplied tokenisation as absent, not as empty", () => {
    // `words` is optional so a caller that does not tokenise leaves it out
    // rather than passing `[]`. The distinction is the difference between a
    // signal that is correctly skipped and one that is handed a clean answer to
    // a question nobody asked: `[]` means "tokenised, found no words", which no
    // real input produces, so a `reads: ["words"]` signal would run, match
    // nothing and score nothing — a silent miss from a context that looked
    // complete. Two live callers had exactly that shape (`words: [number]` on
    // the phone channel, `words: []` for ClickFix) before this was optional.
    const { words: _dropped, ...noWords } = ctx();
    expect(missingReads(fires({ reads: ["words"] }), noWords)).toEqual(["words"]);
    expect(registryScore(noWords, [fires({ reads: ["words"] })])).toEqual([]);
    // Supplied, it is readable on any channel — so this is about the caller, not
    // about where the text came from.
    expect(missingReads(fires({ reads: ["words"] }), ctx())).toEqual([]);
  });

  it("treats an unsupplied pack-entry matcher the same way", () => {
    // `matches` carries the engine's shared matcher to a signal that consults a
    // pack list, and it is the input most of the registry will declare once the
    // 75 keyword rules are converted.
    //
    // It was NOT a `Reads` in the first draft, on the argument that it is a
    // capability rather than an input — a signal using it still reads `body`,
    // and this names the rule by which an entry is found there. Review measured
    // the consequence: a signal needing it and a caller omitting it type-checked
    // clean, `registryProblems` reported nothing, `missingReads` reported
    // nothing, and a real scam scored ZERO rows with nothing saying why. Inert
    // coverage that the inventory reports as real, which is what this file
    // exists to make inexpressible — so it is declared, and the input gate
    // decides, not each `evaluate` remembering to guard.
    const reader = fires({ reads: ["matches"] });
    expect(missingReads(reader, ctx())).toEqual(["matches"]);
    expect(registryScore(ctx(), [reader])).toEqual([]);
    // Supplied, it reads on any channel that has prose.
    const matches = (text: string, entry: string) => text.includes(entry);
    expect(missingReads(reader, ctx({ matches }))).toEqual([]);
    expect(registryScore(ctx({ matches }), [reader])).toHaveLength(1);
  });

  it("knows a pack-entry match needs prose to match against", () => {
    // Unlike `words`, this is answerable from the channel: every message entry
    // point already holds the matcher — it is the engine's own, not something a
    // caller has to build — so the only channel that can never carry it is the
    // one whose input is a number.
    expect(unsatisfiableReads(fires({ reads: ["matches"], channels: ["sms"] }))).toEqual([]);
    expect(unsatisfiableReads(fires({ reads: ["matches"], channels: ["custom"] }))).toEqual([]);
    expect(unsatisfiableReads(fires({ reads: ["matches"], channels: ["phone"] }))).toEqual([
      "matches",
    ]);
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
    expect(unsatisfiableReads(fires({ reads: ["body", "original"], channels: "all" }))).toEqual([]);
  });

  it("will not vouch for `words` on a channel nothing tokenises", () => {
    // This assertion used to read `words` as reachable everywhere, which was
    // true when `Context.words` was required. It became false the moment the
    // field went optional and both production callers stopped supplying one —
    // and a stale "reachable everywhere" is worse than no check, because a
    // `reads: ["words"]` signal would then pass authoring, never fire, and sit
    // in the serialised inventory looking like coverage. The default is the
    // strict answer; reachability is a fact about the caller now, not the
    // channel, so a caller has to say so.
    expect(unsatisfiableReads(fires({ reads: ["words"], channels: "all" }))).toEqual(["words"]);
    expect(unsatisfiableReads(fires({ reads: ["words"], channels: ["sms"] }))).toEqual(["words"]);
    expect(unsatisfiableReads(fires({ reads: ["words"], channels: ["sms"] }), ["sms"])).toEqual([]);
    // A caller that tokenises a DIFFERENT channel vouches for nothing here.
    expect(unsatisfiableReads(fires({ reads: ["words"], channels: ["sms"] }), ["custom"])).toEqual(["words"]);
  });

  // Reading an input without declaring it is silent, and that is the same
  // one-directional gate the channel declaration has.
  //
  // `registryScore` skips a signal whose declared inputs the context cannot
  // supply, so OVER-declaring fails loudly — adding `"headers"` to a signal on
  // the sms channel failed 46 pinned cases, measured. UNDER-declaring is
  // invisible: a signal reading `ctx.original` while declaring `reads: []`
  // scores identically, because nothing compares the declaration with the body.
  // Found by injection on the task-payment conversion, as the thing an injection
  // that passes is.
  //
  // For `original` and `body` the omission costs nothing today, since every
  // context carries both. It is checked anyway because the input it will cost
  // something for is the one this item has already paid for once: `ctx.matches`
  // shipped undeclared, a caller omitting it type-checked clean, every authoring
  // check reported nothing, and a real scam scored zero rows with nothing saying
  // why. `reads` is how that is now prevented, and a declaration nothing
  // cross-checks against the code is half a rule. Step 4 converts 75 signals
  // that all consult a pack list.
  //
  // Structural, like the channel check and for the same reason: the claim is
  // about what the module's source touches, and the alternative is a comment.
  it("declares every context field its module actually reads", async () => {
    const { readFileSync, readdirSync } = await import("fs");
    /** Context fields that are inputs, by the name a signal reads them under. */
    const asRead: Record<string, string> = {
      original: "original",
      body: "body",
      words: "words",
      hostname: "hostname",
      url: "url",
      headers: "headers",
      phone: "phone",
      matches: "matches",
    };
    const dir = "packages/detect/src/signals";
    const modules = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(modules.length).toBeGreaterThan(0);

    for (const file of modules) {
      const src = readFileSync(`${dir}/${file}`, "utf8");
      // `ctx.x`, and the destructured local the family gate uses
      // (`const matches = ctx.matches`) reads as `ctx.matches` too.
      const touched = new Set(
        [...src.matchAll(/\bctx\.([a-zA-Z]+)/g)]
          .map((m) => asRead[m[1]])
          .filter((r): r is string => r !== undefined),
      );
      // Ids in this module, so the declaration compared against is this
      // module's own rather than the whole registry's.
      const ids = [...src.matchAll(/^\s*id: "([^"]+)"/gm)].map((m) => m[1]);
      const declared = new Set(
        SIGNALS.filter((d) => ids.includes(d.id)).flatMap((d) => [...d.reads]),
      );
      for (const read of touched) {
        expect(
          declared.has(read as never),
          `${file} reads ctx.${read} without declaring it in reads`,
        ).toBe(true);
      }
    }
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
      // Present and empty, never absent. A key that appears only on the
      // signals that supersede something would make a diff of this artefact
      // noisier than the change it is reporting, and the inventory's only job
      // is to make a real change visible.
      supersedes: [],
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

// A declared channel with no entry point calling it is inert coverage.
//
// `registryScore` enforces a channel declaration in one direction only: it
// skips a signal on a channel the signal does not declare, so NARROWING a
// declaration fails loudly — 32 pinned cases, measured. WIDENING one is silent.
// Each converted signal reaches the scorer through a helper in the entry point,
// and the helper is called once per channel the signal is meant to run on, so a
// channel listed in `channels` with no call site scores nothing while the
// inventory reads it as coverage.
//
// Found by injection, as the thing an injection that PASSES is: widening the
// family gate's `channels` to `"all"` changed no score and failed no test,
// although the gate genuinely does not run on the free-text channel. The pin for
// that conversion asserts the `custom` zeros, and they passed either way —
// because what decides where the signal runs is which entry point calls the
// helper, not what the signal declares. A scoring fact declared in one place and
// decided in another is the exact defect class the registry exists to delete, so
// it is checked here rather than left to the next conversion to rediscover.
//
// **The next conversion rediscovered it anyway, one level up.** Task payment
// widened its `channels` to `"all"`, changed no score and failed nothing —
// because this check's coverage was a hand-maintained list of helpers and the new
// signal had no row in it, so it was never asked. The check was right about the
// channels it checked and silent about the one it did not know existed, which is
// the "partial check reporting a clean sweep" shape with the registry's own
// guard as the partial check. The row-per-signal assertion below is the fix, and
// it is the half that generalises: step 4 converts 75 rules.
//
// Structural, like `emailDiscount`'s list check and for the same reason: the
// claim is about the entry point's source, and the alternative is a comment.
describe("a declared channel is a channel some entry point actually scores", () => {
  /**
   * Which channels each conversion helper is called with, read out of the
   * scorer.
   *
   * Matched on the call rather than on a channel list, because the call is the
   * thing that makes a channel real. A helper invoked with a variable (`channel`
   * inside `checkSms`, which also serves the email pass) contributes the
   * channels that variable can hold, which is why those are named per helper
   * below rather than inferred.
   */
  const helpers: Array<{
    /** The converted signals' shared prefix, as `id` spells it. */
    idPrefix: string;
    helper: string;
    /**
     * Channels reachable through a call the regex cannot read as a literal —
     * `checkSms`'s `channel` parameter, which is `"sms"` or `"email"`. Stated
     * here with the reason, so a reader can check it against the signature.
     */
    viaVariable: Channel[];
  }> = [
    { idPrefix: "clickfix.", helper: "addClickFixSignals", viaVariable: ["sms", "email"] },
    { idPrefix: "splice.", helper: "addSplicedWordingSignals", viaVariable: ["sms", "email"] },
    {
      idPrefix: "family.",
      helper: "addFamilyImpersonationSignals",
      viaVariable: ["sms", "email"],
    },
    { idPrefix: "task.", helper: "addTaskPaymentSignals", viaVariable: ["sms", "email"] },
  ];

  // A row per converted signal, or the check does not run on it.
  //
  // The list above is opt-in, which made it the shape it was written to catch:
  // the task-payment conversion widened its `channels` to `"all"`, changed no
  // score, and failed nothing — not because the check was wrong about the
  // channels, but because the signal had no row and so was never asked. A guard
  // whose coverage is a list somebody has to remember to extend reports a clean
  // sweep of whatever is in the list.
  //
  // Phone signals are excluded deliberately rather than forgotten: `checkPhone`
  // scores them directly rather than through a named helper, so there is no call
  // site to read, and the phone channel is the only one they can run on. Named
  // here so the exclusion is a decision a reader can check rather than a gap.
  it("has a row for every converted signal, so none goes unchecked", () => {
    const prefixes = new Set(
      SIGNALS.map((d) => `${d.id.split(".")[0]}.`).filter((p) => p !== "phone."),
    );
    expect([...prefixes].sort()).toEqual(helpers.map((h) => h.idPrefix).sort());
  });

  it.each(helpers)(
    "$helper is called on exactly the channels $idPrefix signals declare",
    async ({ idPrefix, helper, viaVariable }) => {
      const { readFileSync } = await import("fs");
      const src = readFileSync("packages/detect/src/scamDetector.ts", "utf8");

      // Call sites, excluding the declaration and any mention in a comment.
      const calls = [...src.matchAll(new RegExp(`^\\s*${helper}\\(([^)]*)\\)`, "gm"))];
      expect(calls.length, `${helper} is never called`).toBeGreaterThan(0);

      const scored = new Set<Channel>();
      for (const call of calls) {
        const last = call[1].split(",").pop()?.trim() ?? "";
        const literal = last.match(/^"(url|sms|email|phone|custom)"$/);
        if (literal) {
          scored.add(literal[1] as Channel);
        } else {
          // A non-literal argument is the channel parameter — the one case the
          // source cannot answer, declared above with its reason.
          for (const c of viaVariable) scored.add(c);
        }
      }

      const declared = new Set<Channel>();
      for (const def of SIGNALS.filter((d) => d.id.startsWith(idPrefix))) {
        for (const c of CHANNELS) if (runsOn(def, c)) declared.add(c);
      }
      expect(declared.size, `no signals found for ${idPrefix}`).toBeGreaterThan(0);

      const sort = (s: Set<Channel>) => [...s].sort();
      // Both directions. A declared channel nobody calls is inert coverage; a
      // called channel nobody declares is a helper doing nothing, which
      // `registryScore` makes silent in the other direction.
      expect(sort(declared)).toEqual(sort(scored));
    },
  );
});
