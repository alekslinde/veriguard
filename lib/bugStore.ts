// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Storage for user-consented bug reports. These are submitted only after the
// user explicitly approves sending the diagnostics shown to them — we never
// auto-send, and we never capture the scam content or any uploaded file. The
// free-text description is PII-scrubbed before storage, mirroring scam reports.

import { randomBytes } from "crypto";
import { scrubPii } from "./piiScrubber";
import { getDb } from "./db";

// The actions whose failures we detect; "manual" covers a user-initiated report.
export const BUG_ACTIONS = ["upload", "check", "report", "manual"] as const;
export type BugAction = (typeof BUG_ACTIONS)[number];

export interface BugReport {
  id: string;
  action: BugAction;
  errorMessage: string;
  description: string;
  contact: string;
  path: string;
  userAgent: string;
  viewport: string;
  appLanguage: string;
  submittedAt: number;
}

export function generateBugId(): string {
  return "BUG-" + randomBytes(4).toString("hex").toUpperCase();
}

export function isBugAction(value: unknown): value is BugAction {
  return typeof value === "string" && (BUG_ACTIONS as readonly string[]).includes(value);
}

// Sanitise an incoming payload into a stored BugReport. Caps lengths, scrubs PII
// from the user-authored description, and constrains the action to the allowlist.
export function sanitizeBugReport(input: {
  action?: unknown;
  error?: unknown;
  description?: unknown;
  contact?: unknown;
  path?: unknown;
  userAgent?: unknown;
  viewport?: unknown;
  language?: unknown;
}): BugReport {
  return {
    id: generateBugId(),
    action: isBugAction(input.action) ? input.action : "manual",
    errorMessage: String(input.error ?? "").slice(0, 500),
    description: scrubPii(String(input.description ?? "").slice(0, 1000)),
    contact: String(input.contact ?? "").slice(0, 200),
    path: String(input.path ?? "").slice(0, 200),
    userAgent: String(input.userAgent ?? "").slice(0, 400),
    viewport: String(input.viewport ?? "").slice(0, 20),
    appLanguage: String(input.language ?? "").slice(0, 35),
    submittedAt: Date.now(),
  };
}

export async function storeBugReport(report: BugReport): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO bug_reports
            (id, action, error_message, description, contact, path,
             user_agent, viewport, app_language, submitted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      report.id, report.action, report.errorMessage, report.description,
      report.contact, report.path, report.userAgent, report.viewport,
      report.appLanguage, report.submittedAt,
    ],
  });
}
