// Where the published engine lives, named once.
//
// The docs page, its tests and anything linking to the package all read these,
// so a rename or a move is one edit rather than a search. Kept free of React
// and of anything that imports it, so the extension could take it if it ever
// needs to name the package it bundles.

/** The published package, named in one place so the docs and the links agree. */
export const NPM_PACKAGE = "@veriguard/detect";

export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;

export const ENGINE_SOURCE_URL =
  "https://github.com/alekslinde/veriguard/tree/main/packages/detect";

export const ENGINE_README_URL = `${ENGINE_SOURCE_URL}#readme`;
