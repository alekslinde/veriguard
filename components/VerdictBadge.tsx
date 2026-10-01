"use client";

import { CheckResult, PhoneIntel } from "@veriguard/detect/scamDetector";
import type { Signal } from "@veriguard/detect/engineTypes";
import { matchedTactics, TACTIC_IDS } from "@/lib/signalTactics";
import { defangText } from "@veriguard/detect/urlSanitizer";
import { reportingFor, type ReportingLink as ReportingLinkData } from "@/lib/reportingResources";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import ReportingLink from "./ReportingLink";

// Verdict colour comes from the tokens, and only from them: red is the verdict
// colour, amber is reserved for statements about our own coverage. "unknown"
// means we could not reach a view — that is a limit of ours, not a finding
// about the message — so it takes the neutral rule rather than a warning hue.
const VERDICTS: Record<
  CheckResult["verdict"],
  { dot: string; text: string; bar: string; edge: string; glow: string }
> = {
  safe:        { dot: "bg-[var(--clear)]",   text: "text-[var(--clear)]",     bar: "bg-[var(--clear)]",   edge: "border-[var(--clear)]/35",   glow: "ring-[rgba(0,166,118,0.18)]" },
  suspicious:  { dot: "bg-[var(--caution)]", text: "text-[var(--caution)]",   bar: "bg-[var(--caution)]", edge: "border-[var(--caution)]/35", glow: "ring-[rgba(232,163,61,0.18)]" },
  likely_scam: { dot: "bg-[var(--scam)]",    text: "text-[var(--scam-text)]", bar: "bg-[var(--scam)]",    edge: "border-[var(--scam)]/35",    glow: "ring-[rgba(214,69,61,0.18)]" },
  unknown:     { dot: "bg-[var(--faint)]",   text: "text-[var(--text-dim)]",  bar: "bg-[var(--faint)]",   edge: "border-[var(--rule)]",       glow: "ring-[rgba(124,135,154,0.18)]" },
};

const EYEBROW =
  "font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.11em] text-[var(--faint)]";

// The source tag on an evidence row. Related to EYEBROW but not the same job:
// that one labels a field in a panel, this one tags a line of a receipt, where
// several stack vertically down a column. Tighter tracking and regular weight
// keep the tag subordinate to the finding beside it — at the field label's
// 0.11em the tags read as a column of headings competing with the text.
const ROW_SOURCE =
  "block font-[family-name:var(--font-mono-ui)] text-[10.5px] uppercase tracking-[0.07em] text-[var(--faint)]";

const SOURCE_KEY: Record<Signal["source"], MessageKey> = {
  link:       "verdict.evidence.source.link",
  message:    "verdict.evidence.source.message",
  sender:     "verdict.evidence.source.sender",
  phone:      "verdict.evidence.source.phone",
  attachment: "verdict.evidence.source.attachment",
  score:      "verdict.evidence.source.score",
};

// ── Evidence ──────────────────────────────────────────────────────────────────

// One row per signal, each showing what it contributed. Publishing the weights
// is the point: detection is open source precisely so people can check our
// reasoning, and a score with no breakdown asks to be taken on faith.
function Evidence({ signals }: { signals: Signal[] }) {
  const { t } = useLang();
  if (!signals.length) return null;

  // Rows run edge to edge on dashed rules rather than sitting in a bordered
  // card. The sheet is the card; a second frame inside it drew a box around the
  // evidence and another around the box. Dashed rules separate items within one
  // list, where a solid rule would read as a break between sections.
  return (
    <ul className="py-[5px]">
      {signals.map((s, i) => (
        <li
          key={i}
          className="grid grid-cols-[1fr_auto] items-baseline gap-3.5 border-b border-dashed border-white/[0.09] px-5 py-2.5 last:border-b-0"
        >
          <div className="min-w-0">
            <div className={`${ROW_SOURCE} mb-[3px]`}>{t(SOURCE_KEY[s.source])}</div>
            <p className="text-[14px] leading-relaxed text-[var(--foreground)]">{defangText(s.text)}</p>
          </div>
          {/* Tabular figures so the column of weights lines up as a column. */}
          <span
            className={`shrink-0 whitespace-nowrap font-[family-name:var(--font-mono-ui)] text-[13px] font-semibold tabular-nums ${
              s.points > 0 ? "text-[var(--caution)]" : s.points < 0 ? "text-[var(--clear)]" : "text-[var(--faint)]"
            }`}
          >
            {s.points > 0 ? `+${s.points}` : s.points < 0 ? `${s.points}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Action steps shown for actionable verdicts ────────────────────────────────

function ActionSteps({ verdict, reporting }: { verdict: "suspicious" | "likely_scam"; reporting: ReportingLinkData }) {
  const { t } = useLang();
  const heading = t(`verdict.${verdict}.nextSteps` as MessageKey);
  // The report step is a node, not a string: the body name links to its
  // reporting URL where the pack carries one. Plain text elsewhere keeps the
  // list homogeneous — every row is still "one thing to do".
  const steps: React.ReactNode[] =
    verdict === "likely_scam"
      ? [
          t("verdict.likely_scam.step1"),
          t("verdict.likely_scam.step2"),
          t("verdict.likely_scam.step3"),
          (<>{t("verdict.likely_scam.step4.pre")} <ReportingLink link={reporting} /></>),
        ]
      : [
          t("verdict.suspicious.step1"),
          t("verdict.suspicious.step2"),
          t("verdict.suspicious.step3"),
        ];

  const accentCls = verdict === "likely_scam" ? "text-[var(--scam-text)]" : "text-[var(--caution)]";

  // A band of the sheet rather than a card set into it. The steps are what the
  // verdict asks of you, so they carry a section heading on a top rule — an
  // inset panel with a coloured edge made them look like an aside.
  return (
    <div className="border-t border-[var(--rule)] px-5 py-4">
      <h3
        className={`mb-3 font-[family-name:var(--font-mono-ui)] text-[11px] font-semibold uppercase tracking-[0.09em] ${accentCls}`}
      >
        {heading}
      </h3>
      <ol className="grid list-none gap-2.5">
        {steps.map((step, i) => (
          <li
            key={i}
            className="grid grid-cols-[20px_1fr] items-baseline gap-2.5 text-[14.5px] leading-relaxed text-[var(--foreground)]"
          >
            <span
              className={`font-[family-name:var(--font-mono-ui)] text-[12px] font-semibold tabular-nums ${accentCls}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Phone intelligence panel ──────────────────────────────────────────────────

const LINE_TYPE_META: Record<PhoneIntel["lineType"], { labelKey: MessageKey }> = {
  mobile:       { labelKey: "phone.lineType.mobile" },
  fixed:        { labelKey: "phone.lineType.fixed" },
  voip_likely:  { labelKey: "phone.lineType.voip" },
  premium:      { labelKey: "phone.lineType.premium" },
  freecall:     { labelKey: "phone.lineType.freecall" },
  shared_cost:  { labelKey: "phone.lineType.shared" },
  emergency:    { labelKey: "phone.lineType.emergency" },
  unknown:      { labelKey: "phone.lineType.unknown" },
};

const SPOOFING_RISK_STYLE: Record<PhoneIntel["spoofingRisk"], { labelKey: MessageKey; cls: string }> = {
  low:       { labelKey: "phone.risk.low",      cls: "text-[var(--clear)]" },
  medium:    { labelKey: "phone.risk.medium",   cls: "text-[var(--caution)]" },
  high:      { labelKey: "phone.risk.high",     cls: "text-[var(--caution)]" },
  very_high: { labelKey: "phone.risk.veryHigh", cls: "text-[var(--scam-text)]" },
};

function PhoneIntelPanel({ intel, reporting }: { intel: PhoneIntel; reporting: ReportingLinkData }) {
  const { t } = useLang();
  const lt   = LINE_TYPE_META[intel.lineType];
  const risk = SPOOFING_RISK_STYLE[intel.spoofingRisk];

  return (
    <div className="space-y-3 border-t border-[var(--rule)] px-5 py-4">
      <div className={EYEBROW}>
        {t("phone.heading")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.type")}</div>
          <div className="text-[13.5px] text-[var(--foreground)]">{t(lt.labelKey)}</div>
        </div>
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.country")}</div>
          <div className="text-[13.5px] text-[var(--foreground)]">{intel.country}</div>
        </div>
        {intel.region && (
          <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
            <div className={EYEBROW}>{t("phone.area")}</div>
            <div className="text-[13.5px] text-[var(--foreground)]">{intel.region}</div>
          </div>
        )}
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5">
          <div className={EYEBROW}>{t("phone.fakeRisk")}</div>
          <div className={`text-[13.5px] font-medium ${risk.cls}`}>{t(risk.labelKey)}</div>
        </div>
        {intel.normalised && (
          <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 space-y-0.5 col-span-2">
            <div className={EYEBROW}>{t("phone.formatted")}</div>
            <div className="text-[13.5px] text-[var(--foreground)] font-[family-name:var(--font-mono-ui)]">{intel.normalised}</div>
          </div>
        )}
      </div>

      {intel.wangiriRisk && (
        <div className="rounded-lg border border-[var(--scam)]/30 bg-[var(--ink)] p-3 text-[13.5px] text-[var(--foreground)] space-y-1">
          <div className="font-bold">{t("phone.wangiri.title")}</div>
          <p>{bold(t("phone.wangiri.body"))}</p>
        </div>
      )}

      <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 text-[13.5px] text-[var(--text-dim)] space-y-1.5">
        <div className="font-medium text-[var(--foreground)]">{t("phone.spoof.title")}</div>
        <p>{t("phone.spoof.body")}</p>
        <p>
          {t("phone.spoof.report.pre")}{" "}
          <ReportingLink link={reporting} />{" "}
          {t("phone.spoof.report.post")}
        </p>
      </div>
    </div>
  );
}

// Trim a signal down to something quotable inside another sentence.
//
// Signal text is written to stand alone in an evidence row, so it often carries
// a colon and the matched terms in their own quotes — "Asks for sensitive info:
// \"bitcoin\", \"gift card\"". Quoting that whole string nests quotes inside
// quotes and reads as a mistake. The clause before the colon is the finding;
// the list after it is already visible in the row above.
function citeSignal(text: string): string {
  const full = defangText(text);
  const head = full.split(/[:—]/)[0].trim();
  // Inner straight quotes become single quotes so they can't close the curly
  // pair wrapping them — "impersonating \"mygov\"" would otherwise render as
  // a quote inside a quote and read as a typo.
  return (head.length >= 12 ? head : full).replace(/"/g, "'");
}

// ── Risk score ────────────────────────────────────────────────────────────────

// The thresholds are drawn on the track rather than described underneath it, so
// "why is this a scam and not merely suspicious" is answerable by looking.
function RiskScore({ score, bar, tone, signals }: { score: number; bar: string; tone: string; signals: Signal[] }) {
  const { t } = useLang();

  // Which band the score landed in, in the engine's own terms — the boundaries
  // here are scoreToResult's, and the ticks drawn on the track below are the
  // same two numbers. A score with no account of why it means what it means
  // asks to be taken on faith, which is the opposite of publishing weights.
  // Real findings only — the clamp row is arithmetic about the total, not an
  // observation, so it must not count towards "how many rules did this trip".
  const findings = signals.filter((x) => x.source !== "score");

  // The pile-up argument ("tripping this many isn't bad luck") only holds when
  // the score came from several independent findings. A 45 built from two rows
  // is still a scam, but claiming a pile-up there is an overclaim the evidence
  // directly above it disproves.
  const bandKey =
    score >= 45
      ? findings.length >= 4 ? "verdict.score.band.scamMany" : "verdict.score.band.scam"
      : score >= 20 ? "verdict.score.band.suspicious"
      : "verdict.score.band.safe";

  // The clamp row records the raw total when the ceiling bit. Explaining the
  // gap matters most at 100, where the headline number is the ceiling rather
  // than the sum and the evidence visibly adds up to more.
  const clamp = signals.find((x) => x.source === "score");
  const raw = clamp ? score - clamp.points : null;

  // A single signal heavy enough to clear the scam line on its own. Named only
  // when that is literally true, and only in the scam band — "X alone clears
  // it" about a score that needed three signals to get there would be a
  // sentence the evidence above it contradicts.
  const heaviest = findings
    .reduce<Signal | null>((a, x) => (a === null || x.points > a.points ? x : a), null);
  const clincher = score >= 45 && heaviest && heaviest.points >= 45 ? heaviest : null;

  // Both clauses can be true at once, and at the ceiling both matter: the cap
  // explains why the headline is 100 when the evidence adds to more, and the
  // clincher explains why it was a scam regardless of the cap.
  const band =
    t(bandKey) +
    (clincher
      ? t("verdict.score.band.clincher", { signal: citeSignal(clincher.text), points: clincher.points })
      : "") +
    (raw !== null ? t("verdict.score.band.capped", { raw }) : "");

  return (
    // The score is the sheet's conclusion, so it sits on its own tinted ground
    // rather than running on as another block of the column. The tint is the
    // same inset treatment used elsewhere for a panel set into a surface, and
    // it does the separating that a rule would otherwise have to.
    <div className="bg-black/[0.22] px-5 pb-5 pt-4">
      <div className="flex items-baseline justify-between gap-3 font-[family-name:var(--font-mono-ui)]">
        {/* Not the eyebrow treatment used elsewhere: this labels the sheet's
            headline figure, so it carries the weight of a section heading
            rather than the whisper of a field label. */}
        <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-dim)]">
          {t("verdict.score.label")}
        </h3>
        {/* The figure takes the verdict's colour. It is the same statement as
            the headline above it, said as a number — leaving it neutral made
            the sheet's loudest element the one that declined to commit. */}
        <div className="tabular-nums">
          <span className={`text-[27px] font-semibold ${tone}`}>{score}</span>
          <span className="ml-0.5 text-[14px] text-[var(--text-dim)]">/100</span>
        </div>
      </div>
      <div
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("verdict.riskScore", { n: score })}
        className="relative mt-3 h-[7px] w-full overflow-hidden rounded-[4px] bg-[var(--ink-3)]"
      >
        <div
          className={`h-[7px] rounded-[4px] transition-[width] duration-700 ease-out ${bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {/* The boundaries are drawn on the track, not described under it: a tick
          rising into the bar ties each label to the point it marks, where two
          floating numbers left the reader measuring by eye. 20 and 45 are
          scoreToResult's own thresholds. */}
      <div className="relative mt-[5px] h-5" aria-hidden="true">
        {([[20, "verdict.score.caution"], [45, "verdict.score.scam"]] as const).map(([at, key]) => (
          <span
            key={at}
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-[family-name:var(--font-mono-ui)] text-[10px] text-[var(--faint)]"
            style={{ left: `${at}%` }}
          >
            <span className="absolute -top-[9px] left-1/2 h-[6px] w-px bg-[var(--ink-3)]" />
            {at} · {t(key)}
          </span>
        ))}
      </div>
      {/* Inside the tinted band, under a rule: the sentence explains this
          score, so it belongs to the panel rather than floating after it. */}
      <p className="mt-3 border-t border-[var(--rule)] pt-3 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        {bold(band)}
      </p>
    </div>
  );
}

// ── Tactics ───────────────────────────────────────────────────────────────────

// The same six names the Learn page teaches, so a reader who has been there
// recognises them here. Unmatched tactics stay visible rather than being
// filtered out: "we looked for six things and found four" says more than a list
// of four, and it teaches the other two exist.
export function Tactics({ signals }: { signals: Signal[] }) {
  const { t } = useLang();
  const found = matchedTactics(signals);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="font-[family-name:var(--font-mono-ui)] text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-dim)]">
          {t("verdict.tactics.heading")}
        </h3>
        {/* Looser tracking than the heading it sits beside: this is a count to
            be read, not a label to be scanned past. */}
        <span className="font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.03em] text-[var(--caution)]">
          {t("verdict.tactics.count", { n: found.size, total: TACTIC_IDS.length })}
        </span>
      </div>
      <p className="mb-3 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        {t("verdict.tactics.lede")}
      </p>
      {/* A matched row is tinted amber, not merely lifted to a paler grey: the
          tint is the same "we found this" signal the evidence weights carry, so
          a matched tactic reads as flagged rather than as selected. Unmatched
          rows drop to --ink, darker than the panel around them, so the matched
          ones come forward instead of the list reading as uniformly active. */}
      <ul className="grid gap-px overflow-hidden rounded-[11px] border border-[var(--rule)] bg-[var(--rule)]">
        {TACTIC_IDS.map((id) => {
          const on = found.has(id);
          return (
            <li
              key={id}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-[11px] px-[13px] py-2.5 ${
                on ? "bg-[var(--caution)]/[0.09]" : "bg-[var(--ink)]"
              }`}
            >
              {/* The tick is drawn, not typed: the ✓ glyph renders at a
                  different weight and baseline on every platform, and it sat
                  low in its box on Windows. */}
              <span
                aria-hidden="true"
                className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border ${
                  on ? "border-[var(--caution)] bg-[var(--caution)]/[0.16]" : "border-[var(--ink-3)]"
                }`}
              >
                <svg viewBox="0 0 12 12" fill="none" className={`h-[11px] w-[11px] ${on ? "" : "opacity-0"}`}>
                  <path
                    d="m1.8 6.2 2.8 2.8L10.2 3.4"
                    stroke="var(--caution)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span
                className={`min-w-0 text-[14px] ${
                  on ? "font-semibold text-[var(--foreground)]" : "font-medium text-[var(--text-dim)]"
                }`}
              >
                {t(`learn.tactics.${id}.title` as MessageKey)}
              </span>
              {/* The label holds its column whether or not it shows, so the
                  names don't shift left on unmatched rows. */}
              <span
                className={`whitespace-nowrap font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] ${
                  on ? "text-[var(--caution)]" : "text-transparent"
                }`}
              >
                {t("verdict.tactics.matched")}
              </span>
            </li>
          );
        })}
      </ul>
      {found.size === 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-dim)]">
          {t("verdict.tactics.none")}
        </p>
      )}
      <a
        href="/learn#tactics"
        className="mt-2.5 inline-block text-[13px] text-[var(--clear)] hover:underline underline-offset-2"
      >
        {t("verdict.tactics.learnMore")}
      </a>
    </div>
  );
}

// ── Main badge ────────────────────────────────────────────────────────────────

// `supporting` holds the sections that describe what was inspected — the
// identifier breakdown, tracking findings, sender analysis. They belong between
// the score and the steps: the steps are what the reader should do about all of
// it, so anything that qualifies the finding has to arrive before them. Passed
// in rather than rendered by the caller after the badge, which is what put "what
// to do right now" in the middle of the sheet instead of at its end.
export default function VerdictBadge({
  result,
  supporting,
  region,
}: {
  result: CheckResult;
  supporting?: React.ReactNode;
  /** Explicit check region (or null for auto). Decides the reporting advice. */
  region?: string | null;
}) {
  const { t } = useLang();
  const v     = VERDICTS[result.verdict];
  const label = t(`verdict.${result.verdict}.label` as MessageKey);
  const sub   = t(`verdict.${result.verdict}.sub`   as MessageKey);

  const signals = result.signals ?? [];
  // Reporting advice follows the resolved check region, not the copy bundle:
  // a UK user told to contact Scamwatch is being sent to the wrong country.
  const reporting = reportingFor(region);
  // result.details is not rendered. Every one of its four values restates
  // something the sheet already says: the safe and suspicious lines repeat
  // verdict.*.sub under the headline, and the two scam lines repeat the action
  // steps ("do NOT engage, click links, or provide any information" against
  // "Don't click any links...", "Block the sender..."). The engine still
  // returns it — the field is part of CheckResult and other surfaces may want
  // a one-line summary — but here it was the same instruction twice.

  return (
    // No border of its own: this renders as the top of the results sheet, which
    // already carries one. Nesting a second bordered card inside it drew a box
    // around the verdict and another around the box, and the reader has to work
    // out which of the two frames means something.
    //
    // Sections are full-bleed bands separated by rules rather than a padded
    // column of cards: a receipt reads top to bottom as one document, and each
    // band owns its own padding so the tinted ones reach the sheet's edges.
    <div>

      {/* Header. A dot rather than an emoji: emoji render differently on every
          platform and carry a tone the verdict has to set itself. The halo
          around it is the same weight of emphasis the headline carries. */}
      <div className="flex items-start gap-4 border-b border-[var(--rule)] px-5 py-5">
        <span
          className={`mt-[7px] h-[11px] w-[11px] shrink-0 rounded-full ring-4 ${v.dot} ${v.glow}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2
            className={`font-[family-name:var(--font-display)] text-[clamp(20px,3vw,25px)] font-semibold leading-tight tracking-[-0.015em] ${v.text}`}
          >
            {label}
          </h2>
          <p className="mt-[5px] text-[14.5px] leading-relaxed text-[var(--text-dim)]">{sub}</p>
        </div>
      </div>

      {signals.length > 0 ? <Evidence signals={signals} /> : null}

      <RiskScore score={result.score} bar={v.bar} tone={v.text} signals={signals} />

      {result.phoneIntel && <PhoneIntelPanel intel={result.phoneIntel} reporting={reporting} />}

      {supporting}

      {/* Last band before the footer: the steps are the sheet's closing
          instruction, so everything qualifying the verdict comes above them. */}
      {(result.verdict === "likely_scam" || result.verdict === "suspicious") && (
        <ActionSteps verdict={result.verdict} reporting={reporting} />
      )}
    </div>
  );
}
