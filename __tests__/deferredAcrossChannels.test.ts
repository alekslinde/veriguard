import { describe, it, expect } from "vitest";
import { checkSms, checkEmail } from "@veriguard/engine/scamDetector";

// Naming an agency is not by itself evidence — every genuine ATO email says
// "ATO" — so that signal holds its points back until something ELSE scores.
// The email path analyses the body by running the SMS checker over it and
// merging the result, and that inner pass used to settle the question against
// its own evidence alone. The sender and link rules had not run yet, so nothing
// they found could corroborate anything the body deferred.
//
// The result was backwards on the exact shape the rule exists to catch: an ATO
// email from a mismatched domain scored 40/suspicious with the flag reading
// "nothing else unusual in the message", while the mismatched domain sat in the
// evidence list directly beneath it at 40 points. The strongest corroboration
// available was the one kind that structurally could not count.

// No angle brackets around the address: the display-name masking rule scores
// "myGov <bobwyatt@…>" on its own, which would carry the verdict regardless of
// whether the deferral resolved and hide the behaviour under test.
const impersonation = [
  "From: myGov bobwyatt@reagan.com",
  "Subject: New Business Activity Lodgement Review",
  "To: someone@gmail.com",
  "",
  "ATO; Your Original Business Activity Statement for the period ending",
  "31 OCT 2024 - GST is Approved.",
  "+ Recent Notice of Assessment Issued",
  "+ Your Refund Is Currently Being Processed",
].join("\n");

describe("deferred signals settle against the whole email, not just its body", () => {
  it("lets a mismatched sender domain corroborate an agency mention", () => {
    const result = checkEmail(impersonation, undefined, "au");

    // The corroborated wording, not the "nothing else unusual" alone wording.
    expect(result.flags.join(" ")).toContain("verify directly via official channels");
    expect(result.flags.join(" ")).not.toContain("nothing else unusual");

    const agency = result.signals?.find((s) => s.text.includes("government agency"));
    expect(agency?.points).toBeGreaterThan(0);
  });

  it("scores the pair above the sender signal alone", () => {
    // Two independent signals must read as more than either by itself, or the
    // agency row is contributing nothing and the deferral never resolved.
    const result = checkEmail(impersonation, undefined, "au");
    expect(result.score).toBeGreaterThan(40);
    expect(result.verdict).toBe("likely_scam");
  });

  it("still withholds the points when the agency mention stands alone", () => {
    // The deferral is the whole point of the rule and must survive the fix:
    // ordinary mail that names an agency, with nothing else unusual anywhere in
    // it, is not evidence of anything.
    const body = "Your Medicare claim has been processed. See your statement in the myGov app.";
    const alone = checkSms(body, undefined, "au");

    const agency = alone.signals?.find((s) => s.text.includes("government agency"));
    expect(agency?.points ?? 0).toBe(0);
    expect(alone.flags.join(" ")).toContain("nothing else unusual");
  });

  it("does not let a deferred row corroborate itself across the channel boundary", () => {
    // A body whose ONLY signal is the deferred agency mention, sent from a
    // domain that raises nothing, must stay unsettled. Carrying the row outward
    // would otherwise turn "deferred" into "always eventually scores".
    const benign = [
      "From: Medicare <noreply@medicare.gov.au>",
      "Subject: Your claim",
      "",
      "Your Medicare claim has been processed.",
    ].join("\n");

    const result = checkEmail(benign, undefined, "au");
    const agency = result.signals?.find((s) => s.text.includes("government agency"));
    expect(agency?.points ?? 0).toBe(0);
  });
});
