// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// An install command, per package manager.
//
// Four runtimes install the same package four ways, and a page that shows only
// the npm spelling makes everyone else translate it. Deno is the one that
// genuinely differs — it needs the `npm:` specifier rather than a different
// verb — so leaving it to the reader is leaving them to guess.
//
// The tab choice is remembered per visitor in localStorage: someone who uses
// bun uses it on every sample on the page, and re-picking it at each code block
// is the kind of friction that makes docs feel hostile. Wrapped in try/catch
// because storage throws in a private window, and the component has to render
// correctly when it does.
//
// Keyboard semantics follow the ARIA tabs pattern: arrow keys move between
// tabs, and only the selected tab is in the tab order.

import { useRef, useSyncExternalStore } from "react";
import CodeBlock from "@/components/CodeBlock";

/**
 * The managers, in the order they are offered.
 *
 * npm first because it is the default for most readers, then the two
 * drop-in-compatible ones, then Deno — which is last because its command is
 * shaped differently and the ordering makes that visible rather than hiding it
 * mid-list.
 */
export const MANAGERS = ["npm", "pnpm", "bun", "deno"] as const;

export type Manager = (typeof MANAGERS)[number];

/**
 * How each manager spells "add this dependency".
 *
 * Deno takes `npm:` because it resolves registry packages through that
 * specifier; without it, `deno add @veriguard/detect` looks for a JSR package
 * that does not exist. The others differ only in the verb.
 */
export function installCommand(manager: Manager, pkg: string): string {
  switch (manager) {
    case "npm":
      return `npm install ${pkg}`;
    case "pnpm":
      return `pnpm add ${pkg}`;
    case "bun":
      return `bun add ${pkg}`;
    case "deno":
      return `deno add npm:${pkg}`;
  }
}

/**
 * How each manager spells "run this binary without installing it".
 *
 * For the MCP server, which is configured as a command an MCP client spawns
 * rather than as a dependency. `-y`/equivalent matters here: the client runs
 * this unattended, so a prompt asking to install would hang the server at
 * startup with no visible reason.
 */
export function execCommand(manager: Manager, pkg: string): string {
  switch (manager) {
    case "npm":
      return `npx -y ${pkg}`;
    case "pnpm":
      return `pnpm dlx ${pkg}`;
    case "bun":
      return `bunx ${pkg}`;
    case "deno":
      // Needs explicit permissions: the server reads its stdio transport and
      // reaches two fixed hosts. Granting all of them is wrong for a tool whose
      // selling point is that it contacts almost nothing.
      return `deno run --allow-net --allow-env --allow-read npm:${pkg}`;
  }
}

const STORAGE_KEY = "veriguard.pkg-manager";

/**
 * The tab strip on its own, for a section with several runtime-dependent
 * samples.
 *
 * The MCP section shows three — the Claude Code one-liner, the client config
 * and the offline invocation — and they must all change together. One strip
 * above them does that; three independent InstallTabs would let a reader set
 * bun on one and leave npx in the next, which is worse than showing npm only.
 */
export function ManagerTabs({
  active,
  onChange,
  label,
}: {
  active: Manager;
  onChange: (manager: Manager) => void;
  label: string;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + MANAGERS.length) % MANAGERS.length;
    onChange(MANAGERS[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {MANAGERS.map((manager, i) => (
        <button
          key={manager}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={active === manager}
          tabIndex={active === manager ? 0 : -1}
          onClick={() => onChange(manager)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            active === manager
              ? "bg-[var(--ink-2)] text-[var(--clear)]"
              : "text-[var(--faint)] hover:text-[var(--text-dim)]"
          }`}
        >
          {manager}
        </button>
      ))}
    </div>
  );
}

/**
 * The remembered choice, shared by every tab strip on the page.
 *
 * `useSyncExternalStore` rather than state seeded in an effect. Reading
 * localStorage during render is impossible on the server, and reading it in an
 * effect means calling setState during mount — which React 19 flags
 * (react-hooks/set-state-in-effect) because it renders the page twice and the
 * reader sees the npm tab flash to theirs. The same primitive is used in
 * WaysGrid for the same reason.
 *
 * The server snapshot is "npm", so the markup is identical for every visitor
 * and stays cacheable; the reader's own choice is applied on hydration.
 *
 * Unlike WaysGrid's user-agent store, this value really does change, so the
 * subscribe is real: `storage` carries a change made in another tab, and the
 * custom event carries one made by a sibling strip in this one.
 */
const CHANGE_EVENT = "veriguard:pkg-manager";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Returns a Manager, never a fresh object: useSyncExternalStore compares
 * snapshots with Object.is, so returning a new object each call would loop.
 */
function readManager(): Manager {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (MANAGERS as readonly string[]).includes(saved)) return saved as Manager;
  } catch {
    // Private window or blocked storage. npm is the right fallback.
  }
  return "npm";
}

export function useManager(): [Manager, (manager: Manager) => void] {
  const active = useSyncExternalStore(subscribe, readManager, () => "npm" as Manager);

  function choose(manager: Manager) {
    try {
      window.localStorage.setItem(STORAGE_KEY, manager);
    } catch {
      // Remembering the choice is a convenience, not a requirement — but the
      // event still has to fire, or the tabs do not move when storage is
      // blocked.
    }
    // `storage` does not fire in the tab that wrote it, so every strip on this
    // page would keep its old value without this.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return [active, choose];
}

export default function InstallTabs({
  pkg,
  label,
  command = installCommand,
}: {
  pkg: string;
  label: string;
  /** Which command shape to show — install by default, exec for the server. */
  command?: (manager: Manager, pkg: string) => string;
}) {
  // The strip and the remembered choice are shared with the MCP section, which
  // drives three samples from one set of tabs. See ManagerTabs and useManager.
  const [active, choose] = useManager();

  return (
    <div>
      <ManagerTabs active={active} onChange={choose} label={label} />
      <div className="mt-2">
        <CodeBlock code={command(active, pkg)} label={`${label} (${active})`} />
      </div>
    </div>
  );
}
