import type { Metadata } from "next";
import { Suspense } from "react";
import ShareTargetSeed from "@/components/ShareTargetSeed";

export const metadata: Metadata = {
  title: "Check a shared message — Veriguard",
  description: "Check a link, text or email you've shared from another app.",
  // A share-sheet landing target, not a content page. Keep it out of search
  // results and out of the sitemap, for the same reason /report is excluded.
  robots: { index: false, follow: true },
};

// The shared payload arrives in the query string, so this page reads
// searchParams and cannot be prerendered.
export const dynamic = "force-dynamic";

/**
 * Web Share Target landing page.
 *
 * Registered in app/manifest.ts as `share_target`, which puts this app in the
 * Android/iOS share sheet. Sharing a message from any app opens this page with
 * the content already in the check box.
 *
 * Deliberately the SAME CheckFlow as the home page rather than a share-specific
 * variant: a shared message is checked identically to a pasted one, so there is
 * one detection path, one set of behaviours and nothing extra to keep in sync.
 */
export default function SharePage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-5">
      {/* Same head shape and tokens as every other page. This carried the old
          palette — font-black, emerald headline, raw greys — left over from an
          earlier iteration, which made the one screen someone reaches from
          their phone's share sheet look like a different product. Smaller than
          PageHeader's headline because the check box below is the point here,
          not the title. */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(22px,3vw,28px)] leading-tight tracking-[-0.02em] text-[var(--foreground)]">
          Shared with Veriguard
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--text-dim)] leading-relaxed">
          Check that everything came through, then run it.
        </p>
      </div>

      {/* The fallback is deliberately NOT an interactive CheckFlow. Rendering a
          usable box here invites typing into a component that unmounts the
          moment the payload resolves, silently discarding the input — and it
          would run CheckFlow's history/popstate effects twice across the swap.
          An inert placeholder of roughly the right height avoids both, and
          keeps the layout from jumping. */}
      {/* The column the box sits in, matching the home page's.
          The cap lives here rather than inside CheckStage because it is a page
          layout decision — and the stage breaks out of it itself once a
          verdict replaces the input, which needs more room than a textarea
          does. See the note on that breakout in CheckStage. */}
      {/* mx-auto is load-bearing, not cosmetic: CheckStage's post-verdict
          breakout applies a symmetric negative margin sized for a CENTRED
          column. Left-aligned, that pulls the left edge past main's padding
          and outside the page gutter at wide widths. The home page centres
          this same column for the same reason. */}
      <div className="max-w-[760px] mx-auto">
        <Suspense
          fallback={
            <div
              className="h-64 rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)] animate-pulse"
              aria-hidden="true"
            />
          }
        >
          <ShareTargetSeed />
        </Suspense>
      </div>
    </main>
  );
}
