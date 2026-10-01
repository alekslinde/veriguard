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
      {/* The heading is for screen readers only, and the lede is gone.
          Both were visible while this was one column of a two-column control
          centre: an unlabelled column beside the radar's labelled one read as a
          fragment of it rather than a thing in its own right. The radar left,
          so that reason left with it, and what is back is the older and better
          one — the rows are self-describing (a name, what you do with it, where
          it runs), and two lines of framing over three lines of content made
          this read as a second offer competing with the check box.

          It stays an <h2> rather than becoming a bare <div>: the section is a
          landmark in the document outline and someone navigating by heading
          needs it to exist. Hidden visually, announced normally — the one case
          where those should differ. */}
      <h2 id="ways-heading" className="sr-only">
        {t("home.ways.heading")}
      </h2>
      <WaysGrid />
    </section>
  );
}
