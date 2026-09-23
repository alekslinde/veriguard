// The first-run page's one interactive piece.
//
// The page is mostly static text; this exists so the "try it" box produces a
// real verdict from the bundled engine rather than a screenshot of one. A
// picture of a result would teach the layout and not the substance, and the
// substance — that a verdict comes with its evidence and its gaps — is what
// this page is for.
//
// Reuses `verdictView`, so what a user learns to read here is exactly what the
// popup shows them later.

import { runCheck } from "./check";
import { REGION_OPTIONS, DEFAULT_REGION } from "@veriguard/engine/regions";
import { hasExtensionApi, storageGet } from "./browser";
import { getBlocklist } from "./blocklist";
import { renderVerdict, renderError, el } from "./verdictView";

const REGION_KEY = "region";

/**
 * The sample in the try-it box.
 *
 * A composite of patterns that are thoroughly public — the fake-delivery-fee
 * lure with a lookalike domain and an artificial deadline — rather than a real
 * captured message. It has to score, or the page teaches nothing on first
 * click; it must also be obviously a specimen, so nobody mistakes the page for
 * a report of something that happened to them.
 */
const SAMPLE =
  "AusPost: your parcel is held pending a $1.95 redelivery fee. " +
  "Confirm within 24 hours or it will be returned: http://auspost-redelivery.bond/pay";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLTextAreaElement>("ob-input");
const regionSel = $<HTMLSelectElement>("ob-region");
const checkBtn = $<HTMLButtonElement>("ob-check");
const out = $<HTMLElement>("ob-out");
const siteLink = $<HTMLAnchorElement>("ob-site");

let running = false;

async function check() {
  const content = input.value.trim();
  if (!content || running) return;

  running = true;
  checkBtn.disabled = true;
  try {
    const region = regionSel.value || undefined;
    // Not persisted from this page. The region select here exists so the sample
    // can be checked against a chosen pack; the popup is where a user makes the
    // choice they want remembered, and writing it from a page they may never
    // return to would override that silently.
    const blocklist = await getBlocklist(__API_BASE__);
    const result = await runCheck(content, region, blocklist);
    if (result) renderVerdict(out, result, content, __API_BASE__);
    else renderError(out, "Nothing to check in that — paste a message, link or number.");
  } catch {
    renderError(out, "Something went wrong checking that. Try again.");
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

  if (hasExtensionApi()) {
    try {
      const stored = await storageGet<string>(REGION_KEY);
      if (stored && REGION_OPTIONS.some((r) => r.code === stored)) region = stored;
    } catch {
      // Default holds.
    }
  }

  populateRegions(region);
  input.value = SAMPLE;

  // Built at runtime from the same constant the manifest's `connect-src` names,
  // so the page cannot link somewhere the extension is not allowed to reach.
  // The href is set rather than written into the HTML because the origin is a
  // build-time value.
  siteLink.href = __API_BASE__;
}

checkBtn.addEventListener("click", () => void check());

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void check();
  }
});

void init();
