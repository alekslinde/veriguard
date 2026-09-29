"use client";

// The other ways in, as three disclosure rows.
//
// There used to be a /ways page and a home-page strip of four cards, two of
// which described the fold they sat under. What is left is the three surfaces
// that are somewhere other than the check box: forward an email, the browser
// extension, the package.
//
// Every row is a <details>, and that is what let the forwarding panel stop
// being a separate block above this one. It was a card beside the check box,
// then a collapsed row under it, and either way it was the same shape as these
// rows saying the same kind of thing — so it is one of them now, and its
// address, copy button and do-not-open guidance are what its row opens to.
// That also retires the #forward anchor: nothing links across the page to a
// disclosure any more, because the disclosure is where the reader already is.
//
// Closed, the three rows cost one line each and say what they are. Open, each
// one says what it takes to use it. Nothing on the home page has to carry that
// detail on behalf of a reader who has not asked for it.

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { bold } from "@/lib/richText";
import { WAYS_IN, type WayIn } from "@/lib/waysIn";
import { EXTENSION_LISTINGS } from "@/lib/extensionInstalls";

const INBOUND_ENABLED = process.env.NEXT_PUBLIC_INBOUND_ENABLED === "true";
const INBOUND_ADDRESS = process.env.NEXT_PUBLIC_INBOUND_ADDRESS ?? "check@veriguard.app";

/**
 * Where the extension row points.
 *
 * Resolved here rather than stored in WAYS_IN, because it depends on which
 * listings are actually published — that is tracked in lib/extensionInstalls.ts
 * and changes when a store goes live, which must not require editing a second
 * file to keep a link working.
 *
 * Null when nothing is published anywhere. The row then states that rather than
 * offering a dead link, which is the honest rendering of "built but not
 * submitted" and avoids sending someone to a store page that 404s.
 */
function extensionHref(): string | null {
  return EXTENSION_LISTINGS.find((l) => l.url)?.url ?? null;
}

function hrefFor(way: WayIn): string | null {
  return way.id === "extension" ? extensionHref() : way.href;
}

function Chevron() {
  return (
    <svg
      className="shrink-0 w-[16px] h-[16px] text-[var(--faint)] transition-transform duration-200 group-open:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * The forwarding instructions — this row's expanded body.
 *
 * Lifted wholesale from the old ForwardPanel, which was a card of its own above
 * this section. There is no mailto here on purpose: a mailto opens a blank
 * compose window, but forwarding is an action on a message the reader already
 * has, and no web API can reach into a mailbox and do it. So the page does the
 * one thing it genuinely can — copy the address — and says plainly where the
 * rest happens.
 */
function ForwardBody() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(INBOUND_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable (older browser, insecure origin). The address is
      // rendered as selectable text beside the button, so there is still a way
      // through without it.
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-3 py-2">
        {/* Selectable text, so the address is usable even when the clipboard
            API isn't. */}
        <code className="flex-1 min-w-0 truncate text-sm text-[var(--clear)] select-all">
          {INBOUND_ADDRESS}
        </code>
        <button
          type="button"
          onClick={copyAddress}
          className="shrink-0 rounded-md border border-[var(--rule)] px-2.5 py-1 text-xs font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
        >
          {copied ? t("check.forward.copied") : t("check.forward.copy")}
        </button>
      </div>

      {/* The app flags tracking pixels as a red flag, so it must not tell people
          to trigger one. Opening a scam email loads its pixel and confirms the
          address is live; forwarding from the message list doesn't. Guidance,
          not a prerequisite — someone who already opened it still needs the
          check. It keeps its caution styling because it is only ever on screen
          once the reader has opened this row, where it competes with nothing. */}
      <p className="text-xs text-[var(--caution)] bg-[var(--caution)]/10 border border-[var(--caution)]/35 rounded-lg px-3 py-2">
        {bold(t("check.forward.noopen"))}
      </p>

      <p className="text-[11px] text-[var(--faint)]">{t("check.forward.note")}</p>
    </>
  );
}

/** The link a row opens to, where its action lives somewhere else. */
function RowLink({ way, href }: { way: WayIn; href: string }) {
  const { t } = useLang();
  const external = href.startsWith("http");
  // The space is its own node rather than part of the arrow's: JSX strips a
  // trailing space from a text line, which butted the arrow against the label.
  const label = (
    <>
      {t(way.cta)}
      {" "}
      <span aria-hidden="true">→</span>
    </>
  );
  const cls =
    "inline-flex items-center rounded-lg border border-[var(--rule)] px-3 py-1.5 text-[13px] font-semibold text-[var(--clear)] hover:border-[var(--clear)] transition-colors";

  return external ? (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <Link className={cls} href={href}>
      {label}
    </Link>
  );
}

function Row({ way }: { way: WayIn }) {
  const { t } = useLang();
  const href = hrefFor(way);

  // Built but not distributed. The row still renders — it is real, and saying
  // so is the point — but it states that instead of offering a call to action.
  const pending = Boolean(way.unavailable);

  return (
    <details className="group">
      {/* The hover tint is on the CLOSED row only (`group-open:hover:bg-…`
          resets it), and that is the fix for the gap rather than more padding.

          A summary's bottom padding is inside the tinted box, so on an open row
          the highlight ran to 12px below the title and the first line of body
          text began at exactly that edge — a hard colour boundary with nothing
          between it and the paragraph. Padding alone would have pushed the text
          down while leaving the block butted against it.

          An open row does not need the affordance anyway: hover says "this is
          clickable", which matters when the row is a closed thing to open and
          reads as noise once it is a heading over its own content. */}
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden hover:bg-[var(--ink-2)] group-open:hover:bg-transparent transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--clear)]">
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-[var(--foreground)] text-[14.5px]">
            {t(way.name)}
          </span>
          <span className="text-[var(--text-dim)] text-[13.5px]"> — {t(way.how)}</span>
        </span>
        {/* Where it runs, per row rather than once above them. The section used
            to carry a lede saying everything here scored on your own machine,
            which was true while the rows were the extension and the package.
            Forwarding runs through mail servers, so the blanket claim would be
            false for exactly the entry most people would use. */}
        <span className="hidden sm:inline shrink-0 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
          {t(way.runs === "device" ? "ways.runs.device" : "ways.runs.server")}
        </span>
        <Chevron />
      </summary>

      {/* pt-1 on top of the summary's own 12px, so the body starts ~16px below
          the title rather than at its exact edge. The summary's padding is
          inside its hover box and cannot be relied on to separate anything from
          what follows it. */}
      <div className="px-4 pt-1 pb-4 flex flex-col gap-3">
        <p className="text-[13.5px] text-[var(--text-dim)] leading-relaxed">
          {t(way.detail)}
        </p>

        {/* The runs marker is dropped from the summary on a phone, where the row
            has no width for it. Restated here so it is never the case that a
            reader cannot find out where their message goes. */}
        <p className="sm:hidden font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
          {t(way.runs === "device" ? "ways.runs.device" : "ways.runs.server")}
        </p>

        {way.id === "email" && <ForwardBody />}

        {pending ? (
          <p className="text-[13px] text-[var(--faint)]">{t(way.unavailable!)}</p>
        ) : href ? (
          <div>
            <RowLink way={way} href={href} />
          </div>
        ) : (
          // No link to give. For the extension that means no store listing is
          // live yet and the row must say so rather than end on nothing; for
          // email it means the row's action is the address above, which needs
          // no call to action after it. Keyed off the row rather than rendered
          // unconditionally, because the extension's "not published" line
          // otherwise printed under the forwarding instructions.
          way.id === "extension" && (
            <p className="text-[13px] text-[var(--faint)]">{t("ways.ext.unavailable")}</p>
          )
        )}
      </div>
    </details>
  );
}

export default function WaysGrid() {
  // The email row is the forwarding panel now, so it goes when inbound mail is
  // off — the same condition that used to return null from ForwardPanel.
  const rows = INBOUND_ENABLED ? WAYS_IN : WAYS_IN.filter((w) => w.id !== "email");

  return (
    <div className="rounded-xl border border-[var(--rule)] divide-y divide-[var(--rule)] overflow-hidden">
      {rows.map((way) => (
        <Row key={way.id} way={way} />
      ))}
    </div>
  );
}
