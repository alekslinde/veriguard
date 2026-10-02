// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildShareContent, parseSharePayload } from "@/lib/sharePrefill";
import CheckStage from "./CheckStage";

/**
 * Thin client wrapper for the share target: reads the shared payload out of the
 * query string and seeds the normal check flow with it.
 *
 * Kept separate from app/share/page.tsx so the page stays a server component
 * and only this (Suspense-wrapped) subtree opts into useSearchParams — the same
 * split ReportPrefillForm uses.
 *
 * The payload is untrusted input like any other: `buildShareContent` bounds its
 * length, and it is only ever placed in the check box, never executed, never
 * rendered as markup, and never sent anywhere the typed path would not send it.
 */
export default function ShareTargetSeed() {
  const params = useSearchParams();

  // Read once, on mount. The URL is rewritten immediately below, so re-reading
  // on a later render would return an empty payload and blank the box.
  const [seed] = useState(() => buildShareContent(parseSharePayload(params)));

  useEffect(() => {
    // Strip the shared content out of the address bar.
    //
    // Whatever someone shares here is, by definition, something they think may
    // be a scam — and it lands in a URL. Left alone that URL sits in browser
    // history, in the tab title, in any screenshot of the address bar, and in
    // whatever a shared/synced browser session carries to the person's other
    // devices. replaceState (not push) drops it without adding a history entry,
    // so Back still leaves the app rather than restoring the payload.
    //
    // The seed is already in React state by this point, so the box keeps its
    // content across the rewrite.
    window.history.replaceState(window.history.state, "", "/share");
  }, []);

  // CheckStage rather than CheckFlow directly: the collapsing fold and the
  // "Checked … / Edit & check again" strip are the stage's, and a share-sheet
  // reader needs the way back to the box exactly as much as a pasting one.
  // No ways-in rows here — arriving via the share sheet is already a choice
  // about how to get content in, so offering other routes is noise.
  return (
    <CheckStage initialContent={seed.content} surface="share">
      {seed.truncated && (
        <p
          role="status"
          className="text-sm text-[var(--caution)] bg-[var(--caution)]/10 border border-[var(--caution)]/30 rounded-xl px-4 py-3"
        >
          That message was too long to check in full, so the end of it was cut.
          Check anything that&apos;s missing separately — scam links often sit at
          the bottom of a long email.
        </p>
      )}
    </CheckStage>
  );
}
