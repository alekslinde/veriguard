// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

interface Props {
  value: string;
  className?: string;
}

// Renders an identifier from a report. Values are defanged server-side before
// they reach the client (hxxps[://], [at], …), so they are safe to select and
// copy — e.g. to compare a number against your call log. The remaining guards:
//   · translate="no"    — prevents translation services auto-linking content
//   · data-nosnippet    — prevents search engines indexing the value
//   · No <a> wrapper    — never rendered as a hyperlink
export default function SafeDisplay({ value, className = "" }: Props) {
  return (
    <span className={className} translate="no" data-nosnippet="">
      {value}
    </span>
  );
}
