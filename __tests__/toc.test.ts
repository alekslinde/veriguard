// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { activeSectionId, type SectionTop } from "@/lib/toc";

// barHeight 52 mirrors the Learn bar; the helper adds an 8px anti-flicker margin,
// so the effective threshold in these cases is 60.
const opts = (atBottom = false) => ({ barHeight: 52, atBottom });

describe("activeSectionId", () => {
  it("returns null for an empty list", () => {
    expect(activeSectionId([], opts())).toBeNull();
  });

  it("returns the first section when nothing has scrolled past the bar", () => {
    // At the top of the page every section sits below the bar; the first is the
    // sensible default rather than no highlight at all.
    const sections: SectionTop[] = [
      { id: "a", top: 300 },
      { id: "b", top: 900 },
    ];
    expect(activeSectionId(sections, opts())).toBe("a");
  });

  it("returns the last section whose top has reached the bar", () => {
    const sections: SectionTop[] = [
      { id: "a", top: -400 },
      { id: "b", top: -100 },
      { id: "c", top: 30 }, // 30 <= 60, reached
      { id: "d", top: 500 }, // still below the bar
    ];
    expect(activeSectionId(sections, opts())).toBe("c");
  });

  it("treats a section exactly at the epsilon boundary as reached", () => {
    // 60 == barHeight(52) + epsilon(8): inclusive, so it wins over the next one.
    const sections: SectionTop[] = [
      { id: "a", top: 60 },
      { id: "b", top: 61 },
    ];
    expect(activeSectionId(sections, opts())).toBe("a");
  });

  it("stops at the first section still below the bar (document order)", () => {
    // Guards the early break: a later section being on-screen must not override an
    // earlier one that hasn't been passed yet.
    const sections: SectionTop[] = [
      { id: "a", top: -50 }, // reached
      { id: "b", top: 500 }, // not reached -> ends the scan
      { id: "c", top: 10 }, // on screen, but out of order; ignored
    ];
    expect(activeSectionId(sections, opts())).toBe("a");
  });

  it("prefers the final section once the page is scrolled to the bottom", () => {
    // A short last section may never reach the bar; atBottom wins regardless.
    const sections: SectionTop[] = [
      { id: "a", top: -900 },
      { id: "b", top: -600 },
      { id: "last", top: 700 },
    ];
    expect(activeSectionId(sections, opts(true))).toBe("last");
  });

  it("handles a single section", () => {
    expect(activeSectionId([{ id: "only", top: -10 }], opts())).toBe("only");
    expect(activeSectionId([{ id: "only", top: 999 }], opts())).toBe("only");
  });
});
