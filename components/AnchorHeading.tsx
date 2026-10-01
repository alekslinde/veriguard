"use client";

// A heading that can be linked to, and whose link can be copied.
//
// Documentation gets read in pieces and quoted in support threads, so the
// useful unit is a section rather than a page. Without anchors, pointing
// someone at "the coverage caveat" means telling them to scroll.
//
// Two affordances, because people reach for different ones:
//
//   · Click the ¶ — navigates, so the URL bar now holds the deep link and the
//     browser's own copy affordances work. This is what a reader expects from
//     a heading link and it needs no explanation.
//   · Copy the link — writes the absolute URL to the clipboard directly, which
//     is what someone pasting into a chat actually wants and what a plain
//     anchor cannot do.
//
// The copy button follows CodeBlock's pattern: it attempts the clipboard and
// stays quiet on failure, because the anchor beside it still works. A button
// reporting an error the reader cannot act on is worse than one that silently
// does nothing while the fallback stays obvious.
//
// `scroll-mt` matters more than it looks: the site header is sticky, so a
// heading scrolled to by fragment lands underneath it and the reader sees the
// paragraph below a title they cannot read.

import { useState } from "react";
import { useLang } from "@/lib/lang";

export default function AnchorHeading({
  id,
  children,
  level = 2,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  /** 2 or 3. Headings carry document structure, so the level is explicit. */
  level?: 2 | 3;
  className?: string;
}) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      // Built at click time, not render: a URL composed during SSR would carry
      // whatever origin the build ran under, and this has to work on a preview
      // deployment and localhost as well as production.
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // See the note above: the ¶ anchor remains, so this is recoverable.
    }
  }

  const Tag = level === 2 ? "h2" : "h3";

  return (
    // `group` drives the hover reveal below. The controls are always in the DOM
    // and always reachable by keyboard — hover only changes their opacity, so
    // this is a visual refinement rather than a gate on the functionality.
    <Tag id={id} className={`group scroll-mt-24 flex items-center gap-2 ${className}`}>
      {children}
      <a
        href={`#${id}`}
        // Opacity rather than `hidden`: a focusable element that is display:none
        // cannot receive focus, so keyboard users would lose the anchor
        // entirely. focus-visible brings it back for them.
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--text-dim)] hover:text-[var(--clear)] transition-opacity text-[14px] font-normal no-underline"
        aria-label={`${t("docs.anchor.link")}: ${id}`}
      >
        ¶
      </a>
      <button
        type="button"
        onClick={copyLink}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded-md border border-[var(--rule)] bg-[var(--ink-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-all"
        aria-label={`${t("docs.anchor.copy")}: ${id}`}
      >
        {copied ? t("npm.copied") : t("docs.anchor.copy")}
      </button>
    </Tag>
  );
}
