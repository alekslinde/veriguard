// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import CheckStage from "@/components/CheckStage";
import HomeHero, { HomeCaption } from "@/components/HomeHero";
import WaysTeaser from "@/components/WaysTeaser";
import { getStats } from "@/lib/reportStore";

// The positioning line the page used to render as an <h1>.
//
// It is metadata rather than markup because of who reads it. "Check before you
// click — see exactly what we found" is addressed to someone deciding whether
// to come here: a search result, a shared link, a store listing. Someone who
// has already arrived does not need to be sold the page they are looking at,
// and on a phone that headline cost ~300px above the paste box — pushing the
// product's one job below the fold to make an argument its reader had already
// accepted.
//
// So the claim still exists, indexed and previewed, where it does that work.
// The screen itself opens on the box.
export const metadata: Metadata = {
  title: "Check before you click — Veriguard",
  description:
    "Paste a suspicious link, text, email or phone number and see exactly what we found. Scored against open-source rules; nothing you paste is stored.",
};

// Per-request for the counters below, which are read on this render rather
// than fetched on mount. Nothing else here needs it — the check flow is
// client-side, and the region lookup this also used to carry left with the
// radar section.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Resolved here rather than fetched by StatsBar on mount. This render is
  // already happening per visit, so reading two counter rows inside it costs
  // nothing extra — while the client fetch it replaces was a second serverless
  // invocation per homepage view, which is the free tier's binding limit.
  //
  // Failure is non-fatal by design: the bar renders empty and the page is
  // unaffected. A stats widget must never be able to take the check flow down
  // with it, which is the actual product.
  let stats: { checks: number; reports: number } | null = null;
  try {
    stats = await getStats();
  } catch {
    stats = null;
  }

  return (
    // Top padding stays tight on a phone, where the short title plus the box
    // has to clear the fold, and opens up from sm where there is room.
    // data-home scopes the centring to this page; data-home-tool below is what
    // actually carries it. The tool fills the viewport and centres itself while
    // the box is empty, then collapses to its content height when a verdict
    // replaces it — see the block in globals.css for why that is a min-height
    // transition and why the page itself must not be the thing padded.
    <main
      data-home
      className="max-w-[1180px] mx-auto px-5 sm:px-8 pt-3 pb-8 sm:pt-10 sm:pb-12"
    >
      {/* ── The tool ────────────────────────────────────────────────────────
          One centred column, and the only thing on its row.

          It was left-aligned in a 760px column inside a 1180px page, which
          left ~500px of empty space beside the single most important control
          on the site — a layout that reads as unfinished rather than focused.
          Centred, the box is the page's axis and the width either side is
          margin rather than a gap where something is missing.

          Once a check has run the stage releases the cap itself: the verdict
          splits into an evidence sheet and a tactics rail that need the room.
          See CheckStage. */}
      <div data-home-tool className="max-w-[760px] mx-auto">
        {/* The head goes in the stage's slot, not the page, because the stage
            owns the step: both the title and the caption retire when a verdict
            replaces the input, and only the stage knows when that happened.

            The caption is ONE instance, moved by `order` rather than
            duplicated — it owns a StatsBar, and two copies would mount two
            `veriguard:check-complete` listeners and paint the same counter
            twice, once invisibly. `order-last` drops it under the box on a
            phone, where three lines above would eat most of the distance to
            the fold; from sm it sits between the headline and the card. The
            stage renders this slot as a flex column for exactly that. */}
        <CheckStage
          above={
            <>
              <HomeHero />
              {/* Centred from sm, with the headline it follows — `mx-auto`
                  centres the paragraph's box, `text-center` centres the lines
                  inside it, and without the second the text ranges left
                  against a centred title.

                  Left-aligned on a phone, where it sits under the card as its
                  footnote and there is no axis to centre on.

                  The bottom margin separates it from the card on a desktop,
                  where it sits above; on a phone `order-last` puts it after
                  the card, so that gap comes off the top instead. */}
              <HomeCaption
                stats={stats}
                className="order-last sm:order-none mt-3 sm:mb-6 sm:max-w-[62ch] sm:mx-auto sm:text-center"
              />
            </>
          }
          // The ways in, hanging off the card's bottom edge rather than sitting
          // as a block beneath it. One stack, no gap, square where the two meet
          // — so the reader's eye travels from the paste box into them without
          // crossing a boundary that says "new section". They are the
          // continuation of the card, not a second offer.
          attached={<WaysTeaser variant="tethered" heading={false} />}
        />
      </div>

      {/* NOTHING UNDER THE TOOL, deliberately.

          The ways-in rows are tethered to the check card itself (the stage's
          `attached` slot), and the install offer is a button in the header's
          top-right — app chrome rather than page content. What is left is one
          block for the centring to act on, which is what makes the centring
          simple: the tool is the page. */}
    </main>
  );
}
