import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  radarForRegion,
  authoredRadarRegions,
  threatsByStatus,
  activeThreats,
  lastUpdated,
  isWellFormedDate,
  formatRadarDate,
  roadmapUrl,
  uncoveredThreats,
  radarSummary,
  filterByChannel,
  channelCounts,
  type ThreatEntry,
} from "@/lib/threatRadar";
import { supportedRegions } from "@veriguard/engine/regions";
import enNormal from "@/messages/en.normal.json";

const AU = radarForRegion("AU");

describe("radarForRegion", () => {
  it("returns authored entries for AU", () => {
    expect(AU.length).toBeGreaterThan(0);
  });

  it("returns an empty list for regions with no authored radar", () => {
    // Deliberate: an unauthored region renders nothing rather than inheriting
    // Australian campaigns. Same contract as calendarForRegion.
    for (const code of supportedRegions().filter((c) => c !== "AU")) {
      expect(radarForRegion(code)).toEqual([]);
      expect(lastUpdated(code)).toBeNull();
    }
  });
});

describe("authoring invariants", () => {
  it("has unique ids", () => {
    const ids = AU.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed firstSeen and lastSeen dates", () => {
    // lastUpdated() orders these by string comparison, which is only valid for
    // zero-padded fixed-width dates — "2026-8-9" would sort before "2026-08-02"
    // and report the wrong "as at" date on the page.
    for (const threat of AU) {
      expect(isWellFormedDate(threat.firstSeen), `${threat.id} firstSeen`).toBe(true);
      expect(isWellFormedDate(threat.lastSeen), `${threat.id} lastSeen`).toBe(true);
    }
  });

  it("never records a lastSeen before its firstSeen", () => {
    for (const threat of AU) {
      expect(threat.lastSeen >= threat.firstSeen, `${threat.id}`).toBe(true);
    }
  });

  it("cites a roadmap that exists in docs/threat-intel", () => {
    // The roadmap link is the whole provenance claim — an entry citing a sweep
    // that doesn't exist is an unsourced assertion presented as a sourced one,
    // and now renders as a public 404 (see roadmapUrl).
    //
    // Resolved from __dirname rather than cwd: a cwd-relative path silently
    // passes from the repo root and silently *stops checking* from anywhere
    // else, which is the failure mode a provenance guard can least afford.
    for (const threat of AU) {
      const path = resolve(__dirname, `../docs/threat-intel/${threat.roadmap}-threat-roadmap.md`);
      expect(existsSync(path), `${threat.id} cites missing ${path}`).toBe(true);
    }
  });

  it("builds a roadmap URL matching the checked filename", () => {
    // Ties the rendered link to the assertion above: the test proves the file
    // exists, this proves the URL points at that same filename.
    for (const threat of AU) {
      expect(roadmapUrl(threat)).toBe(
        `https://github.com/alekslinde/veriguard/blob/main/docs/threat-intel/${threat.roadmap}-threat-roadmap.md`,
      );
    }
  });

  it("carries non-empty copy on every entry", () => {
    for (const threat of AU) {
      expect(threat.title.length, threat.id).toBeGreaterThan(0);
      expect(threat.summary.length, threat.id).toBeGreaterThan(0);
      expect(threat.advice.length, threat.id).toBeGreaterThan(0);
      expect(threat.lures.length, threat.id).toBeGreaterThan(0);
    }
  });

  it("describes detection exactly when there is detection to describe", () => {
    // The pairing the UI depends on: `covered`/`partial` render `detection`,
    // while `none`/`n/a` fall back to a fixed line. A covered entry with no
    // sentence would render an empty claim; an uncovered one carrying a
    // sentence would contradict its own badge.
    for (const threat of AU) {
      const shouldDescribe = threat.coverage === "covered" || threat.coverage === "partial";
      expect(Boolean(threat.detection), `${threat.id} (${threat.coverage})`).toBe(shouldDescribe);
    }
  });

  it("has a message key for every channel and coverage value used", () => {
    // These are interpolated into MessageKey lookups at render, so an unmapped
    // value renders the raw key to the user rather than failing loudly.
    const keys = new Set(Object.keys(enNormal));
    for (const threat of AU) {
      expect(keys.has(`radar.channel.${threat.channel}`), threat.channel).toBe(true);
      const coverageKey =
        threat.coverage === "n/a" ? "radar.coverage.na" : `radar.coverage.${threat.coverage}`;
      expect(keys.has(coverageKey), threat.coverage).toBe(true);
    }
  });
});

describe("i18n", () => {
  it("defines the coverage badges as a complete set", () => {
    // These four render side by side in one list, so a missing one would leave
    // a gap in a row of labels that are read together. The regional register
    // that could once split this set across two voices is retired; the set
    // itself still has to be whole.
    const keys = [
      "radar.coverage.covered",
      "radar.coverage.partial",
      "radar.coverage.none",
      "radar.coverage.na",
    ] as const;

    const missing = keys.filter((k) => !(k in enNormal));
    expect(missing, missing.join(", ")).toEqual([]);
  });

  it("keeps the {region} placeholder in radar.intro", () => {
    // The interpolation is what stops the intro hardcoding one country. A
    // bundle that drops the token silently reintroduces that bug.
    expect((enNormal as Record<string, string>)["radar.intro"]).toContain("{region}");
  });
});

describe("threatsByStatus", () => {
  it("partitions the region's entries with nothing lost or duplicated", () => {
    const active = threatsByStatus("AU", "active");
    const watchlist = threatsByStatus("AU", "watchlist");
    const subsided = threatsByStatus("AU", "subsided");

    // The UI renders exactly these three groups, so an entry with a status
    // outside the union would silently vanish from the page.
    expect(active.length + watchlist.length + subsided.length).toBe(AU.length);
  });

  it("only marks recently-confirmed entries as active", () => {
    // Guards the authoring rule on RadarStatus. "Circulating now" stops meaning
    // anything once it covers everything we have ever recorded — the first draft
    // marked 21 of 24 entries active, which taught the reader nothing.
    //
    // The two exceptions are standing tactics rather than campaigns: they run
    // continuously and so stop being re-reported, which is a fact about the
    // reporting cadence and not about the risk.
    const PERSISTENT = new Set(["hi-mum", "voice-clone-family"]);

    const sweeps = [...new Set(AU.map((t) => t.lastSeen))].sort().slice(-2);
    for (const threat of threatsByStatus("AU", "active")) {
      if (PERSISTENT.has(threat.id)) continue;
      expect(sweeps.includes(threat.lastSeen), `${threat.id} last seen ${threat.lastSeen}`).toBe(true);
    }
  });

  it("does not leave a recently-confirmed entry off the active list", () => {
    // The converse of the rule above, and the direction that actually drifts.
    // The existing check only catches an entry claiming `active` on a stale
    // date; nothing caught the opposite — an entry a sweep re-confirmed that
    // was never brought forward, which is how a promotion goes half-done and
    // still passes CI (issue #194).
    //
    // `subsided` is a deliberate editorial statement that a campaign has
    // stopped, so it is exempt: a sweep can record a last sighting without
    // contradicting the call that it is over.
    const sweeps = [...new Set(AU.map((t) => t.lastSeen))].sort().slice(-2);
    for (const threat of AU) {
      if (threat.status === "subsided") continue;
      if (!sweeps.includes(threat.lastSeen)) continue;
      expect(
        threat.status,
        `${threat.id} was confirmed by sweep ${threat.lastSeen} but is ${threat.status}`,
      ).toBe("active");
    }
  });

  it("keeps every authored radar region under the same status rule", () => {
    // Generalises the rule past AU. Today AU is the only authored radar, so
    // this adds no coverage — that is the point: it is the guard that makes a
    // second region inherit the ageing discipline on the day it is authored,
    // rather than the rule quietly remaining an AU-only convention.
    const PERSISTENT = new Set(["hi-mum", "voice-clone-family"]);
    for (const region of authoredRadarRegions()) {
      const entries = radarForRegion(region);
      const sweeps = [...new Set(entries.map((t) => t.lastSeen))].sort().slice(-2);
      for (const threat of entries) {
        if (threat.status !== "active" || PERSISTENT.has(threat.id)) continue;
        expect(
          sweeps.includes(threat.lastSeen),
          `${region}/${threat.id} last seen ${threat.lastSeen}`,
        ).toBe(true);
      }
    }
  });

  it("keeps active a minority of the board", () => {
    // The distribution is the signal. If most of the radar is "circulating now",
    // the grouping has collapsed back into one undifferentiated list.
    const active = threatsByStatus("AU", "active").length;
    expect(active).toBeLessThan(AU.length * 0.75);
  });

  it("returns entries in authored order", () => {
    const active = threatsByStatus("AU", "active");
    const expected = AU.filter((t) => t.status === "active");
    expect(active.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  });

  it("activeThreats matches the active partition", () => {
    expect(activeThreats("AU")).toEqual(threatsByStatus("AU", "active"));
  });

  it("returns an empty list for an unauthored region", () => {
    expect(threatsByStatus("GB", "active")).toEqual([]);
    expect(activeThreats("GB")).toEqual([]);
  });
});

describe("uncoveredThreats", () => {
  it("returns partial and none, excluding n/a", () => {
    // `n/a` is not a coverage gap — a voice call is outside what a text checker
    // can ever see. Counting it as a shortfall would overstate the gap and make
    // the "worth knowing we don't catch" group misleading.
    const gaps = uncoveredThreats("AU");
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(["partial", "none"]).toContain(g.coverage);
    expect(gaps.some((g) => g.coverage === "n/a")).toBe(false);
  });

  it("stays a minority — the gap section is an exception list, not the board", () => {
    // If most entries were uncovered, promoting them above the full list would
    // be duplicating the page rather than highlighting anything.
    expect(uncoveredThreats("AU").length).toBeLessThan(AU.length / 2);
  });

  it("is empty for an unauthored region", () => {
    expect(uncoveredThreats("GB")).toEqual([]);
  });
});

describe("radarSummary", () => {
  it("counts match the underlying partitions", () => {
    const s = radarSummary("AU");
    expect(s.total).toBe(AU.length);
    expect(s.active).toBe(threatsByStatus("AU", "active").length);
    expect(s.watchlist).toBe(threatsByStatus("AU", "watchlist").length);
    expect(s.covered).toBe(AU.filter((t) => t.coverage === "covered").length);
    expect(s.uncovered).toBe(uncoveredThreats("AU").length);
  });

  it("never claims more covered than exist", () => {
    // The summary line states these to the user as fact; a count drifting from
    // the cards below it would be a visible lie about our own coverage.
    const s = radarSummary("AU");
    expect(s.covered).toBeLessThanOrEqual(s.total);
    expect(s.active + s.watchlist).toBeLessThanOrEqual(s.total);
  });

  it("zeroes out for an unauthored region", () => {
    expect(radarSummary("GB")).toEqual({
      total: 0,
      active: 0,
      watchlist: 0,
      covered: 0,
      uncovered: 0,
    });
  });

  it("keeps `covered` the dominant case the collapsed row relies on", () => {
    // The UI names coverage in the collapsed row ONLY for gaps, so silence has
    // to mean "covered". That convention is only safe while covered is the
    // clear majority — if it stopped being so, the absence of a label would
    // become ambiguous and the rows would need an explicit badge again.
    const s = radarSummary("AU");
    expect(s.covered).toBeGreaterThan(s.total / 2);
  });
});

describe("lastUpdated", () => {
  it("returns the latest lastSeen across the region's entries", () => {
    const expected = AU.map((t) => t.lastSeen).sort().at(-1);
    expect(lastUpdated("AU")).toBe(expected);
  });

  it("is derived rather than pinned, so it moves with the entries", () => {
    // Guards the reason this is a function and not a constant: a hand-maintained
    // date drifts the moment an entry is added without touching it, and a stale
    // date on a page about what's current is worse than no date at all.
    const latest = lastUpdated("AU")!;
    expect(AU.some((t) => t.lastSeen === latest)).toBe(true);
    expect(AU.every((t) => t.lastSeen <= latest)).toBe(true);
  });
});

describe("isWellFormedDate", () => {
  it("accepts real zero-padded dates", () => {
    expect(isWellFormedDate("2026-08-09")).toBe(true);
    expect(isWellFormedDate("2024-02-29")).toBe(true);
  });

  it("rejects unpadded, malformed and impossible dates", () => {
    for (const bad of [
      "2026-8-9",
      "2026-08-9",
      "26-08-09",
      "2026/08/09",
      "2026-13-01",
      "2026-02-30",
      "2025-02-29",
      "",
      "not a date",
    ]) {
      expect(isWellFormedDate(bad), bad).toBe(false);
    }
  });
});

describe("formatRadarDate", () => {
  it("formats an ISO date without timezone drift", () => {
    // Parsed from the string parts rather than through Date, so a runner behind
    // UTC can't render 9 August as the 8th.
    expect(formatRadarDate("2026-08-09")).toBe("9 August 2026");
    expect(formatRadarDate("2026-01-01")).toBe("1 January 2026");
    expect(formatRadarDate("2026-12-31")).toBe("31 December 2026");
  });

  it("returns a malformed value unchanged rather than rendering NaN", () => {
    expect(formatRadarDate("not a date")).toBe("not a date");
    expect(formatRadarDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("coverage claims match the shipped detector", () => {
  // The radar's whole value over a news feed is the coverage claim, and it is
  // the one field nothing else can check: `detection` is prose, so a stale
  // sentence stays green forever. The quishing entry shipped claiming "we can't
  // read the code itself" when jsqr decodes QR images client-side and the
  // PDF-hybrid pattern (D7/#113) had already shipped — an understated claim,
  // which erodes trust exactly as much as an overstated one.
  //
  // These sample a representative lure per entry and assert the matching flag
  // is raised. Asserting on the *flag* rather than the score is deliberate:
  // scores are scaled and rebalanced, so a threshold here would break on
  // unrelated tuning while proving less. The flag firing is the coverage claim.
  const SAMPLES: Array<{ id: string; text: string; flag: RegExp }> = [
    { id: "quishing", text: "The attached PDF contains a QR code — scan it to pay your invoice.", flag: /QR code scan prompt/i },
    { id: "rental-bond-fraud", text: "Your rental bond is due - our bank details have changed, new account number below", flag: /property bond fraud/i },
    { id: "foreign-authority-diaspora", text: "This is the Chinese Police. A parcel in your name contained contraband.", flag: /foreign police or government authority/i },
    { id: "toll-road-smishing", text: "Linkt: you have an unpaid toll of $4.80. Pay now to avoid a $195 fine.", flag: /toll/i },
    { id: "reportcyber-cold-storage", text: "Quote the ReportCyber reference and transfer everything to the cold storage account today.", flag: /Asks for sensitive info/i },
    { id: "stock-tips-group", text: "You're invited to our exclusive trading group, guaranteed returns — join our stock tips group.", flag: /Prize\/reward language/i },
    { id: "courier-collection", text: "Your account is compromised. A courier will collect your card for safekeeping.", flag: /Asks for sensitive info/i },
    // The escalation phase, not the opener — the opener is the documented gap
    // that makes this entry `partial`. Sampling the opener here would assert a
    // signal we don't have; sampling the escalation asserts the half we do.
    { id: "hi-mum", text: "Hi Mum, I've been in an accident and need bail money urgently", flag: /urgency/i },
  ];

  it("covers every sampled entry with a live signal", async () => {
    const { checkEmail } = await import("@veriguard/engine/scamDetector");
    for (const { id, text, flag } of SAMPLES) {
      const entry = AU.find((t) => t.id === id);
      expect(entry, `${id} missing from the radar`).toBeDefined();
      // Only meaningful for entries claiming coverage; `n/a` entries are
      // excluded by construction since none appear above.
      expect(entry!.coverage, `${id} sampled but not claiming coverage`).not.toBe("n/a");
      const flags = checkEmail(text).flags.join(" | ");
      expect(flag.test(flags), `${id} raised no matching flag. Got: ${flags.slice(0, 160)}`).toBe(true);
    }
  });

  it("pins the known gaps that make entries partial", async () => {
    // Documents *why* these are `partial` rather than `covered`, so the reason
    // is a failing test if it ever changes rather than a comment nobody reads.
    // If one of these starts scoring, the rule shipped and the badge should be
    // upgraded — that is a pass-worthy change, so the assertion is the prompt.
    const { checkSms } = await import("@veriguard/engine/scamDetector");

    // "Hi Mum" opener: base.ts covers the money stage, not the first contact.
    expect(checkSms("Hi Mum, this is my new number, my phone broke").score).toBe(0);

    // The "Chinese Embassy" word-order gap that used to sit here was fixed on
    // 2026-08-10 — this test failed the moment the rule shipped, which is what
    // pinning a gap is for. Kept as a regression guard on the fix instead.
    const flags = checkSms("This is the Chinese Embassy. Pay a bond to clear your name.").flags;
    expect(flags.some((f) => /foreign police or government authority/i.test(f))).toBe(true);
  });

  it("keeps n/a entries genuinely undetectable in text", async () => {
    // The other direction: an `n/a` entry that started scoring would mean the
    // badge is now understating us, which is how the quishing entry went wrong.
    const { checkEmail } = await import("@veriguard/engine/scamDetector");
    const samples: Record<string, string> = {
      "sim-swap": "We have received a request to port your number to another carrier",
    };
    for (const [id, text] of Object.entries(samples)) {
      const entry = AU.find((t) => t.id === id);
      expect(entry?.coverage, id).toBe("n/a");
      expect(checkEmail(text).score, `${id} now scores — revisit the n/a badge`).toBeLessThan(15);
    }
  });
});

describe("scoring independence", () => {
  it("is not imported by the detector", () => {
    // The radar is educational data. If scamDetector ever imported it, a verdict
    // could move because a campaign was listed — exactly the coupling the module
    // header rules out, and the same guarantee scamCalendar makes.
    //
    // __dirname-relative for the same reason as the roadmap check: read from the
    // wrong cwd this throws rather than passing vacuously, so the guarantee
    // can't quietly stop being enforced.
    const detector = readFileSync(resolve(__dirname, "../packages/engine/src/scamDetector.ts"), "utf8");
    expect(detector).not.toContain("threatRadar");
  });
});

describe("ThreatEntry type", () => {
  it("accepts a minimal entry without a detection sentence", () => {
    // Type-level guard: `detection` is optional precisely so `none` and `n/a`
    // entries can omit it.
    const entry: ThreatEntry = {
      id: "test",
      title: "Test",
      channel: "sms",
      status: "active",
      coverage: "none",
      firstSeen: "2026-08-09",
      lastSeen: "2026-08-09",
      summary: "summary",
      lures: ["lure"],
      advice: "advice",
      roadmap: "2026-08-09",
    };
    expect(entry.detection).toBeUndefined();
  });
});

describe("filterByChannel", () => {
  const all = radarForRegion("AU");

  it("passes every entry through for \"all\"", () => {
    expect(filterByChannel(all, "all")).toHaveLength(all.length);
  });

  it("keeps only entries on the chosen channel", () => {
    const phone = filterByChannel(all, "phone");
    expect(phone.length).toBeGreaterThan(0);
    expect(phone.every((e) => e.channel === "phone")).toBe(true);
  });

  it("preserves the source order, so most-recently-seen stays first", () => {
    const sms = filterByChannel(all, "sms");
    expect(sms.map((e) => e.id)).toEqual(
      all.filter((e) => e.channel === "sms").map((e) => e.id),
    );
  });

  it("does not mutate the array it is given", () => {
    const before = [...all];
    filterByChannel(all, "email");
    expect(all).toEqual(before);
  });
});

describe("channelCounts", () => {
  it("sums to the region's total, so no entry is uncounted or double-counted", () => {
    const counts = channelCounts("AU");
    const summed = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(radarForRegion("AU").length);
  });

  it("agrees with filterByChannel for every channel", () => {
    const all = radarForRegion("AU");
    const counts = channelCounts("AU");
    for (const channel of ["sms", "email", "phone", "web", "mixed"] as const) {
      expect(counts[channel]).toBe(filterByChannel(all, channel).length);
    }
  });

  it("reports every channel for a region with no radar, all at zero", () => {
    // The filter UI reads every key to decide which buttons to offer, so a
    // missing key would be a runtime undefined rather than a hidden button.
    expect(channelCounts("ZZ")).toEqual({ sms: 0, email: 0, phone: 0, web: 0, mixed: 0 });
  });
});
