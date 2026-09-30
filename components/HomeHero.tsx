"use client";

import { useLang } from "@/lib/lang";
import StatsBar from "./StatsBar";

/**
 * The strip above the check box.
 *
 * **This used to be a hero and deliberately is not one any more.** It carried a
 * 50px display headline and a 58ch subtitle, which on a 390px phone put the
 * paste box roughly 300px down — the thing the entire product exists for,
 * opening below the fold, on the device most likely to be holding the
 * suspicious message.
 *
 * A headline is how a landing page introduces itself to someone deciding
 * whether to stay. That is the wrong model: this is a tool, and an app does not
 * pitch itself on its own home screen. The positioning copy did not get deleted
 * — it moved to the page's <title> and OG metadata, which is where a claim
 * aimed at someone who has NOT arrived yet actually belongs, and where search
 * and link previews read it.
 *
 * What stays is what a reader who HAS arrived needs before they paste: that
 * checking is private, and that other people use it. One line each.
 *
 * `stats` is passed straight through to StatsBar. This is a client component
 * (it uses useLang), so it cannot fetch server-side itself — the homepage
 * resolves the counters during its own render and hands them down.
 *
 * Required rather than optional, and deliberately so: an optional prop would
 * let a future caller render `<HomeHero />`, type-check cleanly, and silently
 * lose the invocation saving with nothing failing. `null` says the server tried
 * and could not.
 */
export default function HomeHero({ stats }: { stats: { checks: number; reports: number } | null }) {
  const { t } = useLang();

  return (
    // No heading element at all. The page's accessible name comes from the
    // document title, and CheckFlow already renders an sr-only <h2> naming the
    // input step — so a visually-hidden <h1> here would announce a third name
    // for the same screen. The route's <h1> obligation is met by the check
    // card's own labelled region.
    //
    // Mono, --faint: the same treatment as the app's other captions (the
    // radar's channel chips, the "Checked" record above a verdict). It reads as
    // instrument labelling rather than marketing copy, which is exactly the
    // register change this component exists to make.
    //
    // The claim is "scored against open-source rules", NOT "checked on your
    // device". Web checks call /api/check; on-device scoring is the extension's
    // property and belongs to its listing. Widening it here would be the same
    // class of error StatsBar's doc comment warns about — a true claim about
    // one surface, restated as a claim about the product.
    // Body face, not mono. Three mono lines at 11px read as a block of
    // instrument output rather than a footnote — the monospace advance widens
    // every line, so the same sentence wrapped to three lines where the body
    // face takes two, and the caption ended up competing with the card it was
    // supposed to qualify. Mono earns its place on values a reader compares or
    // copies; this is a sentence.
    <p className="text-[12px] leading-[1.5] text-[var(--faint)] text-pretty">
      {t("home.privacy")}
      <StatsBar initial={stats} />
    </p>
  );
}
