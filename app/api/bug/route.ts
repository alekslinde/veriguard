// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from "next/server";
import { checkAndRecordRateLimit } from "@/lib/reportStore";
import { sanitizeBugReport, storeBugReport } from "@/lib/bugStore";
import { clientIpFromHeaders } from "@/lib/geo";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — treat as a bot, fake success so it learns nothing.
    return NextResponse.json({ success: true });
  }

  // Honeypot: a hidden field only bots fill in.
  if (String(body.hp ?? "").trim()) {
    return NextResponse.json({ success: true });
  }

  // Share the report rate limiter, namespaced so bug reports and scam reports
  // don't starve each other.
  if (!checkAndRecordRateLimit(`bug:${clientIpFromHeaders(req.headers)}`)) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const report = sanitizeBugReport({
    action: body.action,
    error: body.error,
    description: body.description,
    contact: body.contact,
    path: body.path,
    // Prefer the real request User-Agent over a client-supplied one.
    userAgent: req.headers.get("user-agent") ?? body.userAgent,
    viewport: body.viewport,
    language: body.language,
  });

  await storeBugReport(report);

  return NextResponse.json({ success: true, bugId: report.id });
}
