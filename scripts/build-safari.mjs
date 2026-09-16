// Generate (or regenerate) the Safari Xcode project from the built extension.
//
// Safari runs the same WebExtension source as Chrome and Firefox, but it cannot
// load an unpacked directory: it needs a native app wrapper, built by Xcode and
// signed with an Apple Developer identity. `safari-web-extension-converter`
// ships with Xcode and generates that wrapper from a built extension directory.
//
// **The generated project is build output, not source.** It is regenerated from
// `extension/dist/chrome` on demand and is gitignored, for the same reason the
// bundles are: committing it would mean maintaining a second copy of the
// extension that drifts from the first, plus an Xcode project file that
// conflicts on every merge. What is committed is this script and the extension
// source it converts.
//
// Usage:
//   npm run ext:safari                  # build the extension, then convert
//   npm run ext:safari -- --open        # and open the project in Xcode
//
// Requires Xcode (not just the command line tools). Signing and submission are
// deliberately out of scope — those need a developer identity in the keychain
// and are done from Xcode.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Converted from the Chrome build, not the Firefox one.
 *
 * Both are the same code; the difference is the manifest, and Chrome's is the
 * one Safari understands — `browser_specific_settings` is Firefox-only and the
 * converter would carry it through into a manifest Safari has no use for.
 */
const SOURCE = resolve(ROOT, "extension/dist/chrome");
const OUT = resolve(ROOT, "extension/safari");

const APP_NAME = "Veriguard";
/**
 * Bundle identifier for the wrapper app. **This is the app's full identifier,
 * ending in the app name**, and getting that wrong fails the build.
 *
 * The converter derives the extension's identifier from this one: it uses this
 * value verbatim for the app, and appends `.Extension` after stripping a
 * trailing component that matches the app name. Xcode requires the extension's
 * identifier to be nested inside the app's, so the two must line up:
 *
 *   app.veriguard.Veriguard  → app  app.veriguard.Veriguard
 *                              ext  app.veriguard.Veriguard.Extension   ✓
 *
 *   app.veriguard            → app  app.Veriguard
 *                              ext  app.veriguard.Extension             ✗ case
 *   app.veriguard.extension  → app  app.veriguard.Veriguard
 *                              ext  app.veriguard.extension.Extension   ✗ sibling
 *
 * Both wrong forms fail with "Embedded binary's bundle identifier is not
 * prefixed with the parent app's bundle identifier."
 *
 * Must match the App Store record once one exists; changing it later creates a
 * different app rather than an update to this one.
 */
const BUNDLE_ID = process.env.SAFARI_BUNDLE_ID ?? `app.veriguard.${APP_NAME}`;

if (!existsSync(SOURCE)) {
  console.error(`No build at ${SOURCE}. Run \`npm run ext:chrome\` first.`);
  process.exit(1);
}

// Fail clearly rather than letting xcrun report a missing tool. The converter
// ships inside Xcode, so the command line tools alone are not enough.
try {
  execFileSync("xcrun", ["--find", "safari-web-extension-converter"], { stdio: "pipe" });
} catch {
  console.error(
    "safari-web-extension-converter not found — it ships with Xcode.\n" +
      "Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app",
  );
  process.exit(1);
}

// Regenerated from scratch each time. `--force` alone leaves files from a
// previous run that no longer correspond to anything in the current build.
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

const args = [
  "safari-web-extension-converter",
  SOURCE,
  "--project-location", OUT,
  "--app-name", APP_NAME,
  "--bundle-identifier", BUNDLE_ID,
  "--swift",
  // macOS only. An iOS build is a separate product decision — a different
  // interaction model (no right-click), a separate review, and no way to test it
  // here — rather than a flag worth flipping by default.
  "--macos-only",
  // Copy rather than reference: the project must not silently change meaning
  // when the next `npm run ext` rewrites dist/.
  "--copy-resources",
  "--no-prompt",
  "--force",
];

if (!process.argv.includes("--open")) args.push("--no-open");

console.log(`Converting ${SOURCE} → ${OUT}`);
execFileSync("xcrun", args, { stdio: "inherit" });

console.log(
  [
    "",
    "Done:",
    `  ${OUT}/${APP_NAME}/${APP_NAME}.xcodeproj`,
    "",
    "To run it locally: set a signing team on both targets, build, and enable",
    "Safari's developer setting for loading unsigned extensions — that one",
    "resets on restart, so it is per session rather than once.",
  ].join("\n"),
);
