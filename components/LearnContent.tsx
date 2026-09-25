"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { AUTH_LEGEND, StaticAuthPill } from "@/components/AuthBadges";
import PageHeader from "@/components/PageHeader";
import EmailExportGuide from "@/components/EmailExportGuide";
import Collapsible from "@/components/Collapsible";
import { activeSectionId } from "@/lib/toc";
import { useOpenOnHash } from "@/lib/useOpenOnHash";
import {
  reportingAgencies,
  reportingFor,
  victimHelpline,
  scamTextForwarding,
} from "@/lib/reportingResources";
import ReportingLink from "@/components/ReportingLink";
import type { RegionCode } from "@veriguard/scam-detect/regions";
import RegionBar from "@/components/RegionBar";

// Type icons mirror the input/report type pickers used across the app, so they
// stay as a consistent scanning aid. The tactic/source/flag lists used purely
// decorative emoji and now lead with a neutral marker instead.
const SCAM_TYPE_ICONS = ["🔗", "📱", "📧", "📞", "📷"];
const TACTIC_COUNT = 6;
const SOURCE_COUNT = 6;
const FLAG_COUNT = 8;

// The explanatory content is now a sequence of <Collapsible> cards, each grouped
// by how it's read: orientation (what scams look like, where they come from),
// the core teaching (how scammers operate, red flags, what to do), and technical
// reference (email auth). Reference and secondary sections collapse by default;
// the core teaching stays open but is split so any part can be collapsed. The
// coloured callouts — "if you've been caught" (red) and "where to report"
// (emerald) — stay standalone open cards: their colour carries meaning.
//
// H2 matches the heading style Collapsible renders in its summary, so the two
// remaining plain cards (calendar pointer, and the callouts' headings) sit at
// the same visual level as the disclosures around them.
const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]";

const key = (k: string) => k as MessageKey;

// Anchors for the jump links. Kept next to the TOC that renders them so a
// renamed section can't leave a link pointing at nothing.
const TOC = [
  { id: "caught", labelKey: "learn.caught.heading" },
  { id: "what-scams-look-like", labelKey: "learn.types.heading" },
  { id: "how-to-spot", labelKey: "learn.tactics.heading" },
  { id: "scam-calendar", labelKey: "learn.calendar.heading" },
  { id: "technical-signals", labelKey: "learn.auth.heading" },
  { id: "where-to-report", labelKey: "learn.report.heading" },
  { id: "block-email", labelKey: "learn.block.email.heading" },
  { id: "block-phone", labelKey: "learn.block.phone.heading" },
  { id: "using-this-tool", labelKey: "learn.part.using.heading" },
] as const;

// The mail clients and phone platforms the block/report guides cover. Slugs, not
// indices, so each maps to a readable message key (learn.block.email.<slug>.*).
const BLOCK_EMAIL = ["gmail", "outlook", "apple", "yahoo", "any"] as const;
const BLOCK_PHONE = ["ios", "android", "authorities", "apps"] as const;

// Height of the sticky site header, read from the --header-h token that defines
// it rather than restated here.
//
// It was the literal 58 that matched SiteHeader's old single height. The header
// is now 52px on a phone and 58 above the md breakpoint, plus the status-bar
// inset it pads for — so the constant was wrong by 6px on a plain phone and by
// far more on a notched one, where this bar pinned itself UNDER the header and
// vanished. A token both sides read cannot drift that way again.
//
// MEASURED, not read from the token. `getPropertyValue("--header-h")` returns
// the unresolved text — "calc(52px + 0px)" — because a custom property is
// substituted, not computed, so parsing it yields NaN. The rendered header is
// the one source that is always a real number, and measuring it also picks up
// anything the token cannot know, such as a wrapped title.
//
// Falls back to the desktop height when there is no header to measure (server
// render, or a test DOM that never mounted one).
function headerHeight(): number {
  if (typeof document === "undefined") return 58;
  const el = document.querySelector("header");
  return el ? el.getBoundingClientRect().height : 58;
}

// Part header — the page is split into two distinct halves: "Spotting scams"
// (what scams are / how to identify them) and "Getting the most from this tool"
// (how to capture a scam so we can read it). Larger and divider-led so the two
// halves read as separate sections, not just more cards.
//
// The id is optional: Part 2 carries its anchor on a wrapping <section> instead,
// so that a deep link to #using-this-tool can open the capture guides nested
// inside it (see the hash-open effect) rather than just scrolling to a header.
function PartHeader({ id, heading, intro }: { id?: string; heading: string; intro: string }) {
  return (
    <div id={id} className="scroll-mt-24 pt-4">
      <div className="h-px bg-[var(--rule)] mb-6" />
      <h2 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(20px,2.6vw,26px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]">
        {heading}
      </h2>
      <p className="text-[15px] text-[var(--text-dim)] mt-1.5 max-w-[62ch]">{intro}</p>
    </div>
  );
}

// The index stands open from sm up and is a tap-to-open disclosure below it.
// Feature-detecting the width beats guessing: nine wrapped chips are 327px on a
// phone, which is 39% of the viewport permanently given over to navigation the
// reader is not currently using.
const TOC_WIDE = "(min-width: 640px)";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(TOC_WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function LearnContent({
  activeSeasons = [],
  region,
}: {
  /** Titles of the seasons active today, resolved server-side. */
  activeSeasons?: string[];
  /** Resolved server-side, so the reporting advice names bodies that actually
   *  take reports where the reader is. RegionCode rather than the looser
   *  RegionInput: this drives a RegionBar, which renders the current choice. */
  region: RegionCode;
}) {
  const { t } = useLang();
  const agencies = reportingAgencies(region);
  const reporting = reportingFor(region);
  const helpline = victimHelpline(region);
  const smsForwarding = scamTextForwarding(region);
  // The reporting body is interpolated into the block/report copy so the advice
  // names a body that actually takes reports where the reader is, rather than
  // the Australian one this page hardcoded when the app was AU-only.
  //
  // `body`, not `label`: label appends the host for bodies that don't name it,
  // which reads as a link target rather than prose, and for IE the appending
  // guard misses ("FraudSMART" vs "fraudsmart.ie") giving "An Garda Síochána
  // (or FraudSMART) (fraudsmart.ie)" in bold mid-sentence. ReportForm passes
  // `body` for this same placeholder; the linked form belongs to ReportingLink.
  const bodyVar = { body: reporting.body };

  // Reveal collapsed content when its anchor is navigated to — a table-of-
  // contents link, or the check flow deep-linking to #using-this-tool for the
  // capture guide, which is a <section> wrapping three disclosures. Anchors with
  // no collapsibles (the emergency block, the calendar pointer) are untouched.
  useOpenOnHash();

  // Which section the reader is currently in, so the sticky TOC can highlight it
  // — turning the index from a one-shot list into a "you are here" that tracks
  // as you scroll. Computed from scroll position rather than IntersectionObserver
  // because the answer we want ("the last heading scrolled up past the bar") is
  // exactly a top-edge comparison, and the sections are collapsible, so their
  // heights change under the observer's feet.
  const [activeId, setActiveId] = useState<string>(TOC[0].id);
  const navRef = useRef<HTMLElement>(null);

  // Whether the viewport is wide enough for the index to stand open. Read
  // through useSyncExternalStore rather than a state-in-effect: it reads on
  // every render with no cascading re-render, and its server snapshot (false)
  // means a phone's markup matches what it hydrates to instead of the bar
  // flashing open and shutting.
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(TOC_WIDE).matches,
    () => false,
  );
  // Whether the reader has explicitly opened the index on a phone. Starts
  // false, so a narrow viewport gets the collapsed bar — 40px instead of 332 —
  // and `wide` keeps it open from sm up regardless.
  const [tocExpanded, setTocExpanded] = useState(false);
  const tocOpen = wide || tocExpanded;

  useEffect(() => {
    const sections = TOC.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const computeActive = () => {
      // Read the DOM here; the selection itself is pure and lives in lib/toc so
      // it can be tested without a browser.
      const tops = sections.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top }));
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      // Measured, not assumed — the bar wraps to two or three rows as the
      // viewport narrows, and resize fires when it does.
      const barHeight = headerHeight() + (navRef.current?.offsetHeight ?? 0);
      const id = activeSectionId(tops, { barHeight, atBottom });
      if (id) setActiveId(id);
    };

    computeActive();
    window.addEventListener("scroll", computeActive, { passive: true });
    window.addEventListener("resize", computeActive);
    return () => {
      window.removeEventListener("scroll", computeActive);
      window.removeEventListener("resize", computeActive);
    };
  }, []);

  return (
    // Full-width chrome, matching every other page. The prose inside sets its
    // own measure (max-w-[62ch] on the body copy, 60ch on the header) rather
    // than relying on a narrow container, so lines stay readable while cards and
    // grids get the full width to lay out in.
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-5">
      <PageHeader
        eyebrow={t("learn.eyebrow")}
        title={t("learn.headline")}
        lede={t("learn.intro")}
      />

      {/* Table of contents — a sticky index that also shows where you are.
          The page is long and covers several distinct needs, so the fastest
          route to any one is a persistent bar, not a one-shot list scrolled
          past once. It pins beneath the sticky site header.

          The chips wrap rather than scrolling sideways. Nine labels, some as
          long as "If you've already clicked or shared details", do not fit one
          row at any width, and a horizontal scroller with a hidden scrollbar
          gives no hint that the rest exist.

          Wrapped, though, nine chips are 327px on a phone — 39% of the
          viewport, permanently, for navigation the reader is not currently
          using. So on small screens the list is a native disclosure that opens
          on tap and closes when you pick something; from sm up it is always
          open and the summary is hidden, because there the bar costs one row
          and hiding it would only add a click. `open` is set once from the
          initial width rather than bound to a media query, so a reader who
          opens it does not have it shut under them on an orientation change. */}
      <nav
        ref={navRef}
        aria-label={t("learn.toc.heading")}
        // The rule and background span the full column via padding on the inner
        // elements rather than negative margins on the <nav>. -mx-5 made this
        // box wider than <main>, and since <main> already fills the viewport on
        // a phone, that pushed the whole page into horizontal overflow.
        className="sticky top-[var(--header-h)] z-20 border-y border-[var(--rule)] bg-[var(--ink)]/85 backdrop-blur"
      >
        {/* onToggle keeps React's state and the element's own `open` in step:
            the native disclosure flips `open` itself on click, and without this
            React's next render would put it straight back. */}
        <details
          open={tocOpen}
          onToggle={(e) => setTocExpanded((e.currentTarget as HTMLDetailsElement).open)}
          className="group"
        >
          {/* The summary is the control on a phone and a plain label from sm
              up, where the list is always open — hence marker:hidden and the
              chevron that only renders below sm. */}
          <summary className="flex items-center justify-between gap-3 py-2.5 cursor-pointer sm:cursor-default list-none marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] rounded">
            <span className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
              {t("learn.toc.heading")}
            </span>
            <svg
              className="sm:hidden shrink-0 w-[18px] h-[18px] text-[var(--faint)] transition-transform duration-200 group-open:rotate-180"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
        <ul className="flex flex-wrap gap-1.5 pb-2.5 list-none">
          {TOC.map(({ id, labelKey }) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active ? "location" : undefined}
                  // Closing on pick matters on a phone: the reader has chosen a
                  // destination, and leaving a 327px index pinned over it means
                  // scrolling past the navigation to reach what they navigated
                  // to. Guarded by the same breakpoint that decides `open`, so
                  // the desktop bar is never dismissed by using it.
                  onClick={() => setTocExpanded(false)}
                  // Every chip carries a visible border, not just the active
                  // one. border-transparent made the inactive nine render as
                  // bare words with no boundary, so nothing said they could be
                  // clicked — the bar read as a line of labels that happened to
                  // have one highlighted. The active state now differs by
                  // colour and fill, which is a difference between two things
                  // that both look like controls.
                  className={`block rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--clear)] bg-[var(--clear)]/12 text-[var(--clear)]"
                      : "border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--ink-3)] hover:text-[var(--foreground)] hover:bg-[var(--ink-2)]"
                  }`}
                >
                  {t(key(labelKey))}
                </a>
              </li>
            );
          })}
        </ul>
        </details>
      </nav>

      {/* Emergency content first. Everything else on this page can wait; someone
          who has just clicked a link or shared card details cannot, and making
          them scroll past DMARC explainers to reach help is the one failure this
          page cannot afford. */}
      <section
        id="caught"
        className="scroll-mt-24 rounded-xl border border-l-2 border-[var(--rule)] border-l-[var(--scam)] bg-[var(--scam)]/[0.07] p-5 space-y-3.5"
      >
        <div>
          {/* The one red heading on the page. Colour is doing real work here —
              it marks the section you need when you have no patience to read —
              so nothing else competes for it. */}
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--scam-text)]">
            {t("learn.caught.heading")}
          </h2>
          <p className="text-sm text-[var(--text-dim)] mt-1.5">{t("learn.caught.intro")}</p>
        </div>
        {/* A hairline list rather than four separately bordered cards. The
            content stays fully visible — this is the one section that must
            never be collapsed — but four boxes inside a fifth box was three
            borders of nesting, and the height came out of that chrome rather
            than out of anything a panicking reader needs. */}
        <ul className="grid gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)] list-none">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="bg-[var(--ink-2)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">{t(key(`learn.caught.${i}.situation`))}</p>
              <p className="text-[13.5px] text-[var(--text-dim)] mt-0.5 leading-relaxed">
                {bold(t(key(`learn.caught.${i}.action`), bodyVar))}
                {/* The ID-theft step is the one with a named support service.
                    IDCARE is AU-only, so it is appended only where it operates. */}
                {i === 3 && helpline && (
                  <> {bold(t("learn.caught.3.action.helpline", { helpline: helpline.label }))}</>
                )}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--faint)] leading-relaxed">
          {bold(t("learn.caught.outro", bodyVar))}
          {helpline && <> {bold(t("learn.caught.outro.helpline", { helpline: helpline.label }))}</>}
        </p>
      </section>

      {/* ── Part 1: Spotting scams ─────────────────────────────────────────── */}
      <PartHeader
        id="spotting-scams"
        heading={t("learn.part.spot.heading")}
        intro={t("learn.part.spot.intro")}
      />

      {/* Card 1 — orientation. Collapsed by default: it's read once to get your
          bearings, not on every visit, so it opens on demand rather than pushing
          the core teaching below it down the page. Split into two disclosures,
          one per heading, so each opens to a single focused topic. */}
      <Collapsible id="what-scams-look-like" title={t("learn.types.heading")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SCAM_TYPE_ICONS.map((icon, i) => (
            <div key={i} className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden="true">{icon}</span>
                <span className="text-sm font-semibold text-[var(--foreground)]">{t(key(`learn.types.${i + 1}.label`))}</span>
              </div>
              <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">{t(key(`learn.types.${i + 1}.desc`))}</p>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={t("learn.sources.heading")}>
        <div className="grid sm:grid-cols-2 gap-2">
          {Array.from({ length: SOURCE_COUNT }, (_, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-[var(--clear)] mt-0.5 shrink-0" aria-hidden="true">›</span>
              <p className="text-sm leading-relaxed">
                <span className="font-semibold text-[var(--foreground)]">{t(key(`learn.sources.${i + 1}.title`))}.</span>{" "}
                <span className="text-[var(--text-dim)]">{t(key(`learn.sources.${i + 1}.desc`))}</span>
              </p>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* The core teaching — recognising a scam in front of you: one 20-item
          card split into three focused disclosures, so a reader can collapse
          what they have read and jump to the part they want.

          Two of the three open by default, not all three. "Red flags" is what
          to look for and "if something seems off" is what to do — both are
          safety advice a first-time reader should not have to click to reach.
          "How scammers operate" is the why behind them, which is worth reading
          but is not what someone holding a suspicious text needs first; open,
          its six tactics were 580px and pushed the actionable pair off the
          screen entirely. */}

      {/* How scammers operate — the conceptual half: name the tactic, break the
          spell. Carries the how-to-spot anchor the table of contents points at. */}
      <Collapsible id="how-to-spot" title={t("learn.tactics.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.tactics.intro")}</p>
          {/* A hairline-separated row list rather than free-floating bullets:
              six named tactics are a reference set the reader comes back to, and
              the rules make each one its own object to scan for. */}
          <ul className="grid gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)] list-none">
            {Array.from({ length: TACTIC_COUNT }, (_, i) => (
              <li key={i} className="bg-[var(--ink-2)] px-4 py-3.5">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {t(key(`learn.tactics.${i + 1}.title`))}
                </p>
                <p className="text-[13.5px] text-[var(--text-dim)] mt-1 leading-relaxed">
                  {t(key(`learn.tactics.${i + 1}.desc`))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Collapsible>

      {/* Red flags — the surface half: the quick two-column checklist. */}
      <Collapsible title={t("learn.flags.heading")} defaultOpen>
        <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5 text-sm text-[var(--text-dim)] list-none">
          {Array.from({ length: FLAG_COUNT }, (_, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-[var(--caution)] mt-0.5 shrink-0" aria-hidden="true">⚑</span>
              <span>{t(key(`learn.flags.${i + 1}`))}</span>
            </li>
          ))}
        </ul>
      </Collapsible>

      {/* What to do when something seems off — the action checklist. */}
      <Collapsible title={t("learn.handle.heading")} defaultOpen>
        <ul className="space-y-2.5 text-sm text-[var(--text-dim)] list-none">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-[var(--clear)] mt-0.5 shrink-0" aria-hidden="true">✓</span>
              <span>{bold(t(key(`learn.handle.${i}`)))}</span>
            </li>
          ))}
        </ul>
      </Collapsible>

      {/* Scam calendar — a pointer, not the calendar itself. The full thing has
          its own page; reproducing it here would duplicate content and make an
          already-long page longer. Names today's active seasons so the link
          promises something specific rather than a generic "see also". */}
      <article id="scam-calendar" className="scroll-mt-24 bg-[var(--ink-2)] border border-[var(--rule)] rounded-xl p-5 space-y-3">
        <h2 className={H2}>{t("learn.calendar.heading")}</h2>
        <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("learn.calendar.body")}</p>
        {activeSeasons.length > 0 && (
          // The live bit: what is actually in season as you read this. Marked
          // with the same amber pulse the home strip uses, so "this is current"
          // reads the same way everywhere.
          <p className="flex items-baseline gap-2.5 text-sm text-[var(--foreground)]">
            <span
              aria-hidden="true"
              className="w-[7px] h-[7px] shrink-0 self-center rounded-full bg-[var(--caution)] shadow-[0_0_0_3px_rgba(232,163,61,0.16)]"
            />
            <span>{t("learn.calendar.active", { seasons: activeSeasons.join(", ") })}</span>
          </p>
        )}
        <Link
          href="/calendar"
          className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium inline-block"
        >
          {t("learn.calendar.cta")}
        </Link>
      </article>

      {/* Card 3 — reference material. Collapsed by default: it's consulted when a
          result mentions SPF or DMARC, not read start to finish, so it no longer
          spends a screen of the page on a legend most readers never need. */}
      <Collapsible id="technical-signals" title={t("learn.auth.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.auth.intro")}</p>
          <div className="space-y-4 pt-1">
            {AUTH_LEGEND.map((entry) => (
              <div key={entry.protocol} className="space-y-1.5">
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">
                  {/* Protocol names are identifiers you meet in a verdict, so
                      they take the mono face that carries identifiers elsewhere. */}
                  <span className="font-[family-name:var(--font-mono-ui)] font-medium text-[var(--foreground)]">{entry.protocol}.</span>{" "}
                  {t(entry.explainKey as MessageKey)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {entry.verdicts.map((v) => (
                    <StaticAuthPill key={v.label} label={v.label} severity={v.severity} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* Where to report + disclaimer */}
      <section
        id="where-to-report"
        className="scroll-mt-24 rounded-xl border border-l-2 border-[var(--rule)] border-l-[var(--clear)] bg-[var(--clear)]/[0.055] p-5"
      >
        <div className="space-y-3 text-sm">
          <h2 className={H2}>{t("learn.report.heading")}</h2>
          <p className="text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{bold(t("learn.report.body"))}</p>
          {/* The agencies below are whichever region resolved, and that started
              as a geo-IP guess. Naming the guess is what makes it correctable —
              the same reasoning as the radar and calendar, but load-bearing
              here, because acting on the wrong country's advice means reporting
              a crime to a body that will not take it. */}
          <RegionBar region={region} />
          {/* Rest-of-world packs carry no reporting URL, so there is nothing to
              link to and an empty grid would just leave a gap under the heading.
              Name the body as plain text instead — the same fallback
              ReportingLink makes on the verdict screens. */}
          {agencies.length === 0 ? (
            <p className="text-[var(--text-dim)] max-w-[62ch] leading-relaxed">
              <ReportingLink link={reporting} />
            </p>
          ) : (
          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            {agencies.map(({ name, abbr: abbrTitle, site, href }) => (
              <a key={site} href={href} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-[var(--rule)] bg-[var(--ink-2)] px-3.5 py-2.5 hover:border-[var(--clear)]/50 transition-colors block">
                <div className="text-sm text-[var(--foreground)] font-semibold">
                  {abbrTitle ? <abbr title={abbrTitle} className="no-underline">{name}</abbr> : name}
                  <span className="sr-only"> ({t("a11y.newTab")})</span>
                </div>
                <div className="mt-0.5 font-[family-name:var(--font-mono-ui)] text-[12.5px] text-[var(--clear)]">{site}</div>
              </a>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* Blocking & reporting spam — how to stop a sender and report them, in the
          common mail clients, phones and messaging apps. Moved here from the
          About page: it's how-to guidance, which is Learn's job, whereas About is
          the canonical record of privacy behaviour. Collapsed by default and
          grouped with "where to report" as the "act on it" cluster. */}
      <Collapsible id="block-email" title={t("learn.block.email.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.block.email.intro")}</p>
          <div className="space-y-3">
            {BLOCK_EMAIL.map((slug) => (
              <div key={slug} className="space-y-1">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">{t(key(`learn.block.email.${slug}.title`))}</h3>
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">{bold(t(key(`learn.block.email.${slug}.body`), bodyVar))}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      <Collapsible id="block-phone" title={t("learn.block.phone.heading")}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch]">{t("learn.block.phone.intro")}</p>
          <div className="space-y-3">
            {BLOCK_PHONE.map((slug) => (
              <div key={slug} className="space-y-1">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">{t(key(`learn.block.phone.${slug}.title`))}</h3>
                <p className="text-sm text-[var(--text-dim)] leading-relaxed">
                  {bold(t(key(`learn.block.phone.${slug}.body`), bodyVar))}
                  {/* The free 0429 forwarding shortcode is an AU service; there is
                      no equivalent to substitute elsewhere, so it is named only
                      where it works. */}
                  {slug === "authorities" && smsForwarding && (
                    <> {bold(t("learn.block.phone.authorities.au"))}</>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* ── Part 2: Getting the most from this tool ────────────────────────────
          A deliberately separate appendix: this is how-to reference for capturing
          a scam, not part of learning to spot one. It lives here rather than in
          the check flow on purpose — the flow keeps a quiet "See the guide →"
          pointer to #using-this-tool instead of re-crowding itself with inline
          expandables (see CheckFlow). The anchor sits on this <section> so that
          arriving from that pointer opens the guides inside it, rather than
          landing on three closed toggles. */}
      <section id="using-this-tool" className="scroll-mt-24 space-y-6">
        <PartHeader
          heading={t("learn.part.using.heading")}
          intro={t("learn.part.using.intro")}
        />

        {/* One collapsible each — reached for when you're about to capture a
            scam, so each opens on demand rather than stacking three open sections
            at the foot of an already-long page. The email guide renders open
            inside its own disclosure (the outer Collapsible is the toggle). */}
        <Collapsible title={t("learn.using.photo.heading")}>
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("check.help.photo.body")}</p>
        </Collapsible>

        <Collapsible title={t("learn.using.image.heading")}>
          <p className="text-sm text-[var(--text-dim)] max-w-[62ch] leading-relaxed">{t("check.help.image.body")}</p>
        </Collapsible>

        <Collapsible title={t("learn.using.email.heading")}>
          <EmailExportGuide expandable={false} />
        </Collapsible>
      </section>

      {/* Left-aligned with the rest of the page: a lone centred line reads as a
          layout accident when everything above it starts at the same edge. */}
      <p className="pt-2 pb-4 text-sm">
        <Link href="/" className="text-[var(--clear)] hover:underline underline-offset-2 font-medium">
          {t("learn.footer.cta")}
        </Link>
      </p>
    </main>
  );
}
