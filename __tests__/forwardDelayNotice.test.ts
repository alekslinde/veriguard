import { describe, it, expect } from "vitest";
import enNormal from "@/messages/en.normal.json";

// The forward-to-check path is live, and its emailed reply is currently
// unreliable. Someone who forwards a scam and hears nothing back reads that
// silence as "probably fine" — the worst answer this product can give — so the
// notice has to say what is happening and where the working route is.
//
// Pinned in tests because it is outage copy on a live feature: it will be
// removed in a hurry once replies are reliable again, and a hurried removal is
// exactly when the surrounding promises get broken by accident.

const strings = enNormal as Record<string, string>;

describe("forward delay notice copy", () => {
  it("exists as its own key rather than being folded into the body", () => {
    // A separate key is what lets the notice appear and disappear without
    // rewriting the copy that stays.
    expect(strings["check.forward.delay"]).toBeTypeOf("string");
    expect(strings["check.forward.body"]).not.toMatch(/delay/i);
  });

  it("says checking still happens, so the feature does not read as dead", () => {
    // Every forward is still analysed and still counted. Saying only "replies
    // are delayed" would imply the check itself stopped.
    expect(strings["check.forward.delay"]).toMatch(/still checking/i);
  });

  it("names the working alternative", () => {
    // A notice that reports a problem without offering the route that works
    // leaves someone with a scam in their inbox and nothing to do about it.
    expect(strings["check.forward.delay"]).toMatch(/paste/i);
  });

  it("does not promise a time it cannot keep", () => {
    // The cause is not yet known, so any "back shortly" is a guess presented as
    // a commitment. Four diagnoses have already been wrong; this one stays
    // honest about not knowing.
    expect(strings["check.forward.delay"]).not.toMatch(
      /shortly|soon|within|by tomorrow|back in|minutes|hours/i,
    );
  });

  it("does not blame the user's mail provider", () => {
    // The fault is on our side of the transaction. Pointing at Gmail or the
    // forwarder's setup would send people to fix something that is not broken.
    expect(strings["check.forward.delay"]).not.toMatch(/your (mail|email) provider/i);
  });
});
