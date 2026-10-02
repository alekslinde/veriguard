// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { analyseEmailTracking, TrackingKind } from "@/lib/emailTracking";
import { MOCK_EMAILS_WITH_PIXELS } from "@/lib/fixtures/mockTrackingPixels";

// Helper: assert a given tracking kind was (or wasn't) detected.
function kinds(raw: string): TrackingKind[] {
  return analyseEmailTracking(raw).findings.map((f) => f.kind);
}

describe("analyseEmailTracking", () => {
  it("finds nothing in a plain-text email", () => {
    const r = analyseEmailTracking("From: a@b.com\nSubject: hi\n\nJust some text, no HTML.");
    expect(r.hasTracking).toBe(false);
    expect(r.findings).toHaveLength(0);
    expect(r.summary).toBe("");
  });

  it("detects a tracking pixel (delegated to the pixel analyser)", () => {
    const raw = 'From: a@b.com\n\n<img src="https://trk.example.com/pixel/abc" width="1" height="1">';
    expect(kinds(raw)).toContain("pixel");
    expect(analyseEmailTracking(raw).pixelReport.hasTrackingPixels).toBe(true);
  });

  it("detects click-tracking redirect links", () => {
    const raw = 'From: a@b.com\n\n<a href="https://click.sendgrid.net/ls/click?u=xyz">Click</a>';
    expect(kinds(raw)).toContain("click-redirect");
  });

  it("does not flag benign links whose path merely contains 'click' or 'tracking'", () => {
    const raw = [
      "From: a@b.com",
      "",
      '<a href="https://www.example.com/help/click.html">Help</a>',
      '<a href="https://example.com/blog/tracking.js">Article</a>',
      '<a href="https://docs.example.com/x">Docs</a>',
    ].join("\n");
    expect(kinds(raw)).not.toContain("click-redirect");
  });

  it("detects unique-per-recipient links by a recurring opaque token", () => {
    const tok = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"; // 32 hex chars
    const raw = `From: a@b.com\n\n<a href="https://shop.example/p?id=${tok}">A</a><a href="https://shop.example/q?id=${tok}">B</a>`;
    expect(kinds(raw)).toContain("unique-url");
  });

  it("does not flag a single non-recurring token as a unique-recipient link", () => {
    const tok = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
    const raw = `From: a@b.com\n\n<a href="https://shop.example/p?id=${tok}">only once</a>`;
    expect(kinds(raw)).not.toContain("unique-url");
  });

  it("detects CSS tracking via background-image and @import", () => {
    const bg = 'From: a@b.com\n\n<div style="background-image: url(https://t.example/b.png)"></div>';
    const imp = "From: a@b.com\n\n<style>@import url(https://t.example/s.css);</style>";
    expect(kinds(bg)).toContain("css-resource");
    expect(kinds(imp)).toContain("css-resource");
  });

  it("detects read-receipt request headers", () => {
    const raw = "From: a@b.com\nDisposition-Notification-To: spy@evil.tk\nSubject: hi\n\nbody";
    expect(kinds(raw)).toContain("read-receipt");
  });

  it("detects external stylesheet / preload links", () => {
    const raw = 'From: a@b.com\n\n<link rel="preload" href="https://fonts.evil.tk/f.woff2">';
    expect(kinds(raw)).toContain("external-resource");
  });

  it("detects auto-loading audio/video", () => {
    const raw = 'From: a@b.com\n\n<video src="https://t.example/v.mp4"></video>';
    expect(kinds(raw)).toContain("av-resource");
  });

  it("detects meta refresh", () => {
    const raw = 'From: a@b.com\n\n<meta http-equiv="refresh" content="0;url=https://evil.tk">';
    expect(kinds(raw)).toContain("meta-refresh");
  });

  it("rolls multiple mechanisms into a summary", () => {
    const raw = [
      "From: a@b.com",
      "Disposition-Notification-To: spy@evil.tk",
      "",
      '<img src="https://trk.x.com/pixel/1" width="1" height="1">',
      '<meta http-equiv="refresh" content="0;url=https://evil.tk">',
    ].join("\n");
    const r = analyseEmailTracking(raw);
    expect(r.findings.length).toBeGreaterThanOrEqual(3);
    expect(r.summary).toMatch(/tracking mechanisms found/);
    expect(r.summary).toContain("read-receipt request");
  });

  it("never throws on malformed/empty input", () => {
    expect(() => analyseEmailTracking("")).not.toThrow();
    expect(() => analyseEmailTracking("<<<not really html")).not.toThrow();
  });

  it("detects every mechanism in the ALL_TRACKING_MECHANISMS fixture", () => {
    const found = new Set(kinds(MOCK_EMAILS_WITH_PIXELS.ALL_TRACKING_MECHANISMS.content));
    const expected: TrackingKind[] = [
      "pixel", "click-redirect", "unique-url", "css-resource",
      "read-receipt", "external-resource", "meta-refresh",
    ];
    for (const k of expected) expect(found).toContain(k);
  });
});
