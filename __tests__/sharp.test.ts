// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from "vitest";
import sharp from "sharp";

it("rasterizes an SVG through the native OCR image-processing pipeline", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="red"/></svg>',
  );
  const { data, info } = await sharp(svg)
    .rotate()
    .resize({ width: 16 })
    .flatten({ background: "#ffffff" })
    .jpeg()
    .toBuffer({ resolveWithObject: true });

  expect(info.format).toBe("jpeg");
  expect(info.width).toBe(16);
  expect(info.height).toBe(8);
  expect(data.length).toBeGreaterThan(0);
});
