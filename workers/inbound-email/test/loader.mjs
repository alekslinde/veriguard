// Resolver hook mapping `cloudflare:*` to a local stub so the Worker's
// entrypoint can be imported outside the Workers runtime.
//
// Without this, `import { EmailMessage } from "cloudflare:email"` fails with
// ERR_UNSUPPORTED_ESM_URL_SCHEME before any test body runs — the reason
// src/index.ts had no coverage and its silent-failure paths shipped unnoticed.
// node:test's module mocking cannot help here: it resolves the specifier before
// substituting it, and resolution is exactly what fails.
//
// Scoped to the `cloudflare:` scheme; every other specifier goes to the default
// resolver untouched.
const STUB = new URL("./cloudflare-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:email") {
    return { url: STUB, shortCircuit: true };
  }
  if (specifier.startsWith("cloudflare:")) {
    throw new Error(
      `No test stub for "${specifier}". Add one to test/cloudflare-stub.mjs — ` +
        `silently resolving it to an empty module would make the handler look ` +
        `tested when it is not.`,
    );
  }
  return nextResolve(specifier, context);
}
