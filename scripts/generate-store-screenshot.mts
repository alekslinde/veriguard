// Generates the marketing screenshot: a headline beside a mock of the check
// panel, showing a real verdict with its real working.
//
//   public/store/screenshot-verdict.png   1280×800  — Chrome's screenshot size
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
// real UI to a pixel-exact 1280×800 with the right content in it is a browser
// automation problem with more moving parts than the markup below.
//
// Run: npm run screenshot  (requires a dev build, for the font files)
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { checkUrl } from "../packages/engine/src/scamDetector.ts";
import { findFont, CHROME, TOKENS } from "./lib/brandRender.mts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "public/store");

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

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  @font-face { font-family:"Fraunces"; src:url(data:font/woff2;base64,${fraunces}) format("woff2"); font-weight:100 900; }
  @font-face { font-family:"Inter"; src:url(data:font/woff2;base64,${inter}) format("woff2"); font-weight:100 900; }
  @font-face { font-family:"Plex"; src:url(data:font/woff2;base64,${mono}) format("woff2"); font-weight:100 900; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:1280px; height:800px; }
  body {
    background:${INK};
    font-family:"Inter", system-ui, sans-serif;
    display:flex;
    align-items:center;
    gap:58px;
    padding:0 76px;
    overflow:hidden;
    position:relative;
  }
  /* Same emerald bloom as the promo tiles, so the two assets read as one set. */
  .glow {
    position:absolute; left:-140px; top:50%;
    width:620px; height:620px; transform:translateY(-50%);
    background:radial-gradient(circle, ${EMERALD}26 0%, ${EMERALD}00 70%);
  }

  .left { position:relative; width:452px; flex:none; }
  .kicker {
    display:flex; align-items:center; gap:9px;
    font-family:"Plex", monospace; font-size:11.5px; font-weight:600;
    letter-spacing:.13em; text-transform:uppercase; color:${EMERALD};
    margin-bottom:22px;
  }
  .kicker .dot { width:7px; height:7px; border-radius:50%; background:${EMERALD}; }
  h1 {
    font-family:"Fraunces", Georgia, serif; font-weight:600;
    font-size:51px; line-height:1.08; letter-spacing:-1.1px; color:${PAPER};
  }
  h1 em { font-style:normal; color:${EMERALD}; }
  .lede {
    margin-top:22px; font-size:16.5px; line-height:1.58; color:${TEXT_DIM};
  }
  .points { margin-top:30px; display:flex; flex-direction:column; gap:15px; }
  .point { display:flex; gap:11px; align-items:flex-start; }
  .point svg { flex:none; margin-top:1px; }
  .point p { font-size:14px; line-height:1.55; color:${TEXT_DIM}; }
  .point b { color:${PAPER}; font-weight:600; }

  /* The panel. Sized and spaced like the real check card rather than a
     generic device frame — no fake browser chrome, no status bar. */
  .panel {
    position:relative; width:474px; flex:none;
    background:${INK_2}; border:1px solid rgba(255,255,255,.10);
    border-radius:16px; overflow:hidden;
  }
  .bar {
    display:flex; align-items:center; gap:8px;
    padding:13px 16px; border-bottom:1px solid rgba(255,255,255,.10);
  }
  .bar .dot { width:8px; height:8px; border-radius:50%; background:${EMERALD}; }
  .bar .name {
    font-family:"Fraunces", Georgia, serif; font-weight:600;
    font-size:15px; color:${PAPER};
  }
  .chip {
    margin-left:auto; font-family:"Plex", monospace; font-size:9px; font-weight:600;
    letter-spacing:.09em; text-transform:uppercase; color:${TEXT_DIM};
    border:1px solid rgba(255,255,255,.16); border-radius:6px; padding:3px 7px;
  }
  .body { padding:15px 16px 16px; }
  .flabel {
    font-family:"Plex", monospace; font-size:9px; font-weight:500;
    letter-spacing:.1em; text-transform:uppercase; color:${FAINT};
    display:block; margin-bottom:7px;
  }
  .input {
    background:${INK}; border:1px solid rgba(255,255,255,.13); border-radius:9px;
    padding:11px 12px; font-size:13px; color:${PAPER};
    font-family:"Plex", monospace; word-break:break-all; min-height:52px;
  }
  .row { display:flex; gap:10px; align-items:flex-end; margin-top:13px; }
  .row > div { flex:1; min-width:0; }
  .select {
    background:${INK}; border:1px solid rgba(255,255,255,.13); border-radius:9px;
    padding:10px 12px; font-size:13.5px; color:${PAPER};
    display:flex; align-items:center; justify-content:space-between;
  }
  .select svg { flex:none; opacity:.55; }
  .btn {
    flex:none; min-height:40px; padding:0 22px; border:0; border-radius:9px;
    background:${EMERALD}; color:#04150F; font-size:14px; font-weight:600;
    font-family:"Inter", sans-serif;
  }

  .verdict {
    margin-top:15px; border:1px solid ${SCAM}44; border-radius:12px;
    background:${SCAM}0F; overflow:hidden;
  }
  .vhead { padding:13px 15px 12px; }
  .vlabel {
    display:flex; align-items:center; gap:8px;
    font-size:14.5px; font-weight:600; color:${PAPER};
  }
  .vlabel .dot { width:8px; height:8px; border-radius:50%; background:${SCAM}; flex:none; }
  .vsub { margin-top:5px; font-size:12.5px; line-height:1.45; color:${TEXT_DIM}; }

  .sigs { border-top:1px solid rgba(255,255,255,.08); }
  .sig { padding:10px 15px; border-bottom:1px solid rgba(255,255,255,.06); }
  .sig-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
  .sig-src {
    font-family:"Plex", monospace; font-size:8.5px; font-weight:500;
    letter-spacing:.11em; text-transform:uppercase; color:${FAINT};
  }
  .sig-pts { font-family:"Plex", monospace; font-size:11.5px; font-weight:600; color:${CAUTION}; }
  .sig-text { font-size:12.5px; line-height:1.45; color:${TEXT_DIM}; }

  .score { padding:12px 15px 13px; }
  .score-top { display:flex; align-items:baseline; justify-content:space-between; }
  .score-lbl {
    font-family:"Plex", monospace; font-size:9px; font-weight:500;
    letter-spacing:.11em; text-transform:uppercase; color:${FAINT};
  }
  .score-val { font-family:"Plex", monospace; font-weight:600; color:${PAPER}; font-size:25px; }
  .score-val span { font-size:12px; color:${FAINT}; font-weight:500; }
  .track { margin-top:8px; height:5px; border-radius:3px; background:rgba(255,255,255,.09); overflow:hidden; }
  .fill { height:100%; border-radius:3px; background:${SCAM}; width:${result.score}%; }

  .report {
    margin:0 15px 12px; display:block; width:calc(100% - 30px);
    min-height:40px; border-radius:9px; background:transparent;
    border:1px solid rgba(255,255,255,.18); color:${PAPER};
    font-size:13.5px; font-weight:600; font-family:"Inter", sans-serif;
  }
  .note {
    padding:0 15px 14px; font-size:10.5px; line-height:1.5; color:${FAINT};
  }
  .foot {
    border-top:1px solid rgba(255,255,255,.10); padding:10px 15px;
    text-align:center; font-size:10.5px; color:${FAINT};
  }
</style></head>
<body>
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
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="${EMERALD}" stroke-width="1.5"/>
          <path d="m6 10.2 2.6 2.6L14 7.4" stroke="${EMERALD}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p><b>Nothing you paste leaves your machine.</b> The detection engine is
        built in — turn off your internet and it still works.</p>
      </div>
      <div class="point">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="${EMERALD}" stroke-width="1.5"/>
          <path d="m6 10.2 2.6 2.6L14 7.4" stroke="${EMERALD}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p><b>Every verdict shows its rules.</b> Each signal, what it contributed,
        and a score you can add up yourself.</p>
      </div>
      <div class="point">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
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
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
</body></html>`;

if (!existsSync(CHROME)) {
  console.error(
    `No Chrome at ${CHROME}\n` +
      "Set CHROME_PATH to a Chrome or Chromium binary.",
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const tmp = join(OUT_DIR, ".screenshot.html");
writeFileSync(tmp, html);

execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1280,800",
    `--screenshot=${join(OUT_DIR, "screenshot-verdict.png")}`,
    `file://${tmp}`,
  ],
  { stdio: "pipe" },
);

rmSync(tmp);

console.log(
  `✓ public/store/screenshot-verdict.png (1280×800) — ` +
    `${result.verdict} ${result.score}/100, ${result.signals.length} signals, from the engine`,
);
