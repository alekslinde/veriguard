// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { analyseEmailSource } from "@/lib/emailSource";

// The forwarder's own wrapper — must never be what we report.
const FORWARDER = "victim@gmail.com";

const GMAIL_FORWARD = [
  `From: ${FORWARDER}`,
  "Subject: Fwd: refund",
  "",
  "is this real?",
  "",
  "---------- Forwarded message ---------",
  "From: ATO <refunds@ato-refund.xyz>",
  "Reply-To: get@payme.cc",
  "Disposition-Notification-To: spy@ato-refund.xyz",
  "Subject: refund",
  "",
  '<img src="https://t.ato-refund.xyz/pixel?r=you%40x.com" width="1" height="1">',
].join("\n");

describe("analyseEmailSource", () => {
  it("unwraps a forwarded email and analyses the ORIGINAL sender, not the forwarder", () => {
    const a = analyseEmailSource(GMAIL_FORWARD);
    expect(a.source).toBe("inline");
    expect(a.headers.fromAddress).toBe("refunds@ato-refund.xyz");
    expect(a.headers.replyTo).toBe("get@payme.cc");
    expect(a.headers.fromAddress).not.toBe(FORWARDER);
    // Identity flags reference the original sender split.
    expect(a.identityFlags.length).toBeGreaterThan(0);
    // Tracking from the quoted body + header survives the unwrap.
    const kinds = a.tracking.findings.map((f) => f.kind);
    expect(kinds).toContain("pixel");
    expect(kinds).toContain("read-receipt");
  });

  it("treats a bare (non-forwarded) email as the original", () => {
    const a = analyseEmailSource("From: scammer@bad.tk\nReply-To: scammer@bad.tk\n\nhi");
    expect(a.source).toBe("toplevel");
    expect(a.headers.fromAddress).toBe("scammer@bad.tk");
  });

  it("returns empty identity flags when there's no From address", () => {
    const a = analyseEmailSource("just some pasted text, not an email");
    expect(a.headers.fromAddress).toBe("");
    expect(a.identityFlags).toEqual([]);
  });
});
