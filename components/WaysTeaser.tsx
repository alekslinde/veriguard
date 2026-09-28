"use client";

// Home-page section for taking the checker somewhere else.
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
    <section id="ways" className="scroll-mt-24 pt-2">
      <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
        {t("home.ways.heading")}
      </h2>
      {/* One line, not a card. It answers the question the two cards raise —
          "is this really the same checker?" — and that is a sentence, not a
          section. The per-surface privacy lines in the cards carry the part
          that actually differs between them. */}
      <p className="mt-1 mb-3 max-w-[68ch] text-[13.5px] text-[var(--text-dim)] leading-relaxed">
        {t("home.ways.lede")}
      </p>
      <WaysGrid />
    </section>
  );
}
