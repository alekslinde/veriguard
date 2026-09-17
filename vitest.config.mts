import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // workers/** has its own deps and runs under node:test, not vitest.
    exclude: ["**/node_modules/**", "workers/**"],
  },
  resolve: {
    // Only the app's own "@/" alias is declared here.
    //
    // @veriguard/engine is deliberately NOT aliased: it resolves through
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
