// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  extractPixelUrls,
  analysePixelUrl,
  analyseTrackingPixels,
} from "@/lib/trackingPixel";

// ─── extractPixelUrls ────────────────────────────────────────────────────────

describe("extractPixelUrls", () => {
  it("detects a 1×1 img tag by width/height attributes", () => {
    const html = `<img src="https://trk.evil.com/pixel/abc123" width="1" height="1">`;
    expect(extractPixelUrls(html)).toContain("https://trk.evil.com/pixel/abc123");
  });

  it("detects a 0×0 img (width=0)", () => {
    const html = `<img width="0" height="0" src="https://trk.evil.com/beacon/xyz">`;
    expect(extractPixelUrls(html)).toContain("https://trk.evil.com/beacon/xyz");
  });

  it("detects a pixel via inline style (width:1px)", () => {
    const html = `<img style="width:1px;height:1px" src="https://em.sendgrid.net/wf/open?upn=token">`;
    expect(extractPixelUrls(html)).toContain("https://em.sendgrid.net/wf/open?upn=token");
  });

  it("detects a known ESP domain even without 1×1 dimensions", () => {
    const html = `<img src="https://list-manage.com/track/open?u=abc&id=def&e=ghi">`;
    expect(extractPixelUrls(html)).toContain("https://list-manage.com/track/open?u=abc&id=def&e=ghi");
  });

  it("detects tracking URLs outside img tags", () => {
    const body = `background: url(https://trk.klaviyo.com/trk/abc); color: red;`;
    expect(extractPixelUrls(body)).toContain("https://trk.klaviyo.com/trk/abc");
  });

  it("ignores normal images with no tracking signals", () => {
    const html = `<img src="https://example.com/logo.png" width="200" height="50">`;
    expect(extractPixelUrls(html)).toHaveLength(0);
  });

  it("de-duplicates identical URLs", () => {
    const html = [
      `<img src="https://trk.evil.com/pixel/a" width="1" height="1">`,
      `<img src="https://trk.evil.com/pixel/a" width="1" height="1">`,
    ].join("\n");
    expect(extractPixelUrls(html).filter((u) => u === "https://trk.evil.com/pixel/a")).toHaveLength(1);
  });

  it("handles single-quoted src attributes", () => {
    const html = `<img src='https://createsend.com/t/r-open/abc' width='1' height='1'>`;
    expect(extractPixelUrls(html)).toContain("https://createsend.com/t/r-open/abc");
  });

  it("matches /track/open path pattern", () => {
    const html = `<img src="https://unknown-domain.com/track/open/XYZ" width="1">`;
    expect(extractPixelUrls(html)).toContain("https://unknown-domain.com/track/open/XYZ");
  });
});

// ─── analysePixelUrl ─────────────────────────────────────────────────────────

describe("analysePixelUrl", () => {
  it("identifies Mailchimp from list-manage.com", () => {
    const r = analysePixelUrl("https://list-manage.com/track/open?u=abc&id=def&e=ghi");
    expect(r.esp).toBe("Mailchimp");
  });

  it("identifies SendGrid from sendgrid.net domain", () => {
    const r = analysePixelUrl("https://em.sendgrid.net/wf/open?upn=sometoken");
    expect(r.esp).toBe("SendGrid");
  });

  it("identifies Klaviyo", () => {
    const r = analysePixelUrl("https://trk.klaviyo.com/trk/abc123");
    expect(r.esp).toBe("Klaviyo");
  });

  it("identifies Campaign Monitor from createsend.com", () => {
    const r = analysePixelUrl("https://createsend.com/t/r-open/abc");
    expect(r.esp).toBe("Campaign Monitor");
  });

  it("returns 'unknown' for an unrecognised domain", () => {
    const r = analysePixelUrl("https://pixel.scammer-domain.tk/track/open/abc");
    expect(r.esp).toBe("unknown");
  });

  it("extracts domain correctly", () => {
    const r = analysePixelUrl("https://trk.klaviyo.com/trk/abc");
    expect(r.domain).toBe("trk.klaviyo.com");
  });

  it("decodes a base64url-encoded recipient email from URL path", () => {
    // base64url("victim@example.com") = "dmljdGltQGV4YW1wbGUuY29t"
    const encoded = btoa("victim@example.com").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const r = analysePixelUrl(`https://trk.evil.com/o/${encoded}`);
    expect(r.embeddedEmails).toContain("victim@example.com");
  });

  it("extracts an email address that appears verbatim in the URL query string", () => {
    const r = analysePixelUrl("https://list-manage.com/track/open?e=victim%40example.com");
    expect(r.embeddedEmails).toContain("victim@example.com");
  });

  it("sets isLikelyTracking true for a known tracking path", () => {
    const r = analysePixelUrl("https://someunknown.com/pixel/abc");
    expect(r.isLikelyTracking).toBe(true);
  });

  it("includes a note about the ESP's platform when identified", () => {
    const r = analysePixelUrl("https://list-manage.com/track/open?u=a&id=b&e=c");
    expect(r.notes.join(" ")).toMatch(/mailchimp/i);
  });

  it("includes a note about the embedded recipient when found", () => {
    const encoded = btoa("target@domain.com").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const r = analysePixelUrl(`https://trk.evil.com/o/${encoded}`);
    expect(r.notes.join(" ")).toMatch(/recipient address encoded/i);
  });

  it("resolves the official abuse-report URL for a known ESP", () => {
    const r = analysePixelUrl("https://list-manage.com/track/open?u=a&id=b&e=c");
    expect(r.espReport).toEqual({ esp: "Mailchimp", href: "https://mailchimp.com/contact/abuse/", kind: "url" });
  });

  it("falls back to mailto:abuse@<registrable-domain> for an ESP with no curated form", () => {
    // Campaign Monitor has no `report` URL on file — abuse@ its sending domain,
    // collapsed to the registrable domain (not the per-campaign subdomain).
    const r = analysePixelUrl("https://t.cmail19.com/t/r-open/abc");
    expect(r.espReport).toEqual({ esp: "Campaign Monitor", href: "mailto:abuse@cmail19.com", kind: "mailto" });
  });

  it("returns null espReport for an unrecognised platform", () => {
    const r = analysePixelUrl("https://pixel.scammer-domain.tk/track/open/abc");
    expect(r.espReport).toBeNull();
  });
});

// ─── analyseTrackingPixels ───────────────────────────────────────────────────

describe("analyseTrackingPixels", () => {
  const rawEmail = [
    'From: "myGov" <scammer@evil.tk>',
    "Subject: Account suspended",
    "Content-Type: text/html",
    "",
    '<html><body>',
    '<p>Your account is suspended. Click <a href="https://phish.tk/login">here</a>.</p>',
    '<img src="https://list-manage.com/track/open?u=abc&id=xyz&e=dmljdGltQGdtYWlsLmNvbQ==" width="1" height="1">',
    '</body></html>',
  ].join("\n");

  it("detects tracking pixels in a realistic email", () => {
    const r = analyseTrackingPixels(rawEmail);
    expect(r.hasTrackingPixels).toBe(true);
    expect(r.pixels).toHaveLength(1);
  });

  it("identifies the ESP used", () => {
    const r = analyseTrackingPixels(rawEmail);
    expect(r.espsUsed).toContain("Mailchimp");
  });

  it("extracts a recipient email encoded in the pixel query param", () => {
    // e= param holds base64("victim@gmail.com")
    const r = analyseTrackingPixels(rawEmail);
    expect(r.embeddedRecipients).toContain("victim@gmail.com");
  });

  it("returns hasTrackingPixels false and empty summary for clean email", () => {
    const clean = [
      "From: legit@bank.com",
      "",
      '<img src="https://bank.com/logo.png" width="200" height="50">',
    ].join("\n");
    const r = analyseTrackingPixels(clean);
    expect(r.hasTrackingPixels).toBe(false);
    expect(r.summary).toBe("");
  });

  it("summary mentions the pixel count and ESP", () => {
    const r = analyseTrackingPixels(rawEmail);
    expect(r.summary).toMatch(/1 tracking pixel/i);
    expect(r.summary).toMatch(/mailchimp/i);
  });

  it("summary mentions the encoded recipient", () => {
    const r = analyseTrackingPixels(rawEmail);
    expect(r.summary).toMatch(/victim@gmail\.com/);
  });

  it("handles multiple tracking pixels and de-dupes ESPs", () => {
    const multi = [
      "From: a@b.com",
      "",
      '<img src="https://list-manage.com/track/open?u=1" width="1" height="1">',
      '<img src="https://em.sendgrid.net/wf/open?upn=2" width="1" height="1">',
      '<img src="https://list-manage.com/track/open?u=3" width="1" height="1">',
    ].join("\n");
    const r = analyseTrackingPixels(multi);
    expect(r.pixels).toHaveLength(3);
    // Both ESPs present, each listed once
    expect(r.espsUsed).toContain("Mailchimp");
    expect(r.espsUsed).toContain("SendGrid");
    expect(r.summary).toMatch(/3 tracking pixels/i);
    // One abuse-report target per platform, de-duped across the two Mailchimp pixels.
    expect(r.espReports).toHaveLength(2);
    expect(r.espReports.map((x) => x.esp).sort()).toEqual(["Mailchimp", "SendGrid"]);
  });
});
