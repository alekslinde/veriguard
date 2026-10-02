// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";
import sitemap from "@/app/sitemap";

describe("web app manifest", () => {
  it("registers /share as a GET share target", () => {
    // This object is a contract with the OS share sheet: a wrong action path or
    // a renamed param silently drops the app out of the sheet, with nothing in
    // the app itself failing. Pin the whole shape.
    expect(manifest().share_target).toEqual({
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
  });

  it("declares no file sharing", () => {
    // `files` would require a POST/multipart handler and a server round trip
    // for the image — the opposite of the client-side OCR that shipped in #201.
    expect(manifest().share_target).not.toHaveProperty("files");
  });

  it("keeps the app installable", () => {
    const m = manifest();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons?.length).toBeGreaterThan(0);
  });
});

describe("sitemap", () => {
  it("excludes the share target", () => {
    // /share is a share-sheet landing page, not content. It is noindex, and
    // listing it would invite crawling a route that only makes sense with a
    // payload attached.
    expect(sitemap().some((e) => e.url.endsWith("/share"))).toBe(false);
  });
});
