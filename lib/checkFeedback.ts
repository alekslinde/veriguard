// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The state a check run shows the reader, as a pure transition function.
 *
 * Extracted from CheckFlow because these transitions are where the bugs were,
 * and none of them were reachable by a test while they lived as scattered
 * setState calls: the earlier suite asserted on the component's source text,
 * which pins syntax rather than behaviour and passed happily with three
 * lifecycle bugs present.
 *
 * What is modelled here is deliberately narrow — the feedback surfaces, not the
 * check. Whether a fetch succeeded belongs to CheckFlow; what the reader is
 * told about it belongs here, because that is the part with a history of being
 * wrong in ways nobody could see.
 *
 * The invariants worth stating, since each one is a bug that shipped:
 *
 *  · A re-check runs on the result step, where the pipeline panel and the
 *    error block are both off screen. Its feedback goes to its own surface, and
 *    a failure there must never be silent — silence reads as "your correction
 *    applied" when the opposite happened.
 *  · A re-check error describes the verdict currently on screen. Any new check
 *    replaces that verdict, so the message must not outlive it.
 *  · Both paths are "busy": it is what disables the submit and upload controls,
 *    and a re-check that left them live could be raced by a second request.
 *  · A banner describing what an image read put in the box must not survive
 *    anything that replaces the box's contents.
 */

/** Which surface is narrating, and what it is saying. */
export interface CheckFeedback {
  /** Progress of a re-check, shown inside the coverage notice. */
  recheck:
    | { state: "idle" }
    | { state: "loading"; region: string }
    | { state: "done"; region: string }
    | { state: "error"; kind: "rate_limited" | "server" };
  /** The input step's error block. Null when there is nothing to report. */
  checkError: "rate_limited" | "server" | null;
  /** The image-read handover banner, held until the reader settles it. */
  imageRead: "qr" | "ocr" | null;
  /** Gates the submit and upload controls. True for either kind of run. */
  busy: boolean;
}

export const INITIAL_FEEDBACK: CheckFeedback = {
  recheck: { state: "idle" },
  checkError: null,
  imageRead: null,
  busy: false,
};

export type CheckEvent =
  /** A check started. `region` is present only for a re-check. */
  | { type: "check-started"; region?: string }
  | { type: "check-succeeded"; region?: string }
  | { type: "check-failed"; region?: string; kind: "rate_limited" | "server" }
  /** An image read produced text and put it in the box. */
  | { type: "image-read"; via: "qr" | "ocr" }
  /** Anything that replaces what is in the box: typing, or a .eml upload. */
  | { type: "content-replaced" };

export function checkFeedback(prev: CheckFeedback, event: CheckEvent): CheckFeedback {
  switch (event.type) {
    case "check-started": {
      const isRecheck = !!event.region;
      return {
        ...prev,
        // Both paths, so the controls lock either way.
        busy: true,
        // The box is about to be scored; the banner asking for that has served
        // its purpose.
        imageRead: null,
        recheck: isRecheck ? { state: "loading", region: event.region! } : { state: "idle" },
        // A first check replaces the verdict a re-check error was talking
        // about, so that message cannot be allowed to outlive it.
        checkError: isRecheck ? prev.checkError : null,
      };
    }

    case "check-succeeded": {
      const isRecheck = !!event.region;
      return {
        ...prev,
        busy: false,
        // Said rather than merely stopped: the verdict is swapped underneath
        // the reader with no navigation, which a screen-reader user cannot see
        // happen. Emptying the live region instead announces nothing.
        recheck: isRecheck ? { state: "done", region: event.region! } : { state: "idle" },
        checkError: null,
      };
    }

    case "check-failed": {
      const isRecheck = !!event.region;
      return {
        ...prev,
        busy: false,
        // Reported next to the control that caused it, on the step the reader
        // is actually looking at.
        recheck: isRecheck ? { state: "error", kind: event.kind } : { state: "idle" },
        checkError: isRecheck ? null : event.kind,
      };
    }

    case "image-read":
      return { ...prev, imageRead: event.via };

    case "content-replaced":
      // Typing, or dropping a .eml over it. Either way the banner no longer
      // describes what is in the box.
      return { ...prev, imageRead: null };
  }
}
