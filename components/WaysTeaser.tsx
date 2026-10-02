// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// The other ways in, in full — the forwarding address, the install buttons,
// the packages link.
//
// ON /about NOW, not the home page. The home page offers these as a menu in the
// check card's action bar (OtherWaysMenu), which names the three and links
// here; a menu attached to a text box is the wrong place for a copyable address
// and four store buttons, and a shelf of them under the card made the home page
// two blocks where it should be one.
//
// The heading is visible here. It was sr-only while this sat unlabelled under
// the check box, where a label read as a second offer competing with the box —
// but this is a section among headed sections now, and the odd one without a
// heading is the one that reads as a fragment of its neighbour.
//
// `id="ways"` is load-bearing: the retired /ways route redirects to /about#ways
// permanently, so this anchor is where every old link to that page lands.

import { useLang } from "@/lib/lang";
import { useOpenOnHash } from "@/lib/useOpenOnHash";
import WaysGrid, { type WaysVariant } from "@/components/WaysGrid";

export default function WaysTeaser({
  variant = "cards",
  heading = true,
}: { variant?: WaysVariant; heading?: boolean } = {}) {
  const { t } = useLang();

  // The retired /ways route redirects here permanently, and this section is
  // three closed <details> — so without this the redirect delivers three
  // one-line summaries and hides everything the old page held. The hook opens
  // the disclosures inside whatever the hash names, which is this section.
  useOpenOnHash();

  return (
    // max-w matched to the page's other sections. The rows are full width, so
    // whatever hosts this has to bound them — uncapped on a 1180px page each
    // row is a screen-wide line and three of them read as a footer link farm,
    // which is the shape this shelf was reworked to escape. Carried here rather
    // than left to the caller so moving it again cannot lose it.
    <section
      id="ways"
      aria-labelledby="ways-heading"
      className={variant === "tethered" ? "" : "scroll-mt-24 max-w-[68ch]"}
    >
      {/* Matched to the about page's own section headings rather than styled
          here, so this reads as one of them and not as a widget dropped into
          the page.

          Hidden visually on the home page, where the rows hang off the check
          card as its continuation and a heading over them would re-introduce
          the "second offer competing with the box" the tethering exists to
          avoid. It stays in the outline either way: the section is a landmark
          and someone navigating by heading needs it to exist. */}
      <h2
        id="ways-heading"
        className={
          heading
            ? "font-[family-name:var(--font-display)] font-semibold text-[clamp(18px,2.2vw,22px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]"
            : "sr-only"
        }
      >
        {t("home.ways.heading")}
      </h2>
      {heading && (
        <p className="mt-2 mb-3 max-w-[68ch] text-[14.5px] text-[var(--text-dim)] leading-relaxed">
          {t("home.ways.lede")}
        </p>
      )}
      <WaysGrid variant={variant} />
    </section>
  );
}
