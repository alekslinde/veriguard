// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Three signals fired on the SUBJECT of a message rather than on anything wrong
// with it, and together they scored every genuine AU sender template as
// suspicious or worse. Found by eval/corpus/au-benign-senders.jsonl, which is
// sourced from what the impersonated organisations publish about their own mail.
//
// AU FPR was 41.4% before these; it is 3.4% after, with recall unchanged.

const sms = (t: string) => checkSms(t, undefined, "AU");

describe("naming an agency is not, alone, evidence", () => {
  it.each([
    ["AusPost: your parcel is on board for delivery today. No action needed."],
    ["AusPost: your parcel has been delivered. Track your deliveries in the AusPost app."],
    ["You have a new message in your myGov Inbox. Sign in to myGov to read it."],
    ["The ATO has sent you a message. Sign in to myGov to read it. We will never send you a link to log on."],
    ["Medicare: your claim has been processed. Your benefit will be paid to your nominated bank account within 3 business days."],
    ["Linkt: your account balance is low. Top up in the Linkt app or at a service centre."],
  ])("leaves a genuine sender notification alone: %s", (text) => {
    expect(sms(text).verdict).toBe("safe");
  });

  it("still says what it noticed, rather than going silent", () => {
    // Dropping the row entirely would read as "nothing here", which is not the
    // conclusion — the agency name WAS seen and judged unremarkable.
    const r = sms("You have a new message in your myGov Inbox. Sign in to myGov to read it.");
    expect((r.flags ?? []).join(" ")).toMatch(/names a government agency/i);
  });

  it("scores the mention once something corroborates it", () => {
    // A link, a callback number, urgency or an ask is what separates the scam.
    const withLink = sms("myGov: your account is suspended. Restore access at https://mygov-restore.tk/verify");
    expect(withLink.verdict).toBe("likely_scam");
    expect((withLink.flags ?? []).join(" ")).toMatch(/claims to be from a government agency/i);
  });
});

describe("naming a service is not asking for anything", () => {
  it("does not claim an ask that is not in the text", () => {
    const r = sms("You have a new message in your myGov Inbox. Sign in to myGov to read it.");
    expect((r.flags ?? []).join(" ")).not.toMatch(/asks for sensitive info/i);
  });

  it("still fires, and still reaches likely_scam, on a real ask", () => {
    // The service name is not dropped — paired with a genuine ask it is the
    // scam's whole shape, so it still adds weight.
    const r = sms("ATO: confirm your myGovID and tax file number to release your refund");
    expect(r.verdict).toBe("likely_scam");
    expect((r.flags ?? []).join(" ")).toMatch(/asks for sensitive info/i);
  });
});

describe("'claim' as a noun is not prize language", () => {
  it.each([
    "Medicare: your claim has been processed. Your benefit will be paid within 3 business days.",
    "Your claim was approved. The payment is on its way.",
    "The claim has been assessed and no further action is needed.",
  ])("does not read an insurance or Medicare claim as a prize: %s", (text) => {
    expect((sms(text).flags ?? []).join(" ")).not.toMatch(/prize\/reward language/i);
  });

  it.each([
    "Congratulations! Claim your $1000 prize now at http://free-money.tk/win",
    "You have been selected. Claim your reward before it expires.",
  ])("still reads the verb sense as prize language: %s", (text) => {
    expect((sms(text).flags ?? []).join(" ")).toMatch(/prize\/reward language/i);
  });
});

describe("the same protections apply outside AU", () => {
  // The topic-signal fixes were AU-shaped, and every other pack had one benign
  // corpus case — an FPR of "[0-79]" from a single observation. Postal
  // operators turned out to sit in BOTH authorityMentions and brandMentions in
  // GB, US, NZ and IE (AU is the only pack where they do not overlap), so one
  // mention scored twice and each half corroborated the other.

  it.each([
    ["GB", "Royal Mail: your parcel is ready for collection at your local delivery office. Bring ID and your reference number."],
    ["GB", "HMRC has sent you a message. Sign in to your personal tax account to read it."],
    ["GB", "DVLA: your vehicle tax is due this month. Renew in the DVLA app or at a Post Office."],
    ["US", "USPS: your package is out for delivery today. No action needed."],
    ["US", "Social Security: your benefit statement is ready in your my Social Security account."],
    ["NZ", "NZ Post: your parcel is ready for collection at your local depot."],
    ["NZ", "Inland Revenue has sent you a message. Sign in to myIR to read it."],
    ["IE", "An Post: your parcel is on board for delivery today. No action needed."],
  ])("%s: leaves a genuine sender notification alone", (region, text) => {
    expect(checkSms(text, undefined, region as never).verdict).toBe("safe");
  });

  it.each([
    ["GB", "Royal Mail: your parcel is held, pay the £2.99 fee at https://royalmail-redelivery.tk/pay"],
    ["US", "USPS: your package is held. Update your address at http://usps-redeliver.cyou/fix"],
    ["NZ", "NZ Post: delivery failed. Pay the redelivery fee at https://nzpost-redeliver.tk/pay"],
  ])("%s: still catches the impersonation of that sender", (region, text) => {
    expect(checkSms(text, undefined, region as never).verdict).toBe("likely_scam");
  });

  it("derives service names from the pack rather than a hardcoded list", () => {
    // "social security" is a US service name the AU-only constant missed. The
    // rule is now "listed in both requestWords and authorityMentions", which
    // the packs already encode, so a new region gets it for free.
    const ssa = checkSms("Social Security: your benefit statement is ready.", undefined, "US" as never);
    expect((ssa.flags ?? []).join(" ")).not.toMatch(/asks for sensitive info/i);

    const lure = checkSms(
      "IRS: confirm your social security number and bank details at http://irs-refund.tk/verify",
      undefined,
      "US" as never,
    );
    expect(lure.verdict).toBe("likely_scam");
  });

  it.each([
    ["US", "USPS: your package is out for delivery today. Track it at tools.usps.com"],
    ["GB", "Royal Mail: your parcel is on its way. Track it at www.royalmail.com"],
    ["NZ", "NZ Post: your parcel is ready for collection. Details at www.nzpost.co.nz."],
    ["IE", "An Post: your parcel is on board for delivery. Details at www.anpost.ie."],
  ])("%s: leaves a sender citing its own domain alone", (region, text) => {
    // The exemption for a brand's own domain rejected any subdomain, so
    // "tools.usps.com" read as a squat — and that false hit then corroborated
    // the deferred agency row, reinstating the exact double-score the split
    // exists to remove. A carrier linking its own tracking page is the common
    // shape; the link-free corpus could not see it.
    expect(checkSms(text, undefined, region as never).verdict).toBe("safe");
  });

  it.each([
    ["US", "USPS: package held. Update at http://usps.com.evil.tk/fix"],
    ["GB", "Royal Mail: pay the fee at https://royalmail.com.secure-pay.tk/fee"],
    ["NZ", "NZ Post: pay the redelivery fee at http://nzpost.co.nz.evil.tk/fix"],
  ])("%s: still catches the real domain used as a prefix of the attacker's", (region, text) => {
    // The shape a naive "allow a preceding dot" fix would have whitelisted.
    expect(checkSms(text, undefined, region as never).verdict).toBe("likely_scam");
  });

  it("scores a brand glued into a hostname even with nothing else", () => {
    // Deferring the brand row wholesale dropped "Verify at amazonsupport.tk
    // now" to 0. A brand in prose is what genuine mail contains; a brand glued
    // into a hostname is not.
    expect(checkSms("Verify at amazonsupport.tk now", undefined, "AU").score).toBeGreaterThan(0);
  });
});

describe("phrase lists match through whitespace variation", () => {
  it("scores the myID re-registration lure the same however it is spaced", () => {
    // These matchers used a raw includes(), bypassing mentions() and its
    // whitespace handling — the same defect fixed there, in a rule that did not
    // use the fixed function.
    const single = "Your digital identity verification has expired. Re-verify now to keep your myGov access.";
    const doubled = single.replace(/ /g, "  ");
    expect(sms(single).verdict).toBe("likely_scam");
    expect(sms(doubled).verdict).toBe(sms(single).verdict);
    expect(sms(doubled).score).toBe(sms(single).score);
  });
});
