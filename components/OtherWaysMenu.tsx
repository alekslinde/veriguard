"use client";

// "Other ways" — the three non-paste surfaces, as one control in the check
// card's action bar.
//
// They were a shelf of three rows below the card, which made them a second
// section of the page: the thing that had to be scrolled past, and the reason
// the page had two blocks to centre rather than one. In the bar they are what
// they actually are — another way to start the same check, sitting with the
// other two (screenshot, email file) that already live there.
//
// A <details> rather than React state, for what the element gives free:
// keyboard operation, Escape to close, and a summary that is focusable and
// announced as expandable. The same reasoning as WaysGrid, which this replaces
// on the home page.
//
// It is NOT the full WaysGrid in a popover. That component's rows open to
// install buttons, a copyable forwarding address and a do-not-open warning —
// several screens of detail inside a menu attached to a text box. The menu
// names the three and sends the reader to the page that holds the detail,
// which is what a menu should do.

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

  return (
    <details className="group relative max-sm:w-full">
      <summary
        // list-none + the webkit rule: a summary renders a disclosure triangle
        // by default, which would be a third marker on a bar that already has
        // the chevron below and the button's own affordance.
        className="inline-flex items-center gap-2 rounded-lg border border-[#D9D5CC] bg-white px-3 py-2 min-h-[40px] text-[13px] font-medium text-[#3D4654] hover:border-[#A8B0BC] transition-colors cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden max-sm:w-full max-sm:justify-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)]"
        aria-label={t("check.ways.label")}
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
          className="w-[14px] h-[14px] text-[#8A93A1] transition-transform duration-200 group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      {/* Opens upward on a desktop (bottom-full): the bar is at the bottom of
          the card, so a downward menu would hang off the card and, when the
          tool is centred, over the ways-in nothing. On a phone the card is the
          screen and the menu is a block in flow instead, where there is no
          "up" worth reaching for. */}
      <div className="sm:absolute sm:bottom-full sm:left-0 sm:mb-2 sm:w-[310px] z-20 mt-2 sm:mt-0 rounded-xl border border-[#D9D5CC] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]">
        <ul>
          {WAYS_IN.map((way) => (
            <li key={way.id}>
              <Link
                href={WAYS_HREF[way.id]}
                className="block rounded-lg px-2.5 py-2 hover:bg-[#F2F0EA] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--clear)]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[#1F2733]">
                    {t(way.name)}
                  </span>
                  {/* Where it runs, which is the privacy distinction between
                      these three and the one fact worth carrying into a menu
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

    </details>
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
