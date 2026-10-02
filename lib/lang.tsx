"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  translate,
  parseLocale,
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

export type { Locale, MessageKey } from "@/lib/i18n";

export const LANG_STORAGE_KEY = "vg_lang";

// The key this preference used before the rename. Read as a fallback so a
// returning user keeps their language; storeLocale only ever writes LANG_STORAGE_KEY.
//
// No write-back, matching parseLocale's invariant in lib/i18n.ts ("reads never
// rewrite storage"): migrating the value forward would strand it if that user
// is later served an older cached bundle that reads only the legacy key.
export const LEGACY_LANG_STORAGE_KEY = "jcm_lang";

// setLocale has no caller while en is the only bundle; it is what a language
// picker will call when a second locale ships.
interface LangCtx {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const NOOP_CTX: LangCtx = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
};

const LangContext = createContext<LangCtx>(NOOP_CTX);

// Back the language preference with localStorage exposed as an external store.
// useSyncExternalStore renders the server snapshot (the default locale) on the
// server and during the client's first (hydration) render, then switches to the
// real stored value — so there's no hydration mismatch and no setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb); // keep tabs in sync
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * The stored language string, new key first, legacy key as a fallback.
 *
 * Exported so the migration is testable directly. The provider is a client
 * component and the suite runs under `environment: "node"`, so rendering it is
 * not an option — without a seam here the fallback that every page's copy
 * depends on would ship with no coverage at all.
 */
export function readStoredLangRaw(storage: Pick<Storage, "getItem"> = localStorage): string | null {
  const current = storage.getItem(LANG_STORAGE_KEY);
  if (current !== null) return current;
  return storage.getItem(LEGACY_LANG_STORAGE_KEY);
}

function getSnapshot(): Locale {
  // A string, so useSyncExternalStore's identity check holds without caching.
  return parseLocale(readStoredLangRaw());
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function storeLocale(next: Locale): void {
  localStorage.setItem(LANG_STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((next: Locale) => storeLocale(next), []);

  // setLocale is useCallback'd with an empty dep array, so this is effectively
  // [locale] today. It is listed deliberately: if it ever gains a dependency it
  // will start changing identity, and this memo must invalidate with it —
  // otherwise every consumer of the context silently keeps a stale callback.
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { locale, setLocale } = useContext(LangContext);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
  return { locale, setLocale, t };
}
