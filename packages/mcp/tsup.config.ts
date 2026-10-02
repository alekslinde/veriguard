// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: Apache-2.0

// Build for publication.
//
// Unlike the engine's config next door, this one BUNDLES, and the difference is
// deliberate in both directions.
//
// The engine is file-per-module because its wildcard subpath exports need real
// files behind them, because a consumer bundling for a browser should be able
// to tree-shake a region pack away, and because four store reviewers read it.
// None of that applies here: this package has one entry and one binary, nobody
// subpath-imports it, and it runs in Node.
//
// What does apply is that src/format.ts imports lib/signalTactics.ts from
// outside this directory. A published package cannot carry a path that climbs
// out of its own root, so that module has to be inlined — which is exactly what
// bundling does, and the same approach the extension takes with
// lib/reportPrefill.ts. The alternative was a fourth copy of the six tactic
// names, which CLAUDE.md asks us not to make.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  // Not the root tsconfig: it carries `incremental`, `noEmit`, `paths`, the
  // Next plugin and a DOM lib. tsup takes the nearest one unless told, and the
  // root's made the declaration build fail outright (TS5074 on --incremental).
  tsconfig: "tsconfig.build.json",
  // See the header: required, because of the import that leaves this directory.
  bundle: true,
  dts: true,
  sourcemap: false,
  clean: true,
  target: "es2022",
  platform: "node",
  // Both are real dependencies, installed by the consumer's package manager.
  // Bundling either would ship a second copy that no lockfile, audit or dedupe
  // pass can see — and for the engine specifically it would mean detection
  // rules frozen at build time, diverging from the version actually installed.
  external: ["@modelcontextprotocol/sdk", "@veriguard/detect", "zod"],
  // The CLI is a bin entry. tsup preserves a leading shebang and chmods the
  // output executable on its own, so nothing here has to arrange either —
  // __tests__/mcpPublish.test.ts asserts both on the built file rather than
  // trusting that.
  outExtension: () => ({ js: ".js" }),
});
