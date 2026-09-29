// Build-time constants injected by Vite's `define`.
//
// Declared rather than read from an env object because the value is inlined as
// a literal at build time — there is no runtime object to type. The manifest's
// `connect-src` is generated from the same constant, so the bundle cannot try to
// reach an origin the policy would refuse.

/** Origin the blocklist is fetched from. No trailing slash. */
declare const __API_BASE__: string;

/**
 * Which build this is, as a `ReportSource` from lib/reportPrefill.ts.
 *
 * Used only to label a report link the user clicks through to the website. It
 * is not sent anywhere by the extension itself.
 */
declare const __REPORT_SOURCE__: string;
