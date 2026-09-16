// Popup controller: paste or arrive with a selection, get a verdict.
//
// Rendering is done with `textContent` and `createElement` throughout, never
// `innerHTML`. The content being rendered is a scam message the user pasted —
// it is hostile by assumption, and it reaches the DOM alongside engine signal
// text that quotes it. An `innerHTML` path here would be a script-injection
// sink fed by exactly the input most likely to carry one.

import { runCheck, type ExtensionCheck } from "./check";
import { VERDICT_COPY, SOURCE_LABEL, NOTICE } from "./copy";
import { REGION_OPTIONS, DEFAULT_REGION } from "@veriguard/engine/regions";
import { defangText } from "@veriguard/engine/urlSanitizer";
import { hasExtensionApi, storageGet, storageSet } from "./browser";
import { getBlocklist } from "./blocklist";

const REGION_KEY = "region";
/** Where the background script leaves text from a right-click check. */
const PENDING_KEY = "pendingSelection";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLTextAreaElement>("input");
const regionSel = $<HTMLSelectElement>("region");
const checkBtn = $<HTMLButtonElement>("check");
const out = $<HTMLElement>("out");

// ── Rendering ───────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderError(message: string) {
  out.replaceChildren(el("div", "err", message));
}

function renderVerdict(check: ExtensionCheck) {
  const copy = VERDICT_COPY[check.verdict];
  const card = el("div", "card");

  // Headline.
  const head = el("div", `verdict v-${check.verdict}`);
  head.append(el("span", "dot"));
  const headText = el("div");
  headText.append(el("h2", undefined, copy.label), el("p", undefined, copy.sub));
  head.append(headText);
  card.append(head);

  // Evidence. The clamp row is arithmetic about the total rather than an
  // observation, so it is shown but never counted as a finding.
  const signals = check.results.flatMap((r) => r.result.signals ?? []);
  if (signals.length) {
    const list = el("ul", "ev");
    for (const s of signals) {
      const li = el("li");
      const left = el("div");
      left.append(
        el("span", "src", SOURCE_LABEL[s.source] ?? s.source),
        // Defanged on the way out: signal text quotes the user's input, and a
        // live-looking URL in a verdict panel is the one place it must not be.
        el("span", undefined, defangText(s.text)),
      );
      const weight = s.points > 0 ? `+${s.points}` : s.points < 0 ? `${s.points}` : "—";
      const cls = s.points > 0 ? "up" : s.points < 0 ? "down" : "zero";
      li.append(left, el("span", `pts ${cls}`, weight));
      list.append(li);
    }
    card.append(list);
  }

  // Score.
  const score = el("div", "score");
  const top = el("div", "top");
  top.append(el("span", "label", "Risk score"));
  const n = el("span", "n");
  n.textContent = String(check.score);
  const denom = el("span");
  denom.textContent = "/100";
  denom.style.color = "var(--text-dim)";
  denom.style.fontSize = "13px";
  const figure = el("div");
  figure.append(n, denom);
  top.append(figure);
  const track = el("div", "track");
  const fill = el("div");
  fill.style.width = `${check.score}%`;
  fill.style.background =
    check.verdict === "likely_scam"
      ? "var(--scam)"
      : check.verdict === "suspicious"
        ? "var(--caution)"
        : check.verdict === "safe"
          ? "var(--clear)"
          : "var(--faint)";
  track.append(fill);
  score.append(top, track);
  card.append(score);

  // Notices — what this surface could not do. Always after the score, so the
  // reader has the number before the qualification on it.
  if (check.coverage && check.coverage !== "full") {
    const note = el("div", "notice");
    note.append(el("strong", undefined, "Limited coverage. "), document.createTextNode(NOTICE.coverage(check.coverage)));
    card.append(note);
  }
  if (check.unexpandedShortener) {
    const note = el("div", "notice");
    note.append(el("strong", undefined, "Link not followed. "), document.createTextNode(NOTICE.shortener));
    card.append(note);
  }
  // Only where it changes what the result is worth. On a verdict that already
  // found something, the missing list would not have altered the advice, and a
  // third caveat under a scam warning dilutes the warning itself.
  if (!check.blocklistConsulted && (check.verdict === "safe" || check.verdict === "unknown")) {
    const note = el("div", "notice");
    note.append(
      el("strong", undefined, "One check did not run. "),
      document.createTextNode(NOTICE.noBlocklist),
    );
    card.append(note);
  }

  out.replaceChildren(card);
}

// ── Behaviour ───────────────────────────────────────────────────────────────

let running = false;

async function check() {
  const content = input.value.trim();
  if (!content || running) return;

  running = true;
  checkBtn.disabled = true;
  try {
    const region = regionSel.value || undefined;
    if (hasExtensionApi()) await storageSet(REGION_KEY, region);
    // Returns whatever is cached without waiting on the network — a cold start
    // checks without the list rather than making the user wait for it.
    const blocklist = await getBlocklist(__API_BASE__);
    const result = await runCheck(content, region, blocklist);
    if (result) renderVerdict(result);
    else renderError("Nothing to check in that — paste a message, link or number.");
  } catch {
    // The engine is local, so a throw here is a defect rather than a network
    // failure. Say something true and unalarming rather than surfacing a stack.
    renderError("Something went wrong checking that. Try again.");
  } finally {
    running = false;
    checkBtn.disabled = false;
  }
}

function populateRegions(selected: string) {
  for (const { code, name } of REGION_OPTIONS) {
    const opt = el("option", undefined, name);
    opt.value = code;
    if (code === selected) opt.selected = true;
    regionSel.append(opt);
  }
}

async function init() {
  let region = DEFAULT_REGION as string;
  let pending: string | null = null;

  if (hasExtensionApi()) {
    // A stored region that the engine no longer knows would select nothing and
    // silently fall back, so it is validated against the live list rather than
    // trusted. Packs come and go; storage outlives them.
    const stored = await storageGet<string>(REGION_KEY);
    if (stored && REGION_OPTIONS.some((r) => r.code === stored)) region = stored;

    pending = await storageGet<string>(PENDING_KEY);
    // Cleared on read: the selection is a one-shot handoff, and leaving it in
    // storage means the next popup opens showing text the user did not paste.
    if (pending) await storageSet(PENDING_KEY, null);
  }

  populateRegions(region);

  if (pending) {
    input.value = pending;
    await check();
  } else {
    input.focus();
  }
}

checkBtn.addEventListener("click", () => void check());

// Ctrl/Cmd+Enter checks without reaching for the mouse. Plain Enter inserts a
// newline, because the field is a textarea holding a pasted multi-line message.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void check();
  }
});

void init();
