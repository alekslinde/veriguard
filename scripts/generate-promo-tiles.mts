// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Generates the Chrome Web Store promotional tiles.
//
// These are listing assets, not extension assets: the store shows the small
// tile on the search-results card and in category listings, and falls back to
// rendering the 128px icon on a white square when none is uploaded — which is
// how an emerald mark on an ink ground ends up as a small dark stamp floating
// in white space, nothing like the product.
//
// Kept separate from generate-icons.mjs on purpose. That script composites one
// mark onto a square at many sizes, and every output is an *icon*. These are
// landscape marketing images with type in them, at three fixed sizes the store
// defines, and they need the brand faces — so the recipe shares nothing with
// icon generation beyond the colour tokens.
//
//   extension/store/promo-small.png     440×280   — required for listing
//   extension/store/promo-marquee.png   1400×560  — optional, for featuring
//
// Why a browser rather than sharp: the tiles are typeset in Fraunces and Inter,
// which the project loads through next/font and never installs system-wide.
// sharp rasterises SVG through librsvg, which resolves font families through
// fontconfig and so silently substitutes Helvetica for both — a serif display
// face rendering as a sans is the whole brand gone. Chrome reads the woff2
// files directly, so the tiles use the same faces as the site.
//
// Run: npm run promo  (requires a dev/prod build, for the font files)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { findFont, CHROME, TOKENS } from "./lib/brandRender.mts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "extension/store");

const { INK, INK_2, EMERALD, PAPER, TEXT_DIM } = TOKENS;

const fraunces = findFont(ROOT, "font_google_fraunces");
const inter = findFont(ROOT, "font_google_inter");

// The mark, inlined from the same source generate-icons.mjs uses, so the tiles
// cannot drift from the icons.
//
// The artwork does not fill its own 400×400 viewBox: measured, it spans
// x 25→347.7 and y 57→343, so the box carries ~25px of slack on the left and
// ~57px at the top. Rendering it as given pushes the mark down and right of
// where it looks centred. The icons never show this because they composite the
// whole box onto a square ground, where even slack reads as padding — here the
// mark sits beside type, where it reads as a misaligned logo.
//
// So: a viewBox tightened to the art itself, with an even margin all round.
// The mark is wider than it is tall, so the container it sits in is sized to
// that ratio rather than to a square — a square box would pad the sides and
// leave the mark looking small against the type beside it.
const ART = { x: 25, y: 57, w: 322.7, h: 286 };
const PAD = 10;
const BOX = [ART.x - PAD, ART.y - PAD, ART.w + PAD * 2, ART.h + PAD * 2]
  .map((n) => n.toFixed(2))
  .join(" ");
const MARK_RATIO = (ART.w + PAD * 2) / (ART.h + PAD * 2);

const MARK = readFileSync(join(ROOT, "app/icon-dark.svg"), "utf8")
  .replace(/<\?xml[^>]*\?>/, "")
  .replace('viewBox="0 0 400 400"', `viewBox="${BOX}"`)
  .trim();

// Two tiles, one template. `scale` multiplies every dimension off the 440×280
// small tile, which is the size the layout was proportioned for; the marquee is
// the same composition at 3.18× rather than a second design to keep in step.
type Tile = {
  width: number;
  height: number;
  /** Multiplies every dimension off the 440×280 tile the layout is drawn at. */
  scale: number;
  showTagline: boolean;
  /** Headline measure, in unscaled units. */
  measure: number;
  /** Tagline measure, in unscaled units. */
  subMeasure: number;
};

function page({
  width,
  height,
  scale,
  showTagline,
  measure,
  subMeasure,
}: Tile) {
  const px = (n: number) => `${(n * scale).toFixed(2)}px`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face {
    font-family: "Fraunces";
    src: url(data:font/woff2;base64,${fraunces}) format("woff2");
    font-weight: 100 900;
  }
  @font-face {
    font-family: "Inter";
    src: url(data:font/woff2;base64,${inter}) format("woff2");
    font-weight: 100 900;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; }
  /* justify-content centres the mark-and-copy pair as one unit. Without it the
     pair is left-aligned and the marquee's extra width all collects on the
     right, reading as an unfinished image rather than a wide one. */
  body {
    background: ${INK};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${px(26)};
    padding: 0 ${px(34)};
    overflow: hidden;
    position: relative;
  }
  /* A soft emerald bloom behind the mark. It keeps the left half from reading
     as flat black at thumbnail size, where the store renders these small. */
  .glow {
    position: absolute;
    left: 50%;
    top: 50%;
    width: ${px(300)};
    height: ${px(300)};
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, ${EMERALD}2E 0%, ${EMERALD}00 70%);
    pointer-events: none;
  }
  .mark {
    width: ${px(116)};
    height: ${px(116 / MARK_RATIO)};
    flex: none;
    position: relative;
    display: block;
  }
  .mark svg { width: 100%; height: 100%; display: block; position: relative; }
  .copy { position: relative; min-width: 0; }
  .name {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 600;
    font-size: ${px(42)};
    line-height: 1.02;
    letter-spacing: ${px(-0.8)};
    color: ${PAPER};
    white-space: nowrap;
  }
  .rule {
    width: ${px(44)};
    height: ${px(3)};
    background: ${EMERALD};
    border-radius: ${px(2)};
    margin: ${px(12)} 0 ${px(11)};
  }
  /* A measure rather than a hard <br>: the two tiles set this line at
     different sizes, and a break placed for one of them lands mid-phrase in
     the other. Sized so it turns after "number" at both scales. */
  .line {
    font-family: "Inter", system-ui, sans-serif;
    font-weight: 500;
    font-size: ${px(16.5)};
    line-height: 1.34;
    color: ${PAPER};
    letter-spacing: ${px(-0.1)};
    max-width: ${px(measure)};
    text-wrap: balance;
  }
  .sub {
    font-family: "Inter", system-ui, sans-serif;
    font-weight: 400;
    font-size: ${px(13.5)};
    line-height: 1.4;
    color: ${TEXT_DIM};
    margin-top: ${px(7)};
    max-width: ${px(subMeasure)};
    text-wrap: balance;
  }
  /* The on-device claim is the listing's load-bearing promise, so it gets a
     chip rather than another line of grey text. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: ${px(7)};
    margin-top: ${px(14)};
    padding: ${px(6)} ${px(12)};
    background: ${INK_2};
    border: ${px(1)} solid ${EMERALD}44;
    border-radius: ${px(999)};
    font-family: "Inter", system-ui, sans-serif;
    font-weight: 500;
    font-size: ${px(12)};
    color: ${PAPER};
    letter-spacing: ${px(0.1)};
  }
  .dot {
    width: ${px(7)};
    height: ${px(7)};
    border-radius: 50%;
    background: ${EMERALD};
    flex: none;
  }
</style></head>
<body>
  <div class="mark"><div class="glow"></div>${MARK}</div>
  <div class="copy">
    <div class="name">Veriguard</div>
    <div class="rule"></div>
    <div class="line">Check a link, message or number for scam signals.</div>
    ${showTagline ? `<div class="sub">Paste anything suspicious and get a plain-English verdict.</div>` : ""}
    <div class="chip"><span class="dot"></span>Runs entirely on your device</div>
  </div>
</body></html>`;
}

function render({
  out,
  ...tile
}: Tile & { out: string }) {
  const { width, height } = tile;
  const html = join(OUT_DIR, `.${out}.html`);
  writeFileSync(html, page(tile));

  // --headless=new honours web fonts and device-scale-factor; the older
  // headless mode rasterises text differently and would undo the point of
  // loading the real faces.
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${join(OUT_DIR, out)}`,
      `file://${html}`,
    ],
    { stdio: "pipe" },
  );

  rmSync(html);
  console.log(`✓ extension/store/${out} (${width}×${height})`);
}

if (!existsSync(CHROME)) {
  console.error(
    `No Chrome at ${CHROME}\n` +
      "Set CHROME_PATH to a Chrome or Chromium binary — the tiles are typeset " +
      "in the site's web fonts, which need a browser to render.",
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// Measures are given in unscaled units, like every other dimension here, and
// differ per tile because the two have different aspect ratios: the marquee is
// 2.5:1 against the small tile's 1.57:1, so the same measure that fills the
// small tile leaves the marquee's right third empty.
render({
  width: 440,
  height: 280,
  scale: 1,
  showTagline: false,
  measure: 258,
  subMeasure: 258,
  out: "promo-small.png",
});

render({
  width: 1400,
  height: 560,
  scale: 2.4,
  showTagline: true,
  measure: 330,
  subMeasure: 330,
  out: "promo-marquee.png",
});
