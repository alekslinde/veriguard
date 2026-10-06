// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, afterEach, vi } from "vitest";

import { checkOne, markdown, type Result } from "../scripts/check-calendar-sources";

// The calendar checker delegates reachability to the threat-intel checker, so
// both apply one rule: DEAD needs a confirmed 404/410, NXDOMAIN or a move. Its
// own copy used to call a page DEAD on "403 to any agent", the misreading that
// had live threat-intel sources (wa.gov.au) reported dead.
describe("calendar source reachability", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const stubStatus = (status: number) => {
    vi.stubGlobal("fetch", async (input: string | URL) => ({
      status, ok: status >= 200 && status < 300, url: String(input),
      text: async () => "", json: async () => ({}),
    } as Response));
  };
  const ref = { url: "https://www.scamwatch.gov.au/x", label: "Scamwatch", cited: ["AU/tax-time"] };

  it("reports a 403 to every agent as UNVERIFIED, not DEAD", async () => {
    stubStatus(403);
    const r = await checkOne(ref);
    expect(r.state).toBe("UNVERIFIED");
    expect(r.cited).toEqual(["AU/tax-time"]);
  });

  it("still reports a confirmed 404 as DEAD", async () => {
    stubStatus(404);
    expect((await checkOne(ref)).state).toBe("DEAD");
  });

  it("honours expect: blocked", async () => {
    stubStatus(403);
    expect((await checkOne({ ...ref, expect: "blocked" })).state).toBe("BLOCKED");
  });

  it("leaves a 200 as OK", async () => {
    stubStatus(200);
    expect((await checkOne(ref)).state).toBe("OK");
  });
});

describe("calendar digest wording", () => {
  const row = (state: Result["state"], extra: Partial<Result> = {}): Result =>
    ({ url: "https://x.example/p", label: "X", cited: ["AU/x"], state, ...extra });

  it("does not claim every source resolves when some are unverified", () => {
    const md = markdown([row("OK"), row("UNVERIFIED", { error: "HTTP 403 to every agent" })]);
    expect(md).not.toContain("Every calendar source URL still resolves");
    expect(md).toContain("No calendar source has rotted");
    expect(md).toContain("1 refused by a live server");
  });

  it("lists corroborated-live sources in their own section, not as problems", () => {
    const md = markdown([row("LIVE_FALLBACK", { via: "robots" })]);
    expect(md).toContain("**0 need attention**");
    expect(md).toContain("via robots");
  });

  it("keeps the all-clear when everything is OK", () => {
    expect(markdown([row("OK")])).toContain("Every calendar source URL still resolves");
  });
});
