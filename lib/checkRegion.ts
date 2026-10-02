// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Explicit check-region choice, persisted on this device.
//
// The server resolves a region per request (explicit body field wins over the
// geo header, which wins over the default). This module owns the client side
// of the explicit choice: what "auto" means (null = send nothing, let the
// server decide), how it survives a reload, and what counts as valid.
//
// Stored as the bare region code ("AU", "GB", …) or absent for auto. A stored
// value from a region we no longer support degrades to auto rather than
// pinning the user to a dead option.

import { supportedRegions } from "@veriguard/detect/regions";

export const CHECK_REGION_STORAGE_KEY = "vg_region";

// The key this preference used before the rename. Reads fall back to it so a
// returning user keeps their region; writes only ever target the new key.
//
// Deliberately no write-back, following the invariant parseLocale establishes in
// lib/i18n.ts: reads never rewrite storage. Migrating the value forward would
// strand it if that user is later served an older cached bundle, which reads
// only the legacy key — their region would silently revert to auto. Costing one
// extra getItem on a legacy read is the cheaper side of that trade. The old key
// is left to expire on its own.
export const LEGACY_CHECK_REGION_STORAGE_KEY = "jcm_region";

/** Null = auto (no explicit choice). Anything else must be a supported code. */
export function normaliseCheckRegion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  return (supportedRegions() as string[]).includes(code) ? code : null;
}

export function readStoredCheckRegion(): string | null {
  if (typeof window === "undefined" || !("localStorage" in window)) return null;
  try {
    const current = window.localStorage.getItem(CHECK_REGION_STORAGE_KEY);
    if (current !== null) return normaliseCheckRegion(current);
    return normaliseCheckRegion(window.localStorage.getItem(LEGACY_CHECK_REGION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredCheckRegion(code: string | null): void {
  if (typeof window === "undefined" || !("localStorage" in window)) return;
  try {
    const next = normaliseCheckRegion(code);
    if (next) window.localStorage.setItem(CHECK_REGION_STORAGE_KEY, next);
    else {
      // Clearing to auto has to clear the legacy key too. Removing only the new
      // one would leave the old value for the read fallback to find, so the
      // region the user just cleared would come straight back on the next read.
      // This is a deletion on an explicit user action, not a migration
      // write-back, so the no-write-back invariant above still holds.
      window.localStorage.removeItem(CHECK_REGION_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_CHECK_REGION_STORAGE_KEY);
    }
  } catch {
    // Storage full or blocked — the check still runs, just without persistence.
  }
}
