"use client";

// Reveal collapsed content when its anchor is navigated to.
//
// A jump link to a closed <details> scrolls to a bare summary row and hides the
// content it promised, which is the one thing a deep link must not do. Two
// cases are handled: the target *is* a disclosure (a table-of-contents entry),
// or the target wraps some (the check flow deep-links to a <section> holding
// three of them).
//
// Here rather than inline in the Learn page because it is page-agnostic and the
// app keeps adding disclosures — every one of them is a potential anchor, and
// the fix for a closed target belongs in one place rather than being rewritten
// slightly differently the second time it is needed.

import { useEffect } from "react";

/**
 * Opens the <details> named by the current hash, and any nested inside it.
 *
 * Runs on mount and on every in-page hash change. An anchor that names no
 * disclosure is left alone, so this is safe to mount on a page where only some
 * targets are collapsible.
 *
 * `hashchange` does not fire when the hash is unchanged, which is why the
 * element is also opened on mount: arriving with the hash already in the URL
 * (a shared link, a reload, a cross-page jump) never produces an event.
 */
export function useOpenOnHash(): void {
  useEffect(() => {
    const openTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.querySelectorAll("details").forEach((d) => {
        d.open = true;
      });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);
}
