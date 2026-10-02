// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared pieces for the scripts that render brand imagery through a browser:
// the store promo tiles and the marketing screenshot.
//
// Both need the same three things — the brand colour tokens, a Chrome to
// render with, and the site's own woff2 files — so they live here rather than
// in whichever script was written first.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// From app/globals.css. Duplicated rather than parsed: these scripts run
// without the app, and a handful of hex values is cheaper to keep in step than
// a CSS parser is to maintain. They are the tokens' display values, so a change
// there should be mirrored here — the tests that pin brand colour do not reach
// into generated imagery.
export const TOKENS = {
  INK: "#141C2B",
  INK_2: "#1E2839",
  INK_3: "#2B3648",
  PAPER: "#FBFAF7",
  PAPER_DIM: "#EFEDE7",
  EMERALD: "#00A676",
  TEXT_DIM: "#A6B0C0",
  FAINT: "#7C879A",
  CLEAR: "#00A676",
  CAUTION: "#E8A33D",
  SCAM: "#D6453D",
} as const;

// Overridable because the default is the macOS install location, and a bare
// ENOENT from execFileSync says nothing about what to do next.
export const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Returns the base64 of a font's latin subset, read out of the Next build.
 *
 * The brand faces are loaded through next/font and never installed
 * system-wide, so they are not available to anything that resolves fonts
 * through fontconfig — which is why these scripts render through a browser and
 * inline the file rather than naming the family and hoping. next/font writes
 * hashed filenames, so the file is found through the generated @font-face CSS;
 * the `.p.` infix marks the preloaded latin subset, the only one this imagery
 * needs and the one whose absence would leave type in a fallback face.
 *
 * @param root repo root
 * @param cssNeedle a fragment of the generated CSS filename, e.g. "font_google_inter"
 */
export function findFont(root: string, cssNeedle: string): string {
  const chunks = join(root, ".next/dev/static/chunks");

  let dir: string[];
  try {
    dir = readdirSync(chunks);
  } catch {
    throw new Error(
      ".next/dev not found — run `npm run dev` once so next/font emits the " +
        "font files this script reads.",
    );
  }

  const css = dir.find((f) => f.includes(cssNeedle) && f.endsWith(".css"));
  if (!css) throw new Error(`No font CSS matching "${cssNeedle}" in ${chunks}`);

  const text = readFileSync(join(chunks, css), "utf8");
  const match = text.match(/url\("\.\.\/media\/([^"]*\.p\.[^"]*\.woff2)"\)/);
  if (!match) throw new Error(`No latin subset in ${css}`);

  return readFileSync(join(root, ".next/dev/static/media", match[1])).toString(
    "base64",
  );
}
