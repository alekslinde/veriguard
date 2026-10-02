// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Registers the cloudflare: resolver hook via the supported `module.register`
// API, used with `node --import`. The older `--loader` flag does the same job
// but prints a deprecation warning on every run.
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
