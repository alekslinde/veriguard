"use client";

import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { AnalyzedIdentifier, ScamType } from "@veriguard/engine/scamDetector";
import { detectType } from "@veriguard/engine/detectType";
import { extractIdentifiers, defangEmail } from "@veriguard/engine/urlSanitizer";
import { parseEmailHeaders, summariseAuth } from "@veriguard/engine/emailHeaders";
import { analyseEmailSource, EmailSourceAnalysis } from "@/lib/emailSource";
import { distillEmailContent } from "@/lib/emailDistiller";
import { VERDICT_RANK, defangValue, defangFlag, composeVerdictWithEvidence, isClean, overallCoverage, pooledSignals } from "@/lib/verdictSummary";
import { useLang, MessageKey } from "@/lib/lang";
// Capability probe only — the OCR engine itself is imported dynamically so the
// WASM core is never downloaded by someone who does not upload an image.
import { canRunClientOcr } from "@/lib/clientOcr";
import { saveCheckDraft, readCheckDraft, clearCheckDraft } from "@/lib/checkDraft";
import { checkFeedback, INITIAL_FEEDBACK } from "@/lib/checkFeedback";
import { useBugReport } from "./BugReportProvider";
import VerdictBadge, { Tactics } from "./VerdictBadge";
import CoverageNotice from "./CoverageNotice";
import CheckRegionPicker from "./CheckRegionPicker";
import { readStoredCheckRegion, writeStoredCheckRegion } from "@/lib/checkRegion";
import ReportForm from "./ReportForm";

/**
 * Which part of the flow is on screen. Exported because CheckStage lifts this
 * one piece of state out — the layout around the flow changes once a check has
 * run, and the forwarding panel it needs to hide is CheckFlow's sibling.
 */
export type CheckStep = "input" | "result" | "report";
type Step = CheckStep;
type Verdict = AnalyzedIdentifier["result"]["verdict"];

// Inline stroke icons for the upload actions — kept local (no icon-library
// dependency for three glyphs). They inherit the button's text colour via
// currentColor, so hover/disabled states need no extra wiring.
const ICON = { className: "w-[15px] h-[15px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function CameraIcon() {
  return (
    <svg {...ICON}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-4.5-4.5L5 21" />
    </svg>
  );
}

function EmailFileIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg {...ICON} className="w-[15px] h-[15px] animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

const KIND_META: Record<AnalyzedIdentifier["kind"], { icon: string; labelKey: MessageKey }> = {
  url:     { icon: "🔗", labelKey: "kind.url" },
  email:   { icon: "📧", labelKey: "kind.email" },
  phone:   { icon: "📞", labelKey: "kind.phone" },
  message: { icon: "💬", labelKey: "kind.message" },
};

// Forward-to-us address, shown only once inbound mail is live end-to-end. The
// flag is read at build time (NEXT_PUBLIC_*), so an unconfigured deploy never
// advertises a dead inbox. Address is overridable for staging/other domains.

// Shared chrome for the four capture options (take photo / upload image /
// upload .eml / forward). One constant rather than the same 200-character class
// string repeated four times, so the row styling can only change in lockstep.
// Grid placement and the disabled states are per-option and stay at the call
// site — the forward option is an <a> and is never disabled.
// Icon beside the text on a phone (one full-width row per option, so there is
// plenty of horizontal room), and icon above centred text from sm up, where
// three columns leave each option only ~200px and a side-by-side layout would
// squeeze the description into a narrow ragged column.
// Chips in the card footer, on the paper surface — so these are light-surface
// colours, not the page palette. Secondary to the submit beside them.
const CAPTURE_OPTION =
  "inline-flex items-center gap-2 rounded-lg border border-[#D9D5CC] bg-white " +
  "px-3 py-2 min-h-[40px] text-[13px] font-medium text-[#3D4654] " +
  "hover:border-[#A8B0BC] transition-colors " +
  "disabled:opacity-45 disabled:cursor-not-allowed max-sm:w-full max-sm:justify-start";

// The camera is offered only where one exists. A desktop webcam is not how
// anyone photographs a scam text they were sent, and the picker it opens is a
// dead end. Feature-detecting the pointer beats sniffing the user agent.
const CAMERA_QUERY = "(hover: none) and (pointer: coarse)";

function subscribeCamera(cb: () => void) {
  const mq = window.matchMedia(CAMERA_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useHasCamera() {
  // useSyncExternalStore is the right primitive for a media query: it reads on
  // every render without a state-in-effect round trip, and its server snapshot
  // (false) means the camera button is absent from the SSR markup rather than
  // flashing in and out on hydration.
  return useSyncExternalStore(
    subscribeCamera,
    () => window.matchMedia(CAMERA_QUERY).matches,
    () => false,
  );
}

// The two pipelines' real stages, in the order the code runs them. Every row
// here maps onto a branch that genuinely executes — nothing is a decorative
// step, and nothing is padded with a timer. A row goes "done" when its work has
// actually finished, so a fast check simply flashes through them.
//
// The paste path used to have no list on the grounds that it was a single
// request. That was true of the old shape, not of this one: reading the box and
// pulling identifiers out of it are synchronous client-side work (the same
// engine call the result view uses), and only the scoring is the round trip.
// Naming those three is describing the work, not inventing it.
const PASTE_STAGES = ["reading", "scoring"] as const;
const IMAGE_STAGES = ["qr", "ocr-local", "ocr-server"] as const;

type PasteStage = (typeof PASTE_STAGES)[number];
type ImageStage = (typeof IMAGE_STAGES)[number];
type Stage = PasteStage | ImageStage;

const STAGE_LABEL = {
  "qr": "check.stage.qr",
  "ocr-local": "check.stage.ocrLocal",
  "ocr-server": "check.stage.ocrServer",
  "reading": "check.stage.reading",
  "scoring": "check.stage.scoring",
} as const satisfies Record<Stage, MessageKey>;

/**
 * A /api/check failure the UI can tell apart.
 *
 * Only the rate limit is separated out, because it is the only one where the
 * right advice differs: every other failure is "try again", and a 429 answered
 * with "try again" walks the reader straight back into the same wall. The kind
 * is carried on the error rather than decided at the throw site so both callers
 * — the first check and the region re-check, which render their messages in
 * different places — map it to their own copy.
 */
class CheckRequestError extends Error {
  constructor(readonly kind: "rate_limited" | "server") {
    super(kind);
    this.name = "CheckRequestError";
  }
}

// Status-dot colour per verdict for the neutral breakdown rows. VERDICT_RANK,
// defangValue and defangFlag now live in lib/verdictSummary so the email reply
// shares the exact same rules — see that module.
const STATUS_DOT: Record<Verdict, string> = {
  safe:        "bg-green-500",
  unknown:     "bg-gray-500",
  suspicious:  "bg-yellow-500",
  likely_scam: "bg-red-500",
};

/**
 * Animate a container between two content heights it cannot know in advance.
 *
 * The panel and the textarea swap inside the card, and their heights differ by
 * about 25px — which the card took in a single frame, reading as a flinch at
 * exactly the moment the reader is waiting to be told they are safe. CSS cannot
 * transition to `auto`, so the height is measured either side of the change and
 * the transition is run between the two pixel values.
 *
 * `auto` is restored as soon as the transition finishes. Leaving a fixed height
 * behind would clip the panel if its content reflowed, and would fight the
 * textarea's own resize handle — the box is user-resizable, and pinning it to a
 * measurement taken before a drag would undo the drag.
 *
 * Returns the ref to attach; it no-ops entirely when reduced motion is asked
 * for, so the swap is instant rather than merely faster.
 */
function useSwapHeight(key: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  // The height the element had before this render's DOM changes were applied.
  //
  // Captured by the unkeyed layout effect at the bottom of this hook, which
  // runs after every commit and so always leaves `from` holding the height the
  // element is about to leave. The keyed effect above then reads it before the
  // browser paints the new content. Keeping the measurement unkeyed is the
  // whole trick: tying it to `key` meant it only re-measured on a swap, so it
  // kept the height from the previous swap and the card jumped to the wrong
  // place before easing back down to the right one.
  //
  // The trade-off is that a swap starting mid-transition measures an
  // interpolated height and animates from there. That is the better failure:
  // the alternative — ignoring heights that arrive during a transition — is a
  // stale measurement, which is the bug above.
  const from = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = from.current;
    const end = el.getBoundingClientRect().height;
    if (start === null || Math.round(start) === Math.round(end)) return;

    el.style.setProperty("--swap-h", `${start}px`);
    // Two frames: one for the start height to be committed, one for the change
    // to be seen as a transition rather than folded into the same style pass.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => el.style.setProperty("--swap-h", `${end}px`));
    });

    // Hand the height back to the content once it has arrived. Also fires if
    // the transition is interrupted, so a fast second swap cannot strand a
    // fixed height on the element.
    const done = (e: TransitionEvent) => {
      if (e.propertyName !== "height") return;
      el.style.removeProperty("--swap-h");
    };
    el.addEventListener("transitionend", done);
    el.addEventListener("transitioncancel", done);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("transitionend", done);
      el.removeEventListener("transitioncancel", done);
      el.style.removeProperty("--swap-h");
    };
  }, [key]);

  // Runs on every render, after the DOM is committed but before the browser
  // paints — so `from` always holds the height the element is leaving. Split
  // from the effect above so it is not tied to `key`: the height can change for
  // reasons other than the swap (the reader dragging the resize handle), and a
  // stale measurement would animate from a size the box no longer had.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) from.current = el.getBoundingClientRect().height;
  });

  return ref;
}

/**
 * Yield to the browser between two synchronous stages.
 *
 * React batches state updates inside a single task, so setting three stages in
 * a row without yielding commits only the last one and the list appears to skip
 * straight to the end. One frame is the smallest possible yield that still lets
 * each stage paint — it is a rendering concern, not a simulated delay.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// kind → ScamType for prefilling the report form.
function kindToType(kind: AnalyzedIdentifier["kind"], content: string): ScamType {
  if (kind === "url" || kind === "email" || kind === "phone") return kind;
  return detectType(content);
}

/**
 * What the check is doing, stage by stage, on the paper surface of the card
 * itself — in place of the box it is working on.
 *
 * It sat below the card before, which read as a second, separate thing that had
 * appeared; putting it where the text was makes the check one continuous
 * surface, and makes plain that the work is being done *to* what you pasted.
 *
 * Every row is a branch the code genuinely takes. Rows are marked done when
 * their work has finished, so a fast check flashes through — the panel measures
 * the work rather than performing it.
 */
function CheckPipeline({
  stages,
  stage,
  done,
  t,
}: {
  stages: readonly Stage[];
  /** Null once every stage has completed — the closing frame. */
  stage: Stage | null;
  done: boolean;
  t: (k: MessageKey) => string;
}) {
  const cur = stage ? stages.indexOf(stage) : stages.length;
  return (
    <div
      role="status"
      aria-live="polite"
      className="check-fade-in border-t border-[var(--paper-dim)] bg-[var(--paper)]"
    >
      <div className="px-4 pt-3 pb-1 font-[family-name:var(--font-mono-ui)] text-[11px] font-medium tracking-[0.09em] uppercase text-[#5D6675]">
        {t(done ? "check.stage.done" : "check.stage.working")}
      </div>
      <ul className="list-none m-0 pt-1.5 pb-2.5">
        {stages.map((sKey) => {
          const idx = stages.indexOf(sKey);
          const state = done || idx < cur ? "done" : idx === cur ? "active" : "wait";
          return (
            <li
              key={sKey}
              className={`check-step grid grid-cols-[20px_1fr_auto] gap-[11px] items-center px-4 py-[7px] text-sm ${
                state === "active"
                  ? "text-[var(--ink)] font-medium"
                  : state === "done"
                    ? "text-[#5D6675]"
                    : "text-[#8A93A1]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`check-dot w-3.5 h-3.5 box-border rounded-full border-[1.5px] grid place-items-center ${
                  state === "active"
                    ? "border-[#00805B] border-t-transparent motion-safe:animate-spin"
                    : state === "done"
                      ? "border-[#00805B] bg-[var(--clear)]/[0.16]"
                      : "border-[#D2CEC4]"
                }`}
              >
                {/* The tick lands only on a finished row — it is the one mark
                    that says the work behind that line actually happened. */}
                {state === "done" && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-[9px] h-[9px]">
                    <path d="m1.8 6.2 2.8 2.8L10.2 3.4" stroke="#00A676" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span>{t(STAGE_LABEL[sKey])}</span>
              {/* A word, not an icon: the dot already carries the state
                  visually, and this is what a screen reader reads out. */}
              <span
                className={`check-meta font-[family-name:var(--font-mono-ui)] text-[10.5px] tracking-[0.06em] uppercase whitespace-nowrap ${
                  state === "active" ? "text-[#00805B]" : state === "done" ? "text-[#8A93A1]" : "text-transparent"
                }`}
              >
                {state === "active" ? t("check.stage.stepWorking") : t("check.stage.stepDone")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Where the work is happening, restated at the moment the claim is being tested.
 *
 * Pinned below the controls rather than inside the step list, because it is a
 * statement about the whole run and not about any one row — and because it is
 * the last thing on the card, which is where a reassurance belongs when the
 * thing it reassures about is still happening.
 *
 * Deliberately driven by an explicit claim rather than an `onDevice` boolean.
 * The first version took a boolean that the paste path always passed as true,
 * so the footer promised "Nothing has been uploaded" during the very request
 * that uploads the pasted text. A boolean invites that mistake, because the
 * reassuring value is also the default one; naming the claim forces each caller
 * to say which of them is true for the phase it is actually in.
 */
type PrivacyClaim = "on-device" | "on-device-done" | "sending" | "sent" | "server-ocr";

const PRIVACY_COPY = {
  // Reading a screenshot, or reading and parsing pasted text: genuinely local.
  "on-device":      ["check.stage.onDeviceLead", "check.stage.onDeviceNote"],
  "on-device-done": ["check.stage.finished",     "check.stage.finishedNote"],
  // Scoring. The content is POSTed to /api/check, so this says so while it is
  // in flight and after it lands. The server keeps a counter, not the content.
  "sending":        ["check.stage.sending",      "check.stage.sendingNote"],
  "sent":           ["check.stage.scored",       "check.stage.scoredNote"],
} as const satisfies Record<Exclude<PrivacyClaim, "server-ocr">, readonly [MessageKey, MessageKey]>;

/**
 * What is true about where the content is, for the phase the run is in.
 *
 * The paste path crosses the line mid-run — the local pass happens in the
 * browser and scoring POSTs the content — so the claim is derived per stage
 * rather than per pipeline. Exported for the tests, because getting this wrong
 * is a false statement about a user's data rather than a rendering bug, and
 * asserting on it through the source text could not tell the two apart.
 */
export function privacyClaimFor({
  pipeline,
  stage,
  ocrPath,
  done,
}: {
  pipeline: "paste" | "image" | null;
  stage: Stage | null;
  ocrPath: "local" | "server";
  done: boolean;
}): PrivacyClaim {
  if (pipeline === "paste") {
    // Scoring is the round trip, and the closing frame comes after it: once the
    // content has been sent, no later frame may claim it wasn't.
    if (stage === "scoring") return "sending";
    return stage === null ? "sent" : "on-device";
  }
  if (ocrPath === "server") return "server-ocr";
  return done ? "on-device-done" : "on-device";
}

function CheckPipelineFoot({ claim, t }: { claim: PrivacyClaim; t: (k: MessageKey) => string }) {
  return (
    <p className="px-4 py-2.5 border-t border-[var(--paper-dim)] text-[12.5px] text-[#5D6675] bg-[#F5F3EE]">
      {claim === "server-ocr" ? (
        t("check.stage.uploaded")
      ) : (
        <>
          <b className="text-[#00805B] font-semibold">{t(PRIVACY_COPY[claim][0])}</b>{" "}
          {t(PRIVACY_COPY[claim][1])}
        </>
      )}
    </p>
  );
}

interface CheckFlowProps {
  /**
   * Pre-seeds the check box. Used by the share target (app/share/page.tsx) so
   * content arriving from the OS share sheet lands in the same box a person
   * would have pasted into — nothing about the check itself differs.
   *
   * Only an initial value: the box stays fully editable, and this is not a
   * controlled prop, so later renders do not clobber what the user has typed.
   */
  initialContent?: string;
  /**
   * Which product surface this flow is running on, recorded with the check so
   * share-sheet volume is distinguishable from ordinary web use. Analysis is
   * identical either way — this is attribution only, never behaviour.
   */
  surface?: "web" | "share";
  /**
   * Called whenever the visible step changes, including on browser Back. Lets a
   * parent lay out around the flow without owning the flow's own state.
   */
  onStepChange?: (step: CheckStep) => void;
  /** Called with the content a check was actually run against. */
  onChecked?: (content: string) => void;
}

export default function CheckFlow({ initialContent = "", surface = "web", onStepChange, onChecked }: CheckFlowProps = {}) {
  const { t } = useLang();
  const { reportFailure, openManual } = useBugReport();
  const [step, setStep] = useState<Step>("input");
  // Seeded from the share sheet only. The Back-restore is applied after
  // hydration instead — see the effect below.
  const [content, setContent] = useState(initialContent);
  const [results, setResults] = useState<AnalyzedIdentifier[]>([]);
  // Region the server used for the last check. Null until a check has run.
  const [region, setRegion] = useState<string | null>(null);
  // Explicit region choice for checks. Null = auto: nothing is sent and the
  // server resolves from the geo header. Restored after hydration (like the
  // check draft) so the first render matches the server and the saved choice
  // lands immediately afterwards. Persisted on change.
  const [checkRegion, setCheckRegion] = useState<string | null>(null);
  // Everything the reader is told about a run, in one place.
  //
  // These four moved out of scattered useState calls into lib/checkFeedback
  // because the transitions between them are where the bugs were, and none of
  // them were reachable by a test while they lived here: a re-check error
  // survived into the next check and sat under a fresh verdict telling the
  // reader to distrust it; `busy` stayed false through a re-check, so pressing
  // Back left the Check button live and a second request could race the first;
  // and a .eml upload left the image banner up describing content it had just
  // replaced. The reducer is driven directly by __tests__/checkFeedback.
  const [feedback, dispatch] = useReducer(checkFeedback, INITIAL_FEEDBACK);
  const { recheck, imageRead } = feedback;
  const checkError = feedback.checkError
    ? t(feedback.checkError === "rate_limited" ? "check.rateLimited" : "check.serverError")
    : null;

  const [uploadLoading, setUploadLoading] = useState(false);
  // Which stage the running pipeline is in, and which pipeline it is. Both map
  // 1:1 onto branches in handleImageUpload / runCheck — there is no stage here
  // that the code does not really pass through.
  const [stage, setStage] = useState<Stage | null>(null);
  const [pipeline, setPipeline] = useState<"paste" | "image" | null>(null);
  // Which OCR path this run actually took. Kept separately from `stage` because
  // the closing frame has no live stage to read it off, and the two paths make
  // different privacy promises — deriving it from a cleared `stage` would have
  // the confirmation claim the work stayed on the device when it had not.
  const [ocrPath, setOcrPath] = useState<"local" | "server">("local");
  // Held for a beat after the last stage completes so the panel can say
  // "Checked" rather than vanishing mid-spin. Purely the closing frame of work
  // that has genuinely finished — it never gates the result.
  const [pipelineDone, setPipelineDone] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // Forward-address copy confirmation. Copying is the one part of forwarding the
  // web can actually do for someone — the forward itself happens in their mail
  // app, which no page can reach into.
  const [dragOver, setDragOver] = useState(false);
  // Full email-source analysis (unwrap → headers → identity flags → tracking),
  // populated in runCheck. null until a check runs. Everything the result page
  // needs (pixel report, tracking findings, sender headers/flags) is derived
  // from this single source of truth.
  const [emailAnalysis, setEmailAnalysis] = useState<EmailSourceAnalysis | null>(null);
  // The sender card shows only when the content actually parsed as email (a real
  // From address). The tracking section can show without one.
  const hasSender = !!emailAnalysis?.headers.fromAddress;
  const pixelReport =
    emailAnalysis?.tracking.pixelReport.hasTrackingPixels ? emailAnalysis.tracking.pixelReport : null;
  const trackingReport = emailAnalysis?.tracking ?? null;

  // Animates the card between the textarea's height and the panel's. Keyed on
  // whether the panel is up, so it runs on the swap and on nothing else — not
  // on every stage row, and not while the reader is typing.
  const swapRef = useSwapHeight(!!pipeline);

  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const emlRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // Put back the message a check was run against, after a Back.
  //
  // Next's App Router reloads the document when the user returns to a
  // same-document pushState entry, so this is a fresh mount by the time we get
  // here and every piece of React state has gone — see lib/checkDraft for the
  // full account of why nothing in the tree can survive it.
  //
  // After hydration, not during render. Reading storage in a lazy useState
  // initialiser put the draft into the very first client render while the
  // server had rendered an empty box, and React threw a hydration mismatch on
  // every restore. It *looked* fine only because React then regenerates the
  // tree — the box ended up correct with an error behind it.
  //
  // So the first client render matches the server's empty textarea, and the
  // draft lands immediately afterwards. Reading and clearing sit together here
  // because an effect runs once, after commit, and is the one place it is safe
  // to consume: a render must be pure, and React re-runs initialisers during
  // hydration and under Strict Mode.
  //
  // A seeded box wins outright — content from the share sheet is what the
  // reader has just chosen to check — but the draft is consumed either way so
  // it cannot resurface on a later Back.
  // useSyncExternalStore is the usual answer for browser state, and is wrong
  // here: it returns the store's value on every render, so the restored draft
  // would overwrite each keystroke and the box could never be edited. This is a
  // one-shot restore that then becomes ordinary editable state, which is an
  // effect's job — the setState below is the synchronisation, not a cascade.
  useEffect(() => {
    const draft = readCheckDraft();
    clearCheckDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore of browser state after hydration; see the note above.
    if (draft && !initialContent) setContent(draft);
    const stored = readStoredCheckRegion();
    // One-shot restore alongside the draft above.
    if (stored) setCheckRegion(stored);
    // Mount only: a later run would fight the reader for the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History contract: every step transition is mirrored in history state, and
  // history is the single source of truth for backwards movement. Forward
  // transitions push an entry; the in-app back buttons call history.back() so
  // browser Back/Forward and the UI never diverge.
  useEffect(() => {
    if (!history.state?.step) history.replaceState({ step: "input" }, "");
    function onPopState(e: PopStateEvent) {
      setStep((e.state?.step as Step) ?? "input");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function goForward(next: Step) {
    setStep(next);
    history.pushState({ step: next }, "");
  }

  // Move focus to the step heading on transitions so screen readers announce
  // the new step (the steps replace each other in place, with no navigation).
  const prevStep = useRef<Step>("input");
  useEffect(() => {
    if (prevStep.current !== step) stepHeadingRef.current?.focus();
    prevStep.current = step;
  }, [step]);

  // Tell the parent which step is showing. Done in an effect on `step` rather
  // than inside goForward so browser Back — which moves the step via popstate,
  // not through goForward — is reported too. A parent laying out around the
  // flow must see every transition, not only the forward ones.
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // The closing "Checked" frame is a confirmation, not a state to sit in: it
  // holds just long enough to be read, then the card comes back with the text
  // the read produced. Cleared early if another run starts in the meantime.
  useEffect(() => {
    if (!pipelineDone) return;
    const timer = setTimeout(() => {
      setPipelineDone(false);
      setPipeline(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [pipelineDone]);

  // Image → QR decode (client-side) first, OCR fallback via /api/ocr.
  async function handleImageUpload(file: File) {
    setUploadError(null);
    dispatch({ type: "content-replaced" });
    setUploadLoading(true);
    setPipelineDone(false);
    setPipeline("image");
    // Whether this run got as far as text. Tracked locally rather than read
    // back off state in the `finally`, which closes over the render that
    // started the run and cannot see anything set since.
    let read = false;
    setOcrPath("local");
    try {
      let qrData: string | null = null;
      setStage("qr");
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const jsQR = (await import("jsqr")).default;
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code) qrData = code.data;
      } catch {
        // Not a QR or unreadable — fall through to OCR
      }

      // A decoded QR is the most on-device outcome there is — the image never
      // left the machine and no OCR was needed — so it gets the same closing
      // confirmation as every other successful read. Returning early without
      // one inverted the reassurance: the server path confirmed itself and the
      // local path stayed silent.
      if (qrData) {
        setContent(qrData);
        read = true;
        dispatch({ type: "image-read", via: "qr" });
        setPipelineDone(true);
        return;
      }

      // OCR on-device first: the image never leaves the machine, and it costs
      // us nothing. /api/ocr is the fallback for browsers that can't run the
      // WASM core, or when the local attempt fails outright.
      let cleaned: string | null = null;
      if (canRunClientOcr()) {
        setStage("ocr-local");
        try {
          const { recogniseImageText } = await import("@/lib/clientOcr");
          cleaned = await recogniseImageText(file);
        } catch (err) {
          // Local OCR unavailable or broken for this image — fall through to
          // the server rather than failing the upload.
          console.warn("[Upload] client OCR failed, falling back to server:", err);
          reportFailure("upload", err);
        }
      }

      if (cleaned === null) {
        setOcrPath("server");
        setStage("ocr-server");
        const formData = new FormData();
        formData.append("image", file);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        let res: Response;
        try {
          res = await fetch("/api/ocr", { method: "POST", body: formData, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error ?? "OCR request failed");
        }
        const data = await res.json() as { text?: string };
        cleaned = (data.text ?? "").trim();
      }

      if (cleaned) {
        setContent(cleaned);
        // The image path returns to the card rather than to a verdict, so the
        // panel's last frame is the only confirmation that the read finished
        // and that it finished where we said it would.
        read = true;
        dispatch({ type: "image-read", via: "ocr" });
        setPipelineDone(true);
      } else setUploadError(t("check.ocr.noText"));
    } catch (err) {
      console.error("[Upload] failed:", err);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      setUploadError(
        isTimeout
          ? t("check.ocr.timeout")
          : err instanceof Error && err.message
            ? err.message
            : t("check.ocr.failed"),
      );
      reportFailure("upload", err);
    } finally {
      setUploadLoading(false);
      setStage(null);
      // `pipeline` is deliberately left set when the run produced text: it is
      // what keeps the closing "Checked" frame addressed to the right list, and
      // the effect on `pipelineDone` clears both a beat later. Anything that
      // ends without a read (an error, no text found) takes the panel with it.
      if (!read) setPipeline(null);
      if (imageRef.current) imageRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  // .eml is just RFC822 text — read it on-device and drop the raw source into
  // the textarea so the headers (From/Reply-To) feed the check.
  async function handleEmlUpload(file: File) {
    setUploadError(null);
    // This replaces the textarea's contents, so a banner describing what an
    // earlier image read put there stops being true. The QR variant is the
    // worst of it: it would assert "that QR code points to the address now in
    // the box" about email source.
    dispatch({ type: "content-replaced" });
    try {
      const text = await file.text();
      setContent(text);
    } catch (err) {
      setUploadError(t("check.file.error"));
      reportFailure("upload", err);
    } finally {
      if (emlRef.current) emlRef.current.value = "";
    }
  }

  // Drag-and-drop onto the textarea: an image goes through the QR/OCR pipeline,
  // anything else (a .eml, .txt, or raw source) is read as email text. Routing
  // by MIME type keeps a dropped screenshot from being read as garbled text.
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) handleImageUpload(file);
    else handleEmlUpload(file);
  }

  // First checks use the persisted input choice; re-checks re-run the same
  // content against the region just picked on the result step. `overrideRegion`
  // is undefined only on the first-check path — every re-check passes an
  // explicit code or null for auto. Null sends nothing (server auto-resolves)
  // but still counts as a re-check for feedback routing, so the reducer's
  // `region`-presence convention keeps working via dispatchRegion below.
  async function runCheck(overrideRegion?: string | null) {
    if (!content.trim()) return;
    // A re-check is driven from the result step, where the pipeline panel and
    // the error block below the card are both off screen. It gets its own
    // in-place state on the region picker instead; the panel would otherwise
    // spin on a step nobody is looking at.
    const isRecheck = step === "result";
    const payloadRegion = isRecheck ? (overrideRegion ?? undefined) : (checkRegion ?? undefined);
    // Surface routing, not payload: a re-check to auto still reports on the
    // re-check surface, so fall back to the region that ran rather than
    // sending feedback nowhere.
    const dispatchRegion = isRecheck ? (payloadRegion ?? region ?? undefined) : undefined;
    dispatch({ type: "check-started", region: dispatchRegion });
    if (!isRecheck) {
      setPipelineDone(false);
      setPipeline("paste");
    }
    try {
      // Stage 1 — the on-device pass. Unwraps a forwarded message to the
      // original, parses its headers, derives the sender identity flags and
      // finds tracking pixels. All of it runs here, none of it is sent, and its
      // output is what the sender card and tracking section on the result are
      // built from — so this row names work whose product the reader goes on to
      // see. It ran after the fetch before, purely by habit.
      //
      // An earlier version of this panel split this into two rows ("reading",
      // then "extracting") over a trim() and a discarded extractIdentifiers()
      // call. Both were decoration: the identifiers a reader actually sees come
      // back from the server. Two honest rows beat three that flatter the wait.
      if (!isRecheck) {
        setStage("reading");
        // Without a yield React batches both stage updates into one commit and
        // the list jumps straight to the last row. One frame, for paint — not a
        // delay, and not tied to how long the work takes.
        await nextFrame();
      }
      const analysis = analyseEmailSource(content);

      // Stage 2 — scoring, which is the round trip. The content leaves the
      // device here and the footer says so while it does.
      if (!isRecheck) setStage("scoring");
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(payloadRegion ? { region: payloadRegion } : {}),
          ...(surface !== "web" ? { surface } : {}),
        }),
      });
      // The server's own body, not just the status: a 429 is the one failure
      // the reader can act on ("wait", not "retry"), and flattening it into the
      // generic message sent them straight back into the same wall. Matched on
      // `code` rather than the prose, which is translated.
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { code?: string };
        throw new CheckRequestError(body.code === "rate_limited" ? "rate_limited" : "server");
      }
      const data = await res.json() as { results: AnalyzedIdentifier[]; region?: string };
      setResults(data.results ?? []);
      // Remember which pack actually ran, so the coverage notice reflects the
      // server's decision rather than being re-derived on the client.
      setRegion(data.region ?? null);
      // Computed above, in the stage that named it. Same path as ReportForm
      // and /api/inbound.
      setEmailAnalysis(analysis);
      setShareCopied(false);
      // Report what was checked, not what the box holds: a region re-check
      // re-runs against the same content, and the strip should keep naming it.
      onChecked?.(content);
      // Written down before the transition, because going back to this entry
      // reloads the document and takes the component's state with it. Stored
      // only for as long as it takes to put it back — see lib/checkDraft.
      saveCheckDraft(content);
      // No "Checked" hold on this path: the verdict *is* the completion, and
      // pausing on a tick before showing it would be padding the very wait the
      // panel exists to explain.
      dispatch({ type: "check-succeeded", region: dispatchRegion ?? undefined });
      // The homepage counter reads its numbers from the server render, so it
      // has no way to know a check just moved one.
      //
      // Fired on re-checks too, because /api/check increments on every call —
      // it has no notion of a re-check, so the count really does move again.
      // Skipping it here would show a number the server has already changed.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("veriguard:check-complete"));
      }
      if (!isRecheck) goForward("result");
    } catch (err) {
      const limited = err instanceof CheckRequestError && err.kind === "rate_limited";
      // The reducer routes this to whichever surface is on screen: the region
      // picker for a re-check, the input step's block for a first check. A
      // re-check failure must never be silent — silence there reads as "your
      // correction applied", which is the opposite of what happened.
      dispatch({
        type: "check-failed",
        region: dispatchRegion ?? undefined,
        kind: limited ? "rate_limited" : "server",
      });
      // A rate limit is the service working as designed, not a fault to file.
      if (!limited) reportFailure("check", err);
    } finally {
      // `busy` is cleared by the reducer on both terminal events, so there is
      // nothing to reset here. What is left is the pipeline panel, which only
      // the first-check path ever raised.
      //
      // The rest of this block tears down the pipeline panel, which a re-check
      // never put up — and clearing `pipeline` here would take the *input*
      // step's panel down mid-run if one were somehow live. A re-check owns
      // only its own state, which the success and error paths have already set.
      if (!isRecheck) {
        setStage(null);
        // Take the panel down with the run, on every exit.
        //
        // `pipeline` is the single switch gating the panel *and* the textarea's
        // visibility, so leaving it set on the error path hid the box behind an
        // all-ticked panel with no way back to it but a reload — the primary
        // input, unreachable, after precisely the failure that makes someone
        // want to retry.
        //
        // The success path has already navigated to the result by this point,
        // so clearing here costs it nothing. A re-check never sets either, and
        // is excluded above rather than relying on them happening to be null.
        setPipeline(null);
        setPipelineDone(false);
      }
    }
  }

  // Share the verdicts (defanged) via the native share sheet, falling back to
  // the clipboard. The shared text never contains a live link to the scam.
  async function shareResults() {
    const lines = results.map((r) => {
      const label = t(KIND_META[r.kind].labelKey);
      const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
      return `${label}${value}: ${t(`verdict.${r.result.verdict}.label` as MessageKey)}`;
    });
    const text = `${t("check.share.summary")}\n${lines.join("\n")}\n${window.location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User dismissed the sheet, or share failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Clipboard unavailable (rare) — nothing sensible to do.
    }
  }

  // One flag for "a run is in progress", covering both kinds. A re-check used
  // to leave this false, so only the region <select> was disabled and the
  // submit and upload controls stayed live behind it.
  const busy = uploadLoading || feedback.busy;
  // The panel is on screen while a pipeline is running, and for the closing
  // frame after an image read finishes. `pipeline` alone is the switch, and it
  // also gates the textarea's visibility — so every exit from every path must
  // clear it, including the ones that fail.
  const pipeStages: readonly Stage[] | null =
    pipeline === "paste"
      ? PASTE_STAGES
      : pipeline === "image"
        // The two OCR stages are alternatives, not a sequence: only the one
        // actually taken is listed, so the panel never shows a row that this
        // particular run will not reach.
        ? IMAGE_STAGES.filter((sk) => (sk === "ocr-local" ? ocrPath === "local" : sk === "ocr-server" ? ocrPath === "server" : true))
        : null;
  const hasCamera = useHasCamera();

  // ── Report step ─────────────────────────────────────────────────────────────
  if (step === "report") {
    const ids = extractIdentifiers(content);
    // Prefer the unwrapped headers from the shared analysis so a forwarded email
    // prefills the original scammer's From/Reply-To, not the forwarder's.
    const headers = emailAnalysis?.headers ?? parseEmailHeaders(content);
    // For email source, distil the raw forward down to the legible scam content
    // (meaningful headers + decoded body) before prefilling the form — the user
    // shouldn't see, or be asked to submit, the transport/auth header storm,
    // MIME boundaries, or their own mailbox/relay headers. Non-email content
    // (URL/QR/text) is shown as-is. The server distils/scrubs again on submit;
    // this keeps the displayed content honest and matches what gets stored.
    const reportContent = headers.fromAddress
      ? distillEmailContent(content)
      : content;
    const primary = results[0];
    return (
      <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl overflow-hidden">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.report")}</h2>
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 w-full px-6 py-3.5 border-b border-[var(--rule)] text-sm font-semibold text-gray-300 hover:text-emerald-400 transition-colors"
        >
          <span aria-hidden="true">‹</span> {t("check.back.results")}
        </button>
        <div className="p-6">
          <ReportForm
            initialType={
              // A parsed From address means this is email source — report it as
              // such so the sender/reply-to/authentication fields all show.
              headers.fromAddress
                ? "email"
                : primary ? kindToType(primary.kind, content) : detectType(content)
            }
            initialContent={reportContent}
            initialScamUrl={ids.scamUrl}
            initialScamPhone={ids.scamPhone}
            initialScamEmail={headers.fromAddress || ids.scamEmail}
            initialScamReplyTo={headers.replyTo}
            initialAuth={{ spf: headers.spf, dkim: headers.dkim, dkimDomain: headers.dkimDomain, dmarc: headers.dmarc }}
            region={region}
          />
        </div>
      </div>
    );
  }

  // ── Result step ───────────────────────────────────────────────────────────────
  if (step === "result") {
    // Evidence pools across every identifier, so both columns derive from one
    // list — the sheet lists the findings, the rail names the tactics behind
    // them. Computed here rather than inside the sheet because the rail is its
    // sibling, not its child. Same list the sheet scores from, so the rail can
    // never name a tactic for evidence the sheet doesn't show.
    const allSignals =
      composeVerdictWithEvidence(results, pixelReport)?.signals ?? pooledSignals(results);
    // The rail is part of the result's shape, not a reward for finding
    // something. A clean check showing "0 of 6 matched" against the same six
    // names is the more useful answer — it says what we looked for and came up
    // empty, where an absent panel just leaves the reader wondering whether we
    // looked at all. It also means the two states are the same layout with
    // different content, so moving between them doesn't reflow the page.
    const showTactics = results.length > 0;

    // The sections describing what was inspected. Defined here so they can be
    // handed to VerdictBadge as its `supporting` slot: they have to render
    // between the risk score and the action steps, and they are siblings of the
    // scored-identifier breakdown rather than children of it (a header-only
    // email has tracking and sender analysis but no scored identifier).
    const supportingSections = (
      <>
          {/* Broader tracking surface — pixels plus click redirects, CSS
              beacons, read-receipt headers, meta refresh, etc. Sibling of the
              breakdown so it renders even for a header-only email with no scored
              identifiers. Shown when we found tracking, OR (as reassurance) when
              this was email source that came up clean. Findings carry their own
              copy; the values they surface are already non-clickable text. */}
          {trackingReport && (trackingReport.hasTracking || hasSender) && (
            <div className="space-y-2 border-t border-[var(--rule)] px-5 py-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t("tracking.heading")}
              </div>
              {trackingReport.findings.length > 0 ? (
                <>
                  <ul className="space-y-1.5">
                    {trackingReport.findings.map((f) => (
                      <li key={f.kind} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${STATUS_DOT.suspicious}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-gray-300 font-medium">{f.label}</span>
                          {f.count > 1 && <span className="text-gray-500"> ×{f.count}</span>}
                          <span className="block text-xs text-gray-500">{f.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-emerald-400/90 pl-[18px]">{t("tracking.safe")}</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t("tracking.none")}</p>
              )}
            </div>
          )}

          {/* Email sender analysis — only when the pasted content parsed as
              email source. Surfaces the display-name/Reply-To/auth picture that
              previously lived only inside the report form. All addresses and
              domains are defanged before display. */}
          {hasSender && emailAnalysis && (() => {
            const { headers, identityFlags: flags } = emailAnalysis;
            const authSummary = summariseAuth(headers);
            return (
              <div className="space-y-2 border-t border-[var(--rule)] px-5 py-4">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {t("email.analysis.heading")}
                </div>
                <dl className="space-y-1 text-sm">
                  {headers.fromAddress && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.from")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{defangEmail(headers.fromAddress)}</dd>
                    </div>
                  )}
                  {headers.replyTo && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.replyTo")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{defangEmail(headers.replyTo)}</dd>
                    </div>
                  )}
                  {authSummary && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-gray-500">{t("email.analysis.auth")}</dt>
                      <dd className="font-mono text-gray-400 break-all min-w-0">{authSummary}</dd>
                    </div>
                  )}
                </dl>
                {flags.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {flags.map((flag, i) => (
                      <li key={i} className="flex gap-2 text-sm text-amber-300/90">
                        <span aria-hidden="true" className="shrink-0">⚠</span>
                        <span className="min-w-0">{defangFlag(flag)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 pt-1">{t("email.analysis.clean")}</p>
                )}
              </div>
            );
          })()}
      </>
    );


    return (
      // No back link in this header any more: the checked-strip above the
      // results carries it, alongside the record of what was checked, so the
      // two live together instead of the affordance floating on its own.
      <div className="check-result-in">
        <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.result")}</h2>

        {/* Section label above both columns, so "Evidence" names the whole
            payoff rather than one panel inside it. Always present: it is part
            of the result's frame, and a heading that comes and goes with the
            verdict makes the safe and scam states two different pages. */}
        <p className="mb-3 flex items-center gap-2.5 font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-dim)]">
          {t("verdict.evidence.heading")}
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--rule)]" />
        </p>

        {/* The verdict leads at width; the tactics legend sits alongside as
            support and sticks while the evidence column scrolls. One column
            below 900px, where a 300px rail would squeeze both.
            The gap tracks the viewport rather than sitting at a fixed 20px:
            at desktop width two fixed-20px columns read as one crowded block
            instead of a sheet with a rail beside it. */}
        <div
          className={
            showTactics
              ? "grid gap-[clamp(20px,2.6vw,32px)] min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)] min-[900px]:items-start"
              : "grid gap-[clamp(20px,2.6vw,32px)]"
          }
        >
          <div className="min-w-0 bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl overflow-hidden">
        <div>
          {results.length === 0 ? (
            // Email source can parse to a sender analysis even when there are no
            // URL/phone/email identifiers to score — in that case the analysis
            // carries the payoff, so don't claim there's nothing. With no scored
            // identifier there is no verdict sheet to slot them into, so the
            // supporting sections render on their own here.
            <>
              {!hasSender && !trackingReport?.hasTracking && (
                <p className="px-5 py-5 text-sm text-gray-400">{t("check.nothing")}</p>
              )}
              {supportingSections}
            </>
          ) : (() => {
            // One overall verdict drives the page — the worst-identifier-wins
            // and tracking-pixel-nudge rules come from composeVerdict beneath
            // it, shared with the forward-to-us email reply so the two can't
            // drift.
            // Score and evidence come from one call, so the rows on screen add
            // up to the headline above them. Composing them separately put a 75
            // over rows totalling 120 — see composeVerdictWithEvidence.
            const composed = composeVerdictWithEvidence(results, pixelReport)!;
            const worst = results.reduce((acc, r) =>
              VERDICT_RANK[r.result.verdict] > VERDICT_RANK[acc.result.verdict] ? r : acc,
            );
            const overall = { ...worst.result, ...composed };

            return (
              <>
                {/* The verdict leads the sheet directly. It had an "Overall
                    verdict" eyebrow above it, which labelled the one element on
                    the page that needs no label — the headline says "Likely a
                    scam" in the verdict's own colour. */}
                <VerdictBadge
                  result={overall}
                  region={region}
                  supporting={
                    <>
                {/* Region correction + coverage honesty. The picker is always
                    visible: geo-IP misfires for travellers and VPN users, and
                    the old notice hid it on full coverage — exactly when a
                    wrong guess most needed correcting. The warning band stays
                    conditional (CoverageNotice returns null on full), so the
                    top rule below only draws around something. */}
                <div className="border-t border-[var(--rule)] px-5 py-4 space-y-3">
                  <CheckRegionPicker
                    id="result-region"
                    value={checkRegion ?? region}
                    onChange={(code) => {
                      setCheckRegion(code);
                      writeStoredCheckRegion(code);
                      void runCheck(code);
                    }}
                    disabled={feedback.busy}
                    recheck={recheck}
                  />
                  {overallCoverage(results) !== "full" && (
                    <CoverageNotice coverage={overallCoverage(results)} />
                  )}
                </div>

                {/* Neutral breakdown — every identifier as a quiet row with a
                    small status dot. No competing card colours.

                    Only shown when it says something the verdict above hasn't.
                    One identifier and no pixel means every row repeats the
                    headline — "Message · Looks good" under "Looks good" — and a
                    section that restates the conclusion teaches the reader that
                    parts of this sheet aren't worth reading. It earns its place
                    when there are several identifiers to tell apart (a clean
                    message carrying a dodgy link is only visible here) or when
                    the pixel row and its ESP links have something to add. */}
                {(results.length > 1 || pixelReport) && (
                <div className="space-y-2 border-t border-[var(--rule)] px-5 py-4">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("verdict.breakdown.heading")}
                  </div>
                  <ul className="space-y-1.5">
                    {results.map((r, i) => {
                      const meta = KIND_META[r.kind];
                      return (
                        <li key={`${r.kind}-${i}`} className="flex items-center gap-2.5 text-sm">
                          <span className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[r.result.verdict]}`} aria-hidden="true" />
                          <span aria-hidden="true">{meta.icon}</span>
                          {r.value && r.kind !== "message" ? (
                            <span className="font-mono text-gray-400 break-all min-w-0 flex-1">{defangValue(r.kind, r.value)}</span>
                          ) : (
                            <span className="text-gray-400 flex-1">{t(meta.labelKey)}</span>
                          )}
                          <span className="shrink-0 text-gray-300 font-medium">{t(`verdict.${r.result.verdict}.status` as MessageKey)}</span>
                        </li>
                      );
                    })}
                    {pixelReport && (
                      <li className="flex items-center gap-2.5 text-sm">
                        <span className={`shrink-0 w-2 h-2 rounded-full ${STATUS_DOT.suspicious}`} aria-hidden="true" />
                        <span className="text-gray-400 flex-1">{t("verdict.breakdown.pixel")}</span>
                        <span className="shrink-0 text-gray-300 font-medium">{pixelReport.pixels.length}</span>
                      </li>
                    )}
                  </ul>
                  {pixelReport && (
                    <div className="text-xs text-gray-500 space-y-1 pl-[18px]">
                      {pixelReport.pixels.flatMap((p) => p.notes).map((note, i) => (
                        <p key={i}>• {note}</p>
                      ))}
                    </div>
                  )}
                  {/* Direct line to each identified platform's abuse channel —
                      reporting the sender here can shut the scammer's account down. */}
                  {pixelReport && pixelReport.espReports.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-[18px] pt-0.5">
                      {pixelReport.espReports.map((r) => (
                        <a
                          key={r.esp}
                          href={r.href}
                          {...(r.kind === "url" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-[var(--caution)] hover:bg-amber-900/40 hover:text-amber-200 transition-colors"
                        >
                          <span aria-hidden="true">🚩</span>
                          {t("verdict.breakdown.reportEsp", { esp: r.esp })}
                          {r.kind === "url" && (
                            <>
                              <span className="sr-only"> ({t("a11y.newTab")})</span>
                              <span aria-hidden="true">↗</span>
                            </>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                )}
                    {supportingSections}
                    </>
                  }
                />
              </>
            );
          })()}


          {/* One action row rather than a stack of full-width buttons. Report is
              the primary act and leads; share, re-check and "wrong verdict" are
              peers beside it. Keeping them on one rule-topped row makes the set
              read as "what you can do next" instead of three separate demands.
              "Wrong verdict?" belongs here specifically: the moment someone
              disagrees with us is the moment we most need to hear about it, and
              burying that behind the floating bug button loses the correction. */}
          <div className="flex flex-wrap gap-2 border-t border-[var(--rule)] bg-black/[0.12] px-5 py-3.5">
            {(() => {
              // "Clean" means nothing flagged it — every identifier safe, no
              // tracking pixel, and no sender-spoofing flags. A pixel or a flag
              // pushes the verdict up, so the CTA matches that (the stronger
              // "report", not the softer "report anyway").
              const clean = isClean(results, pixelReport, emailAnalysis?.identityFlags ?? []);
              return (
                <button
                  onClick={() => goForward("report")}
                  className={`rounded-lg border px-3.5 py-2.5 text-[13.5px] font-medium transition-colors hover:border-[#3B4759] ${
                    clean
                      ? "border-[var(--rule)] bg-transparent text-[var(--text-dim)]"
                      : "border-[var(--ink-3)] bg-[var(--ink-3)] text-[var(--foreground)]"
                  }`}
                >
                  {clean ? t("check.reportAnyway") : t("check.report")}
                </button>
              );
            })()}

            {results.length > 0 && (
              <button
                onClick={shareResults}
                className="rounded-lg border border-[var(--rule)] bg-transparent px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--foreground)] transition-colors hover:border-[#3B4759]"
              >
                {shareCopied ? t("check.shareCopied") : t("check.share")}
              </button>
            )}

            <button
              onClick={openManual}
              className="rounded-lg border border-[var(--scam)]/50 bg-transparent px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--scam-text)] transition-colors hover:bg-[var(--scam)]/10"
            >
              {t("check.wrongVerdict")}
            </button>
          </div>
        </div>
          </div>

          {showTactics && (
            // Top-aligned with the sheet, with no padding of its own: the
            // Evidence label above spans both columns, so the rail and the
            // sheet start on the same line and the grid does the aligning.
            // A pt here was an attempt to put the rail's heading on the
            // verdict's baseline, which it cannot do — the verdict is a
            // display face with its own leading, so the two never met.
            <aside className="min-w-0 min-[900px]:sticky min-[900px]:top-[18px]">
              <Tactics signals={allSignals} />
            </aside>
          )}
        </div>
      </div>
    );
  }

  // ── Input step ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <h2 ref={stepHeadingRef} tabIndex={-1} data-step-heading className="sr-only">{t("check.step.input")}</h2>

      {/* Hidden file inputs */}
      <input ref={imageRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
      <input ref={emlRef} type="file" accept=".eml,message/rfc822,text/plain" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEmlUpload(f); }} />

      {/* Region rides above the card as its own control rather than inside a
          header row on the paper. It drives the check but is not the content, so
          it reads as a setting for the box below — and lifting it out reclaims
          the header row (and the "Suspicious content" label beside it) that
          crowded the top of the input, worst of all on a phone. Right-aligned
          and quiet; dark-surface styling, since this sits on the page rather
          than the paper card. */}
      <div className="flex items-center justify-end">
        <CheckRegionPicker
          id="check-region"
          value={checkRegion}
          onChange={(code) => {
            setCheckRegion(code);
            writeStoredCheckRegion(code);
          }}
          disabled={busy}
          compact
          small
          prefix={t("check.region.shortLabel")}
          selectClassName="max-w-[150px]"
        />
      </div>

      {/* The check card is deliberately light on a dark page: it reads as paper,
          the thing you put a message onto. Pasting is the primary action, so the
          textarea leads and the capture options sit in the footer beside the
          submit — the old arrangement put three bordered cards above the box and
          an "or paste below" divider under them, which made paste the fallback. */}
      {/* The card animates its own height across the swap. The panel replaces
          the textarea *and* adds a footer below the button row, so the change is
          spread across the whole card rather than confined to one row — this is
          the element whose size actually moves, and animating anything smaller
          left the 25px jump exactly where it was. */}
      <div
        ref={swapRef}
        className={`check-swap bg-[var(--paper)] text-[var(--ink)] rounded-2xl overflow-hidden relative shadow-[0_18px_44px_-20px_rgba(0,0,0,0.6)] transition-shadow ${
          dragOver ? "ring-2 ring-[var(--clear)]" : ""
        }`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={handleDrop}
      >
        {/* The pasted text steps aside for the work being done on it, rather
            than the two stacking — the panel is about that text, so occupying
            its place is what makes them read as one thing rather than two.
            Hidden, not unmounted: unmounting a focused textarea drops focus to
            the body, and the box must come back with its content and scroll
            position intact. */}
        <label htmlFor="check-content" className="sr-only">{t("check.contentLabel")}</label>
        {/* The textarea and the panel take turns in this one row, and the row
            animates between their two heights so the card grows and shrinks
            rather than snapping — it moved 25px in a single frame before, which
            reads as a flinch at the moment the reader is waiting to be
            reassured. The textarea stays mounted (hidden) throughout:
            unmounting a focused field drops focus to the body, and the box must
            come back with its content and scroll position intact. */}
        <div className="min-w-0">
            <textarea
              hidden={!!pipeStages}
              id="check-content"
              value={content}
              onChange={(e) => { setContent(e.target.value); dispatch({ type: "content-replaced" }); }}
              placeholder={t("check.placeholder")}
              rows={4}
              className="w-full min-h-[118px] px-4 py-4 bg-transparent text-[var(--ink)] placeholder-[#8A93A1] border-0 resize-y text-base leading-relaxed focus:outline-none block"
            />

            {pipeStages && (
              <CheckPipeline
                stages={pipeStages}
                stage={pipelineDone ? null : stage}
                done={pipelineDone}
                t={t}
              />
            )}
        </div>

        {/* Capture options and the submit share one bar: they are all ways to
            start the same check, and the chips are secondary to pasting. */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--paper-dim)] bg-[#F5F3EE]">
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            disabled={busy}
            aria-busy={uploadLoading}
            className={CAPTURE_OPTION}
          >
            <span className="shrink-0">{uploadLoading ? <SpinnerIcon /> : <ImageIcon />}</span>
            {t("check.uploadImage")}
          </button>

          {hasCamera && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className={CAPTURE_OPTION}
            >
              <span className="shrink-0"><CameraIcon /></span>
              {t("check.takePhoto")}
            </button>
          )}

          <button
            type="button"
            onClick={() => emlRef.current?.click()}
            disabled={busy}
            className={CAPTURE_OPTION}
          >
            <span className="shrink-0"><EmailFileIcon /></span>
            {t("check.uploadEml")}
          </button>

          {/* The button goes quiet while the panel is up, and says "done" for
              the closing frame after an image read.

              It used to spin with "Analysing…" during a paste check, three
              inches under a panel naming the actual stage — two spinners for
              one wait, the vaguer of them on the louder element. The panel is
              strictly the better narrator, so when it is on screen the button
              stops competing and simply reads as unavailable.

              It stays enabled through the closing "Checked" frame on the image
              path: that frame lands on the step where the reader's next act is
              to press this button, and disabling it for 900ms meant the control
              was inert at the exact moment their hand arrived. A fixed
              min-width stops the footer reflowing as the label changes. */}
          <button
            onClick={() => runCheck()}
            disabled={busy || !content.trim()}
            aria-busy={feedback.busy}
            className={`ml-auto max-sm:w-full max-sm:ml-0 min-w-[172px] inline-flex items-center justify-center gap-2.5 rounded-[9px] px-5 py-2.5 font-semibold text-[15px] transition-colors ${
              pipelineDone
                ? "bg-[#00805B] text-white"
                : "bg-[var(--ink)] text-white hover:bg-[#232F42] disabled:opacity-60 disabled:cursor-not-allowed"
            }`}
          >
            {pipelineDone && (
              <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="w-[13px] h-[13px]">
                <path d="m1.8 6.2 2.8 2.8L10.2 3.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="truncate">
              {pipelineDone ? t("check.checkedButton") : t("check.submit")}
            </span>
          </button>
        </div>

        {/* Below the controls, so the last word on the card while it works is
            where the work is happening. */}
        {pipeStages && (
          <CheckPipelineFoot claim={privacyClaimFor({ pipeline, stage, ocrPath, done: pipelineDone })} t={t} />
        )}

        {dragOver && (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center bg-[rgba(0,166,118,0.13)] backdrop-blur-[2px] pointer-events-none font-[family-name:var(--font-mono-ui)] text-[13px] tracking-[0.06em] uppercase font-semibold text-[#00674A]"
          >
            {t("check.dropHere")}
          </div>
        )}
      </div>

      {/* The image path's handover: we read it, now you check it.
          Suppressed while the panel is up so the closing tick and this don't
          both claim the moment — this takes over as the panel retires. */}
      {imageRead && !pipeStages && (
        <div
          role="status"
          className="rounded-xl border border-[var(--clear)]/35 bg-[var(--clear)]/[0.07] px-4 py-3"
        >
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--clear)]">
            <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="w-[13px] h-[13px] shrink-0">
              <path d="m1.8 6.2 2.8 2.8L10.2 3.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t(imageRead === "qr" ? "check.qr.readTitle" : "check.ocr.readTitle")}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
            {t(imageRead === "qr" ? "check.qr.readBody" : "check.ocr.readBody")}
          </p>
        </div>
      )}

      {/* Paste guidance for users who aren't sure how to copy on mobile */}
      {!content && !pipeStages && (
        <p className="text-xs text-[var(--faint)] px-0.5">
          {t("check.pasteHint")}{" "}
          <span className="hidden sm:inline">{t("check.dropHint")}</span>
        </p>
      )}


      {uploadError && <p className="text-sm text-red-400" role="alert">{uploadError}</p>}

      {checkError && (
        <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {checkError}
        </div>
      )}

      {/* Forward-to-us. Deliberately below the submit button and visually set
          apart, because it is not another way to fill in the box above — it is a
          different route entirely: you act in your MAIL APP, not on this page,
          and the verdict comes back by email rather than appearing here.
          Grouping it with the upload options implied an equivalence that misled.

          There is no mailto here on purpose. A mailto opens a blank compose
          window, but forwarding is an action taken on a message the user already
          has in their mailbox — no web API can reach in and do that. A button
          promising "Forward" that opens an empty email is worse than no button,
          so we do the one thing the page genuinely can (copy the address) and
          state plainly where the rest happens. */}
    </div>
  );
}
