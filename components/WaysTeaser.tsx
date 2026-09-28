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
import WaysGrid from "@/components/WaysGrid";

export default function WaysTeaser() {
  const { t } = useLang();
  return (
    // The label is for assistive technology only — it replaces the visible
    // heading that used to name this group, so the section is still announced
    // and navigable rather than being an unlabelled run of links.
    <section id="ways" aria-label={t("home.ways.label")} className="scroll-mt-24">
      <WaysGrid />
    </section>
  );
}
