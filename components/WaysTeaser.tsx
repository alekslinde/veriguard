// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// The other ways in, as a bare group of rows.
//
// No heading and no lede. Both were removed deliberately: "Take it with you"
// plus a sentence explaining that the same engine runs behind all of them was
// two lines of framing over three lines of content, and the rows say what they
// are — a name, what you do with it, where it runs, and how to get it. A
// section label earns its place when a reader has to be told what they are
// looking at; these rows are self-describing, and the label was the part that
// made this read as a second offer competing with the check box.
//
// Below the fold on purpose, and last on the page: someone arriving mid-panic
// with a dodgy SMS needs the paste field first, and "you could also install an
// extension" is not what they came for. It earns its space further down, where
// a reader who already has their answer is deciding whether to keep the tool
// around.
//
// `id` so the retired /ways route can redirect here rather than 404 for anyone
// holding an old link.

import { useLang } from "@/lib/lang";
import { useOpenOnHash } from "@/lib/useOpenOnHash";
import WaysGrid from "@/components/WaysGrid";

export default function WaysTeaser() {
  const { t } = useLang();

  // The retired /ways route redirects here permanently, and this section is
  // three closed <details> — so without this the redirect delivers three
  // one-line summaries and hides everything the old page held. The hook opens
  // the disclosures inside whatever the hash names, which is this section.
  useOpenOnHash();

  return (
    <section id="ways" aria-labelledby="ways-heading" className="scroll-mt-24">
      {/* The heading is visible again.
          It was dropped when this was the last block on a single-column page,
          where the rows were self-describing and a label over them read as a
          second offer competing with the check box. It is a column of a
          control centre now, sitting beside the radar's own heading — and an
          unlabelled column next to a labelled one reads as a fragment of the
          section above it rather than a thing in its own right.

          Matched to the radar's heading so the two columns are visibly peers.
          The dot is neutral rather than the radar's amber: that colour says
          "something is happening", which is true of circulating scams and not
          of a list of ways to install. */}
      <h2
        id="ways-heading"
        className="flex items-center gap-2 text-[15px] font-semibold text-[var(--foreground)]"
      >
        <span
          aria-hidden="true"
          className="w-[7px] h-[7px] rounded-full bg-[var(--faint)] shrink-0"
        />
        {t("home.ways.heading")}
      </h2>
      <p className="mt-1 mb-3 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
        {t("home.ways.lede")}
      </p>
      <WaysGrid />
    </section>
  );
}
