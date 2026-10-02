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
            {/* No outbound marks here.

                `label` is shared with the unpublished-browser branch below,
                which renders plain text and must stay unmarked — nothing
                navigates, so an arrow would promise a click that does nothing.
                The published branch wraps this in ExternalLink, which supplies
                the arrow, the sr-only note, the rel and the focus ring.

                Both were written here once, before the component existed, and
                the merge left the pair doubled: two arrows on every store
                button and the new-tab note announced twice. */}
          </>
        );
        // gap-1 rather than relying on the space before the arrow: the arrow
        // arrives as its own <span> from ExternalLink, and inline-flex collapses
        // the whitespace between flex children — so "Chrome ↗" rendered as
        // "Chrome↗", with the mark crowding the word it qualifies.
        const shell =
          "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px] font-semibold";

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
            <ExternalLink
              href={target.url}
              variant="bare"
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
 * One channel, as a tile.
 *
 * The closed state is a glyph, a name and a half-line — enough to scan a shelf
 * of them without reading any. Opening one reveals the same body the stacked
 * rows used to show; nothing is lost, it is just no longer all on screen at
 * once.
 *
 * Still a <details>, deliberately. The disclosure is free, keyboard-operable
 * and open-by-default-printable, and replacing it with React state would mean
 * re-implementing all three. What changed is the SHAPE it presents when closed,
 * not the mechanism.
 */
/**
 * The shared face of a tile — glyph, name, half-line — so the pending and
 * interactive shapes cannot drift apart while being two different elements.
 */
function TileFace({ way, pending }: { way: WayIn; pending: boolean }) {
  const { t } = useLang();
  return (
    <>
      {/* Name and half-line on ONE line, the clause following the name after a
          dash — which is how `how` was authored ("get a verdict by reply"), so
          this is the shape the copy was always written for.

          The glyph went with the second line. It was decoration doing no work:
          three rows do not need to be told apart by icon when each is named,
          and the icon column cost horizontal room the right-hand chip now
          uses. WayIcon survives for anything else that draws a channel.

          The half-line hides below xs rather than wrapping. A wrapped clause
          puts the row back at two lines, which is the thing this shape exists
          to avoid; the name alone still says what the row is, and opening it
          is one tap. */}
      <span className="flex-1 min-w-0 truncate">
        <span
          className={`font-semibold text-[14px] ${
            pending ? "text-[var(--text-dim)]" : "text-[var(--foreground)]"
          }`}
        >
          {t(way.name)}
        </span>
        <span className="hidden xs:inline text-[13px] text-[var(--text-dim)]">
          {" — "}
          {t(way.how)}
        </span>
      </span>

      {/* Where it runs, as the row's right edge.
          This used to be inside the body, on the grounds that a narrow tile had
          no room for it and the claim differs per row. The row is full width
          now, so there is room — and it is the one fact worth having BEFORE
          opening: "via email" vs "on your device" is the privacy distinction,
          and a reader deciding between these rows is often deciding exactly
          that. A pending row shows its own status here instead, since "where it
          runs" is not yet a fact about it. */}
      <span className="shrink-0 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
        {pending
          ? t(way.unavailable!)
          : t(way.runs === "device" ? "ways.runs.device" : "ways.runs.server")}
      </span>
    </>
  );
}

/**
 * A surface that is built but not distributed.
 *
 * A plain <div>, NOT a <details> that refuses to open — which is what this was
 * and why it is being written out again. A `<summary>` is focusable whatever
 * you do to it, so preventing the click only stopped the mouse: a keyboard
 * reader still tabbed to it, still got a focus ring, and pressing Enter or
 * Space toggled an element whose body renders nothing. That is a dead stop in
 * the tab order, offered to the reader least able to guess why it did nothing.
 * `open: false` as a prop with no onToggle could also desync from the DOM's own
 * state, which is the bug CheckStage's keyed wrapper exists to avoid elsewhere.
 *
 * The original PendingRow was a <div> for exactly this reason, and turning the
 * rows into tiles lost the reason along with the shape. Restored: a row that
 * cannot act says so on its face and is not a control.
 *
 * It still renders, deliberately — the package is real and the shelf would
 * misrepresent what exists by omitting it. Dimmed to the weight of what it is:
 * an announcement, not an option.
 */
/**
 * How the shelf is mounted.
 *
 * "cards" — three separate rounded rows, each its own object. This is the
 * about page, where the shelf is a section among sections.
 *
 * "tethered" — one stack with a single border, divided rather than gapped, and
 * flat on top so it meets the check card's bottom edge. This is the home page,
 * where the rows are not a separate offer but the continuation of the card
 * above them: the reader's eye should travel from the paste box into them
 * without crossing a gap that says "new section".
 */
export type WaysVariant = "cards" | "tethered";

/** The shell each row wears, which is the whole of the difference. */
function rowShell(variant: WaysVariant): string {
  return variant === "tethered"
    ? "bg-[var(--ink-2)] overflow-hidden transition-colors hover:bg-[var(--ink-3)]/40"
    : "rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] overflow-hidden transition-colors hover:border-[var(--ink-3)]";
}

function PendingTile({ way, variant }: { way: WayIn; variant: WaysVariant }) {
  return (
    <div className={`${rowShell(variant)} opacity-70`}>
      {/* Padded to the same line box as an interactive row, minus the chevron's
          width, so a pending row sits flush in the stack rather than reading as
          a shorter kind of thing. */}
      <div className="flex items-center gap-3 px-3.5 py-3 pr-[calc(0.875rem+16px+0.75rem)]">
        <TileFace way={way} pending />
      </div>
    </div>
  );
}

function Tile({ way, variant }: { way: WayIn; variant: WaysVariant }) {
  const { t } = useLang();

  // Nothing to open: see PendingTile.
  if (way.unavailable) return <PendingTile way={way} variant={variant} />;

  return (
    <details
      // A tile keeps its place in the list whether open or closed.
      //
      // It used to take the whole row on open (`open:col-span-full`) so its
      // body had room for the install buttons. In a grid that looked broken:
      // the open tile jumped to full width while its neighbours stayed narrow,
      // reflowing the rest around it and leaving a ragged block of three
      // different widths. The fix is the container, not the tile — the shelf
      // is a single column of full-width rows now, so every body already has
      // the room, and opening one moves nothing else sideways.
      className={`group ${rowShell(variant)}`}
    >
      {/* items-center, not items-start: one line of content has no second line
          for the chevron and the chip to align to the top of. */}
      <summary className="flex items-center gap-3 px-3.5 py-3 list-none marker:hidden [&::-webkit-details-marker]:hidden cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--clear)]">
        <TileFace way={way} pending={false} />
        <Chevron />
      </summary>

      <div className="px-3.5 pb-3.5 pt-0.5 flex flex-col gap-3">
        <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">{t(way.detail)}</p>

        {/* "Where it runs" is NOT repeated here. It moved to the row's right
            edge, where it is readable without opening anything — see TileFace.
            It lived in the body only because a narrow tile had no room for it,
            and that constraint went with the grid. */}

        {way.id === "email" && <ForwardBody />}

        {way.id === "extension" &&
          (HAS_ANY_LISTING ? (
            <InstallLinks />
          ) : (
            <p className="text-[13px] text-[var(--faint)]">{t("ways.ext.unavailable")}</p>
          ))}

        {/* A plain link, for the tile whose action is one. Internal, so Link
            rather than ExternalLink — the ↗ would say "this leaves the site",
            which it does not.

            Both `cta` and `href` are required: a label with nowhere to go is
            not an action, and an href with no label has nothing to click. */}
        {way.cta && way.href && (
          <p>
            <Link
              href={way.href}
              className="text-[13px] font-semibold text-[var(--clear)] hover:underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] rounded-sm"
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

export default function WaysGrid({ variant = "cards" }: { variant?: WaysVariant } = {}) {
  // The email row is the forwarding panel now, so it goes when inbound mail is
  // off — the same condition that used to return null from ForwardPanel.
  const rows = INBOUND_ENABLED ? WAYS_IN : WAYS_IN.filter((w) => w.id !== "email");

  // One column of rows, inside whatever column the page gives this.
  //
  // This was a 2-then-3 column grid, which was the wrong answer to a real
  // problem. The problem was that the channels used to be full-width rows
  // across the WHOLE page, so each one cost a screen-width line and seven of
  // them — Edge and Safari listings, the package docs, a Telegram bot — would
  // have been a footer link farm. Columns fixed the width and broke
  // everything else: at 165px a tile's name wrapped, its half-line clamped to
  // nothing useful, and an open tile had to jump to full width to fit its
  // install buttons, which reflowed the other two and left a ragged block of
  // three different widths.
  //
  // The page solves the width now. This sits in one column of a two-column
  // control centre, so a row is ~420px rather than 1180 — a readable line,
  // with room for a name, a half-line and the buttons a body opens to, and
  // nothing moves sideways when one opens. Ten channels cost ten short rows
  // in a side column, which is the compactness the grid was reaching for.
  // Tethered: one bordered stack, divided rather than gapped, square along the
  // top so it meets the check card's bottom edge with no seam. The card above
  // carries the shadow for both — a second one here would draw a line between
  // them, which is the join this variant exists to remove.
  return (
    <div
      className={
        variant === "tethered"
          ? "rounded-b-2xl border border-t-0 border-[var(--rule)] divide-y divide-[var(--rule)] overflow-hidden"
          : "space-y-2.5"
      }
    >
      {rows.map((way) => (
        <Tile key={way.id} way={way} variant={variant} />
      ))}
    </div>
  );
}
