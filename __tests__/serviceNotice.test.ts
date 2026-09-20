import { describe, it, expect } from "vitest";
import enNormal from "@/messages/en.normal.json";

// The site-wide service notice says what is wrong with the service itself —
// maintenance, a degraded feature, an incident being worked on. It is
// configured by env var rather than coded per incident, so what these tests
// pin is the copy and the properties that make it safe to leave in place.

const strings = enNormal as Record<string, string>;

describe("service notice copy", () => {
  it("has the dismiss control's accessible name", () => {
    // The button renders a glyph; without this its name would be "✕".
    expect(strings["service.dismiss"]).toBeTypeOf("string");
    expect(strings["service.dismiss"].length).toBeGreaterThan(0);
  });

  describe("the inbound-replies notice", () => {
    const body = () => strings["service.inboundDelayed"];

    it("exists and leads with what is wrong", () => {
      expect(body()).toBeTypeOf("string");
      expect(body()).toMatch(/^\*\*Emailed replies are delayed\.\*\*/);
    });

    it("says checking still happens, so the feature does not read as dead", () => {
      // Every forward is still analysed and still counted. "Replies are
      // delayed" alone would imply the check itself stopped.
      expect(body()).toMatch(/still checked/i);
    });

    it("names the route that works", () => {
      // A notice that reports a problem without offering the working
      // alternative leaves someone with a scam in their inbox and nothing to
      // do about it.
      expect(body()).toMatch(/paste/i);
    });

    it("promises no timeframe", () => {
      // The cause is not yet known and several diagnoses have already been
      // wrong. Any "back shortly" would be a guess presented as a commitment.
      expect(body()).not.toMatch(/shortly|soon|within|by tomorrow|back in \d/i);
    });

    it("does not blame the user's mail provider", () => {
      // The fault is on our side of the transaction. Pointing at Gmail would
      // send people to fix something that is not broken.
      expect(body()).not.toMatch(/your (mail|email) provider/i);
    });
  });

  it("keeps notice copy in the bundle, not in environment variables", () => {
    // The component takes a message KEY from the environment, never body text.
    // A notice assembled from an env var would bypass translation and put
    // unreviewed content — including markup — straight onto every page.
    const noticeKeys = Object.keys(strings).filter((k) => k.startsWith("service."));
    expect(noticeKeys.length).toBeGreaterThan(0);
    for (const key of noticeKeys) {
      expect(strings[key]).toBeTypeOf("string");
    }
  });

  it("no longer carries the superseded per-panel copy", () => {
    // Replaced by the site-wide strip. Leaving it would be a second notice for
    // one incident, which is how a page ends up training people to skim.
    expect(strings["check.forward.delay"]).toBeUndefined();
  });
});
