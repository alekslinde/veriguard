import type { WayIcon as WayIconName } from "@/lib/waysIn";

/**
 * The glyphs the channel shelf draws.
 *
 * Inline strokes rather than an icon library, matching CheckFlow's capture
 * icons: four paths do not justify a dependency, and `currentColor` means a
 * tile's hover and pending states need no extra wiring here.
 *
 * They are drawn from the same 24px grid at the same 2px weight, because a
 * shelf is read as one object — one glyph at a different weight reads as a
 * different KIND of thing, which is exactly the distinction the shelf is
 * already making with its pending state.
 *
 * Deliberately generic: an envelope, a puzzle piece, a box, a speech bubble.
 * None of these is a brand mark. Store and platform logos are trademarked, they
 * date as those brands rebrand, and the shelf's job is to say what KIND of
 * surface each tile is — the name below it says which one.
 */
export default function WayIcon({ name }: { name: WayIconName }) {
  const props = {
    className: "w-[19px] h-[19px]",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "email":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      );
    case "extension":
      // A puzzle piece: the one shape every store uses for an add-on, without
      // being any particular store's mark.
      return (
        <svg {...props}>
          <path d="M10 3.5a1.8 1.8 0 0 1 3.6 0V5h2.9a1 1 0 0 1 1 1v2.9h1.5a1.8 1.8 0 0 1 0 3.6H17.5V15a1 1 0 0 1-1 1h-2.9v1.5a1.8 1.8 0 0 1-3.6 0V16H7a1 1 0 0 1-1-1v-3H4.5a1.8 1.8 0 0 1 0-3.6H6V6a1 1 0 0 1 1-1h3V3.5Z" />
        </svg>
      );
    case "package":
      return (
        <svg {...props}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-2.8-.4L3 21l1.5-4.2A8.1 8.1 0 0 1 3.6 12a8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 9 7.9Z" />
        </svg>
      );
  }
}
