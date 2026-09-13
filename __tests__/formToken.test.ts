import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_SECRET = process.env.REPORT_FORM_SECRET;

describe("formToken", () => {
  afterEach(() => {
    process.env.REPORT_FORM_SECRET = ORIGINAL_SECRET;
  });

  describe("without REPORT_FORM_SECRET configured", () => {
    beforeEach(() => {
      delete process.env.REPORT_FORM_SECRET;
      vi.resetModules();
    });

    it("issueFormToken returns null", async () => {
      const { issueFormToken } = await import("@/lib/formToken");
      expect(issueFormToken()).toBeNull();
    });

    it("verifyFormToken returns null even for a well-formed pair", async () => {
      const { verifyFormToken } = await import("@/lib/formToken");
      expect(verifyFormToken(Date.now(), "anything")).toBeNull();
    });
  });

  describe("with REPORT_FORM_SECRET configured", () => {
    beforeEach(() => {
      process.env.REPORT_FORM_SECRET = "test-secret-do-not-use-in-prod";
      vi.resetModules();
    });

    it("issues a token that verifies back to the same issuedAt", async () => {
      const { issueFormToken, verifyFormToken } = await import("@/lib/formToken");
      const issued = issueFormToken();
      expect(issued).not.toBeNull();
      const verified = verifyFormToken(issued!.issuedAt, issued!.token);
      expect(verified).toBe(issued!.issuedAt);
    });

    it("rejects a tampered issuedAt (the classic Date.now() - 3000 bypass)", async () => {
      const { issueFormToken, verifyFormToken } = await import("@/lib/formToken");
      const issued = issueFormToken()!;
      const forged = issued.issuedAt - 3000;
      expect(verifyFormToken(forged, issued.token)).toBeNull();
    });

    it("rejects a tampered token", async () => {
      const { issueFormToken, verifyFormToken } = await import("@/lib/formToken");
      const issued = issueFormToken()!;
      expect(verifyFormToken(issued.issuedAt, issued.token + "0")).toBeNull();
    });

    it("rejects an empty token", async () => {
      const { verifyFormToken } = await import("@/lib/formToken");
      expect(verifyFormToken(Date.now(), "")).toBeNull();
    });

    it("rejects a correctly-signed token that has aged past its TTL", async () => {
      // Replay protection: a valid signature says the timestamp is ours and
      // unmodified, but says nothing about how old it is.
      const { verifyFormToken, FORM_TOKEN_TTL_MS } = await import("@/lib/formToken");
      const { createHmac } = await import("crypto");
      const stale = Date.now() - FORM_TOKEN_TTL_MS - 1000;
      const token = createHmac("sha256", process.env.REPORT_FORM_SECRET!)
        .update(String(stale))
        .digest("hex");
      expect(verifyFormToken(stale, token)).toBeNull();
    });

    it("accepts a correctly-signed token still inside its TTL", async () => {
      const { verifyFormToken, FORM_TOKEN_TTL_MS } = await import("@/lib/formToken");
      const { createHmac } = await import("crypto");
      const recent = Date.now() - FORM_TOKEN_TTL_MS / 2;
      const token = createHmac("sha256", process.env.REPORT_FORM_SECRET!)
        .update(String(recent))
        .digest("hex");
      expect(verifyFormToken(recent, token)).toBe(recent);
    });

    it("rejects a token signed with a different secret", async () => {
      const { issueFormToken } = await import("@/lib/formToken");
      const issued = issueFormToken()!;
      process.env.REPORT_FORM_SECRET = "a-different-secret";
      vi.resetModules();
      const { verifyFormToken } = await import("@/lib/formToken");
      expect(verifyFormToken(issued.issuedAt, issued.token)).toBeNull();
    });
  });
});
