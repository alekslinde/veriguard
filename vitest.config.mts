import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // workers/** has its own deps and runs under node:test, not vitest.
    exclude: ["**/node_modules/**", "workers/**"],
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
