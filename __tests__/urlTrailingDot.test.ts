import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail } from "@veriguard/engine/scamDetector";

/**
 * The FQDN root dot, in the SCAM direction.
 *
 * "evil.tk." is a valid fully-qualified form of the identical host, but it
 * survives URL parsing into `hostname` and defeats every `=== d` and
 * `endsWith("." + d)` comparison — so it cuts both ways. The false-positive
 * half (a real `auspost.com.au.` losing the official-link exemption) is covered
 * in officialLinkExemption.test.ts. This file covers the half that matters more
 * to an attacker: appending one character to drop a suspicious-TLD flag.
 *
 * Why these are unit tests rather than corpus cases. The metamorphic
 * `host-trailing-dot` relation looks like it should own this and CANNOT: the
 * eval scores through `analyzeContent`, which takes the WORST card, and the
 * per-URL card always runs `normaliseForAnalysis` (which strips the dot). So
 * the URL card holds at 55 while the message card collapses 35 -> 15, and the
 * worst-card rule hides the regression. The relation reported 0 violations
 * across 27 checks while `checkUrl` was genuinely evadable — verified by
 * injecting the defect and re-running it. A relation is only as good as the
 * path the harness scores through.
 */

const SUSPICIOUS_HOST = "evil-login.tk";

describe("FQDN root dot — suspicious-TLD detection (scam direction)", () => {
  it("scores a suspicious TLD identically in fully-qualified form", () => {
    const plain = checkUrl(`http://${SUSPICIOUS_HOST}/x`, undefined, "AU");
    const fqdn = checkUrl(`http://${SUSPICIOUS_HOST}./x`, undefined, "AU");
    // The property: one appended character must change nothing.
    expect(fqdn.score).toBe(plain.score);
    expect(fqdn.verdict).toBe(plain.verdict);
    // And specifically, it must not fall to safe.
    expect(fqdn.verdict).not.toBe("safe");
  });

  it("does not let the root dot weaken an SMS verdict", () => {
    const plain = checkSms(`Urgent: verify at http://${SUSPICIOUS_HOST}/x`, undefined, "AU");
    const fqdn = checkSms(`Urgent: verify at http://${SUSPICIOUS_HOST}./x`, undefined, "AU");
    expect(fqdn.score).toBe(plain.score);
    expect(fqdn.verdict).toBe(plain.verdict);
  });

  it("does not let the root dot weaken an email verdict", () => {
    const body = (host: string) =>
      ["From: x@y.com", "Subject: verify", "", `Please verify your account at http://${host}/x`].join("\n");
    const plain = checkEmail(body(SUSPICIOUS_HOST), undefined, "AU");
    const fqdn = checkEmail(body(`${SUSPICIOUS_HOST}.`), undefined, "AU");
    expect(fqdn.score).toBe(plain.score);
    expect(fqdn.verdict).toBe(plain.verdict);
  });

  it("handles repeated trailing dots", () => {
    // `replace(/\.+$/)` strips a run, not just one — asserted so a future
    // change to `.replace(/\.$/)` fails here rather than silently reopening it.
    const plain = checkUrl(`http://${SUSPICIOUS_HOST}/x`, undefined, "AU");
    const fqdn = checkUrl(`http://${SUSPICIOUS_HOST}.../x`, undefined, "AU");
    expect(fqdn.score).toBe(plain.score);
  });

  it("still recognises a legitimate domain in fully-qualified form", () => {
    // The same strip, in the direction that produces false positives.
    const plain = checkUrl("https://ato.gov.au/mytax", undefined, "AU");
    const fqdn = checkUrl("https://ato.gov.au./mytax", undefined, "AU");
    expect(fqdn.score).toBe(plain.score);
    expect(fqdn.verdict).toBe("safe");
  });

  it("does not treat the dot as a way past the legit-domain allowlist", () => {
    // Stripping must not make a lookalike resolve to the allowlisted domain.
    const r = checkUrl("https://ato.gov.au.evil.tk/mytax", undefined, "AU");
    expect(r.verdict).not.toBe("safe");
  });
});
