// The ways someone can reach the detection engine, as one list.
//
// Four surfaces now answer the same question — the paste box, email forwarding,
// the WebExtension and the npm package — and each was introduced on its own,
// documented where it was built. The homepage strip and the /ways page both
// need the same four, so they read them from here rather than each carrying a
// copy that drifts when a fifth arrives or a store goes live.
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
  id: "paste" | "email" | "extension" | "npm";
  /** Message keys for the four lines every card shows. */
  name: MessageKey;
  /** Who it is for — the line that helps someone self-select. */
  audience: MessageKey;
  /** What actually happens when you use it. */
  how: MessageKey;
  /** What it means for their privacy, stated per-surface rather than globally. */
  privacy: MessageKey;
  /** Call to action. */
  cta: MessageKey;
  /**
   * Where the CTA goes, or null when the destination is resolved at render
   * time — the extension's store link depends on which listings are live, and
   * that lives in lib/extensionInstalls.ts rather than being restated here.
   */
  href: string | null;
  runs: WhereItRuns;
}

/**
 * Ordered by how many people can use them, widest first.
 *
 * The paste box needs nothing at all; forwarding needs an email client; the
 * extension needs a supported browser; the package needs a developer. Someone
 * scanning the page stops at the first one that fits them, so a narrower
 * surface placed earlier would waste that scan.
 */
export const WAYS_IN: readonly WayIn[] = [
  {
    id: "paste",
    name: "ways.paste.name",
    audience: "ways.paste.for",
    how: "ways.paste.how",
    privacy: "ways.paste.privacy",
    cta: "ways.paste.cta",
    href: "/",
    runs: "server",
  },
  {
    id: "email",
    name: "ways.email.name",
    audience: "ways.email.for",
    how: "ways.email.how",
    privacy: "ways.email.privacy",
    cta: "ways.email.cta",
    // The home page's forward panel, which holds the address and the steps.
    // Linked rather than duplicated: the address is configured in one place and
    // a second copy here would be the one that goes stale.
    href: "/#forward",
    runs: "server",
  },
  {
    id: "extension",
    name: "ways.ext.name",
    audience: "ways.ext.for",
    how: "ways.ext.how",
    privacy: "ways.ext.privacy",
    cta: "ways.ext.cta",
    href: null, // resolved from EXTENSION_LISTINGS
    runs: "device",
  },
  {
    id: "npm",
    name: "ways.npm.name",
    audience: "ways.npm.for",
    how: "ways.npm.how",
    privacy: "ways.npm.privacy",
    cta: "ways.npm.cta",
    // The engine source, not the registry or a docs page: the package is not
    // published yet, and a card offering an install that 404s is worse than
    // one pointing at the code it would install. Repoint it at the docs page
    // once the package is out.
    href: ENGINE_SOURCE_URL,
    runs: "device",
  },
];
