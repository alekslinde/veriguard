"use client";

// "Other ways" — the three non-paste surfaces, as a control in the check card's
// action bar.
//
// They were a shelf of three rows below the card, which made them a second
// section of the page: the thing that had to be scrolled past, and the reason
// the page had two blocks to centre rather than one. In the bar they are what
// they actually are — another way to start the same check, sitting with the
// other two (screenshot, email file) that already live there.
//
// It is NOT the full WaysGrid. That component's rows open to install buttons, a
// copyable forwarding address and a do-not-open warning — several screens of
// detail inside a control attached to a text box. This names the three and
// sends the reader to the page holding the detail, which is what a menu should
// do.
//
// THE PANEL IS A ROW, NOT A POPOVER, and that is forced by the card. The card
// carries overflow-hidden — it is what rounds the corners over the textarea and
// what lets the swap animate its height — so an absolutely positioned panel is
// clipped wherever it overflows, which cut the first entry off entirely.
// Escaping that clip with position:fixed would need CSS anchor positioning or
// the popover API to stay attached to the button, and this project supports iOS
// 15, which has neither. A row below the buttons cannot overflow, so nothing
// can clip it; the card grows, which it already does smoothly.
//
// React state rather than <details>, which is what the rest of the app uses for
// disclosures. The panel has to be a sibling of the summary (a full-width row
// in the bar's flex-wrap, not a child trapped in one chip's width), and the
// only way to keep them inside one <details> is display:contents on it — which
// browsers have disagreed about, since hiding the closed panel depends on the
// element having a box. The ARIA below is what <details> would have given.

import { useId, useState } from "react";
import Link from "next/link";
import { useLang, type MessageKey } from "@/lib/lang";
import { WAYS_IN } from "@/lib/waysIn";

/**
 * Where each way's full detail lives.
 *
 * Per-id rather than one shared page: about#email explains what a forwarded
 * message's reply contains, about#extension is the extension's own privacy
 * section, and /packages is the developer docs. Sending all three to one
 * destination would make the reader hunt for the one they picked.
 *
 * Keyed by WayIn["id"], so adding a surface to lib/waysIn without giving it a
 * destination fails the build here rather than rendering a dead row.
 */
const WAYS_HREF: Record<(typeof WAYS_IN)[number]["id"], string> = {
  email: "/about#email",
  extension: "/about#extension",
  npm: "/packages",
};

export default function OtherWaysMenu() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[40px] text-[13px] font-medium text-[#3D4654] transition-colors cursor-pointer max-sm:w-full max-sm:justify-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] ${
          open
            ? "border-[#A8B0BC] bg-[#EDEAE3]"
            : "border-[#D9D5CC] bg-white hover:border-[#A8B0BC]"
        }`}
      >
        <span className="shrink-0">
          <WaysIcon />
        </span>
        {t("check.ways.button")}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`w-[14px] h-[14px] text-[#8A93A1] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* w-full is what puts this on its own line: the bar is flex-wrap, so a
          full-width item cannot share a row with the chips above it. The
          negative margins pull it out to the bar's padding so the row meets the
          card's edges rather than sitting inset by the button gap. */}
      {open && (
        <div
          id={panelId}
          className="w-full -mx-4 -mb-3 mt-1 border-t border-[var(--paper-dim)] bg-white px-2.5 py-2"
        >
          <ul className="sm:grid sm:grid-cols-3 sm:gap-1">
            {WAYS_IN.map((way) => (
              <li key={way.id}>
                <Link
                  href={WAYS_HREF[way.id]}
                  className="block h-full rounded-lg px-2.5 py-2 hover:bg-[#F2F0EA] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--clear)]"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#1F2733]">
                      {t(way.name)}
                    </span>
                    {/* Where it runs: the privacy distinction between these
                        three, and the one fact worth carrying into a summary
                        this small — forwarding goes through mail servers, the
                        other two do not. */}
                    <span className="shrink-0 font-[family-name:var(--font-mono-ui)] text-[9.5px] uppercase tracking-[0.08em] text-[#8A93A1]">
                      {t(
                        way.runs === "device"
                          ? ("ways.runs.device" as MessageKey)
                          : ("ways.runs.server" as MessageKey),
                      )}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[#5A6373]">
                    {t(way.how)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Three stacked lines, matching the bar's other glyphs in weight and grid. */
function WaysIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}
