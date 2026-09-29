// Generates the marketing screenshot: a headline beside a mock of the check
// panel, showing a real verdict with its real working.
//
//   extension/store/screenshot-verdict.png       1280×800   — Chrome's size
//   extension/store/screenshot-verdict-amo.png   2400×1800  — AMO's size
//
// The panel is a mock, but nothing in it is invented. The verdict, the score
// and every signal row come from calling the engine at build time, and the
// verdict wording comes from the message bundle the app renders — so a rule
// change or a reworded string moves the screenshot on the next run instead of
// leaving it quietly claiming something the product no longer does. A
// screenshot that overstates the product is the kind of thing a store reviewer
// checks, and the honest-commercialisation line in the brief is the same point.
//
// The layout is a mock rather than a capture of the running app because the
// store wants one image at a fixed size with a headline on it, and driving the
// real UI to a pixel-exact size with the right content in it is a browser
// automation problem with more moving parts than the markup below.
//
// The two targets are different shapes — 16:10 against 4:3 — so the second is
// not the first upscaled. Letterboxing a 16:10 composition into a 4:3 frame
// would leave bands of dead ink, and stretching it would distort the type. The
// markup below is written once and laid out per target: the wide frame puts the
// copy beside the panel, the tall one stacks the copy above it, each filling
// its own frame. Both are rendered at a 2× device scale factor and so are
// emitted at twice the CSS size — which is what gets 2400×1800 out of a 1200×900
// viewport, with type rasterised at the higher density rather than resampled.
//
// Run: npm run screenshot  (requires a dev build, for the font files)
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { checkUrl } from "../packages/engine/src/scamDetector.ts";
import { findFont, CHROME, TOKENS } from "./lib/brandRender.mts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "extension/store");

const { INK, INK_2, EMERALD, PAPER, TEXT_DIM, FAINT, SCAM, CAUTION } = TOKENS;

// The subject of the screenshot. A .top domain impersonating a bank is the
// shape most Australian phishing SMS actually take, and it exercises three
// different rules rather than one — which is the point being made.
const SAMPLE_URL = "https://nab-secure-login.top/verify";
const REGION = "au";

const result = checkUrl(SAMPLE_URL, undefined, REGION) as unknown as {
  verdict: string;
  score: number;
  signals: { text: string; points: number; source: string }[];
};

// The app's own strings, so the mock cannot describe a verdict differently
// from the screen it is a picture of.
const messages = JSON.parse(
  readFileSync(join(ROOT, "messages/en.normal.json"), "utf8"),
) as Record<string, string>;

const label = messages[`verdict.${result.verdict}.label`];
const sub = messages[`verdict.${result.verdict}.sub`];
const reportLabel = messages["check.report"];

if (!label || !sub || !reportLabel) {
  throw new Error(
    `Missing message strings for verdict "${result.verdict}" — the bundle was ` +
      "reworded, so this screenshot's copy needs rechecking rather than " +
      "silently falling back.",
  );
}

// The panel is drawn for a high-risk verdict: the score bar is nearly full and
// the accent is the scam colour. A rule change that dropped this sample below
// that would make the picture misleading, so it fails rather than redraws.
if (result.verdict !== "likely_scam") {
  throw new Error(
    `Sample now scores "${result.verdict}" (${result.score}), not likely_scam. ` +
      "Pick a sample that still demonstrates a high-risk verdict.",
  );
}

const fraunces = findFont(ROOT, "font_google_fraunces");
const inter = findFont(ROOT, "font_google_inter");
const mono = findFont(ROOT, "font_google_ibm_plex_mono");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Signal rows, from the engine. `source` is the engine's own grouping and is
// shown as the row's kicker, so the panel labels each row the way the product
// does rather than inventing a category for it.
const signalRows = result.signals
  .map(
    (s) => `
      <div class="sig">
        <div class="sig-head">
          <span class="sig-src">${esc(s.source)}</span>
          <span class="sig-pts">+${s.points}</span>
        </div>
        <div class="sig-text">${esc(s.text)}</div>
      </div>`,
  )
  .join("");

/**
 * The two store frames.
 *
 * `out` is the PNG; `w`/`h` are its pixel dimensions, which is what each store
 * specifies. `stacked` picks the composition — side by side for the wide frame,
 * copy above panel for the tall one.
 *
 * There is deliberately no scale factor here. The composition is laid out at
 * its natural size in a `stage` of fixed design width, and the page then scales
 * that stage to fit the frame (see `.stage` below). Hand-tuning a multiplier
 * per frame is what produced a first pass whose headline sat above the top edge
 * and whose panel ran off the bottom — `overflow:hidden` crops silently, so the
 * error only shows up by eye. Letting the browser derive the factor removes the
 * class of mistake rather than correcting one instance of it, and the assertion
 * after rendering fails loudly if a stage ever exceeds its frame anyway.
 */
type Target = {
  out: string;
  w: number;
  h: number;
  stacked: boolean;
  store: string;
};

const TARGETS: Target[] = [
  {
    out: "screenshot-verdict.png",
    w: 1280,
    h: 800,
    stacked: false,
    store: "Chrome Web Store",
  },
  {
    out: "screenshot-verdict-amo.png",
    w: 2400,
    h: 1800,
    stacked: true,
    store: "addons.mozilla.org",
  },
];

// The stage each composition is drawn on, in CSS pixels, before it is scaled to
// its frame. The wide one is the original 1280×800 design, untouched. The tall
// one is a 4:3 stage roomy enough for the copy to sit above the panel at the
// same type sizes — so both frames render one design at one set of measurements
// and differ only in arrangement.
const STAGE = {
  wide: { w: 1280, h: 800 },
  tall: { w: 1360, h: 1020 },
};

// Chrome renders at this device scale factor, so a frame is laid out in
// frame/DPR CSS pixels and comes out at its full size with type rasterised at
// the higher density rather than resampled from a smaller render.
const DPR = 2;

// A stage must be the same shape as the frame it fills; scaling to width would
// otherwise leave a band of bare ink at the bottom, which is exactly the defect
// the fit is there to prevent.
for (const t of TARGETS) {
  const stage = t.stacked ? STAGE.tall : STAGE.wide;
  const frameRatio = t.w / t.h;
  const stageRatio = stage.w / stage.h;
  if (Math.abs(frameRatio - stageRatio) > 0.001) {
    throw new Error(
      `Stage for ${t.out} is ${stage.w}×${stage.h} (${stageRatio.toFixed(4)}) ` +
        `but the frame is ${t.w}×${t.h} (${frameRatio.toFixed(4)}). ` +
        "Resize the stage to the frame's aspect ratio.",
    );
  }
}

const buildHtml = (t: Target) => {
  const stage = t.stacked ? STAGE.tall : STAGE.wide;

  // Lengths are written at the design's own scale and pass through unchanged;
  // the stage-to-frame fit is the only scaling, and the browser applies it.
  const px = (n: number) => `${n}px`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  @font-face { font-family:"Fraunces"; src:url(data:font/woff2;base64,${fraunces}) format("woff2"); font-weight:100 900; }
  @font-face { font-family:"Inter"; src:url(data:font/woff2;base64,${inter}) format("woff2"); font-weight:100 900; }
  @font-face { font-family:"Plex"; src:url(data:font/woff2;base64,${mono}) format("woff2"); font-weight:100 900; }
  * { margin:0; padding:0; box-sizing:border-box; }
  /* The viewport is the frame at its CSS size; the stage inside is the design,
     scaled to it. Both carry the ink background so any rounding at the edge
     lands on brand rather than on white. */
  html, body {
    width:${t.w / DPR}px; height:${t.h / DPR}px;
    background:${INK}; overflow:hidden;
  }
  .stage {
    width:${stage.w}px; height:${stage.h}px;
    transform:scale(${(t.w / DPR / stage.w).toFixed(6)});
    transform-origin:top left;
    background:${INK};
    font-family:"Inter", system-ui, sans-serif;
    display:flex;
    flex-direction:${t.stacked ? "column" : "row"};
    align-items:center;
    justify-content:center;
    gap:${t.stacked ? px(38) : px(58)};
    padding:${t.stacked ? `${px(54)} ${px(60)}` : `0 ${px(76)}`};
    overflow:hidden;
    position:relative;
  }
  /* Same emerald bloom as the promo tiles, so the two assets read as one set.
     In the stacked frame it sits behind the headline at the top rather than
     off the left edge, which is where the composition's weight has moved. */
  .glow {
    position:absolute;
    ${
      t.stacked
        ? `left:50%; top:${px(-120)}; transform:translateX(-50%);`
        : `left:${px(-140)}; top:50%; transform:translateY(-50%);`
    }
    width:${px(620)}; height:${px(620)};
    background:radial-gradient(circle, ${EMERALD}26 0%, ${EMERALD}00 70%);
  }

  .left {
    position:relative; flex:none;
    width:${t.stacked ? "100%" : px(452)};
    ${t.stacked ? "text-align:center;" : ""}
  }
  .kicker {
    display:flex; align-items:center; gap:${px(9)};
    ${t.stacked ? "justify-content:center;" : ""}
    font-family:"Plex", monospace; font-size:${px(11.5)}; font-weight:600;
    letter-spacing:.13em; text-transform:uppercase; color:${EMERALD};
    margin-bottom:${px(22)};
  }
  .kicker .dot { width:${px(7)}; height:${px(7)}; border-radius:50%; background:${EMERALD}; }
  h1 {
    font-family:"Fraunces", Georgia, serif; font-weight:600;
    font-size:${px(51)}; line-height:1.08; letter-spacing:${px(-1.1)}; color:${PAPER};
    ${t.stacked ? `max-width:${px(740)}; margin:0 auto;` : ""}
  }
  h1 em { font-style:normal; color:${EMERALD}; }
  .lede {
    margin-top:${px(22)}; font-size:${px(16.5)}; line-height:1.58; color:${TEXT_DIM};
    ${t.stacked ? `max-width:${px(660)}; margin-left:auto; margin-right:auto;` : ""}
  }
  /* The three points are the wide frame's left column. The tall frame drops
     them: stacked, the panel needs the vertical room, and the points restate
     what the panel is already demonstrating — the signal rows with their
     weights are the "shows its rules" claim, made rather than asserted. A row
     of them across the top measured fine and still read as filler above the
     thing worth looking at. */
  .points {
    margin-top:${px(30)};
    display:${t.stacked ? "none" : "flex"};
    flex-direction:column;
    gap:${px(15)};
  }
  .point { display:flex; gap:${px(11)}; align-items:flex-start; }
  .point svg { flex:none; margin-top:${px(1)}; }
  .point p { font-size:${px(14)}; line-height:1.55; color:${TEXT_DIM}; }
  .point b { color:${PAPER}; font-weight:600; }

  /* The panel. Sized and spaced like the real check card rather than a
     generic device frame — no fake browser chrome, no status bar. */
  .panel {
    position:relative; width:${px(474)}; flex:none;
    background:${INK_2}; border:${px(1)} solid rgba(255,255,255,.10);
    border-radius:${px(16)}; overflow:hidden;
  }
  .bar {
    display:flex; align-items:center; gap:${px(8)};
    padding:${px(13)} ${px(16)}; border-bottom:${px(1)} solid rgba(255,255,255,.10);
  }
  .bar .dot { width:${px(8)}; height:${px(8)}; border-radius:50%; background:${EMERALD}; }
  .bar .name {
    font-family:"Fraunces", Georgia, serif; font-weight:600;
    font-size:${px(15)}; color:${PAPER};
  }
  .chip {
    margin-left:auto; font-family:"Plex", monospace; font-size:${px(9)}; font-weight:600;
    letter-spacing:.09em; text-transform:uppercase; color:${TEXT_DIM};
    border:${px(1)} solid rgba(255,255,255,.16); border-radius:${px(6)}; padding:${px(3)} ${px(7)};
  }
  .body { padding:${px(15)} ${px(16)} ${px(16)}; }
  .flabel {
    font-family:"Plex", monospace; font-size:${px(9)}; font-weight:500;
    letter-spacing:.1em; text-transform:uppercase; color:${FAINT};
    display:block; margin-bottom:${px(7)};
  }
  .input {
    background:${INK}; border:${px(1)} solid rgba(255,255,255,.13); border-radius:${px(9)};
    padding:${px(11)} ${px(12)}; font-size:${px(13)}; color:${PAPER};
    font-family:"Plex", monospace; word-break:break-all; min-height:${px(52)};
  }
  .row { display:flex; gap:${px(10)}; align-items:flex-end; margin-top:${px(13)}; }
  .row > div { flex:1; min-width:0; }
  .select {
    background:${INK}; border:${px(1)} solid rgba(255,255,255,.13); border-radius:${px(9)};
    padding:${px(10)} ${px(12)}; font-size:${px(13.5)}; color:${PAPER};
    display:flex; align-items:center; justify-content:space-between;
  }
  .select svg { flex:none; opacity:.55; }
  .btn {
    flex:none; min-height:${px(40)}; padding:0 ${px(22)}; border:0; border-radius:${px(9)};
    background:${EMERALD}; color:#04150F; font-size:${px(14)}; font-weight:600;
    font-family:"Inter", sans-serif;
  }

  .verdict {
    margin-top:${px(15)}; border:${px(1)} solid ${SCAM}44; border-radius:${px(12)};
    background:${SCAM}0F; overflow:hidden;
  }
  .vhead { padding:${px(13)} ${px(15)} ${px(12)}; }
  .vlabel {
    display:flex; align-items:center; gap:${px(8)};
    font-size:${px(14.5)}; font-weight:600; color:${PAPER};
  }
  .vlabel .dot { width:${px(8)}; height:${px(8)}; border-radius:50%; background:${SCAM}; flex:none; }
  .vsub { margin-top:${px(5)}; font-size:${px(12.5)}; line-height:1.45; color:${TEXT_DIM}; }

  .sigs { border-top:${px(1)} solid rgba(255,255,255,.08); }
  .sig { padding:${px(10)} ${px(15)}; border-bottom:${px(1)} solid rgba(255,255,255,.06); }
  .sig-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:${px(4)}; }
  .sig-src {
    font-family:"Plex", monospace; font-size:${px(8.5)}; font-weight:500;
    letter-spacing:.11em; text-transform:uppercase; color:${FAINT};
  }
  .sig-pts { font-family:"Plex", monospace; font-size:${px(11.5)}; font-weight:600; color:${CAUTION}; }
  .sig-text { font-size:${px(12.5)}; line-height:1.45; color:${TEXT_DIM}; }

  .score { padding:${px(12)} ${px(15)} ${px(13)}; }
  .score-top { display:flex; align-items:baseline; justify-content:space-between; }
  .score-lbl {
    font-family:"Plex", monospace; font-size:${px(9)}; font-weight:500;
    letter-spacing:.11em; text-transform:uppercase; color:${FAINT};
  }
  .score-val { font-family:"Plex", monospace; font-weight:600; color:${PAPER}; font-size:${px(25)}; }
  .score-val span { font-size:${px(12)}; color:${FAINT}; font-weight:500; }
  .track { margin-top:${px(8)}; height:${px(5)}; border-radius:${px(3)}; background:rgba(255,255,255,.09); overflow:hidden; }
  .fill { height:100%; border-radius:${px(3)}; background:${SCAM}; width:${result.score}%; }

  .report {
    margin:0 ${px(15)} ${px(12)}; display:block; width:calc(100% - ${px(30)});
    min-height:${px(40)}; border-radius:${px(9)}; background:transparent;
    border:${px(1)} solid rgba(255,255,255,.18); color:${PAPER};
    font-size:${px(13.5)}; font-weight:600; font-family:"Inter", sans-serif;
  }
  .note {
    padding:0 ${px(15)} ${px(14)}; font-size:${px(10.5)}; line-height:1.5; color:${FAINT};
  }
  .foot {
    border-top:${px(1)} solid rgba(255,255,255,.10); padding:${px(10)} ${px(15)};
    text-align:center; font-size:${px(10.5)}; color:${FAINT};
  }
</style></head>
<body>
<div class="stage">
  <div class="glow"></div>

  <div class="left">
    <div class="kicker"><span class="dot"></span>Runs on your device</div>
    <h1>Check a dodgy text <em>before</em> you tap the link.</h1>
    <p class="lede">
      Paste a message, link, email or phone number — or select it on any page
      and right-click — and get an instant verdict that shows its working.
    </p>
    <div class="points">
      <div class="point">
        <svg width="${px(17)}" height="${px(17)}" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="${EMERALD}" stroke-width="1.5"/>
          <path d="m6 10.2 2.6 2.6L14 7.4" stroke="${EMERALD}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p><b>Nothing you paste leaves your machine.</b> The detection engine is
        built in — turn off your internet and it still works.</p>
      </div>
      <div class="point">
        <svg width="${px(17)}" height="${px(17)}" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="${EMERALD}" stroke-width="1.5"/>
          <path d="m6 10.2 2.6 2.6L14 7.4" stroke="${EMERALD}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p><b>Every verdict shows its rules.</b> Each signal, what it contributed,
        and a score you can add up yourself.</p>
      </div>
      <div class="point">
        <svg width="${px(17)}" height="${px(17)}" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="${EMERALD}" stroke-width="1.5"/>
          <path d="m6 10.2 2.6 2.6L14 7.4" stroke="${EMERALD}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p><b>Two permissions, no page access.</b> It never asks to read the pages
        you visit — the only text it sees is text you give it.</p>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="bar">
      <span class="dot"></span>
      <span class="name">Veriguard</span>
      <span class="chip">On-device</span>
    </div>

    <div class="body">
      <span class="flabel">Paste a message, link or number</span>
      <div class="input">${esc(SAMPLE_URL)}</div>

      <div class="row">
        <div>
          <span class="flabel">Region</span>
          <div class="select">Australia
            <svg width="${px(11)}" height="${px(11)}" viewBox="0 0 12 12" fill="none">
              <path d="m3 4.5 3 3 3-3" stroke="${PAPER}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <button type="button" class="btn">Check</button>
      </div>

      <div class="verdict">
        <div class="vhead">
          <div class="vlabel"><span class="dot"></span>${esc(label)}</div>
          <div class="vsub">${esc(sub)}</div>
        </div>

        <div class="sigs">${signalRows}</div>

        <div class="score">
          <div class="score-top">
            <span class="score-lbl">Risk score</span>
            <span class="score-val">${result.score}<span>/100</span></span>
          </div>
          <div class="track"><div class="fill"></div></div>
        </div>

        <button type="button" class="report">${esc(reportLabel)}</button>
        <p class="note">Opens the report form on veriguard.app with the link,
        number or address filled in. Nothing is sent until you review it there
        and submit.</p>
      </div>
    </div>

    <div class="foot">Rule-based. Nothing you paste leaves this device.</div>
  </div>
</div>
</body></html>`;
};

/**
 * The markup that reports whether the composition fits its stage.
 *
 * `overflow:hidden` on the stage means content that does not fit is cropped
 * without complaint — the failure is invisible to anything checking the PNG's
 * dimensions, and shows up only as a headline with its top sliced off. So the
 * page measures itself and writes the answer into the title, which
 * `--dump-dom` hands back.
 */
// `top` is a read-only property of `window`, so a top-level `const top` is a
// redeclaration and kills the whole script — hence the hi/lo names.
const PROBE = `
<script>
  const s = document.querySelector(".stage");
  const kids = [...s.children].filter((el) => !el.classList.contains("glow"));
  const rects = kids.map((el) => el.getBoundingClientRect());
  const hi = Math.min(...rects.map((r) => r.top));
  const lo = Math.max(...rects.map((r) => r.bottom));
  // The rects are in post-transform pixels; compare against the scaled stage.
  const h = s.getBoundingClientRect().height;
  // Not just "inside the stage": a centred flex container that overflows spills
  // past both edges at once, so a composition can clear a zero-tolerance bounds
  // check and still have its first line shaved. Requiring a real margin catches
  // the near-miss, which is the one that looks like a design choice rather than
  // a bug. The value is in post-transform pixels, so it is a visible gap at any
  // frame size.
  const MARGIN = 12;
  document.title = JSON.stringify({
    over: hi < MARGIN || lo > h - MARGIN,
    margin: MARGIN,
    top: Math.round(hi),
    bottom: Math.round(lo),
    stage: Math.round(h),
  });
</script>`;

if (!existsSync(CHROME)) {
  console.error(
    `No Chrome at ${CHROME}\n` +
      "Set CHROME_PATH to a Chrome or Chromium binary.",
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const t of TARGETS) {
  // Named per target: a shared temp file would be fine sequentially, but two
  // of these running at once would have one overwrite the other's markup
  // between write and render.
  const tmp = join(OUT_DIR, `.screenshot-${t.out}.html`);
  const viewport = `${t.w / DPR},${t.h / DPR}`;

  // Measure before rendering, so a composition that does not fit fails here
  // rather than being written out silently cropped.
  writeFileSync(tmp, buildHtml(t).replace("</body>", `${PROBE}</body>`));

  const dom = execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--force-device-scale-factor=${DPR}`,
      `--window-size=${viewport}`,
      "--virtual-time-budget=2000",
      "--dump-dom",
      `file://${tmp}`,
    ],
    { encoding: "utf8", maxBuffer: 1e8, stdio: ["pipe", "pipe", "pipe"] },
  );

  const title = dom.match(/<title>([^<]*)<\/title>/)?.[1];
  const fit = title && JSON.parse(title.replace(/&quot;/g, '"'));
  if (!fit || fit.over) {
    rmSync(tmp, { force: true });
    throw new Error(
      fit
        ? `${t.out}: the composition does not clear its stage — content spans ` +
          `${fit.top}…${fit.bottom}px in a ${fit.stage}px stage, inside a ` +
          `${fit.margin}px margin. It would be cropped or sit flush to an ` +
          "edge. Adjust the stage size or the stacked layout."
        : `Could not measure ${t.out} — the fit probe did not run.`,
    );
  }

  writeFileSync(tmp, buildHtml(t));

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--force-device-scale-factor=${DPR}`,
      `--window-size=${viewport}`,
      `--screenshot=${join(OUT_DIR, t.out)}`,
      `file://${tmp}`,
    ],
    { stdio: "pipe" },
  );

  rmSync(tmp);

  console.log(`✓ extension/store/${t.out} (${t.w}×${t.h}) — ${t.store}`);
}

console.log(
  `  ${result.verdict} ${result.score}/100, ` +
    `${result.signals.length} signals, from the engine`,
);
