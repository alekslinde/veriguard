import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB-backed functions so guardSubmission tests are fully synchronous
vi.mock("@/lib/reportStore", () => ({
  checkAndRecordRateLimit: vi.fn().mockReturnValue(true),
  isRecentDuplicate: vi.fn().mockReturnValue(false),
}));

import { guardSubmission, GuardInput } from "@/lib/submissionGuard";
import { checkAndRecordRateLimit, isRecentDuplicate } from "@/lib/reportStore";

// A valid base input that passes every guard stage
function validInput(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    type: "url",
    content: "http://bit.ly/scam123",   // scores well above 8
    description: "",
    hp: "",
    loadedAt: Date.now() - 5_000,       // 5 seconds ago — human speed
    loadedAtVerified: true,             // server-signed timing proof present
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36",
    contentLength: 100,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(checkAndRecordRateLimit).mockReturnValue(true);
  vi.mocked(isRecentDuplicate).mockReturnValue(false);
});

describe("guardSubmission — honeypot", () => {
  it("returns poison when the honeypot field is filled", () => {
    const result = guardSubmission(validInput({ hp: "I am a bot" }));
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("honeypot_filled");
  });
});

describe("guardSubmission — payload sanity", () => {
  it("returns poison when content is missing", () => {
    const result = guardSubmission(validInput({ content: "" }));
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("missing_required_fields");
  });

  it("returns poison when content is only whitespace", () => {
    const result = guardSubmission(validInput({ content: "   " }));
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("missing_required_fields");
  });

  it("returns poison when type is missing", () => {
    const result = guardSubmission(validInput({ type: "" }));
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("missing_required_fields");
  });

  it("returns poison when the payload exceeds 8000 bytes", () => {
    const result = guardSubmission(validInput({ contentLength: 8001 }));
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("payload_too_large");
  });

  it("accepts a payload of exactly 8000 bytes", () => {
    const result = guardSubmission(validInput({ contentLength: 8000 }));
    expect(result.verdict).toBe("accept");
  });
});

describe("guardSubmission — timing", () => {
  it("returns suspect when loadedAt is missing (0)", () => {
    const result = guardSubmission(validInput({ loadedAt: 0 }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("submitted_too_fast");
  });

  it("returns suspect when form was filled in under 2.5 seconds", () => {
    const result = guardSubmission(validInput({ loadedAt: Date.now() - 1_000 }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("submitted_too_fast");
  });

  it("returns suspect when loadedAt is in the future", () => {
    // elapsed = now - (now + 10_000) = -10_000 < 2500, caught by the too-fast guard
    const result = guardSubmission(validInput({ loadedAt: Date.now() + 10_000 }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("submitted_too_fast");
  });

  it("returns suspect when loadedAt is more than 1 hour ago", () => {
    const result = guardSubmission(validInput({ loadedAt: Date.now() - 3_700_000 }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("suspicious_timestamp");
  });
});

describe("guardSubmission — user-agent", () => {
  it("returns suspect when user-agent is absent", () => {
    const result = guardSubmission(validInput({ userAgent: "" }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("missing_user_agent");
  });

  it("returns suspect when user-agent is too short (< 10 chars)", () => {
    const result = guardSubmission(validInput({ userAgent: "Mozilla" }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("missing_user_agent");
  });

  it("returns suspect for curl user-agent", () => {
    const result = guardSubmission(validInput({ userAgent: "curl/7.85.0" }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("bot_user_agent");
  });

  it("returns suspect for python-requests user-agent", () => {
    const result = guardSubmission(
      validInput({ userAgent: "python-requests/2.28.0" })
    );
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("bot_user_agent");
  });

  it("returns suspect for selenium user-agent", () => {
    const result = guardSubmission(
      validInput({ userAgent: "Mozilla/5.0 HeadlessChrome selenium" })
    );
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("bot_user_agent");
  });
});

describe("guardSubmission — rate limiting", () => {
  it("returns poison when the rate limit is exceeded", () => {
    vi.mocked(checkAndRecordRateLimit).mockReturnValue(false);
    const result = guardSubmission(validInput());
    expect(result.verdict).toBe("poison");
    expect(result.reason).toBe("rate_limited");
  });
});

describe("guardSubmission — duplicate detection", () => {
  it("returns suspect for a duplicate submission", () => {
    vi.mocked(isRecentDuplicate).mockReturnValue(true);
    const result = guardSubmission(validInput());
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("duplicate_content");
  });
});

describe("guardSubmission — content plausibility", () => {
  it("returns suspect when the content scores below 8 (looks legitimate)", () => {
    // A real AU gov domain scores 5 on checkUrl — reporter is likely a scammer
    // trying to get a legitimate URL allowlisted
    const result = guardSubmission(validInput({ content: "https://ato.gov.au" }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("content_appears_legitimate");
  });
});

describe("guardSubmission — timing verification", () => {
  it("returns suspect when the timing proof isn't server-verified, even though every other gate passes", () => {
    const result = guardSubmission(validInput({ loadedAtVerified: false }));
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("timing_unverified");
  });
});

describe("guardSubmission — identifier plausibility", () => {
  it("returns suspect when the accused URL scores as legitimate", () => {
    const result = guardSubmission(
      validInput({
        content: "http://bit.ly/scam123 verify your account now",
        scamIdentifier: { kind: "url", value: "https://ato.gov.au" },
      })
    );
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("identifier_not_substantiated");
  });

  it("returns suspect when the accused identifier never appears in the reported content", () => {
    // content is scam-flavoured and scores fine on its own, but the accused
    // URL is never mentioned in it — an attacker naming an unrelated domain.
    const result = guardSubmission(
      validInput({
        content: "URGENT: verify your account now or it will be suspended",
        scamIdentifier: { kind: "url", value: "http://totally-unrelated-domain.example" },
      })
    );
    expect(result.verdict).toBe("suspect");
    expect(result.reason).toBe("identifier_not_substantiated");
  });

  it("accepts when the accused identifier is scam-shaped and mentioned in content", () => {
    const result = guardSubmission(
      validInput({
        content: "Got this scam link: http://bit.ly/scam123 — verify your account now",
        scamIdentifier: { kind: "url", value: "http://bit.ly/scam123" },
      })
    );
    expect(result.verdict).toBe("accept");
  });
});

describe("guardSubmission — accept path", () => {
  it("returns accept for a fully valid submission", () => {
    const result = guardSubmission(validInput());
    expect(result.verdict).toBe("accept");
    expect(result.reason).toBe("ok");
  });

  it("accepts all scam type variants when content is suspicious enough", () => {
    const cases: Array<[string, string]> = [
      ["url",    "http://bit.ly/scam"],
      ["sms",    "URGENT: Your account is suspended. Verify your TFN now."],
      ["email",  "Dear Customer, open the attached invoice immediately."],
      ["phone",  "1900123456"],
      ["qr",     "http://bit.ly/qrscam"],
      ["custom", "You have won a free $1000 gift card! Claim your prize now."],
    ];
    for (const [type, content] of cases) {
      const result = guardSubmission(validInput({ type, content }));
      expect(result.verdict).toBe("accept");
    }
  });
});
