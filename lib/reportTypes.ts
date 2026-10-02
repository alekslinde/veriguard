// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

export const REPORT_TYPES = ["url", "sms", "email", "phone", "qr", "custom"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
