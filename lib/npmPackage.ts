// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Where the published packages live, named once.
//
// The docs page, its tests and anything linking to a package all read these, so
// a rename or a move is one edit rather than a search. Kept free of React and
// of anything that imports it, so the extension could take it if it ever needs
// to name the package it bundles.
//
// Both packages are published from this repo and documented on the same page,
// so they are named together — a second module would be a second place for the
// scope to drift.

const GITHUB_TREE = "https://github.com/alekslinde/veriguard/tree/main";

/** The detection library, named in one place so the docs and the links agree. */
export const NPM_PACKAGE = "@veriguard/detect";

export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;

export const ENGINE_SOURCE_URL = `${GITHUB_TREE}/packages/detect`;

export const ENGINE_README_URL = `${ENGINE_SOURCE_URL}#readme`;

/** The MCP server, which depends on the library above. */
export const MCP_PACKAGE = "@veriguard/mcp";

export const MCP_URL = `https://www.npmjs.com/package/${MCP_PACKAGE}`;

export const MCP_SOURCE_URL = `${GITHUB_TREE}/packages/mcp`;

export const MCP_README_URL = `${MCP_SOURCE_URL}#readme`;
