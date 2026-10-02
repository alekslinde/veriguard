// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Parses the compact emailAuth summary (e.g. "SPF fail · DKIM pass (tenant[.]com) · DMARC none")
// into individual pill badges. Used on submission cards and in the Learn page legend.

type Severity = "bad" | "warn" | "ok" | "neutral";

interface Token {
  label: string;
  severity: Severity;
}

const BAD_VERDICTS  = new Set(["fail", "failed", "softfail", "soft-failed", "permerror", "temperror"]);
const WARN_VERDICTS = new Set(["none", "neutral", "bestguesspass"]);
const OK_VERDICTS   = new Set(["pass", "passed"]);

function severity(verdict: string): Severity {
  const v = verdict.toLowerCase();
  if (BAD_VERDICTS.has(v))  return "bad";
  if (WARN_VERDICTS.has(v)) return "warn";
  if (OK_VERDICTS.has(v))   return "ok";
  return "neutral";
}

function parseTokens(emailAuth: string): Token[] {
  if (!emailAuth.trim()) return [];
  return emailAuth.split("·").map((raw) => {
    const part = raw.trim();
    // Extract the first verdict word after the protocol name, e.g. "SPF fail", "DKIM pass (…)"
    const match = part.match(/^(\w+)\s+(\S+)/);
    if (!match) return { label: part, severity: "neutral" as Severity };
    const verdict = match[2].replace(/[()]/g, "");
    return { label: part, severity: severity(verdict) };
  }).filter((t) => t.label.length > 0);
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  bad:     "bg-red-900/50 text-red-300 border-red-700/60",
  warn:    "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  ok:      "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  neutral: "bg-[var(--ink-3)] text-gray-400 border-[var(--rule)]",
};

interface Props {
  emailAuth: string;
  className?: string;
}

export default function AuthBadges({ emailAuth, className = "" }: Props) {
  const tokens = parseTokens(emailAuth);
  if (tokens.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tokens.map((token, i) => (
        <span
          key={i}
          className={`inline-flex items-center border text-xs font-mono px-2 py-0.5 rounded-full ${SEVERITY_CLASSES[token.severity]}`}
        >
          {token.label}
        </span>
      ))}
    </div>
  );
}

// Static legend entries for the Learn page — one per protocol.
export interface AuthLegendEntry {
  protocol: string;
  verdicts: { label: string; severity: Severity; example: string }[];
  explainKey: string; // i18n key for the plain-English explanation
}

export const AUTH_LEGEND: AuthLegendEntry[] = [
  {
    protocol: "SPF",
    verdicts: [
      { label: "SPF pass",     severity: "ok",      example: "SPF pass" },
      { label: "SPF softfail", severity: "warn",    example: "SPF softfail" },
      { label: "SPF fail",     severity: "bad",     example: "SPF fail" },
    ],
    explainKey: "learn.auth.spf.desc",
  },
  {
    protocol: "DKIM",
    verdicts: [
      { label: "DKIM pass",    severity: "ok",      example: "DKIM pass" },
      { label: "DKIM pass (other[.]domain)", severity: "warn", example: "DKIM pass (other[.]domain)" },
      { label: "DKIM fail",    severity: "bad",     example: "DKIM fail" },
    ],
    explainKey: "learn.auth.dkim.desc",
  },
  {
    protocol: "DMARC",
    verdicts: [
      { label: "DMARC pass",   severity: "ok",      example: "DMARC pass" },
      { label: "DMARC none",   severity: "warn",    example: "DMARC none" },
      { label: "DMARC fail",   severity: "bad",     example: "DMARC fail" },
    ],
    explainKey: "learn.auth.dmarc.desc",
  },
];

// Render a single static pill for the legend (no parsing needed).
export function StaticAuthPill({ label, severity: sev }: { label: string; severity: Severity }) {
  return (
    <span className={`inline-flex items-center border text-xs font-mono px-2 py-0.5 rounded-full ${SEVERITY_CLASSES[sev]}`}>
      {label}
    </span>
  );
}
