import { describe, it, expect } from "vitest";
import enNormal from "@/messages/en.normal.json";
import { resolveNoticeKey } from "@/components/ServiceNotice";

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

  describe("the key the component resolves", () => {
    // The component takes a message KEY from the environment, never body text:
    // an env-assembled notice would bypass translation and put unreviewed
    // content, markup included, on every page.
    //
    // But a key is only safe if it resolves. translate() falls back to
    // returning the key itself, so a typo'd or renamed variable would print
    // the literal "service.inboundDelyed" site-wide — failing loudest at
    // exactly the moment the notice matters most. These exercise the
    // resolution the component performs, against the real bundle.
    const DEFAULT_KEY = "service.inboundDelayed";
    // The component's own resolver, not a copy of it — a reimplementation here
    // would pass while the shipped code did something else.
    const resolve = resolveNoticeKey;

    it("keeps a known key", () => {
      expect(resolve("service.inboundDelayed")).toBe("service.inboundDelayed");
    });

    it("falls back to the default when the key is unknown", () => {
      // A misconfiguration costs the right wording, not the whole page.
      expect(resolve("service.inboundDelyed")).toBe(DEFAULT_KEY);
      expect(resolve("totally.made.up")).toBe(DEFAULT_KEY);
      expect(resolve("")).toBe(DEFAULT_KEY);
      expect(resolve(undefined)).toBe(DEFAULT_KEY);
    });

    it("never resolves to a key absent from the bundle", () => {
      for (const candidate of ["service.inboundDelyed", "", "nope", DEFAULT_KEY]) {
        expect((resolve(candidate) as string) in strings).toBe(true);
      }
    });

    it("has a default that exists, so the fallback itself cannot fail", () => {
      expect(strings[DEFAULT_KEY]).toBeTypeOf("string");
    });

    it("gives the notice landmark an accessible name", () => {
      expect(strings["service.label"]).toBeTypeOf("string");
      expect(strings["service.label"].length).toBeGreaterThan(0);
    });
  });

  it("no longer carries the superseded per-panel copy", () => {
    // Replaced by the site-wide strip. Leaving it would be a second notice for
    // one incident, which is how a page ends up training people to skim.
    expect(strings["check.forward.delay"]).toBeUndefined();
  });
});
