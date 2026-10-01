import type { ScamType } from "./engineTypes";

// Heuristic classifier mapping pasted/extracted content to a scam type.
// Order matters: URL and phone patterns are checked before the email-header
// sniff, and anything unmatched falls back to "sms" (free-text message).
export function detectType(text: string): ScamType {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return "url";
  if (/^\+?[\d][\d\s\-().]{6,}[\d]$/.test(t)) return "phone";
  if (/^(from|to|subject|date)\s*:/im.test(t)) return "email";
  return "sms";
}
