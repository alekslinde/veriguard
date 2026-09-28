"use client";

// A code sample with a copy button.
//
// The copy button follows ForwardPanel's pattern: it attempts the clipboard and
// stays quiet on failure, because the code is rendered as selectable text
// beside it and there is still a way through without it. A button that reports
// an error the reader cannot act on is worse than one that silently does
// nothing while the fallback remains obvious.

import { useState } from "react";
import { useLang } from "@/lib/lang";

export default function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // See the note above: the sample is selectable, so this is recoverable
      // by the reader without being told.
    }
  }

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--ink)] overflow-hidden">
      {/* The button sits in its own row rather than floating over the code.
          Absolutely positioned, it covered the first line's text as soon as the
          sample scrolled horizontally — which on a phone is immediately, and
          the covered line is the import. A row costs ~28px and never hides
          anything. */}
      <div className="flex justify-end border-b border-[var(--rule)] px-2 py-1.5">
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-[var(--rule)] bg-[var(--ink-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
          aria-label={label ? `${t("npm.copy")} ${label}` : t("npm.copy")}
        >
          {copied ? t("npm.copied") : t("npm.copy")}
        </button>
      </div>
      {/* `overflow-x-auto` rather than wrapping: a wrapped shell command or
          import line reads as two commands, and the horizontal scroll keeps
          each statement on the line it belongs to. */}
      <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed">
        <code className="font-[family-name:var(--font-mono-ui)] text-[var(--foreground)]">
          {code}
        </code>
      </pre>
    </div>
  );
}
