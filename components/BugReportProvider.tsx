"use client";

// Bug-reporting context + UI.
//
// Two entry points:
//   • openManual()  — user taps the floating "Report a bug" button.
//   • reportFailure(action, error) — a common action (upload/check/report) threw,
//     so we surface a prompt offering to send diagnostics.
//
// Consent model: a failure NEVER auto-sends anything. We collect the diagnostics
// locally and show them in a dialog; nothing leaves the device until the user
// reviews them and taps "Send report". The scam content and any uploaded files
// are deliberately excluded from what we collect.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLang, MessageKey } from "@/lib/lang";
import type { BugAction } from "@/lib/bugStore";

interface BugReportCtx {
  reportFailure: (action: BugAction, error?: unknown) => void;
  openManual: () => void;
}

const noop = () => {};
const Ctx = createContext<BugReportCtx>({ reportFailure: noop, openManual: noop });

export function useBugReport(): BugReportCtx {
  return useContext(Ctx);
}

function errorToText(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || e.name;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

const ACTION_LABEL_KEY: Record<BugAction, MessageKey> = {
  upload: "bug.action.upload",
  check: "bug.action.check",
  report: "bug.action.report",
  manual: "bug.action.manual",
};

interface Diagnostics {
  action: BugAction;
  error: string;
}

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const [diag, setDiag] = useState<Diagnostics>({ action: "manual", error: "" });
  // Bumped each time a report is opened. Used as the modal's key so a new
  // report (e.g. a failure firing while the modal is already open, even on its
  // "sent" screen) remounts the modal with fresh inputs rather than stranding
  // the user on stale state.
  const [session, setSession] = useState(0);

  const reportFailure = useCallback((action: BugAction, error?: unknown) => {
    setDiag({ action, error: errorToText(error) });
    setAuto(true);
    setOpen(true);
    setSession((n) => n + 1);
  }, []);

  const openManual = useCallback(() => {
    setDiag({ action: "manual", error: "" });
    setAuto(false);
    setOpen(true);
    setSession((n) => n + 1);
  }, []);

  // reportFailure/openManual are stable, so this value never changes identity —
  // consumers don't re-render when the modal opens/closes.
  const ctx = useMemo(() => ({ reportFailure, openManual }), [reportFailure, openManual]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {/* The manual entry point now lives inline in the site footer
          (SiteFooter → useBugReport().openManual), not a floating chip over the
          check input. Only the modal is mounted here; the trigger moved to where
          it no longer overlaps the paste box on a phone. */}
      {open && (
        <BugModal key={session} diag={diag} auto={auto} onClose={() => setOpen(false)} />
      )}
    </Ctx.Provider>
  );
}

type Status = "idle" | "sending" | "sent" | "error";

function collectEnv() {
  if (typeof window === "undefined") {
    return { path: "", userAgent: "", viewport: "", language: "" };
  }
  return {
    // pathname only — query strings are never used to carry user content here,
    // but we exclude them anyway to be safe.
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    language: navigator.language,
  };
}

// Native <dialog> + showModal(): focus is trapped, the background becomes
// inert, Escape fires `cancel`, and focus returns to the opener on close —
// none of which we have to reimplement.
function BugModal({
  diag,
  auto,
  onClose,
}: {
  diag: Diagnostics;
  auto: boolean;
  onClose: () => void;
}) {
  const { mode, t } = useLang();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [env] = useState(collectEnv);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [bugId, setBugId] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function send() {
    setStatus("sending");
    try {
      const res = await fetch("/api/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: diag.action,
          error: diag.error,
          description,
          contact,
          path: env.path,
          userAgent: env.userAgent,
          viewport: env.viewport,
          // Browser language, annotated with the in-app preference when it
          // differs from the default (locale/tone are separate axes now).
          language:
            mode.tone === "normal"
              ? `${env.language} (${mode.locale})`
              : `${env.language} (${mode.locale}, ${mode.tone})`,
          hp,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBugId(data.bugId ?? null);
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="bug-modal-title"
      onCancel={(e) => { if (status === "sending") e.preventDefault(); }}
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop land on the <dialog> element itself.
        if (e.target === dialogRef.current && status !== "sending") {
          dialogRef.current?.close();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)] p-0 text-gray-100 backdrop:bg-black/60"
    >
      <div className="p-6 space-y-4">
        {status === "sent" ? (
          <div className="space-y-4 text-center py-2">
            <h2 id="bug-modal-title" className="text-lg font-bold text-emerald-400">
              {t("bug.sent.title")}
            </h2>
            <p className="text-sm text-gray-300">{t("bug.sent.body")}</p>
            {bugId && (
              <div className="inline-block rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-4 py-2">
                <div className="text-xs text-gray-400">{t("bug.sent.reference")}</div>
                <div className="font-mono font-bold text-emerald-400">{bugId}</div>
              </div>
            )}
            <div>
              <button
                onClick={() => dialogRef.current?.close()}
                className="px-4 py-2 bg-[var(--ink-3)] hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
              >
                {t("bug.close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="bug-modal-title" className="text-lg font-bold text-gray-100">
                  {auto ? t("bug.title.auto") : t("bug.title.manual")}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {auto ? t("bug.intro.auto") : t("bug.intro.manual")}
                </p>
              </div>
              <button
                onClick={() => dialogRef.current?.close()}
                disabled={status === "sending"}
                aria-label={t("bug.close")}
                className="shrink-0 text-gray-500 hover:text-gray-300 text-xl leading-none disabled:opacity-40"
              >
                ×
              </button>
            </div>

            {/* Honeypot */}
            <div className="absolute -left-[9999px] top-0" aria-hidden="true">
              <label htmlFor="bug-website">Website (leave blank)</label>
              <input
                id="bug-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="bug-description" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {t("bug.what.label")} <span className="normal-case font-normal text-gray-500">{t("bug.optional")}</span>
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("bug.what.placeholder")}
                rows={3}
                maxLength={1000}
                className="w-full bg-[var(--ink)] border border-[var(--rule)] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-y"
              />
            </div>

            <div>
              <label htmlFor="bug-contact" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {t("bug.contact.label")} <span className="normal-case font-normal text-gray-500">{t("bug.contact.optional")}</span>
              </label>
              <input
                id="bug-contact"
                type="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="you@example.com.au"
                maxLength={200}
                className="w-full bg-[var(--ink)] border border-[var(--rule)] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* The exact diagnostics that will be sent — shown in full so consent
                is informed. */}
            <details className="rounded-lg border border-[var(--rule)] bg-[var(--ink)]" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {t("bug.details.summary")}
              </summary>
              <dl className="px-3 pb-3 space-y-1.5 text-xs">
                <Row label={t("bug.details.action")} value={t(ACTION_LABEL_KEY[diag.action])} />
                {diag.error && <Row label={t("bug.details.error")} value={diag.error} mono />}
                <Row label={t("bug.details.page")} value={env.path} mono />
                <Row label={t("bug.details.screen")} value={env.viewport} mono />
                <Row label={t("bug.details.browser")} value={env.userAgent} mono />
              </dl>
            </details>

            <p className="text-xs text-gray-500">🔒 {t("bug.privacy")}</p>

            {status === "error" && (
              <div role="alert" className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
                {t("bug.error")}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                onClick={() => dialogRef.current?.close()}
                disabled={status === "sending"}
                className="px-4 py-2 bg-[var(--ink-3)] hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-40"
              >
                {t("bug.notNow")}
              </button>
              <button
                onClick={send}
                disabled={status === "sending"}
                aria-busy={status === "sending"}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400"
              >
                {status === "sending" ? t("bug.sending") : t("bug.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

// Inline so the trigger carries no external request. currentColor lets it
// inherit the button's text colour and its hover transition for free. Exported
// for the footer's inline "Report a bug" button, which is now the manual entry
// point (see SiteFooter).
export function BugIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 w-16 text-gray-500">{label}</dt>
      <dd className={`min-w-0 break-words text-gray-300 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
