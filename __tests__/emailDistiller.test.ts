// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { distillEmailContent } from "@/lib/emailDistiller";

// A trimmed-but-representative Outlook/Exchange phish: the same transport-header
// storm, MIME boundaries, quoted-printable text part and duplicate HTML part a
// real forwarded scam carries. The distiller should reduce this to a handful of
// meaningful headers plus the readable body.
const EXCHANGE_PHISH = [
  "ARC-Seal: i=2; a=rsa-sha256; t=1781587377; cv=pass; d=google.com; s=arc-20240605; b=Wam",
  "ARC-Message-Signature: i=2; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20240605;",
  "Authentication-Results: mx.google.com; dkim=pass header.i=@vinicosmetics.com",
  "Return-Path: <it_head@vinicosmetics.com>",
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=vinicosmetics.com; s=selector2;",
  "From: Centrelink <it_head@vinicosmetics.com>",
  "Subject: Your Centrelink inquiry has been processed",
  "Thread-Topic: Your Centrelink inquiry has been processed",
  "Date: Tue, 16 Jun 2026 03:48:49 +0000",
  "Message-ID: <PN2P287MB0926@PN2P287MB0926.INDP287.PROD.OUTLOOK.COM>",
  "x-ms-office365-filtering-correlation-id: 765b17a5-e4ea-4416-c373-08decb5a2d0e",
  "x-forefront-antispam-report: CIP:255.255.255.255;CTRY:;LANG:en;SCL:1;",
  'Content-Type: multipart/alternative; boundary="_000_PN2P287MB0926_"',
  "MIME-Version: 1.0",
  "X-OriginatorOrg: vinicosmetics.com",
  "",
  "--_000_PN2P287MB0926_",
  'Content-Type: text/plain; charset="us-ascii"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hello,",
  "",
  "Your Centrelink inquiry has been successfully processed. Please log in to y=",
  "our account to review any updates or further actions required.",
  "",
  "click here<https://fpdjfuicrqmmjhwtkpep.supabase.co/functions/v1/redirect-h=",
  "andler?id=3Dxrce9sbf> to review",
  "",
  "Regards,",
  "",
  "Centrelink Support",
  "--_000_PN2P287MB0926_",
  'Content-Type: text/html; charset="us-ascii"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<html><head><style>p {color:red}</style></head><body>",
  '<p>Hello,</p><p><a href=3D"https://evil.example/x">click here</a> to review</p>',
  "</body></html>",
  "--_000_PN2P287MB0926_--",
].join("\n");

describe("distillEmailContent", () => {
  it("keeps the meaningful headers and drops the transport/auth storm", () => {
    const out = distillEmailContent(EXCHANGE_PHISH);
    expect(out).toContain("From: Centrelink <it_head@vinicosmetics.com>");
    expect(out).toContain("Subject: Your Centrelink inquiry has been processed");
    expect(out).toContain("Date: Tue, 16 Jun 2026 03:48:49 +0000");
    // None of the noise survives.
    expect(out).not.toMatch(/ARC-Seal/i);
    expect(out).not.toMatch(/DKIM-Signature/i);
    expect(out).not.toMatch(/x-ms-office365/i);
    expect(out).not.toMatch(/x-forefront/i);
    expect(out).not.toMatch(/Thread-Topic/i);
    expect(out).not.toMatch(/Message-ID/i);
  });

  it("prefers the plain-text part, decoded from quoted-printable", () => {
    const out = distillEmailContent(EXCHANGE_PHISH);
    expect(out).toContain("Your Centrelink inquiry has been successfully processed.");
    expect(out).toContain("Centrelink Support");
    // Soft line breaks ("=" wrap) are healed — no "=" artifacts, no mid-word split.
    expect(out).toContain("log in to your account");
    expect(out).not.toContain("=\n");
  });

  it("drops MIME boundaries and the duplicate HTML part", () => {
    const out = distillEmailContent(EXCHANGE_PHISH);
    expect(out).not.toContain("_000_PN2P287MB0926_");
    expect(out).not.toMatch(/Content-Transfer-Encoding/i);
    expect(out).not.toMatch(/<html>|<style>|<p>/i);
  });

  it("does not store the live scam link inline (it's captured separately)", () => {
    const out = distillEmailContent(EXCHANGE_PHISH);
    expect(out).not.toContain("supabase.co");
    expect(out).not.toContain("evil.example");
  });

  it("falls back to the html part rendered as text when no plain part exists", () => {
    const htmlOnly = [
      "From: Scammer <a@evil.tk>",
      "Subject: Verify now",
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<html><head><style>x{}</style></head><body>",
      "<p>Hello,</p><p>Please <a href=3D\"https://evil.tk/go\">verify</a> now.</p>",
      "</body></html>",
    ].join("\n");
    const out = distillEmailContent(htmlOnly);
    expect(out).toContain("From: Scammer <a@evil.tk>");
    expect(out).toContain("Hello,");
    expect(out).toContain("verify [scam link removed] now.");
    expect(out).not.toContain("evil.tk/go");
    expect(out).not.toMatch(/<style>|<p>/);
  });

  it("unwraps a forwarded original before distilling", () => {
    const forwarded = [
      "From: Victim <me@gmail.com>",
      "Subject: Fwd: Verify now",
      "Delivered-To: me@gmail.com",
      "",
      "FYI this looks dodgy",
      "",
      "---------- Forwarded message ---------",
      "From: Bank <fraud@evil.tk>",
      "Subject: Verify now",
      "",
      "Please verify your account immediately.",
    ].join("\n");
    const out = distillEmailContent(forwarded);
    expect(out).toContain("From: Bank <fraud@evil.tk>");
    expect(out).toContain("Please verify your account immediately.");
    expect(out).not.toContain("me@gmail.com");
    expect(out).not.toContain("Delivered-To");
  });

  it("handles a bare body with no headers without losing content", () => {
    const out = distillEmailContent("Just some pasted scam text, no headers here.");
    expect(out).toContain("Just some pasted scam text");
  });

  it("decodes base64 text parts", () => {
    const b64 = [
      "From: x@evil.tk",
      "Subject: hi",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("Pay the invoice now please.").toString("base64"),
    ].join("\n");
    const out = distillEmailContent(b64);
    expect(out).toContain("Pay the invoice now please.");
  });
});
