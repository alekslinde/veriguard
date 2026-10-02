import { describe, it, expect } from "vitest";
import enMessages from "@/messages/en.json";
import {
  reportingFor,
  victimHelpline,
  reportingAgencies,
  scamTextForwarding,
} from "@/lib/reportingResources";

describe("reportingFor", () => {
  it("links AU to Scamwatch with the host appended", () => {
    const r = reportingFor("AU");
    expect(r.body).toBe("Scamwatch");
    expect(r.url).toBe("https://www.scamwatch.gov.au");
    expect(r.label).toBe("Scamwatch (scamwatch.gov.au)");
  });

  it("leaves bodies that already name their host untouched", () => {
    // GB and US packs embed the URL in the body; appending it again would
    // read "Report Fraud (reportfraud.police.uk) (reportfraud.police.uk)".
    expect(reportingFor("GB").label).toBe("Report Fraud (reportfraud.police.uk)");
    expect(reportingFor("US").label).toBe("the FTC (reportfraud.ftc.gov)");
  });

  it("links every covered region to an https URL, none to a shortener", () => {
    for (const code of ["AU", "GB", "US", "NZ", "CA", "IE"] as const) {
      const r = reportingFor(code);
      expect(r.url, code).toMatch(/^https:\/\//);
      expect(r.url, code).not.toMatch(/bit\.ly|tinyurl|t\.co\b/);
    }
  });

  it("renders rest-of-world as plain text with no URL", () => {
    const r = reportingFor("ZZ");
    expect(r.url).toBeNull();
    expect(r.label).toBe(r.body);
  });

  it("falls back to AU for anything unrecognised, matching pack resolution", () => {
    expect(reportingFor("XX")).toEqual(reportingFor("AU"));
    expect(reportingFor(undefined)).toEqual(reportingFor("AU"));
  });
});

describe("victimHelpline", () => {
  it("names IDCARE for AU only", () => {
    expect(victimHelpline("AU")).toEqual({ number: "1800595160", label: "IDCARE on 1800 595 160" });
    for (const code of ["GB", "US", "NZ", "CA", "IE", "ZZ"] as const) {
      expect(victimHelpline(code), code).toBeNull();
    }
  });
});

describe("reportingAgencies", () => {
  it("keeps the full Australian set for AU", () => {
    // The four bodies the Learn page listed when the app was AU-only.
    const names = reportingAgencies("AU").map((a) => a.name);
    expect(names).toContain("Scamwatch (ACCC)");
    expect(names).toContain("ReportCyber");
    expect(names).toContain("IDCARE (ID theft)");
    expect(names).toHaveLength(4);
  });

  it("gives every other covered region its own reporting body, not Australia's", () => {
    // The bug this replaced: a reader in the UK was told to file with Scamwatch,
    // which does not take their report.
    for (const code of ["GB", "US", "NZ", "CA", "IE"] as const) {
      const agencies = reportingAgencies(code);
      expect(agencies, code).toHaveLength(1);
      expect(agencies[0].href, code).toBe(reportingFor(code).url);
      expect(JSON.stringify(agencies), code).not.toMatch(/scamwatch|ReportCyber|IDCARE/i);
    }
  });

  it("derives the displayed host from the pack URL, without a www prefix", () => {
    expect(reportingAgencies("NZ")[0].site).toBe("cert.govt.nz");
  });

  it("returns nothing for rest-of-world, which has no URL to link", () => {
    // The section falls back to naming the body as plain text; an empty grid
    // would leave a gap under the heading.
    expect(reportingAgencies("ZZ")).toEqual([]);
  });
});

describe("scamTextForwarding", () => {
  it("is AU-only — the 0429 shortcode exists nowhere else", () => {
    expect(scamTextForwarding("AU")).toBe(true);
    for (const code of ["GB", "US", "NZ", "CA", "IE", "ZZ"] as const) {
      expect(scamTextForwarding(code), code).toBe(false);
    }
  });

  it("is a separate fact from the victim helpline", () => {
    // Both are AU-only today. Gating one on the other would show Australia's
    // shortcode to the first region that gained a helpline of its own.
    expect(scamTextForwarding("AU")).toBe(victimHelpline("AU") !== null);
  });
});

describe("learn-page reporting copy", () => {
  // The Learn page hardcoded Australian bodies while the app shipped six region
  // packs, so a UK reader was told to file with Scamwatch. These guard the fix:
  // shared strings must interpolate the reader's own body, and the AU-only
  // facts must live in keys that are rendered only for AU.
  const msg = enMessages as Record<string, string>;

  it("interpolates the reporting body rather than naming one", () => {
    for (const key of [
      "learn.caught.outro",
      "learn.block.email.any.body",
      "learn.block.phone.authorities.body",
    ]) {
      expect(msg[key], key).toContain("{body}");
      expect(msg[key], key).not.toMatch(/scamwatch|ReportCyber|IDCARE/i);
    }
  });

  it("names no country in the shared reporting copy", () => {
    for (const key of [
      "learn.caught.outro",
      "learn.block.email.any.body",
      "learn.block.phone.authorities.body",
    ]) {
      expect(msg[key], key).not.toMatch(/\bAustralian?\b|\bTelstra\b|\bOptus\b/i);
    }
  });

  it("keeps the AU-only facts in their own gated keys", () => {
    // Not deleted — correct advice for AU readers, just not shown to everyone.
    expect(msg["learn.block.phone.authorities.au"]).toContain("0429 999 888");
    expect(msg["learn.caught.outro.helpline"]).toContain("{helpline}");
  });
});

describe("reporting body in prose", () => {
  // The Learn page interpolates {body} into sentences. `label` is the linked
  // form (body + host where the body omits it) and belongs to ReportingLink;
  // using it in prose double-prints the host for any body whose name does not
  // literally contain it.
  it("never double-prints a host for any covered region", () => {
    for (const code of ["AU", "GB", "US", "NZ", "CA", "IE", "ZZ"] as const) {
      const { body } = reportingFor(code);
      const hosts = body.match(/\b[a-z0-9-]+(?:\.[a-z]{2,})+\b/gi) ?? [];
      for (const h of hosts) {
        const occurrences = body.split(h).length - 1;
        expect(occurrences, `${code}: "${body}" repeats ${h}`).toBe(1);
      }
    }
  });

  it("keeps IE readable — the case label gets wrong", () => {
    // reportingFor's includes(host) guard misses here: the body says
    // "FraudSMART", the host is "fraudsmart.ie", so label appends anyway.
    const r = reportingFor("IE");
    expect(r.body).toBe("An Garda Síochána (or FraudSMART)");
    expect(r.label).toContain("(fraudsmart.ie)");
    expect(r.body).not.toContain("fraudsmart.ie");
  });
});
