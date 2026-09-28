// The ways to take the detection engine somewhere other than this site.
//
// Four surfaces answer the same question, but only two of them are worth
// listing: the paste box and email forwarding ARE the home page's fold, and
// carding them again below it advertised a box 400px above the card — one of
// them linked to the page it was sitting on. What is left is the pair a reader
// cannot already see: the WebExtension and the package.
//
// Copy lives in messages/, not here: this module says which surfaces exist and
// where they point. It holds no JSX and no React import, so the extension could
// import it if it ever needed to — see the note in CLAUDE.md about what a pure
// lib/ module may be.

import type { MessageKey } from "@/lib/i18n";

export const ENGINE_SOURCE_URL =
  "https://github.com/alekslinde/veriguard/tree/main/packages/engine";

/** Where scoring happens, which is the distinction users actually care about. */
export type WhereItRuns = "server" | "device";

export interface WayIn {
  id: "extension" | "npm";
  /** Message keys for the lines every card shows. */
  name: MessageKey;
  /**
   * Who it is for and what happens when you use it, as one sentence.
   *
   * These used to be three keys — audience, how, privacy — written for a page
   * that had room for them. Two-up under the check box that read as a wall, so
   * the card is down to the line someone actually scans for, and the privacy
   * claim is made once for the section instead of twice per card.
   */
  how: MessageKey;
  /** Call to action. */
  cta: MessageKey;
  /**
   * Where the CTA goes, or null when the destination is resolved at render
   * time — the extension's store link depends on which listings are live, and
   * that lives in lib/extensionInstalls.ts rather than being restated here.
   */
  href: string | null;
  runs: WhereItRuns;
  /**
   * Set where the surface is built but not yet distributed.
   *
   * The card then leads with this rather than a call to action, and `href`
   * becomes a secondary link to whatever does exist. A CTA that reads "Read the
   * docs" and lands on a source tree is a small lie told on the busiest page we
   * have; saying "not published yet" costs nothing and is true. Clear the flag
   * when the package ships, and repoint `href` at the docs.
   */
  unavailable?: MessageKey;
  /** Label for the fallback link shown while `unavailable` is set. */
  fallbackCta?: MessageKey;
}

/**
 * Ordered by how many people can use them, widest first.
 *
 * The extension needs a supported browser; the package needs a developer.
 * Someone scanning stops at the first one that fits them, so a narrower surface
 * placed earlier would waste that scan.
 */
export const WAYS_IN: readonly WayIn[] = [
  {
    id: "extension",
    name: "ways.ext.name",
    how: "ways.ext.how",
    cta: "ways.ext.cta",
    href: null, // resolved from EXTENSION_LISTINGS
    runs: "device",
  },
  {
    id: "npm",
    name: "ways.npm.name",
    how: "ways.npm.how",
    cta: "ways.npm.cta",
    // The engine source, not the registry: the package is not published, and a
    // card offering an install that 404s is worse than one pointing at the code
    // it would install.
    href: ENGINE_SOURCE_URL,
    runs: "device",
    unavailable: "ways.npm.unavailable",
    fallbackCta: "ways.npm.source",
  },
];
