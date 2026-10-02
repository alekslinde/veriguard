// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from "react";

// Renders a translated string with **bold** markers as <strong> elements, so
// message dictionaries can stay plain JSON while keeping emphasis. Anything
// outside well-formed ** pairs renders as-is.
export function bold(text: string): ReactNode {
  const parts = text.split("**");
  if (parts.length < 3) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-[var(--foreground)]">{part}</strong>
    ) : (
      part
    ),
  );
}

// Same **marker** convention, but the emphasis is the accent colour rather than
// weight. Used where a single word carries the promise and should be seen
// before the sentence is read — the home headline's "exactly".
export function accent(text: string): ReactNode {
  const parts = text.split("**");
  if (parts.length < 3) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} className="not-italic text-[var(--clear)]">{part}</em>
    ) : (
      part
    ),
  );
}
