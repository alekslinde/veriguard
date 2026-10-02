// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return { ...actual, incrementCheckCount: async () => {} };
});

import { NextRequest } from "next/server";

// Route-level wiring, distinct from lib/cors's own unit tests: those prove the
// header logic, these prove /api/check actually calls it — on every exit path,
// and that the preflight exists at all. A JSON POST always preflights, so a
// route without OPTIONS would 405 before the real request was ever sent.

const EXT = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";
const SITE = "https://veriguard.app";
const ORIGINAL = { ...process.env };

let ipCounter = 0;
function req(body: unknown, origin?: string, ip?: string): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Unique synthetic IP per request so tests cannot throttle each other.
    "x-forwarded-for": ip ?? `10.1.0.${ipCounter % 254}`,
  };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/check", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Load the route with a specific CORS configuration.
 *
 * Environment is set *before* the import, and lib/cors now reads it per call
 * rather than capturing it at module load — so these tests no longer depend on
 * vi.resetModules() reaching lib/cors transitively through the route's import
 * graph. That dependency was invisible and fragile: a future top-level
 * `@/lib/cors` import somewhere else in the graph would have left a stale
 * allowlist in place and made the disallowed-origin assertions pass vacuously
 * while proving nothing.
 *
 * resetModules() is still called, for the route's own module state.
 */
async function loadRoute(allowed?: string) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  if (allowed === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
  else process.env.CORS_ALLOWED_ORIGINS = allowed;
  return import("@/app/api/check/route");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("/api/check preflight", () => {
  it("answers OPTIONS for an allowed origin", async () => {
    const { OPTIONS } = await loadRoute(EXT);
    const res = await OPTIONS(new NextRequest("http://localhost/api/check", {
      method: "OPTIONS",
      headers: { origin: EXT },
    }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("answers OPTIONS without CORS headers for a disallowed origin", async () => {
    // Still a 204 — the browser, not the server, is what refuses the follow-up
    // request, and returning an error here would leak whether an origin is
    // allowlisted.
    const { OPTIONS } = await loadRoute(EXT);
    const res = await OPTIONS(new NextRequest("http://localhost/api/check", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("/api/check responses carry CORS on every exit path", () => {
  it("on a successful check", async () => {
    const { POST } = await loadRoute(EXT);
    const res = await POST(req({ content: "hello there" }, EXT));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
  });

  it("on a 400", async () => {
    const { POST } = await loadRoute(EXT);
    const res = await POST(req({ content: "  " }, EXT));
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
  });

  it("on a 429", async () => {
    // A cross-origin caller that gets an un-CORSed 429 sees an opaque network
    // failure rather than the message — bad UX and confusing to debug from
    // inside an extension.
    const { POST } = await loadRoute(EXT);
    const { CHECK_RATE_LIMIT } = await import("@/lib/reportStore");
    const ip = "10.9.9.9";
    for (let i = 0; i < CHECK_RATE_LIMIT; i++) {
      await POST(req({ content: "hello" }, EXT, ip));
    }
    const res = await POST(req({ content: "hello" }, EXT, ip));
    expect(res.status).toBe(429);
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT);
  });

  it("omits them entirely for a disallowed origin", async () => {
    const { POST } = await loadRoute(EXT);
    const res = await POST(req({ content: "hello there" }, "https://evil.example"));
    // The request still runs and is still rate-limited: CORS is a browser
    // policy, not a server firewall. What changes is that the browser will not
    // expose this response to the calling page.
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("leaves a same-origin request (no Origin header) unchanged", async () => {
    const { POST } = await loadRoute(EXT);
    const res = await POST(req({ content: "hello there" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("the allowlist is read at request time", () => {
  it("does not depend on module-reset ordering to see the configured origins", () => {
    // The guard for the fragility described on loadRoute. If lib/cors ever goes
    // back to capturing its allowlist in a module-level const, this fails: the
    // value set here arrives after the module has already been imported by the
    // suite above.
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    process.env.CORS_ALLOWED_ORIGINS = "https://configured-late.example";
    return import("@/lib/cors").then(({ isAllowedOrigin }) => {
      expect(isAllowedOrigin("https://configured-late.example")).toBe(true);
    });
  });
});

describe("the write paths stay same-origin", () => {
  // The allowlist opens exactly one route. If a future change wires CORS into
  // a write path, that should be a deliberate decision with its own review —
  // not something that happens by copying an import.
  it.each([
    ["report", () => import("@/app/api/report/route")],
    ["bug", () => import("@/app/api/bug/route")],
    ["ocr", () => import("@/app/api/ocr/route")],
  ])("/api/%s exports no OPTIONS handler", async (_name, load) => {
    const mod = (await load()) as Record<string, unknown>;
    expect(mod.OPTIONS).toBeUndefined();
  });

  it.each(["report", "bug", "ocr", "reports", "stats", "feed-stats", "inbound"])(
    "/api/%s does not import the CORS helpers",
    async (name) => {
      const { readFileSync } = await import("fs");
      const src = readFileSync(`${process.cwd()}/app/api/${name}/route.ts`, "utf8");
      expect(src).not.toContain("@/lib/cors");
    },
  );
});
