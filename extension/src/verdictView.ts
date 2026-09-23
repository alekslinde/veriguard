// Verdict rendering, shared by the popup and the onboarding page.
//
// Extracted rather than duplicated: both surfaces show the same card, and a
// second copy is how the onboarding page ends up quietly disagreeing with the
// popup about what a score means — which is the one thing a first-run page must
// not do, since it is where a user learns to read the panel.
//
// Rendering is done with `textContent` and `createElement` throughout, never
// `innerHTML`. The content being rendered is a scam message the user pasted —
// it is hostile by assumption, and it reaches the DOM alongside engine signal
// text that quotes it. An `innerHTML` path here would be a script-injection
// sink fed by exactly the input most likely to carry one. `extensionBundle`
// asserts no such sink reaches the built file.

import type { ExtensionCheck } from "./check";
import { VERDICT_COPY, SOURCE_LABEL, NOTICE, REPORT } from "./copy";
import { defangText } from "@veriguard/engine/urlSanitizer";
import { openTab } from "./browser";
import { isReportable, prefillFor, reportUrl } from "./report";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The colour a verdict's score bar is drawn in. */
function fillColor(verdict: ExtensionCheck["verdict"]): string {
  switch (verdict) {
    case "likely_scam":
      return "var(--scam)";
    case "suspicious":
      return "var(--caution)";
    case "safe":
      return "var(--clear)";
    default:
      return "var(--faint)";
  }
}

export function renderError(out: HTMLElement, message: string): void {
  out.replaceChildren(el("div", "err", message));
}

/**
 * Render a verdict card into `out`.
 *
 * `content` is the text that was checked, needed only to prefill a report.
 * `apiBase` is passed rather than read from the build-time constant so this
 * module stays free of the global and can be exercised directly.
 */
export function renderVerdict(
  out: HTMLElement,
  check: ExtensionCheck,
  content: string,
  apiBase: string,
): void {
  const copy = VERDICT_COPY[check.verdict];
  const card = el("div", "card");

  // Headline.
  const head = el("div", `verdict v-${check.verdict}`);
  head.append(el("span", "dot"));
  const headText = el("div");
  headText.append(el("h2", undefined, copy.label), el("p", undefined, copy.sub));
  head.append(headText);
  card.append(head);

  // Evidence, already pooled across identifiers with duplicates collapsed and
  // any clamp row last — see `evidenceFor`. Taken as composed rather than
  // re-derived here: these rows sum to `check.score`, and recomputing either
  // half separately is what breaks that.
  const signals = check.signals;
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
  fill.style.background = fillColor(check.verdict);
  track.append(fill);
  score.append(top, track);
  card.append(score);

  // Notices — what this surface could not do. Always after the score, so the
  // reader has the number before the qualification on it.
  if (check.coverage && check.coverage !== "full") {
    const note = el("div", "notice");
    note.append(
      el("strong", undefined, "Limited coverage. "),
      document.createTextNode(NOTICE.coverage(check.coverage)),
    );
    card.append(note);
  }
  if (check.unexpandedShortener) {
    const note = el("div", "notice");
    note.append(
      el("strong", undefined, "Link not followed. "),
      document.createTextNode(NOTICE.shortener),
    );
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

  // Report — last, after the verdict and everything qualifying it. The user
  // should know what was found, and what could not be, before being asked to
  // act on it.
  //
  // A button rather than a link: an <a href> would put the prefilled URL in the
  // DOM, where "copy link address" hands someone a URL with the scam
  // identifiers in it and no indication that it is about to become a public
  // report. The click builds it and goes.
  if (isReportable(check.verdict)) {
    const block = el("div", "report");
    const button = el("button", "report-go", REPORT.label);
    button.type = "button";
    button.addEventListener("click", () => {
      openTab(reportUrl(apiBase, prefillFor(check.results, content)));
    });
    block.append(button, el("p", "report-note", REPORT.note));
    card.append(block);
  }

  out.replaceChildren(card);
}
