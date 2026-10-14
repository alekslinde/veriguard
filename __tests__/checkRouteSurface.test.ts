// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/urlhausBlocklist", async () =>
  (await import("./fixtures/routeRequest")).emptyBlocklistMock(),
);

// Capture the surface the route attributes each check to.
const incrementCheckCount = vi.fn(async () => {});
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return {
    ...actual,
    incrementCheckCount: (...args: unknown[]) => incrementCheckCount(...(args as [])),
  };
});

import { POST } from "@/app/api/check/route";
import { checkRequest as check } from "./fixtures/routeRequest";

const SCAM = "ATO: your tax refund is waiting, verify now at http://ato-refund.xyz";

beforeEach(() => {
  incrementCheckCount.mockClear();
});

describe("POST /api/check surface attribution", () => {
  it("attributes a share-sheet check to the share surface", async () => {
    await POST(check({ content: SCAM, surface: "share" }));
    expect(incrementCheckCount).toHaveBeenCalledWith("share");
  });

  it("attributes an ordinary check to web", async () => {
    await POST(check({ content: SCAM }));
    expect(incrementCheckCount).toHaveBeenCalledWith("web");
  });

  it.each(["email", "telegram", "unknown", "", "../../etc", 42, null, {}])(
    "records %s as web rather than trusting the client",
    async (surface) => {
      // The surface is client-supplied. Without an allowlist anyone could write
      // arbitrary rows into the telemetry aggregate, including impersonating
      // the `email` surface whose counts come from the inbound worker.
      await POST(check({ content: SCAM, surface }));
      expect(incrementCheckCount).toHaveBeenCalledWith("web");
    },
  );

  it("does not change the verdict based on the surface", async () => {
    // Attribution only — a shared message must be analysed identically.
    const web = await (await POST(check({ content: SCAM }))).json();
    const share = await (await POST(check({ content: SCAM, surface: "share" }))).json();
    expect(share.results).toEqual(web.results);
    expect(share.region).toBe(web.region);
  });
});
