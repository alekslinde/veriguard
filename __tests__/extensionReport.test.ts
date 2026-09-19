// The extension's report hand-off.
//
// The feature is a link, and that is the whole design. Submitting from the
// extension would mean a second network call carrying the user's pasted
// content — the one thing this surface promises not to do — so the report is
// handed to the site's form instead, prefilled, for the user to review and
// send from a page they are looking at.
//
// What these tests protect is that boundary: what travels in the link, what
// deliberately does not, and that the link is built with the same contract the
// form parses.

import { describe, it, expect } from "vitest";
import { isReportable, prefillFor, reportUrl } from "../extension/src/report";
import { parseReportPrefill } from "../lib/reportPrefill";
import { analyzeContent } from "@veriguard/engine/scamDetector";

const API = "https://veriguard.app";

const SCAM_SMS =
  "URGENT: your myGov account is suspended. Verify now at http://mygov-secure.tk/login";

describe("isReportable", () => {
  it("offers a report only where the check found something", () => {
    // A "report this" call to action under a result we just called clean reads
    // as us not believing our own verdict, and invites reports of things the
    // engine judged safe.
    expect(isReportable("likely_scam")).toBe(true);
    expect(isReportable("suspicious")).toBe(true);
    expect(isReportable("safe")).toBe(false);
    expect(isReportable("unknown")).toBe(false);
  });
});

describe("prefillFor", () => {
  it("carries the identifiers the check found", async () => {
    const results = await analyzeContent(SCAM_SMS, undefined, "AU");
    const prefill = prefillFor(results, SCAM_SMS);
    expect(prefill.scamUrl).toContain("mygov-secure.tk");
  });

  it("never carries the pasted message", async () => {
    // The message is the field most likely to hold the user's OWN details —
    // their name, their address, why the scammer had their number. It belongs
    // in a box they can see and edit, not in a query string assembled behind
    // them. The form leaves it empty on purpose.
    const personal =
      "Hi, this is Jane Doe on 0412 999 888 — my account 12345678 got this: http://scam-bank.tk/login";
    const results = await analyzeContent(personal, undefined, "AU");
    const prefill = prefillFor(results, personal);

    const carried = JSON.stringify(prefill);
    expect(carried).not.toContain("Jane Doe");
    expect(carried).not.toContain("12345678");
    // The scam link is the accusation and does travel.
    expect(prefill.scamUrl).toContain("scam-bank.tk");
  });

  it("classifies the report type with the engine's own answer", async () => {
    // Not the identifier's kind: an SMS carrying a link is an "sms" report that
    // also names a scamUrl. Using detectType keeps the extension and the site's
    // form classifying the same paste the same way.
    const results = await analyzeContent(SCAM_SMS, undefined, "AU");
    expect(prefillFor(results, SCAM_SMS).type).toBe("sms");

    const bare = "http://mygov-secure.tk/login";
    const urlResults = await analyzeContent(bare, undefined, "AU");
    expect(prefillFor(urlResults, bare).type).toBe("url");
  });

  it("takes one identifier of each kind", async () => {
    // The report form accuses a single identifier. Sending several of one kind
    // would mean choosing for the user without showing them the choice.
    const many = "Pay at http://one.tk/a or http://two.tk/b, or call 0400 000 000";
    const results = await analyzeContent(many, undefined, "AU");
    const prefill = prefillFor(results, many);

    expect(prefill.scamUrl).toBeDefined();
    expect(prefill.scamUrl).not.toContain(" ");
    // First occurrence wins, so the answer is stable rather than incidental.
    const urls = results.filter((r) => r.kind === "url");
    if (urls.length > 1) expect(prefill.scamUrl).toBe(urls[0].value);
  });
});

describe("reportUrl", () => {
  it("builds a link the report form can read back", async () => {
    // The round trip is the point: this is built with buildReportQuery and the
    // page parses it with parseReportPrefill, so a parameter rename cannot
    // break one side silently. A second copy of the contract here is the defect
    // shape that would.
    const results = await analyzeContent(SCAM_SMS, undefined, "AU");
    const prefill = prefillFor(results, SCAM_SMS);
    const url = new URL(reportUrl(API, prefill));

    expect(url.pathname).toBe("/report");
    const parsed = parseReportPrefill(url.searchParams);
    expect(parsed.type).toBe(prefill.type);
    expect(parsed.scamUrl).toBe(prefill.scamUrl);
  });

  it("stays on the configured origin", () => {
    // The link cannot point somewhere the manifest has not already named.
    const url = new URL(reportUrl(API, { type: "url", scamUrl: "http://evil.tk" }));
    expect(url.origin).toBe(API);
  });

  it("degrades to the bare form when there is nothing to carry", () => {
    expect(reportUrl(API, {})).toBe(`${API}/report`);
  });

  it("encodes an identifier rather than letting it alter the query", () => {
    // The identifier is attacker-chosen text. It reaches a URL here, so a
    // crafted value must not be able to add or overwrite a parameter.
    const url = new URL(reportUrl(API, { scamUrl: "http://evil.tk/?a=1&type=phone#x" }));
    expect(url.searchParams.get("type")).toBeNull();
    expect(url.searchParams.get("scamUrl")).toBe("http://evil.tk/?a=1&type=phone#x");
  });
});
