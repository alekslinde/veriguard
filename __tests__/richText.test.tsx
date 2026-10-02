// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { bold } from "@/lib/richText";

// Narrow a bold() result to the array form and hand back its segments. bold()
// returns a plain string when there's nothing to emphasise, so array-ness is
// itself part of the contract worth asserting.
function segments(node: ReactNode): unknown[] {
  expect(Array.isArray(node)).toBe(true);
  return node as unknown[];
}

// Assert a segment is a <strong> and return its text, so the emphasis assertions
// read as one line each below.
function strongText(seg: unknown): ReactNode {
  expect(isValidElement(seg)).toBe(true);
  const el = seg as ReactElement<{ children: ReactNode; className: string }>;
  expect(el.type).toBe("strong");
  expect(el.props.className).toContain("text-[var(--foreground)]");
  return el.props.children;
}

describe("bold", () => {
  it("returns the raw string when there are no markers", () => {
    expect(bold("plain text")).toBe("plain text");
  });

  it("returns the empty string unchanged", () => {
    expect(bold("")).toBe("");
  });

  it("returns the raw string when the markers are unbalanced", () => {
    // "a **b" splits into two parts (< 3), so nothing is emphasised — the stray
    // ** stays literal rather than swallowing the rest of the line.
    expect(bold("a **b")).toBe("a **b");
  });

  it("wraps a single **pair** in a <strong>, keeping the surrounding text", () => {
    const parts = segments(bold("say **hello** now"));
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("say ");
    expect(strongText(parts[1])).toBe("hello");
    expect(parts[2]).toBe(" now");
  });

  it("emphasises every pair when there are several", () => {
    const parts = segments(bold("**a** and **b**"));
    // ["", strong(a), " and ", strong(b), ""]
    expect(parts).toHaveLength(5);
    expect(strongText(parts[1])).toBe("a");
    expect(parts[2]).toBe(" and ");
    expect(strongText(parts[3])).toBe("b");
  });

  it("handles emphasis at the very start and end", () => {
    const parts = segments(bold("**x**"));
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("");
    expect(strongText(parts[1])).toBe("x");
    expect(parts[2]).toBe("");
  });
});
