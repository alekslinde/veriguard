// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { getDb } from "@/lib/db";
import { MOCK_REPORTS } from "@/lib/fixtures/mockReports";

async function seed() {
  const db = await getDb();

  // Clear existing reports (optional — comment out if you want to keep them)
  await db.execute("DELETE FROM reports");

  // Insert mock reports
  for (const report of MOCK_REPORTS) {
    await db.execute({
      sql: `
        INSERT INTO reports (
          id, type, content, description, submitted_at,
          scam_url, scam_phone, scam_email, scam_reply_to, email_auth, report_count, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        report.id,
        report.type,
        report.content,
        report.description,
        report.submittedAt,
        report.scamUrl || "",
        report.scamPhone || "",
        report.scamEmail || "",
        report.scamReplyTo || "",
        report.emailAuth || "",
        report.matchCount,
        report.location || "",
      ],
    });
  }

  console.log(`✓ Seeded ${MOCK_REPORTS.length} mock reports`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
