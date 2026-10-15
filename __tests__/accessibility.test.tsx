// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

// Item 10 steps 1–2: the automated accessibility baseline plus the keyboard
// contract for the email guide's tabs.
//
// Runs axe over the surfaces a targeted user must get through — paste →
// verdict, the report form, and the navigation around them — and fails on
// serious/critical violations only. Moderate/minor findings (landmarks,
// heading order across a full page, colour contrast, which jsdom cannot
// compute anyway) are reported by hand in step 2, not asserted here: an
// isolated component render has no <main> and no page heading, so asserting
// on those would fail every component for not being a page.
//
// Runs in jsdom via the @vitest-environment pragma above; everything else in
// this suite stays on node. next/link and next/navigation are stubbed
// to plain anchors and a fixed path — the point here is the markup's ARIA
// contract, not the router.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import axe from "axe-core";
import type { ReactElement } from "react";

// next/link is a client component around an anchor; for an axe pass the
// anchor is the contract (href + name + focusability).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : "/"} {...rest}>
      {children}
    </a>
  ),
}));

// The header and tab bar read the current path to set aria-current. Fixed at
// "/" so the assertions are about the markup shape, not the router.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import ExternalLink from "@/components/ExternalLink";
import CheckRegionPicker from "@/components/CheckRegionPicker";
import CoverageNotice from "@/components/CoverageNotice";
import VerdictBadge from "@/components/VerdictBadge";
import ReportForm from "@/components/ReportForm";
import SiteHeader from "@/components/SiteHeader";
import MobileTabBar from "@/components/MobileTabBar";
import EmailExportGuide from "@/components/EmailExportGuide";
import InstallTabs from "@/components/InstallTabs";
import type { CheckResult } from "@veriguard/detect/scamDetector";

// jsdom has no matchMedia; several components read it (camera offer,
// reduced-motion guards). A fixed "no" keeps renders deterministic without
// touching what axe reads.
function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom has no canvas, and axe's label-content-name-mismatch rule reaches for
// one on every text node it reads: it calls visibleVirtual with
// ignoreIconLigature hardcoded true, which rasterises the first character to
// decide whether the text is an icon font's ligature and should be ignored as
// decorative. Without a 2d context jsdom throws "Not implemented", printing a
// stack trace on a passing run — noise that trains a reader to skip stack
// traces in test output.
//
// That rule is impact: "serious", so it is inside this suite's gate. Disabling
// it to silence the trace would widen what passes, and so would a lazy stub:
// the ligature path treats a zero-width glyph, or two draws that rasterise
// identically, AS a ligature and drops the text — and visibleVirtual returning
// "" makes the rule pass unconditionally. Every assertion about a visible
// label matching its accessible name would then hold vacuously.
//
// So the stub answers the way an ordinary, non-ligature glyph would: a
// non-zero advance width per character, and pixel data that differs between
// the first-character draw and the full-string draw. isIconLigature returns
// false, the text stays visible to the rule, and the rule keeps deciding.
function stubCanvas() {
  // One draw's worth of state: fillText records what was asked for, and
  // getImageData answers from that, so the two comparison draws differ.
  let drawn = "";
  const context = {
    canvas: { width: 0, height: 0 },
    font: "",
    textAlign: "",
    textBaseline: "",
    // 10px per character: non-zero, and linear so that the rule's
    // expectedWidth (sum of per-character widths) matches its actualWidth
    // (the whole string) — a size difference of 0, as a real proportional
    // font without ligatures gives.
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string) => {
      drawn = text;
    },
    clearRect: () => {
      drawn = "";
    },
    // A deterministic pattern seeded by what was drawn, so the first
    // character and the full string produce different buffers and the rule
    // sees a pixel difference below its threshold rather than a blank canvas
    // (which it reads as a ligature).
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(
        Math.max(1, Math.ceil(w) * Math.ceil(h) * 4),
      );
      for (let i = 0; i < data.length; i++) {
        data[i] = drawn.length === 0 ? 0 : (drawn.charCodeAt(i % drawn.length) + i) % 256;
      }
      return { data };
    },
  };
  Object.defineProperty(window.HTMLCanvasElement.prototype, "getContext", {
    writable: true,
    configurable: true,
    value: vi.fn(() => context),
  });
}

// ReportForm fetches a form token and a report count on mount. Swallowed by
// its own .catch, but a stub keeps the test output quiet and the run hermetic.
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalReports: 0 }),
    }),
  );
}

beforeEach(() => {
  stubMatchMedia();
  stubFetch();
  stubCanvas();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Render ui, run axe over the mounted DOM, and fail on serious/critical
 * violations. Returns violations and incompletes for tests that also want to
 * pin a lesser finding the gate alone would not catch.
 */
async function expectNoSeriousOrCritical(ui: ReactElement, label: string) {
  render(ui);
  // axe works on the document, not the container: render mounts into
  // document.body, so scope the run there.
  const { violations, incomplete } = await axe.run(document.body, {
    // Colour contrast needs computed styles and layout; jsdom provides
    // neither, so the rule can only guess. It is covered by the manual pass
    // (step 2) against a real browser instead.
    resultTypes: ["violations", "incomplete"],
    rules: { "color-contrast": { enabled: false } },
  });
  const blocking = violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (blocking.length > 0) {
    const detail = blocking
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.help}\n` +
          v.nodes
            .map((n) => `  - ${n.html.slice(0, 160)}\n    ${n.failureSummary}`)
            .join("\n"),
      )
      .join("\n");
    expect(
      blocking,
      `${label} has serious/critical axe violations:\n${detail}`,
    ).toEqual([]);
  }
  return { violations, incomplete };
}

function verdictResult(
  verdict: CheckResult["verdict"],
): CheckResult {
  return {
    verdict,
    score: verdict === "likely_scam" ? 78 : verdict === "suspicious" ? 32 : 5,
    signals:
      verdict === "safe" || verdict === "unknown"
        ? []
        : [
            {
              text: "Urgent payment request with a deadline",
              points: 30,
              source: "message",
            },
          ],
    details: "",
  } as CheckResult;
}

describe("accessibility baseline (axe, serious/critical)", () => {
  it("finds the surfaces to check", () => {
    // Guards against the suite silently covering nothing: every case below
    // renders one of these, so an import that stops resolving must fail here
    // rather than as nine identical render errors.
    for (const c of [
      ExternalLink,
      CheckRegionPicker,
      CoverageNotice,
      VerdictBadge,
      ReportForm,
      SiteHeader,
      MobileTabBar,
      EmailExportGuide,
      InstallTabs,
    ]) {
      expect(c, "a checked component failed to import").toBeTruthy();
    }
  });

  it("passes an external link", async () => {
    await expectNoSeriousOrCritical(
      <ExternalLink href="https://example.com">Example</ExternalLink>,
      "ExternalLink",
    );
  });

  it("passes the region picker", async () => {
    await expectNoSeriousOrCritical(
      <CheckRegionPicker id="a11y-region" value={null} onChange={() => {}} />,
      "CheckRegionPicker",
    );
  });

  it("passes the coverage notice", async () => {
    await expectNoSeriousOrCritical(
      <CoverageNotice coverage="partial" />,
      "CoverageNotice",
    );
  });

  for (const verdict of [
    "safe",
    "suspicious",
    "likely_scam",
    "unknown",
  ] as const) {
    it(`passes a ${verdict} verdict sheet`, async () => {
      // The meter, the evidence weights, the tactics list and the action
      // steps all render here; the unknown/safe variants cover the empty
      // signals branch.
      await expectNoSeriousOrCritical(
        <VerdictBadge result={verdictResult(verdict)} region="AU" />,
        `VerdictBadge (${verdict})`,
      );
    });
  }

  it("passes the report form", async () => {
    // Known axe noise, pinned here so it is not "fixed" into something worse:
    // axe reports form-field-multiple-labels on the type picker's native
    // radios, which pair one wrapping <label> with a fieldset+legend. That is
    // the recommended pattern, and a minimal repro of two wrapped radios
    // without any of this form's code produces the same finding — so the
    // markup stays and the gate stays at serious/critical, which this is not.
    await expectNoSeriousOrCritical(<ReportForm />, "ReportForm");
  });

  it("passes the email guide tabs", async () => {
    const { violations, incomplete } = await expectNoSeriousOrCritical(
      <EmailExportGuide />,
      "EmailExportGuide",
    );
    // The panel used to carry role="tabpanel" on the <ol> itself, which is
    // not an allowed role for a list. Fixed by wrapping the list in a plain
    // div holding the role; this pins it at the rule that found it (minor, so
    // the gate above would not catch a regression on its own).
    const roleFindings = [...violations, ...incomplete].filter(
      (v) => v.id === "aria-allowed-role",
    );
    expect(
      roleFindings,
      "EmailExportGuide reintroduced a disallowed ARIA role",
    ).toEqual([]);
  });

  it("passes the install tabs", async () => {
    // The reference tab pattern on this page (arrow keys + roving tabindex),
    // which the email guide now matches — see the keyboard suite below.
    await expectNoSeriousOrCritical(
      <InstallTabs pkg="@veriguard/detect" label="Install" />,
      "InstallTabs",
    );
  });

  it("passes the email guide's always-open variant", async () => {
    // The Learn page renders the guide without its <details> wrapper. The
    // tab markup is identical, but the axe case above only ever mounted the
    // collapsed variant — if the two wrappers diverge, this is what notices.
    await expectNoSeriousOrCritical(
      <EmailExportGuide expandable={false} />,
      "EmailExportGuide (open)",
    );
  });

  it("passes the site header", async () => {
    await expectNoSeriousOrCritical(<SiteHeader />, "SiteHeader");
  });

  it("passes the mobile tab bar", async () => {
    await expectNoSeriousOrCritical(<MobileTabBar />, "MobileTabBar");
  });

  it("still catches a visible label missing from its accessible name", async () => {
    // Guards stubCanvas, not a component. The canvas stub exists to keep
    // axe's label-content-name-mismatch rule working under jsdom, and the
    // ways it could go wrong all make the rule pass rather than fail: a
    // zero-width glyph, or two draws that rasterise alike, read as an icon
    // ligature, the visible text is dropped as decorative, and the rule
    // returns true for everything. Nothing above would notice — the suite
    // asserts an empty violation list, which is what a dead rule produces.
    //
    // So this feeds it a button whose aria-label omits its visible text,
    // which is the violation the rule is for, and requires it to be found.
    // If the stub ever starts reporting ligatures, this fails.
    render(
      <button type="button" aria-label="Submit">
        Send report
      </button>,
    );
    const { violations } = await axe.run(document.body, {
      runOnly: { type: "rule", values: ["label-content-name-mismatch"] },
    });
    expect(
      violations.map((v) => v.id),
      "the canvas stub has disabled label-content-name-mismatch: axe is " +
        "reading visible text as an icon ligature and ignoring it",
    ).toEqual(["label-content-name-mismatch"]);
  });
});

describe("email guide tabs follow the ARIA tabs pattern with the keyboard", () => {
  // Item 10 step 2: the guide's tabs were three plain buttons — every client
  // in the tab order, no arrow-key movement, and aria-controls pointing at
  // panels that were not in the document until selected. These pin the fixed
  // behaviour (automatic activation + roving tabindex, as the install tabs do)
  // rather than the axe gate above, which cannot see keyboard handling.
  function getTabs() {
    const { container } = render(<EmailExportGuide />);
    const list = container.querySelectorAll('[role="tab"]');
    expect(list.length, "the guide renders one tab per mail client").toBe(3);
    return [...list] as HTMLElement[];
  }

  it("keeps only the selected tab in the tab order", () => {
    const [apple, gmail, outlook] = getTabs();
    expect(apple.tabIndex).toBe(0);
    expect(gmail.tabIndex).toBe(-1);
    expect(outlook.tabIndex).toBe(-1);
    expect(apple.getAttribute("aria-selected")).toBe("true");
  });

  it("moves selection and focus with the arrow keys, wrapping at the ends", () => {
    const [apple, gmail, outlook] = getTabs();
    apple.focus();
    fireEvent.keyDown(apple, { key: "ArrowRight" });
    expect(gmail.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(gmail);
    expect(apple.tabIndex).toBe(-1);
    expect(gmail.tabIndex).toBe(0);

    fireEvent.keyDown(gmail, { key: "ArrowRight" });
    expect(outlook.getAttribute("aria-selected")).toBe("true");

    // Wraps past the last tab back to the first.
    fireEvent.keyDown(outlook, { key: "ArrowRight" });
    expect(apple.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(apple);

    // And backwards.
    fireEvent.keyDown(apple, { key: "ArrowLeft" });
    expect(outlook.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(outlook);
  });

  it("leaves other keys alone", () => {
    const [apple] = getTabs();
    apple.focus();
    fireEvent.keyDown(apple, { key: "Enter" });
    expect(apple.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(apple);
  });

  it("resolves every tab's controls to a panel in the document", () => {
    // Inactive panels stay mounted and hidden rather than unmounting, so a
    // tab never controls an id that is not there.
    const listed = getTabs();
    for (const tab of listed) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel, `${tab.textContent} controls a mounted panel`).not.toBeNull();
      expect(panel!.getAttribute("role")).toBe("tabpanel");
    }
    const visible = listed.filter(
      (tab) =>
        !(
          document.getElementById(
            tab.getAttribute("aria-controls")!,
          ) as HTMLElement
        ).hidden,
    );
    expect(visible.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
    ]);
  });

  it("gives every tab an explicit focus ring on both tab strips", () => {
    // Roving tabindex makes the focused tab the only tab stop, so the
    // browser default is not enough to point at it. Both strips carry the
    // same ring as ExternalLink; this pins the classes rather than the
    // pixels, since jsdom cannot evaluate :focus-visible.
    for (const tab of getTabs()) {
      expect(tab.className, "guide tab has no focus ring").toMatch(
        /focus-visible:outline-2/,
      );
    }
    cleanup();
    const { container } = render(
      <InstallTabs pkg="@veriguard/detect" label="Install" />,
    );
    const installTabs = [...container.querySelectorAll('[role="tab"]')];
    expect(installTabs.length).toBeGreaterThan(0);
    for (const tab of installTabs) {
      expect(
        (tab as HTMLElement).className,
        "install tab has no focus ring",
      ).toMatch(/focus-visible:outline-2/);
    }
  });
});
