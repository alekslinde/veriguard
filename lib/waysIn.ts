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

// The package source URL used to be declared here as well as in
// lib/npmPackage.ts. Two copies of the same path is how a rename gets applied
// to one of them — npmPackage.ts is the single place both are named now, and
// this module no longer needs it: the npm row points at the on-site docs.

/**
 * Where scoring happens, which is the distinction users actually care about.
 *
 * This became load-bearing when the section lost its explanatory lede. While
 * every entry ran on-device the claim could be made once above the rows; with
 * forwarding among them it differs per row, and a blanket "nothing is sent
 * anywhere" would be false for exactly the entry most people would use.
 */
export type WhereItRuns = "server" | "device";

/**
 * Which glyph the shelf draws for a surface.
 *
 * A name, not a path: the SVG lives with the component that draws it, because
 * this module is importable by the extension and must stay free of JSX. Adding
 * a channel means adding a member here and a case there, and the compiler names
 * the second half if you forget it.
 */
export type WayIcon = "email" | "extension" | "package" | "chat";

export interface WayIn {
  /**
   * Only ids with a WAYS_IN entry belong here. A member with no entry is a
   * channel the type system says exists and the shelf never renders — and
   * this file's job is to say which surfaces are real.
   */
  id: "email" | "extension" | "npm";
  /** The glyph the shelf draws. See WayIcon. */
  icon: WayIcon;
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
   * Optional, and set only on the packages row, whose action really is a single
   * link. Every other row's action is something richer: the extension offers a
   * button per browser, email offers an address and a copy button. Making this
   * required would invite the next person to give one of those a redundant
   * link beside the thing it already has.
   *
   * Rendered only with `href`, since a label with nowhere to go is not an
   * action.
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
   * NO ROW SETS THIS TODAY, and that is deliberate rather than an oversight —
   * the packages row used it until they were published, and clearing the one
   * flag was the whole change, as the note below predicted. It is kept because
   * "built but not distributed" recurs: a second extension listing, a new
   * package, a region pack with no data yet.
   *
   * The row renders flat when this is set — no disclosure, nothing to expand.
   * There is nothing behind it to open: `detail` would describe an install
   * nobody can run, so a chevron would only invite a click that pays out in
   * disappointment. It still links to on-site documentation when `href` is a
   * path, because docs exist whether or not the thing they document ships; see
   * PendingRow.
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
    icon: "email",
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
    icon: "extension",
    name: "ways.ext.name",
    how: "ways.ext.how",
    detail: "ways.ext.detail",
    href: null, // resolved from EXTENSION_LISTINGS
    runs: "device",
  },
  {
    id: "npm",
    icon: "package",
    name: "ways.npm.name",
    how: "ways.npm.how",
    detail: "ways.npm.detail",
    cta: "ways.npm.cta",
    // The on-site docs, which cover both packages — the library and the MCP
    // server. Points here rather than at the GitHub source or at a registry
    // page: a reader following "read the docs" wants prose with copyable
    // samples, and the page links out to both packages' registry entries and
    // READMEs itself.
    href: "/packages",
    runs: "device",
  },
];
