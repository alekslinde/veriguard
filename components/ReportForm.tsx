"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ScamType } from "@veriguard/engine/scamDetector";
import { summariseAuth } from "@veriguard/engine/emailHeaders";
import { EmailTrackingReport } from "@/lib/emailTracking";
import { analyseEmailSource } from "@/lib/emailSource";
import { useLang, MessageKey } from "@/lib/lang";
import { reportingFor, victimHelpline } from "@/lib/reportingResources";
import type { ReportSource } from "@/lib/reportPrefill";
import { useBugReport } from "./BugReportProvider";
import EmailExportGuide from "./EmailExportGuide";
import ReportingLink from "./ReportingLink";

// Stroke icons for the type picker, matching the set CheckFlow draws for its
// capture options. Emoji were the previous answer and are the wrong one here:
// they render in the platform's emoji font at a size and colour this page does
// not control, so the row looked different on every OS and the glyphs could not
// take the accent colour when a type was selected.
const TYPE_ICON = {
  className: "w-[17px] h-[17px] shrink-0", viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round",
  strokeLinejoin: "round", "aria-hidden": true,
} as const;

function LinkIcon() {
  return (
    <svg {...TYPE_ICON}>
      <path d="M9.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.1 1" />
      <path d="M14.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.1-1" />
    </svg>
  );
}
function SmsIcon() {
  return <svg {...TYPE_ICON}><path d="M20 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 14-5Z" /></svg>;
}
function MailIcon() {
  return (
    <svg {...TYPE_ICON}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg {...TYPE_ICON}>
      <path d="M6 3h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />
    </svg>
  );
}
function QrIcon() {
  return (
    <svg {...TYPE_ICON}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h6" />
    </svg>
  );
}
function OtherIcon() {
  return (
    <svg {...TYPE_ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.6 2.6 0 1 1 3.3 2.5c-.5.2-.8.7-.8 1.2v.6M12 17v.5" />
    </svg>
  );
}

const REPORT_TYPES: { value: ScamType; labelKey: MessageKey; Icon: () => React.ReactElement }[] = [
  { value: "url",    labelKey: "report.type.url",    Icon: LinkIcon },
  { value: "sms",    labelKey: "report.type.sms",    Icon: SmsIcon },
  { value: "email",  labelKey: "report.type.email",  Icon: MailIcon },
  { value: "phone",  labelKey: "report.type.phone",  Icon: PhoneIcon },
  { value: "qr",     labelKey: "report.type.qr",     Icon: QrIcon },
  { value: "custom", labelKey: "report.type.custom", Icon: OtherIcon },
];

const PLACEHOLDER_KEYS: Record<ScamType, MessageKey> = {
  url:    "report.placeholder.url",
  sms:    "report.placeholder.sms",
  email:  "report.placeholder.email",
  phone:  "report.placeholder.phone",
  qr:     "report.placeholder.qr",
  custom: "report.placeholder.custom",
};

// Shared field chrome. Twelve inputs previously repeated the same 200-character
// class string, which is twelve places for the focus ring to drift out of sync.
const LEGEND =
  "font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-dim)]";
const FIELD_LABEL = "block text-[14px] font-medium text-[var(--foreground)] mb-1.5";
const OPTIONAL = "font-normal text-[var(--faint)]";
const HELP = "mt-1.5 text-[12.5px] leading-relaxed text-[var(--faint)]";
// 16px on phones is deliberate: iOS Safari zooms the viewport when a focused
// input's text is smaller than that, and the zoom does not undo itself.
const INPUT =
  "w-full rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-3.5 py-2.5 " +
  "text-[16px] sm:text-[14px] text-[var(--foreground)] placeholder-[var(--faint)] " +
  "focus:outline-none focus:border-[var(--clear)] focus:ring-1 focus:ring-[var(--clear)] transition-colors";
const INPUT_MONO = `${INPUT} font-[family-name:var(--font-mono-ui)]`;

type Status = "idle" | "submitting" | "success" | "error";

interface EmailAuth { spf: string; dkim: string; dkimDomain: string; dmarc: string }
const EMPTY_AUTH: EmailAuth = { spf: "", dkim: "", dkimDomain: "", dmarc: "" };

// Map an SPF/DKIM/DMARC verdict word to a Tailwind chip class. "pass" reads as
// safe (emerald), "fail" as bad (red), the soft/neutral middle as caution
// (amber); anything else (none/error/unknown) is neutral grey.
function authChipClass(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "pass":
    case "bestguesspass":
      return "bg-[var(--clear)]/12 border-[var(--clear)]/45 text-[var(--clear)]";
    case "fail":
    case "permerror":
      return "bg-[var(--scam)]/12 border-[var(--scam)]/40 text-[var(--scam-text)]";
    case "softfail":
    case "neutral":
    case "temperror":
      return "bg-[var(--caution)]/12 border-[var(--caution)]/40 text-[var(--caution)]";
    default:
      return "bg-[var(--ink-3)] border-[var(--rule)] text-[var(--text-dim)]";
  }
}

// Small coloured verdict chip, e.g. "SPF pass" in green. Rendered only when the
// verdict word is present.
function AuthChip({ label, verdict }: { label: string; verdict: string }) {
  if (!verdict) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${authChipClass(verdict)}`}>
      <span className="font-semibold">{label}</span>
      <span>{verdict.toLowerCase()}</span>
    </span>
  );
}

export default function ReportForm({ initialType, initialContent, initialScamUrl, initialScamPhone, initialScamEmail, initialScamReplyTo, initialAuth, region, source }: { initialType?: ScamType; initialContent?: string; initialScamUrl?: string; initialScamPhone?: string; initialScamEmail?: string; initialScamReplyTo?: string; initialAuth?: EmailAuth; /** Explicit check region (or null for auto). Decides the reporting advice; absent keeps the historical AU behaviour. */ region?: string | null; /** Which surface sent the reporter here, from the prefill link. Posted as-is and never rendered: unlike every other field on this form it is not the reporter's to edit, because it describes how they arrived rather than what they are reporting. Absent for someone who came to the form directly. */ source?: ReportSource } = {}) {
  const { t } = useLang();
  const { reportFailure } = useBugReport();
  // Reporting advice follows the check region: a UK reporter told to contact
  // Scamwatch is being sent to the wrong country.
  const reporting = reportingFor(region);
  const helpline = victimHelpline(region);
  const [type, setType] = useState<ScamType>(initialType ?? "url");
  const [content, setContent] = useState(initialContent ?? "");
  const [description, setDescription] = useState("");
  const [scamUrl, setScamUrl] = useState(initialScamUrl ?? "");
  const [scamPhone, setScamPhone] = useState(initialScamPhone ?? "");
  const [scamEmail, setScamEmail] = useState(initialScamEmail ?? "");
  const [scamReplyTo, setScamReplyTo] = useState(initialScamReplyTo ?? "");
  const [emailSource, setEmailSource] = useState("");
  const [parseNote, setParseNote] = useState<string | null>(null);
  // When the email was already identified upstream (Check→Report handoff gave us
  // a From address), the raw-source paste box adds nothing — the headers are
  // already parsed. Keep it available behind a toggle for power users who want to
  // enrich a missing SPF/DKIM, but collapsed by default in that case.
  const [showSource, setShowSource] = useState(!initialScamEmail);
  // Authentication verdicts pulled from pasted headers. Not directly editable —
  // derived from the source and submitted as-is so the public report can show
  // the SPF/DKIM/DMARC picture. Empty until a source is parsed.
  const [auth, setAuth] = useState<EmailAuth>(initialAuth ?? EMPTY_AUTH);
  const authSummary = summariseAuth(auth);
  // Broader tracking surface (pixels + click redirects, CSS beacons, read
  // receipts, …). Seeded from initialContent so a Check→Report handoff shows
  // tracking immediately; re-derived whenever a source is pasted/parsed.
  const [trackingReport, setTrackingReport] = useState<EmailTrackingReport | null>(() => {
    if (!initialContent?.trim()) return null;
    const tr = analyseEmailSource(initialContent).tracking;
    return tr.hasTracking ? tr : null;
  });
  const [contact, setContact] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reportId, setReportId] = useState<string | null>(null);
  const [totalReports, setTotalReports] = useState<number | null>(null);

  const loadedAt = useRef(0);
  // Server-signed render timestamp (see lib/formToken.ts) — replaces the raw
  // client loadedAt as the anti-bot timing signal when the server has a
  // REPORT_FORM_SECRET configured. Empty until the GET below resolves.
  const formToken = useRef({ token: "", issuedAt: 0 });

  useEffect(() => {
    loadedAt.current = Date.now();
    fetch("/api/report")
      .then((r) => r.json())
      .then((d) => {
        setTotalReports(d.totalReports);
        if (d.formToken && d.formTokenIssuedAt) {
          formToken.current = { token: d.formToken, issuedAt: d.formTokenIssuedAt };
        }
      })
      .catch(() => null);
  }, []);

  // Tokens expire, and a stale one is invisible to the reporter: every verdict
  // returns the same success screen, so an expired token would silently route
  // a real report to the review queue.
  //
  // Refreshed only when close to expiry, never unconditionally before submit.
  // The token's issuedAt IS the render time the guard measures against, so a
  // freshly minted one reads as "submitted 0ms after loading" and trips the
  // too-fast check — refreshing on every submit would fail every submission.
  // Re-fetching near the end of the window trades that for a timestamp still
  // old enough to look human. Failure is non-fatal: the existing token is
  // kept and the server falls back to its unverified-timing path.
  async function refreshFormTokenIfStale() {
    const { issuedAt } = formToken.current;
    const age = Date.now() - issuedAt;
    // 55 min against a 60 min server TTL — enough headroom for a slow submit.
    if (!issuedAt || age < 55 * 60 * 1000) return;
    try {
      const d = await fetch("/api/report", { cache: "no-store" }).then((r) => r.json());
      if (d.formToken && d.formTokenIssuedAt) {
        formToken.current = { token: d.formToken, issuedAt: d.formTokenIssuedAt };
        // Keep the heuristic fallback consistent with the token we now hold.
        loadedAt.current = d.formTokenIssuedAt;
      }
    } catch {
      // Keep whatever token we already hold.
    }
  }

  // Parse pasted email source / a dropped .eml entirely client-side and
  // auto-fill the From and Reply-To fields. The raw source is NEVER submitted —
  // only the two extracted scammer addresses are. This keeps the reporter's own
  // address and routing metadata on their device.
  function parseSource(raw: string) {
    setEmailSource(raw);
    if (!raw.trim()) { setParseNote(null); setAuth(EMPTY_AUTH); setTrackingReport(null); return; }
    // Shared analysis: unwraps a forwarded email to the original first, so the
    // fields autofill the scammer's From/Reply-To, not the forwarder's.
    const { headers: h, identityFlags, tracking } = analyseEmailSource(raw);
    if (h.fromAddress) setScamEmail(h.fromAddress);
    if (h.replyTo) setScamReplyTo(h.replyTo);
    setAuth({ spf: h.spf, dkim: h.dkim, dkimDomain: h.dkimDomain, dmarc: h.dmarc });
    setTrackingReport(tracking);
    if (!h.fromAddress && !h.replyTo) {
      setParseNote(t("report.parse.notFound"));
      return;
    }
    setParseNote(identityFlags.length > 0 ? `⚠ ${identityFlags[0]}` : t("report.parse.ok"));
  }

  async function handleEmlFile(file: File) {
    const text = await file.text();
    parseSource(text);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || status === "submitting") return;

    setStatus("submitting");

    await refreshFormTokenIfStale();

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          content,
          description,
          scamUrl,
          scamPhone,
          scamEmail,
          scamReplyTo,
          // Authentication verdicts only make sense for an email report; gating
          // on type means switching away from "email" never carries stale auth
          // onto a URL/phone/etc. report.
          ...(type === "email" ? auth : EMPTY_AUTH),
          contact,
          // Omitted entirely when absent, rather than sent as "": the route
          // allowlists it anyway, and a key that is only present when it means
          // something keeps the payload honest about what is being claimed.
          ...(source ? { source } : {}),
          hp,
          loadedAt: loadedAt.current,
          formToken: formToken.current.token,
          formTokenIssuedAt: formToken.current.issuedAt,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReportId(data.reportId);
        setStatus("success");
        setTotalReports((n) => (n !== null ? n + 1 : n));
      } else {
        setStatus("error");
        reportFailure("report", "Report submission was rejected by the server");
      }
    } catch (err) {
      setStatus("error");
      reportFailure("report", err);
    }
  }

  function reset() {
    setContent("");
    setDescription("");
    setScamUrl("");
    setScamPhone("");
    setScamEmail("");
    setScamReplyTo("");
    setEmailSource("");
    setParseNote(null);
    setAuth(EMPTY_AUTH);
    setContact("");
    setTrackingReport(null);
    setReportId(null);
    setStatus("idle");
    loadedAt.current = Date.now();
    // A second report through the same mounted form starts a fresh timing
    // window; the token from the first one is already minutes old.
    void refreshFormTokenIfStale();
  }

  if (status === "success") {
    return (
      <div className="space-y-5 text-center py-4">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--clear)]/12 border border-[var(--clear)]/45 text-2xl text-[var(--clear)]"
          aria-hidden="true"
        >
          ✓
        </div>
        <div>
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-[var(--clear)] text-[23px] tracking-[-0.01em] mb-1.5">{t("report.success.title")}</h3>
          <p className="text-[14.5px] leading-relaxed text-[var(--text-dim)]">{t("report.success.body")}</p>
        </div>
        <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-lg px-4 py-3 inline-block mx-auto">
          <div className="font-[family-name:var(--font-mono-ui)] text-[10.5px] uppercase tracking-[0.09em] text-[var(--faint)] mb-1">{t("report.success.reference")}</div>
          <div className="font-[family-name:var(--font-mono-ui)] text-[15px] font-medium text-[var(--foreground)]">{reportId}</div>
          {/* The reference is genuinely usable: the submissions search matches ids */}
          {reportId && (
            <Link
              href={`/submissions?q=${encodeURIComponent(reportId)}`}
              className="block mt-1.5 text-[12px] text-[var(--clear)] hover:no-underline underline underline-offset-2"
            >
              {t("report.success.findIt")}
            </Link>
          )}
        </div>
        {totalReports !== null && (
          <p className="text-[13.5px] text-[var(--text-dim)]">
            {t("report.success.total", { n: totalReports.toLocaleString() })}{" "}
            <Link href="/submissions" className="text-[var(--clear)] hover:no-underline underline underline-offset-2">
              {t("report.success.viewAll")}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-[var(--rule)] px-4 py-2 text-[13.5px] text-[var(--text-dim)] hover:border-[var(--ink-3)] hover:bg-[var(--ink-3)] transition-colors"
          >
            {t("report.success.another")}
          </button>
          <Link
            href="/submissions"
            className="rounded-lg border border-[var(--rule)] px-4 py-2 text-[13.5px] text-[var(--clear)] hover:border-[var(--clear)] transition-colors"
          >
            {t("report.success.community")}
          </Link>
        </div>
        <div className="text-[13px] leading-relaxed text-[var(--faint)] pt-3 border-t border-[var(--rule)]">
          {t("report.success.official.pre")}{" "}
          <ReportingLink link={reporting} />
          {helpline && (
            <>
              {" "}{t("report.success.official.or")}{" "}
              <a
                href={`tel:${helpline.number}`}
                className="text-[var(--clear)] underline underline-offset-2 hover:no-underline"
              >
                {helpline.label}
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>

      {/* Honeypot — off-screen, never shown to real users */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0 }} aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      {/* Amber and left-aligned, not centred green. This is a warning that the
          form has limits — it does not reach your bank or the police, and
          nobody is watching it overnight — and green centred text reads as
          reassurance, which is the opposite of what it says. Amber, never red:
          red is the verdict colour, and this is about us, not about what the
          reader was sent. */}
      <p className="rounded-lg border-l-2 border-l-[var(--caution)] bg-[var(--caution)]/[0.08] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        <strong className="font-semibold text-[var(--foreground)]">{t("report.urgent.heading")}</strong>
        {", "}
        {t("report.urgent", { body: reporting.body })}
      </p>

      {/* Required field note */}
      <p className="text-[13px] text-[var(--faint)]">
        {t("report.required.pre")} <span aria-hidden="true" className="text-[var(--caution)]">*</span>
        <span className="sr-only">{t("report.required.srAsterisk")}</span> {t("report.required.post")}
      </p>

      {/* Type — native radios styled as cards, so arrow keys and grouping work
          without re-implementing the ARIA radio pattern by hand. */}
      <fieldset>
        <legend className={`${LEGEND} mb-2.5`}>{t("report.type.legend")}</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REPORT_TYPES.map((rt) => (
            // Selection is a tinted border and ground, not a solid fill. Six
            // solid accent blocks made the picker the loudest thing on a page
            // whose actual subject is the message below it, and only one of
            // them is ever chosen — the other five were competing for nothing.
            <label
              key={rt.value}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg border text-sm cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--clear)] ${
                type === rt.value
                  ? "border-[var(--clear)] bg-[var(--clear)]/[0.09] text-[var(--foreground)] font-medium"
                  : "border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--ink-3)] hover:bg-[var(--ink-2)]"
              }`}
            >
              <input
                type="radio"
                name="report-type"
                value={rt.value}
                checked={type === rt.value}
                onChange={() => setType(rt.value)}
                className="sr-only"
              />
              <span className={type === rt.value ? "text-[var(--clear)]" : "text-[var(--faint)]"}>
                <rt.Icon />
              </span>
              <span>{t(rt.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* For email type: show a summary of what was already parsed from the headers */}
      {type === "email" && (scamEmail || scamReplyTo || authSummary) && (
        <div className="rounded-lg border border-[var(--clear)]/35 bg-[var(--clear)]/[0.07] px-4 py-3 space-y-1.5 text-xs">
          <p className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--clear)]">{t("report.extracted.heading")}</p>
          {scamEmail && (
            <p className="font-[family-name:var(--font-mono-ui)] text-[var(--text-dim)] break-all">
              <span className="text-[var(--faint)]">{t("report.extracted.from")} </span>{scamEmail}
            </p>
          )}
          {scamReplyTo && (
            <p className="font-[family-name:var(--font-mono-ui)] text-[var(--text-dim)] break-all">
              <span className="text-[var(--faint)]">{t("report.extracted.replyTo")} </span>{scamReplyTo}
            </p>
          )}
          {(auth.spf || auth.dkim || auth.dmarc) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[var(--faint)]">{t("report.extracted.auth")}</span>
              <AuthChip label="SPF" verdict={auth.spf} />
              <AuthChip label="DKIM" verdict={auth.dkim} />
              <AuthChip label="DMARC" verdict={auth.dmarc} />
            </div>
          )}
          {trackingReport?.summary && (
            <p className="text-[var(--caution)] font-mono">
              <span className="text-[var(--faint)]">{t("report.extracted.tracking")} </span>{trackingReport.summary}
            </p>
          )}
          <p className="text-[var(--faint)]">{t("report.extracted.review")}</p>
        </div>
      )}

      {/* Scam content */}
      <div>
        <label htmlFor="report-content" className={FIELD_LABEL}>
          {t("report.content.label")}{" "}
          <span aria-hidden="true" className="text-red-400">*</span>
        </label>
        <textarea
          id="report-content"
          required
          aria-required="true"
          aria-describedby="content-count"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t(PLACEHOLDER_KEYS[type])}
          rows={type === "url" || type === "phone" ? 2 : 4}
          maxLength={2000}
          className={`${INPUT_MONO} resize-y`}
        />
        {/* Deliberately not aria-live — announcing every keystroke is noise;
            the count is reachable via aria-describedby on the field. */}
        <div id="content-count" className="text-right font-[family-name:var(--font-mono-ui)] text-[11px] tabular-nums text-[var(--faint)] mt-1">
          {content.length}/2000
        </div>
      </div>

      {/* For custom reports, description comes first — it's the primary signal */}
      {type === "custom" && (
        <div>
          <label htmlFor="report-description-custom" className={FIELD_LABEL}>
            {t("report.desc.label")}
          </label>
          <textarea
            id="report-description-custom"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("report.desc.placeholder.custom")}
            rows={4}
            maxLength={1000}
            className={`${INPUT} resize-y`}
          />
        </div>
      )}

      {/* Scam identifiers — shown selectively based on report type.
          Set inside a dashed panel: these are the fields that make a report
          matchable against future ones, and they are all optional, so the
          grouping has to say "these belong together and none is required"
          without looking like a second form. Dashed rather than solid so it
          reads as an aside to the required fields above, not a peer of them. */}
      <fieldset className="space-y-3 rounded-xl border border-dashed border-[var(--rule)] bg-black/[0.14] px-4 py-3.5">
        <legend className={`${LEGEND} px-1.5`}>
          {t("report.ids.legend")}{" "}
          <span className={`${OPTIONAL} normal-case tracking-normal`}>{t("report.optional")}</span>
        </legend>
        <p className="text-[12.5px] leading-relaxed text-[var(--faint)]">{t("report.ids.hint")}</p>

        {/* URL — shown for url, sms, qr, email (links in phishing), custom */}
        {type !== "phone" && (
          <div>
            <label htmlFor="report-scam-url" className={FIELD_LABEL}>{t("report.ids.url")}</label>
            <input
              id="report-scam-url"
              type="url"
              value={scamUrl}
              onChange={(e) => setScamUrl(e.target.value)}
              placeholder="https://fake-ato-refund.xyz/verify"
              maxLength={2000}
              className={INPUT_MONO}
            />
          </div>
        )}

        {/* Phone — shown for phone, sms, custom */}
        {(type === "phone" || type === "sms" || type === "custom") && (
          <div>
            <label htmlFor="report-scam-phone" className={FIELD_LABEL}>{t("report.ids.phone")}</label>
            <input
              id="report-scam-phone"
              type="tel"
              value={scamPhone}
              onChange={(e) => setScamPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
              maxLength={50}
              className={INPUT_MONO}
            />
          </div>
        )}

        {/* Email — shown for email, sms (sender addr), custom; hidden for url/phone/qr */}
        {(type === "email" || type === "sms" || type === "custom") && (
          <div>
            <label htmlFor="report-scam-email" className={FIELD_LABEL}>
              {type === "email" ? t("report.ids.emailFrom") : t("report.ids.email")}
            </label>
            <input
              id="report-scam-email"
              type="email"
              value={scamEmail}
              onChange={(e) => setScamEmail(e.target.value)}
              placeholder="scammer@suspicious-domain.com"
              maxLength={200}
              className={INPUT_MONO}
            />
          </div>
        )}

        {type === "email" && (
          <>
            <div>
              <label htmlFor="report-scam-reply-to" className={FIELD_LABEL}>
                {t("report.ids.replyTo")}
              </label>
              <input
                id="report-scam-reply-to"
                type="email"
                value={scamReplyTo}
                onChange={(e) => setScamReplyTo(e.target.value)}
                placeholder="different-address@elsewhere.ru"
                maxLength={200}
                className={INPUT_MONO}
              />
              {scamEmail && scamReplyTo &&
                scamEmail.split("@")[1]?.toLowerCase() !== scamReplyTo.split("@")[1]?.toLowerCase() && (
                <p className="mt-1 text-xs text-amber-400">
                  ⚠ {t("report.ids.replyMismatch")}
                </p>
              )}
            </div>

            {/* Raw-source paste / .eml drop. Collapsed by default once the email
                was already identified upstream (we have a From) — re-pasting
                wouldn't add anything. A toggle keeps it reachable to enrich a
                missing SPF/DKIM. When nothing was parsed yet it's shown open. */}
            {showSource ? (
              <div>
                <EmailExportGuide />
                <label htmlFor="report-email-source" className={`${FIELD_LABEL} mt-4`}>
                  {t("report.email.source.label")}
                </label>
                <textarea
                  id="report-email-source"
                  value={emailSource}
                  onChange={(e) => parseSource(e.target.value)}
                  placeholder={t("report.email.source.placeholder")}
                  rows={3}
                  className={`${INPUT_MONO} resize-y text-[16px] sm:text-[12.5px]`}
                />
                <input
                  type="file"
                  accept=".eml,message/rfc822,text/plain"
                  aria-label={t("report.email.source.file")}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlFile(f); }}
                  className="mt-2 block w-full text-[12px] text-[var(--faint)] file:mr-3 file:rounded file:border-0 file:bg-[var(--ink-3)] file:px-3 file:py-1.5 file:text-[var(--foreground)] hover:file:bg-[var(--rule)]"
                />
                {parseNote && (
                  <p className={`mt-1.5 text-[12px] ${parseNote.startsWith("⚠") ? "text-[var(--caution)]" : "text-[var(--text-dim)]"}`}>
                    {parseNote}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSource(true)}
                className="text-[12px] text-[var(--text-dim)] hover:text-[var(--clear)] underline underline-offset-2"
              >
                {t("report.email.source.add")}
              </button>
            )}

            {/* Tracking findings are derived analysis — keep them visible even
                when the raw-source box is collapsed. */}
            {trackingReport?.hasTracking && (
              <div className="space-y-1">
                {trackingReport.findings.map((f) => (
                  <p key={f.kind} className="text-xs text-amber-400">
                    • {f.label}{f.count > 1 ? ` ×${f.count}` : ""} — {f.detail}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* Description — hidden for custom (rendered above identifiers instead) */}
      {type !== "custom" && (
        <div>
          <label htmlFor="report-description" className={FIELD_LABEL}>
            {t("report.desc.label")}{" "}
            <span className={OPTIONAL}>{t("report.desc.optional")}</span>
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("report.desc.placeholder")}
            rows={3}
            maxLength={1000}
            className={`${INPUT} resize-y`}
          />
        </div>
      )}

      {/* Contact */}
      <div>
        <label htmlFor="report-contact" className={FIELD_LABEL}>
          {t("report.contact.label")}{" "}
          <span className={OPTIONAL}>{t("report.contact.optional")}</span>
        </label>
        <input
          id="report-contact"
          type="email"
          autoComplete="email"
          aria-describedby="contact-hint"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com.au"
          maxLength={200}
          className={INPUT}
        />
        <p id="contact-hint" className={HELP}>
          {t("report.contact.hint")}{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-[var(--foreground)]">
            {t("report.contact.aboutLink")}
          </Link>
        </p>
      </div>

      {/* What the scrubber removes, named specifically. "Personal details are
          removed" is a claim the reader cannot check; a list they can match
          against their own message is one they can. Every item here is a
          pattern in lib/piiScrubber.ts — see PATTERNS. */}
      <div className="rounded-xl border border-[var(--rule)] border-l-2 border-l-[var(--clear)] bg-[var(--clear)]/[0.055] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          {t("report.privacy.heading")}
        </p>
        <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
          {t("report.privacy.body")}
        </p>
      </div>

      {/* Error */}
      {status === "error" && (
        <div role="alert" className="bg-[var(--scam)]/12 border border-[var(--scam)]/40 rounded-lg px-4 py-3 text-[var(--scam-text)] text-sm">
          {t("report.error")}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!content.trim() || status === "submitting"}
        aria-busy={status === "submitting"}
        className={`w-full py-3.5 px-6 rounded-xl font-semibold text-base transition-colors inline-flex items-center justify-center gap-2.5 ${
          status === "submitting"
            ? "bg-[#00825C] text-[#EAF7F2] cursor-progress"
            : "bg-[var(--clear)] text-[#08130F] hover:bg-[#00BF88] disabled:bg-[var(--ink-3)] disabled:text-[var(--faint)]"
        }`}
      >
        {status === "submitting" && (
          <span
            aria-hidden="true"
            className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
          />
        )}
        {status === "submitting" ? t("report.submitting") : t("report.submit")}
      </button>

    </form>
  );
}
