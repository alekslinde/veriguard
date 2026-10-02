// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// The install figures are hand-maintained, so the tests here are about the one
// failure mode a hand-maintained public claim has: a number that outlives the
// date attached to it, or a missing figure that renders as zero.

import { describe, it, expect } from "vitest";
import { EXTENSION_LISTINGS, totalReportedUsers, reportedAsOf } from "../lib/extensionInstalls";

describe("extension listings", () => {
  it("pairs every reported figure with the date it was read", () => {
    // The pairing is the whole claim. A count without a date is a statement
    // about today no matter when it was actually read, which is the way this
    // file goes wrong silently.
    for (const listing of EXTENSION_LISTINGS) {
      if (typeof listing.users === "number") {
        expect(listing.asOf, `${listing.store} reports a count with no asOf date`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      }
    }
  });

  it("explains every store that will not render a figure", () => {
    // A blank cell invites the reader to supply their own reason, and the most
    // available one is "nobody uses it". Each absence says why it is absent.
    //
    // The condition matches what the about page actually branches on — a count
    // WITH a date — rather than just `users === null`. A listing with a count
    // and no date takes the same fallback path, so testing the narrower
    // condition left exactly one shape that rendered empty.
    for (const listing of EXTENSION_LISTINGS) {
      const willRenderFigure = typeof listing.users === "number" && listing.asOf !== null;
      if (!willRenderFigure) {
        expect(listing.note, `${listing.store} shows no count and no explanation`).toBeTruthy();
      }
    }
  });

  it("never reports a negative or fractional user count", () => {
    for (const listing of EXTENSION_LISTINGS) {
      if (typeof listing.users === "number") {
        expect(Number.isInteger(listing.users), `${listing.store}`).toBe(true);
        expect(listing.users).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("dates a figure no later than today", () => {
    // A future date means someone typed the wrong year, and it would make a
    // stale figure look fresher than anything else on the page.
    const today = new Date().toISOString().slice(0, 10);
    for (const listing of EXTENSION_LISTINGS) {
      if (listing.asOf) expect(listing.asOf <= today, `${listing.store} is dated ahead`).toBe(true);
    }
  });

  it("gives every published listing an https URL", () => {
    for (const listing of EXTENSION_LISTINGS) {
      if (listing.url !== null) expect(listing.url).toMatch(/^https:\/\//);
    }
  });

  it("distinguishes 'no figure' from zero", () => {
    // The distinction this module exists to preserve. With nothing reported the
    // total is null, so a caller cannot render "0 users".
    const total = totalReportedUsers();
    const anyReported = EXTENSION_LISTINGS.some((l) => typeof l.users === "number");
    if (!anyReported) {
      expect(total).toBeNull();
      expect(reportedAsOf()).toBeNull();
    } else {
      expect(total).not.toBeNull();
    }
  });

  it("dates the total by its stalest component", () => {
    // A total is only as current as the oldest figure inside it.
    const dates = EXTENSION_LISTINGS.filter((l) => typeof l.users === "number" && l.asOf).map(
      (l) => l.asOf as string,
    );
    if (dates.length > 0) {
      expect(reportedAsOf()).toBe([...dates].sort()[0]);
    }
  });

  it("holds one entry per store", () => {
    // Chrome and Edge were one entry while nothing but branding separated them.
    // They are two now because their availability differs — submitted to the
    // Chrome Web Store, not to Edge Add-ons — and one entry cannot report
    // "published" and "not published" at once. What must stay true is that a
    // store appears once, so no dashboard is double-counted into the totals.
    const stores = EXTENSION_LISTINGS.map((l) => l.store);
    expect(new Set(stores).size).toBe(stores.length);
  });

  it("reports a user figure only where the extension is actually listed", () => {
    // An unsubmitted store has no dashboard to read, so a count on one would be
    // invented rather than observed.
    for (const l of EXTENSION_LISTINGS) {
      if (!l.url) expect(l.users, `${l.store} is unpublished`).toBeNull();
    }
  });
});
