// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enMessages from "@/messages/en.json";

/**
 * "On your device" is the extension's claim, not the website's.
 *
 * The WebExtension bundles the engine and scores locally — nothing it checks
 * is sent anywhere, which is what lets its four store listings disclose no
 * data collection. The WEBSITE POSTs the content to /api/check. Both are
 * honest; they are different, and the difference is the whole basis of the
 * extension's listing.
 *
 * Restating the extension's property as a property of the product is therefore
 * not a copy nit. It is a false statement about where someone's message goes,
 * made by the tool that exists to help them judge such statements — and it has
 * happened three times: the home caption, the About page's opening sentence
 * (the canonical record of what we store), and the install blurb, which
 * described a PWA of the website as running checks on-device.
 *
 * This guards the general shape rather than those three strings. A surface
 * that genuinely IS local says so freely; what it may not do is claim the
 * website scores locally.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const messages = enMessages as Record<string, string>;

/** Phrases that assert the reader's own machine did the work. */
const ON_DEVICE = /\b(on|to|from) your (own )?device\b|\bnever leaves your (own )?device\b|\bon your own machine\b/i;

describe("web-surface copy does not claim on-device scoring", () => {
  // Keys rendered on the website outside the genuinely-local stages. The
  // check flow's own stage copy is excluded deliberately and asserted below:
  // it has a state machine for exactly this and is allowed to say "on your
  // device" while the work really is local.
  const WEB_KEYS = ["home.privacy", "install.blurb", "install.title", "footer.scope"];

  for (const key of WEB_KEYS) {
    it(`${key} makes no on-device claim`, () => {
      const copy = messages[key];
      if (!copy) return; // key retired; nothing to assert
      expect(copy, `${key}: ${copy}`).not.toMatch(ON_DEVICE);
    });
  }

  it("the About page's lede does not claim it either", () => {
    // This page is the canonical record of what we store. An over-claim in its
    // opening sentence discredits every accurate statement beneath it.
    const about = read("app/about/page.tsx");
    const lede = about.match(/lede="([^"]+)"/)?.[1] ?? "";
    expect(lede).toBeTruthy();
    expect(lede, lede).not.toMatch(ON_DEVICE);
  });
});

describe("the surfaces that are genuinely local may still say so", () => {
  it("keeps the extension's claim, where it is true", () => {
    // The engine ships inside the extension; there is no server call to score.
    // This is the claim the store listings rest on and it must not be softened
    // by a blanket rule aimed at the website.
    expect(messages["ways.ext.detail"]).toMatch(/nothing you check is sent anywhere/i);
    expect(read("app/about/page.tsx")).toMatch(/what you check never leaves your device/i);
  });

  it("keeps the check flow's per-stage claim", () => {
    // CheckFlow derives its claim per stage, because the paste path crosses
    // the line mid-run: the local pass happens in the browser and scoring
    // POSTs the content. Saying "on your device" during the local pass is
    // correct; the machine is what keeps it correct.
    const flow = read("components/CheckFlow.tsx");
    expect(flow).toMatch(/export function privacyClaimFor/);
    expect(flow).toMatch(/"sending":\s*\["check\.stage\.sending"/);
  });
});
