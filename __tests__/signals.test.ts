// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom } from "@veriguard/detect/scamDetector";
import type { CheckResult } from "@veriguard/detect/engineTypes";

// Signals exist so a verdict can explain itself: every reason carries the
// weight it contributed. The invariant that makes the evidence trustworthy is
// that the rows add up to the headline score — if they ever disagree, the UI is
// showing arithmetic the reader can check and find wrong.

const cases: Array<[string, () => CheckResult]> = [
  ["scam url",        () => checkUrl("http://auspost-redelivery.tk/verify")],
  ["legit url",       () => checkUrl("https://www.australiapost.com.au")],
  ["shortener",       () => checkUrl("http://bit.ly/xyz")],
  ["ip url",          () => checkUrl("http://192.168.10.4/login")],
  ["scam sms",        () => checkSms("AusPost: parcel held pending a $2.15 fee. Pay within 24 hours or it's returned: http://auspost-r.tk")],
  ["benign sms",      () => checkSms("Hey, are we still on for lunch tomorrow?")],
  ["scam email",      () => checkEmail("From: no-reply@ato-refund.tk\nSubject: Refund\n\nVerify your TFN to claim your refund now.")],
  ["mobile phone",    () => checkPhone("0412345678")],
  ["premium phone",   () => checkPhone("1900654321")],
  ["custom text",     () => checkCustom("Check this out: http://bit.ly/scam — looks legit right?")],
  ["custom benign",   () => checkCustom("Just a normal note about the weather.")],
];

describe("signals", () => {
  it.each(cases)("%s: signal points sum to the score", (_name, run) => {
    const r = run();
    if (!r.signals?.length) {
      // No evidence means nothing to explain, which is only honest at zero.
      expect(r.score).toBe(0);
      return;
    }
    const sum = r.signals.reduce((n, s) => n + s.points, 0);
    expect(sum).toBe(r.score);
  });

  it.each(cases)("%s: flags and signals stay in step", (_name, run) => {
    const r = run();
    // flags is derived from signals, so a consumer reading either sees the same
    // reasons in the same order.
    expect(r.flags).toEqual((r.signals ?? []).map((s) => s.text));
  });

  it("records the clamp as its own row when the raw total overshoots", () => {
    const r = checkSms(
      "URGENT: your myGov account is suspended. Verify your TFN and bank details immediately at http://mygov-verify.tk or your refund is cancelled within 24 hours.",
    );
    expect(r.score).toBe(100);
    const clamp = r.signals?.find((s) => s.source === "score");
    expect(clamp).toBeDefined();
    // The row is negative and closes exactly the gap the ceiling opened.
    expect(clamp!.points).toBeLessThan(0);
    expect(r.signals!.reduce((n, s) => n + s.points, 0)).toBe(100);
  });

  it("leaves no clamp row when nothing was capped", () => {
    const r = checkSms("Hey, are we still on for lunch tomorrow?");
    expect(r.signals?.some((s) => s.source === "score") ?? false).toBe(false);
  });

  it("labels every signal with the surface it came from", () => {
    const r = checkUrl("http://auspost-redelivery.tk/verify");
    for (const s of r.signals ?? []) {
      expect(["link", "message", "sender", "phone", "attachment", "score"]).toContain(s.source);
    }
  });
});
