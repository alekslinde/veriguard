// Server-proof of "when the report form was actually rendered."
//
// A client-supplied timestamp is only a claim, not evidence — a form-render
// timestamp only means anything if the client cannot choose it, so the server
// issues it, signs it, and later verifies the signature instead of trusting
// the number back.

import { createHmac, timingSafeEqual } from "crypto";

export interface FormToken {
  issuedAt: number;
  token: string;
}

/**
 * How long an issued token stays valid.
 *
 * Matches the guard's own upper timing bound, which already treats a form open
 * longer than an hour as suspicious — a token outliving that would be accepted
 * here only to be rejected one check later. Without any expiry a harvested
 * token would be replayable forever, since the signature alone says nothing
 * about age.
 */
export const FORM_TOKEN_TTL_MS = 3_600_000;

function secret(): string | null {
  return process.env.REPORT_FORM_SECRET || null;
}

function sign(issuedAt: number, key: string): string {
  return createHmac("sha256", key).update(String(issuedAt)).digest("hex");
}

/**
 * Issue a fresh signed timestamp. Returns null if REPORT_FORM_SECRET isn't
 * configured — callers fall back to the old, weaker client-timestamp
 * heuristic rather than breaking local dev over an optional secret.
 */
export function issueFormToken(): FormToken | null {
  const key = secret();
  if (!key) return null;
  const issuedAt = Date.now();
  return { issuedAt, token: sign(issuedAt, key) };
}

/**
 * Verify a (issuedAt, token) pair came from issueFormToken and hasn't been
 * tampered with. Returns the trustworthy issuedAt on success, or null if the
 * signature is missing, malformed, or doesn't match — the caller should then
 * fall back to treating the submission as unverified rather than trusting the
 * client's own number.
 */
export function verifyFormToken(issuedAt: number, token: string): number | null {
  const key = secret();
  if (!key || !issuedAt || !token) return null;
  const expected = sign(issuedAt, key);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Signature valid — now check age. A signature proves the timestamp is ours
  // and unmodified; it says nothing about whether it is still current.
  const age = Date.now() - issuedAt;
  if (age < 0 || age > FORM_TOKEN_TTL_MS) return null;
  return issuedAt;
}
