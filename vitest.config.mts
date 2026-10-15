// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // workers/** has its own deps and runs under node:test, not vitest.
    exclude: ["**/node_modules/**", "workers/**"],

    // Isolation stays ON, against vitest's own advice.
    //
    // Every run prints a hint that `isolate: false` would be "at least ~1.21s
    // faster" by reusing workers across files. Measured, it is not: 6.25s
    // against 6.25-6.29s isolated, because this suite is CPU-bound across all
    // cores (~600% CPU, 34s of user time in a 6.6s wall clock), not bound by
    // the ~77ms per-file startup the hint adds up. The arithmetic assumes
    // startup is serial; here it overlaps the work.
    //
    // It also breaks the suite. Sharing a worker leaks module state between
    // files: runs failed 11 tests across 2 files and 5 files in another, a
    // different set each time, because the failures depend on the order files
    // land in a worker. Among them was the suite guarding the no-network-call
    // property — a test that must never be flaky, since a flake there gets
    // re-run rather than read.
    //
    // So the hint is trading a reliable 6.6s suite for an unreliable 6.6s one.
    // Revisit only if the suite's own runtime becomes the bottleneck, which at
    // this size it is not — CI spends its minutes on install, typecheck, lint
    // and two package builds.
    isolate: true,
  },
  // The extension's build-time constant, which its Vite config injects and
  // `extension/src/env.d.ts` declares. A test that imports an extension entry
  // would otherwise hit an undefined global — and because the background
  // script reaches it inside the try that guards the engine, the module's own
  // catch turns that into a check which silently produces nothing. That is a
  // failure shaped exactly like the bug these tests exist to catch, so it is
  // fixed here rather than stubbed per test.
  //
  // A value that is obviously not a real origin: anything reaching the network
  // from a test is a defect, and it should fail against a host nobody owns
  // rather than quietly succeed against production.
  define: {
    __API_BASE__: JSON.stringify("https://api.example.invalid"),
    // The build target, for the `source` label on report links. A real value
    // rather than a placeholder: it is validated against the allowlist in
    // lib/reportPrefill.ts, so an invented one would be dropped and every
    // assertion about attribution would pass vacuously.
    __REPORT_SOURCE__: JSON.stringify("ext-chromium"),
  },
  resolve: {
    // Only the app's own "@/" alias is declared here.
    //
    // @veriguard/detect is deliberately NOT aliased: it resolves through
    // the workspace symlink in node_modules, which means Vite consults the
    // package's own `exports` map. Aliasing it by file path would resolve
    // around that map, so a subpath the package does not export — or one it
    // later stops exporting — would keep working in tests and under tsc while
    // failing for any real consumer. The map is only a boundary if the tooling
    // is made to honour it. __tests__/engineExports.test.ts asserts that it is.
    //
    // `.mts` + `import.meta.dirname` rather than `.ts` + `__dirname`: Vite's
    // native config loader, planned to become its default, loads this as real
    // ESM, where a `.ts` file is treated as CommonJS and `__dirname` does not
    // exist. Both forms warned before the switch and would have broken after.
    alias: [{ find: /^@\/(.*)$/, replacement: import.meta.dirname + "/$1" }],
  },
});
