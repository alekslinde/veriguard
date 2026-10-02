// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Pure i18n core: message dictionaries + lookup. No React, so it can be unit
// tested and imported anywhere. The React provider/hook live in lib/lang.tsx.
//
// Bundles follow the next-intl layout: one file per locale in messages/
// (messages/en.json), keyed by a BCP 47 language tag. Regional voice, if it
// ever returns, is a locale variant (en-AU) overlaying its base language —
// the standard model — not a separate axis. The retired "aussie" mode and the
// later "locale:tone" pair both still sit in returning users' localStorage;
// parseLocale reads them as their base locale.

import enMessages from "@/messages/en.json";

export type Locale = "en";

export const DEFAULT_LOCALE: Locale = "en";

// en.json is the base bundle; every key must exist there. It is currently the
// only bundle, so every lookup resolves here.
export type MessageKey = keyof typeof enMessages;

type Dict = Partial<Record<MessageKey, string>>;

const DICTS: Record<Locale, Dict> = {
  en: enMessages,
};

function lookup(locale: Locale, key: MessageKey): string | undefined {
  // Active locale, then the base locale — the guaranteed-complete bundle.
  return DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE][key];
}

// Active locale → base locale → the raw key, then interpolate {placeholder}
// tokens from `vars`.
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let str: string = lookup(locale, key) ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}

const LOCALES: readonly Locale[] = ["en"];

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

// Tolerant of anything: unknown values, and the legacy "aussie"/"normal" and
// "locale:tone" strings still sitting in returning users' localStorage. An
// unreadable value degrades to the default rather than throwing. Kept here
// (not in lang.tsx) so it is unit-testable without React.
//
// Reads never rewrite storage, so a stored locale that this build does not
// ship survives and starts working again if that locale returns.
export function parseLocale(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;
  // "en:normal" → "en". The single-axis "aussie"/"normal" values have no
  // locale part and fall through to the default below.
  const [locale] = raw.split(":");
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}
