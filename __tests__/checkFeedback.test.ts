import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { translate, type LangMode, type MessageKey } from "@/lib/i18n";
import {
  checkFeedback,
  INITIAL_FEEDBACK,
  type CheckEvent,
  type CheckFeedback,
} from "@/lib/checkFeedback";

// Feedback during a check, and the places there was none.
//
// The region re-check fires from the coverage notice on the *result* step,
// while every surface the flow owns — the pipeline panel, the submit spinner,
// the checkError block — renders on the *input* step. So it used to run with
// nothing on screen, swap the results underneath the reader, and on failure set
// a checkError that nothing rendered: the previous region's verdict stayed up
// as though the correction had applied. The 30/window rate limit makes that
// reachable rather than theoretical, because stepping through regions to find
// your own is exactly what spends it.
//
// These are transitions, not rendering. An earlier version of this file
// asserted on CheckFlow's source text with regexes, which pins syntax rather
// than behaviour — it passed unchanged with three lifecycle bugs present
// (a stale re-check error surviving into the next check, `busy` staying false
// through a re-check, and a .eml upload leaving the image banner up). Driving
// the reducer catches those; matching source text cannot.

const NORMAL: LangMode = { locale: "en", tone: "normal" };
// Every tone the app ships. The regional register was retired with the rebrand,
// so this is a single entry today — kept as a list because these assertions are
// about a claim holding in every register, and that is what would need
// re-checking if a second one ever ships.
const TONES: LangMode[] = [NORMAL];
const say = (m: LangMode, k: MessageKey, v?: Record<string, string | number>) => translate(m, k, v);

/** Run a sequence of events from the initial state, as the flow would. */
const run = (...events: CheckEvent[]): CheckFeedback =>
  events.reduce(checkFeedback, INITIAL_FEEDBACK);

const AU = "AU";

describe("region re-check — never fails silently", () => {
  it("reports a failed re-check on the surface the reader is looking at", () => {
    const s = run({ type: "check-started", region: AU }, { type: "check-failed", region: AU, kind: "server" });
    // On its own surface...
    expect(s.recheck).toEqual({ state: "error", kind: "server" });
    // ...and never in the input step's block, which is off screen here. This is
    // the original bug: the message was set somewhere nothing rendered it.
    expect(s.checkError).toBeNull();
  });

  it("reports a failed first check in the input step's block instead", () => {
    const s = run({ type: "check-started" }, { type: "check-failed", kind: "server" });
    expect(s.checkError).toBe("server");
    expect(s.recheck.state).toBe("idle");
  });

  it("announces a successful re-check rather than falling silent", () => {
    // The verdict is swapped underneath the reader with no navigation. Going
    // straight back to idle empties the live region and announces nothing, so
    // a screen-reader user has no way to know the result was replaced.
    const s = run({ type: "check-started", region: AU }, { type: "check-succeeded", region: AU });
    expect(s.recheck).toEqual({ state: "done", region: AU });
  });

  it("does not let a re-check error outlive the verdict it describes", () => {
    // The message says "the verdict below is still the one from before". A new
    // check replaces that verdict, so the sentence stops being true — leaving
    // it up puts a red alert under a fresh, correct result.
    const s = run(
      { type: "check-started", region: AU },
      { type: "check-failed", region: AU, kind: "rate_limited" },
      { type: "check-started" },
    );
    expect(s.recheck.state).toBe("idle");
  });

  it("keeps a re-check error up while only the region is being retried", () => {
    // A second re-check replaces it with its own state; it is a first check
    // that invalidates it. Both are covered so the clearing above can't be
    // over-applied.
    const s = run(
      { type: "check-started", region: AU },
      { type: "check-failed", region: AU, kind: "server" },
      { type: "check-started", region: "GB" },
    );
    expect(s.recheck).toEqual({ state: "loading", region: "GB" });
  });

  it("locks the controls during a re-check, not just the region picker", () => {
    // `busy` gates the submit and the uploads. A re-check that left it false
    // only disabled the <select>, so pressing Back mid-re-check left the Check
    // button live — a second request would race the first, and whichever
    // resolved last would win. That is the same race the <select> is disabled
    // to prevent, relocated one step away.
    expect(run({ type: "check-started", region: AU }).busy).toBe(true);
    expect(run({ type: "check-started" }).busy).toBe(true);
  });

  it("releases the controls however the run ends", () => {
    for (const end of [
      { type: "check-succeeded", region: AU },
      { type: "check-failed", region: AU, kind: "server" },
      { type: "check-succeeded" },
      { type: "check-failed", kind: "rate_limited" },
    ] as CheckEvent[]) {
      const region = "region" in end ? (end as { region?: string }).region : undefined;
      expect(run({ type: "check-started", region }, end).busy, JSON.stringify(end)).toBe(false);
    }
  });
});

describe("image path — reading is not checking", () => {
  it("holds the handover past the closing tick", () => {
    // The 900ms "Checked" frame reports the *read* and then vanishes; the
    // banner is separate state so it survives to be acted on.
    expect(run({ type: "image-read", via: "qr" }).imageRead).toBe("qr");
    expect(run({ type: "image-read", via: "ocr" }).imageRead).toBe("ocr");
  });

  it("retires the handover once anything replaces the box", () => {
    // Typing over it, or dropping a .eml on it. The .eml path was the miss:
    // it calls setContent without clearing the banner, so the QR variant would
    // assert "that QR code points to the address now in the box" about email
    // source.
    const after = run({ type: "image-read", via: "qr" }, { type: "content-replaced" });
    expect(after.imageRead).toBeNull();
  });

  it("retires the handover when the check it asks for is run", () => {
    const after = run({ type: "image-read", via: "ocr" }, { type: "check-started" });
    expect(after.imageRead).toBeNull();
  });

  it("does not resurrect a previous read's banner on a new one", () => {
    const s = run(
      { type: "image-read", via: "qr" },
      { type: "content-replaced" },
      { type: "image-read", via: "ocr" },
    );
    expect(s.imageRead).toBe("ocr");
  });
});

// ── Copy ──────────────────────────────────────────────────────────────────────
//
// The strings carry the claims, so they are asserted through translate() in
// every shipped tone rather than by reading the JSON.

describe("what the reader is told", () => {
  it("says the verdict on screen is still the old one", () => {
    // The sentence that stops a failure reading as success.
    for (const mode of TONES) {
      for (const k of ["verdict.coverage.recheckError", "verdict.coverage.recheckRateLimited"] as const) {
        expect(say(mode, k), `${k}`).toMatch(/still (the one from before|the old verdict)/i);
      }
    }
  });

  it("tells a rate-limited reader to wait rather than to retry", () => {
    // "Try again" against a rate limit walks them back into the same wall.
    for (const mode of TONES) {
      expect(say(mode, "check.rateLimited")).toMatch(/minute|give it|steady on/i);
      expect(say(mode, "verdict.coverage.recheckRateLimited")).toMatch(/minute|give it|steady on/i);
    }
  });

  it("names the region in every re-check status line", () => {
    for (const k of ["verdict.coverage.rechecking", "verdict.coverage.recheckDone"] as const) {
      expect(say(NORMAL, k, { region: "Canada" }), k).toContain("Canada");
    }
  });

  it("asks for the check in words, in both tones", () => {
    for (const mode of TONES) {
      for (const k of ["check.ocr.readTitle", "check.qr.readTitle"] as const) {
        expect(say(mode, k), k).toMatch(/check it/i);
      }
    }
  });

  it("warns that a decoded QR is an address, not a destination", () => {
    for (const mode of TONES) {
      expect(say(mode, "check.qr.readBody")).toMatch(/opened|near it/i);
    }
  });

  it("points at the box rather than a direction the banner isn't in", () => {
    // It said "the address below" while rendering beneath the box.
    for (const mode of TONES) {
      expect(say(mode, "check.qr.readBody")).not.toMatch(/below/i);
    }
  });

  it("says what was missing and what to try, instead of refusing", () => {
    // "Nothing to analyse." read as a rejection and gave nowhere to go.
    for (const mode of TONES) {
      const s = say(mode, "check.nothing");
      expect(s).toMatch(/link|phone number|email address/i);
      expect(s).toMatch(/paste/i);
    }
  });

  it("retires strings it stopped rendering", () => {
    // An unused key is a trap for the next contributor. translate() falls back
    // to the key itself, so this is how absence reads.
    expect(translate(NORMAL, "check.analysing" as MessageKey)).toBe("check.analysing");
  });
});

// ── Wiring ────────────────────────────────────────────────────────────────────
//
// A small amount of source-reading survives, for contracts that are genuinely
// about a file's shape and have no runtime behaviour to drive: the transport
// code on the wire, and the two design rules the notice exists to follow.

const FLOW = readFileSync(path.join(process.cwd(), "components/CheckFlow.tsx"), "utf8");
const NOTICE = readFileSync(path.join(process.cwd(), "components/CoverageNotice.tsx"), "utf8");
const ROUTE = readFileSync(path.join(process.cwd(), "app/api/check/route.ts"), "utf8");

describe("rate limit — machine-readable, not prose-matched", () => {
  it("travels as a code, so it survives rewording and translation", () => {
    expect(ROUTE).toMatch(/code: "rate_limited"/);
    expect(FLOW).toMatch(/body\.code === "rate_limited"/);
  });

  it("does not file a bug report for a rate limiter working as designed", () => {
    const run_ = FLOW.slice(FLOW.indexOf("async function runCheck"), FLOW.indexOf("async function shareResults"));
    expect(run_.slice(run_.indexOf("} catch (err) {"))).toMatch(/if \(!limited\) reportFailure\("check", err\)/);
  });
});

describe("coverage notice — our limits, in the colour reserved for them", () => {
  it("uses the caution token rather than a third hue", () => {
    // VerdictBadge's rule: red is the verdict's, amber is for statements about
    // our own coverage. This is that statement. Sky-blue appeared nowhere else.
    expect(NOTICE).toMatch(/var\(--caution\)/);
    expect(NOTICE).not.toMatch(/sky-\d/);
  });

  it("carries no emoji, for the reason the verdict header carries none", () => {
    expect(NOTICE).not.toMatch(/🌏/);
  });

  it("sits below the verdict headline it qualifies", () => {
    // As the first thing on the page it was the loudest element on screen — a
    // caveat where the answer should be.
    const supporting = FLOW.indexOf("supporting={");
    expect(supporting).toBeGreaterThan(-1);
    expect(FLOW.indexOf("<CoverageNotice")).toBeGreaterThan(supporting);
  });

  it("only draws the warning band when it has something to say", () => {
    // CoverageNotice returns null on full coverage, so an unconditional wrapper
    // drew a top rule and 16px of padding around nothing on every fully-covered
    // check. The region picker is the exception: it renders unconditionally (a
    // wrong geo guess most needs correcting exactly when coverage is full), so
    // only the warning stays behind the coverage guard.
    expect(FLOW).toMatch(/overallCoverage\(results\) !== "full" && \(/);
    const resultPicker = FLOW.indexOf('id="result-region"');
    const warningGuard = FLOW.indexOf('overallCoverage(results) !== "full"');
    expect(resultPicker).toBeGreaterThan(-1);
    expect(warningGuard).toBeGreaterThan(-1);
    expect(resultPicker).toBeLessThan(warningGuard);
  });

  it("keeps region off the input step — the picker lives only on the result", () => {
    // The input step used to carry its own region picker; it crowded the top of
    // the paste card (a label plus a dropdown) for a control most readers never
    // touch, since Auto resolves the pack from the geo header. Region is now
    // corrected on the result step alone (id="result-region"), and a choice made
    // there persists to drive the next first check. So the input step carries no
    // region UI at all.
    expect(FLOW).not.toContain('id="check-region"');
    expect(FLOW).toContain('id="result-region"');
  });

  it("sends the persisted choice on the first check", () => {
    // Auto sends nothing (the server resolves from geo headers); an explicit
    // choice — persisted from an earlier result-step correction — travels as the
    // region field. Asserted on the payload shape rather than prose, which is
    // translated.
    const run_ = FLOW.slice(FLOW.indexOf("async function runCheck"), FLOW.indexOf("async function shareResults"));
    expect(run_).toMatch(/\.\.\.\(payloadRegion \? \{ region: payloadRegion \}/);
    expect(run_).toMatch(/checkRegion \?\? undefined/);
  });
});
