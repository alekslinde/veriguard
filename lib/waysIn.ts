// The ways to reach the detection engine other than pasting into the box.
//
// Four surfaces answer the same question. The paste box is the home page's
// fold, so it is not listed here — a row advertising the box 400px above it
// said nothing. The other three are: forward an email, the WebExtension, the
// package.
//
// Copy lives in messages/, not here: this module says which surfaces exist and
// where they point. It holds no JSX and no React import, so the extension could
// import it if it ever needed to — see the note in CLAUDE.md about what a pure
// lib/ module may be.

import type { MessageKey } from "@/lib/i18n";

export const ENGINE_SOURCE_URL =
  "https://github.com/alekslinde/veriguard/tree/main/packages/engine";

/**
 * Where scoring happens, which is the distinction users actually care about.
 *
 * This became load-bearing when the section lost its explanatory lede. While
 * every entry ran on-device the claim could be made once above the rows; with
 * forwarding among them it differs per row, and a blanket "nothing is sent
 * anywhere" would be false for exactly the entry most people would use.
 */
export type WhereItRuns = "server" | "device";

export interface WayIn {
  id: "email" | "extension" | "npm";
  /** Message keys for the parts of the row. */
  name: MessageKey;
  /**
   * What you do with it, as a clause following the name after a dash. This is
   * the closed row, so it is the half-line someone scans to decide whether to
   * open it — not a summary of everything below.
   */
  how: MessageKey;
  /**
   * What it takes to actually use it — the first thing the row opens to.
   *
   * One short paragraph. The detail that earns a click but not a line on a page
   * someone came to paste a message into: which browsers, what a reply contains,
   * what running it yourself involves.
   */
  detail: MessageKey;
  /**
   * Call to action, where the row ends in one.
   *
   * Optional, and currently set only on the package — which does not render it
   * either, because it is pending. Every other row's action is something richer
   * than a link: the extension offers a button per browser, email offers an
   * address and a copy button. A required field that no row renders invites the
   * next person to wire it back up and quietly duplicate one of those.
   */
  cta?: MessageKey;
  /**
   * Where the CTA goes, or null when there is no link to give.
   *
   * Null for the extension, whose store link depends on which listings are live
   * — that is resolved at render time from lib/extensionInstalls.ts rather than
   * being restated here. Also null for email, whose row holds an address and a
   * copy button rather than pointing anywhere.
   */
  href: string | null;
  runs: WhereItRuns;
  /**
   * Set where the surface is built but not yet distributed.
   *
   * The row renders flat when this is set — no disclosure, no link, nothing to
   * click. There is nothing behind it to open: `detail` would describe an
   * install nobody can run, so a chevron would only invite a click that pays
   * out in disappointment.
   *
   * `detail`, `cta` and `href` stay authored on a pending entry rather than
   * being emptied. They are what the row becomes the day it ships, and clearing
   * this one flag is then the whole change — an entry whose copy was deleted
   * while it waited would need writing again from nothing.
   */
  unavailable?: MessageKey;
}

/**
 * Ordered by how many people can use them, widest first.
 *
 * Forwarding needs only an email client; the extension needs a supported
 * browser; the package needs a developer. Someone scanning stops at the first
 * one that fits them, so a narrower surface placed earlier would waste that
 * scan.
 */
export const WAYS_IN: readonly WayIn[] = [
  {
    id: "email",
    name: "ways.email.name",
    how: "ways.email.how",
    detail: "ways.email.detail",
    // Nothing to link to: this row opens to the address and a copy button. The
    // panel that used to hold them sat above this section and was linked from
    // here by anchor, which broke the moment that panel unmounted after a check.
    href: null,
    // Forwarding goes through mail servers — the reader's and ours. It is the
    // one entry here that is not on-device, and the row says so rather than
    // letting the others imply otherwise.
    runs: "server",
  },
  {
    id: "extension",
    name: "ways.ext.name",
    how: "ways.ext.how",
    detail: "ways.ext.detail",
    href: null, // resolved from EXTENSION_LISTINGS
    runs: "device",
  },
  {
    id: "npm",
    name: "ways.npm.name",
    how: "ways.npm.how",
    detail: "ways.npm.detail",
    cta: "ways.npm.cta",
    // The engine source for now — the package has no registry page to point at,
    // and this is where its docs will live. Unrendered while `unavailable` is
    // set: the row is flat until the package ships. Repoint it at the docs then.
    href: ENGINE_SOURCE_URL,
    runs: "device",
    unavailable: "ways.npm.unavailable",
  },
];
