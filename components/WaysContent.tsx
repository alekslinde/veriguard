"use client";

// The /ways page body.
//
// A client component for the same reason every other content page has one: the
// copy comes from the language context, which PageHeader and the cards both
// read. The route file stays a server component holding the metadata.

import { useLang } from "@/lib/lang";
import PageHeader from "@/components/PageHeader";
import WaysGrid from "@/components/WaysGrid";

export default function WaysContent() {
  const { t } = useLang();
  return (
    <>
      <PageHeader
        eyebrow={t("ways.eyebrow")}
        title={t("ways.headline")}
        lede={t("ways.lede")}
      />
      <WaysGrid />
      {/* What the four have in common, stated once at the end rather than
          repeated per card. It is the answer to the question the grid raises —
          "are these really the same checker?" — so it follows the cards instead
          of preceding them. */}
      <section className="mt-8 max-w-[68ch] rounded-2xl border border-[var(--rule)] p-5">
        <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
          {t("ways.privacy.heading")}
        </h2>
        <p className="mt-2 text-[14px] text-[var(--text-dim)] leading-relaxed">
          {t("ways.privacy.body")}
        </p>
      </section>
    </>
  );
}
