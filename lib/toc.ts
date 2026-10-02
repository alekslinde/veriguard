// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Table-of-contents helpers — the pure logic behind the Learn page's sticky
// index, extracted so it can be unit-tested in node without a DOM.
//
// The component still owns everything that needs the browser (reading each
// section's getBoundingClientRect().top, the scroll/resize listeners, setting
// state). What lives here is the decision those inputs feed: given where each
// section currently sits, which one is "active". That decision is where the
// off-by-one and ordering bugs hide, and it needs nothing but numbers.

/** A section and the viewport-relative top of its heading, in px. */
export interface SectionTop {
  id: string;
  /** getBoundingClientRect().top for the section. */
  top: number;
}

// Anti-flicker margin, in px. A section counts as reached once its top is within
// this distance of the bar's bottom edge, so a heading resting a pixel under the
// bar doesn't flip the active link on and off as the page settles.
const ACTIVE_EPSILON_PX = 8;

/**
 * Which section the reader is currently in: the last one whose top has scrolled
 * up to (or just past) the bottom of the sticky bar.
 *
 * `sections` must be in document order — the same order the bar renders — because
 * the scan stops at the first section still below the bar. A scroll-position
 * comparison rather than IntersectionObserver: the answer we want is exactly a
 * top-edge test, and the sections are collapsible, so their heights change under
 * an observer's feet.
 *
 * `atBottom` is the page-scrolled-to-the-end signal. The final section can be too
 * short to ever reach the bar, so once the reader is at the bottom we prefer it
 * rather than leaving its link dark while they're plainly looking at it.
 *
 * Returns null only for an empty list, so a caller can leave the current
 * highlight untouched rather than clearing it.
 */
export function activeSectionId(
  sections: readonly SectionTop[],
  opts: { barHeight: number; atBottom: boolean },
): string | null {
  if (sections.length === 0) return null;
  if (opts.atBottom) return sections[sections.length - 1].id;

  const threshold = opts.barHeight + ACTIVE_EPSILON_PX;
  let current = sections[0].id;
  for (const section of sections) {
    if (section.top <= threshold) current = section.id;
    else break;
  }
  return current;
}
