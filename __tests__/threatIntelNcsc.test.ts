// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkUrl } from "@veriguard/detect/scamDetector";
import { inferTargetRegion } from "@/lib/targetRegion";

// Coverage for the 2026-10-06 roadmap's D7 / #428: NCSC impersonation in New
// Zealand. CERT NZ merged into the NCSC. The NZ pack named CERT NZ but not
// its successor.
//
// The issue's copy half (reportingBody/reportingUrl, D9) is not in this
// change: where NZ individuals should now report could not be confirmed when
// this was written, and the current URL still resolves to the successor body.

const authorityFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims to be from a government agency"));

describe("#428 NZ — NCSC impersonation", () => {
  it("names the NCSC by acronym", () => {
    // Probed 2026-10-06: safe 10.
    const r = checkSms(
      "NCSC alert: your device has been compromised. Call 0800 555 123 now to secure your accounts.",
      undefined,
      "NZ",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).not.toBe("safe");
  });

  it("names the NCSC in full", () => {
    // Probed 2026-10-06: suspicious 30.
    const r = checkSms(
      "This is the National Cyber Security Centre. Your computer has been compromised. Call us back on 09 888 1234 immediately.",
      undefined,
      "NZ",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("scores a bare mention at zero", () => {
    expect(checkSms("The NCSC has published new guidance on securing home routers.", undefined, "NZ").score).toBe(0);
  });

  it("treats ncsc.govt.nz as the real agency", () => {
    expect(checkUrl("https://www.ncsc.govt.nz/news/", undefined, "NZ").verdict).toBe("safe");
  });

  it("does not guess NZ from a name three countries share", () => {
    // GB, IE and NZ each have a National Cyber Security Centre.
    expect(inferTargetRegion("National Cyber Security Centre: your device has been compromised.").region).not.toBe("NZ");
    expect(inferTargetRegion("NCSC alert: your device has been compromised.").region).not.toBe("NZ");
  });
});
