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

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import ExternalLink from "@/components/ExternalLink";
import { bold } from "@/lib/richText";
import { WAYS_IN, type WayIn } from "@/lib/waysIn";
import { installsForBrowser, INSTALL_TARGETS } from "@/lib/extensionInstalls";
import { currentBrowser } from "@/lib/detectBrowser";

const INBOUND_ENABLED = process.env.NEXT_PUBLIC_INBOUND_ENABLED === "true";
const INBOUND_ADDRESS = process.env.NEXT_PUBLIC_INBOUND_ADDRESS ?? "check@veriguard.app";

/**
 * Nothing changes the user agent within a page view, so there is nothing to
 * subscribe to. Safe because `currentStore` returns a string or null —
 * useSyncExternalStore compares snapshots with Object.is, and a fresh object
 * each call would loop forever.
 */
const subscribeNever = () => () => {};

/**
 * Every browser the extension targets, the reader's own first.
 *
 * One button per browser rather than a single "Install it" pointing at whichever
 * listing came first in the array — which was the Chrome Web Store, for
 * everyone, including people reading in Firefox. Chrome and Edge get a button
 * each although they share one listing: see InstallTarget for why that split
 * belongs here and not in the data.
 *
 * The order is settled AFTER hydration, not during render. The page is server
 * rendered and cached, so there is no current browser at render time, and
 * ordering the list from a value the server cannot know is a hydration
 * mismatch. The first paint shows the authored order and the reader's browser
 * moves to the front once the client says which it is — a reorder nobody sees,
 * because this sits below the fold inside a closed row.
 */
function InstallLinks() {
  const { t } = useLang();

  // useSyncExternalStore rather than an effect, the same shape ServiceNotice
  // uses for the same problem: React 19 rejects setState called from an effect
  // body, and the server snapshot has to differ from the client one or
  // hydration mismatches. getServerSnapshot returns null — the server genuinely
  // does not know which browser will receive this page — and getSnapshot reads
  // the real value on the client. subscribe is a no-op because a user agent
  // does not change within a page view.
  const browser = useSyncExternalStore(subscribeNever, currentBrowser, () => null);

  const targets = installsForBrowser(browser);

  return (
    <ul className="flex flex-wrap gap-2">
      {targets.map((target) => {
        // Matched on identity, not on position. An unpublished browser is not
        // promoted (see installsForBrowser), so on Safari the first entry is
        // Chrome — and marking whatever landed first as "yours" would tell that
        // reader they are running a browser they are not.
        //
        // Null until the client reports, which is the honest state: before that
        // every target is equally likely to be the right one, and emphasising
        // one would be a guess presented as a fact.
        const isYours = target.id === browser;
        const label = (
          <>
            {target.name}
            {isYours && (
              <span className="ml-1.5 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--clear)]/70">
                {t("ways.ext.yours")}
              </span>
            )}
          </>
        );
        const shell =
          "inline-flex items-center rounded-lg border px-3 py-1.5 text-[13px] font-semibold";

        // Not published for this browser yet. Rendered as text rather than a
        // link, for the same reason the npm row is flat: there is nothing behind
        // it, and a button that cannot be pressed is worse than a plain
        // statement. It stays in the list because a browser missing from a list
        // of four reads as "not supported" rather than "not yet".
        if (!target.url) {
          return (
            <li key={target.id}>
              <span
                className={`${shell} border-dashed font-normal ${
                  // Still marked when it is the reader's own browser, even
                  // though it is the one they cannot use. That is the entry they
                  // are looking for, and finding it greyed with "soon" answers
                  // their question — where its absence would leave them
                  // wondering whether they had simply missed it.
                  isYours
                    ? "border-[var(--caution)]/40 text-[var(--caution)]"
                    : "border-[var(--rule)] text-[var(--faint)]"
                }`}
              >
                {target.name}
                <span className="ml-1.5 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em]">
                  {isYours ? t("ways.ext.yoursSoon") : t("ways.ext.soon")}
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={target.id}>
            {/* A store button, so no arrow: the label already names the store
                and these sit in a row where one arrow each is noise. The
                new-tab note is announced either way, which it was not before. */}
            <ExternalLink
              href={target.url}
              variant="bare"
              arrow={false}
              className={`${shell} transition-colors ${
                isYours
                  ? "border-[var(--clear)]/50 bg-[var(--clear)]/10 text-[var(--clear)]"
                  : "border-[var(--rule)] text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)]"
              }`}
            >
              {label}
            </ExternalLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Whether anything is published at all.
 *
 * Distinct from which browser the reader is on: when this is false the row has
 * no links to offer and says so, rather than rendering four buttons that all
 * read "coming soon".
 */
const HAS_ANY_LISTING = INSTALL_TARGETS.some((t) => t.url);

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

/**
 * A surface that is built but not distributed.
 *
 * Rendered flat rather than as a disclosure. There is nothing behind it: the
 * body would describe an install nobody can run and end on "Coming soon", so
 * the chevron invites a click that pays out in disappointment. A row that
 * cannot act says so on its face and stops.
 *
 * It still renders, and that is deliberate — the package is real and the
 * section would misrepresent what exists by omitting it. It is dimmed to the
 * weight of what it is: an announcement, not an option.
 */
function PendingRow({ way }: { way: WayIn }) {
  const { t } = useLang();

  // An on-site href is documentation, which exists whether or not the package
  // is published — so a pending row still links to it. Suppressing the link
  // made the docs unreachable from anywhere on the site: this row was the only
  // thing naming the package, and it named it without pointing at anything.
  //
  // An external href (a store page, a registry listing) is NOT linked here,
  // because that is the thing that does not exist yet and is what `unavailable`
  // is reporting.
  const docs = way.href?.startsWith("/") ? way.href : null;

  const body = (
    <>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-[var(--text-dim)] text-[14.5px]">{t(way.name)}</span>
        <span className="text-[var(--faint)] text-[13.5px]"> — {t(way.how)}</span>
      </span>
      <span className="shrink-0 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
        {t(way.unavailable!)}
      </span>
    </>
  );

  if (!docs) {
    return <div className="flex items-center gap-3 px-4 py-3">{body}</div>;
  }

  return (
    <Link
      href={docs}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--ink-2)]/40 transition-colors"
    >
      {body}
    </Link>
  );
}

function Row({ way }: { way: WayIn }) {
  const { t } = useLang();

  // Nothing to open: a row with no action behind it is a statement, not a
  // control. See PendingRow.
  if (way.unavailable) return <PendingRow way={way} />;

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

        {/* The extension's action is a store link per browser, so it has no
            single call to action. Email's action is the address above it, which
            needs nothing after it. */}
        {way.id === "extension" &&
          (HAS_ANY_LISTING ? (
            <InstallLinks />
          ) : (
            // Built, but submitted nowhere. Says so rather than ending on
            // nothing, and rather than linking to a store page that 404s.
            <p className="text-[13px] text-[var(--faint)]">{t("ways.ext.unavailable")}</p>
          ))}

        {/* A plain link, for the row whose action is one. Internal, so Link
            rather than ExternalLink — the arrow would say "this leaves the
            site", which it does not.

            Both `cta` and `href` are required: a label with nowhere to go is
            not an action, and an href with no label has nothing to click. */}
        {way.cta && way.href && (
          <p>
            <Link
              href={way.href}
              className="text-[13.5px] font-semibold text-[var(--clear)] hover:underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] rounded-sm"
            >
              {t(way.cta)}
              <span aria-hidden="true"> →</span>
            </Link>
          </p>
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
