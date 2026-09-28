// Generates app/favicon.ico from app/icon.svg — on a white ground, since
// browser tabs are overwhelmingly light chrome and the dark-ground variant
// disappears into a light tab bar.
//
// The ground is a rounded plate with real padding around the glyph, not a
// full-bleed square. A glyph filling ~85% of the tile leaves the white as a
// hairline ring, which against dark tab chrome reads as one dark smudge —
// the plate has to be visibly a plate for the light ground to do its job.
//
// Next.js's file-convention favicon needs an actual .ico container; sharp
// only emits raster formats, so this assembles a minimal ICO by hand — a
// directory header followed by one embedded PNG per size, which is a valid
// ICO entry format since Windows Vista and universally supported by browsers.
//
// Run: npm run icons (which generates the PNG set, then this).
import sharp from "sharp";
import { writeFileSync, readFileSync } from "fs";

const SVG = readFileSync(new URL("../app/icon.svg", import.meta.url));
const SIZES = [16, 32, 48];

// Rounded white plate, drawn as SVG so the corner radius survives rasterising
// at every size. Transparent outside the plate, so dark tab chrome shows
// through the corners and the plate reads as a badge with an edge.
function plate(size, radius) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#FFFFFF"/>` +
      `</svg>`,
  );
}

async function renderSize(size, glyphRatio, radiusRatio) {
  const glyphSize = Math.round(size * glyphRatio);
  const glyph = await sharp(SVG).resize(glyphSize, glyphSize).png().toBuffer();
  const ground = await sharp(plate(size, Math.round(size * radiusRatio)))
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: ground, gravity: "centre" },
      { input: glyph, gravity: "centre" },
    ])
    .png()
    .toBuffer();
}

// The glyph sits at ~66% of the tile, leaving a clear white margin on all
// sides. 16px keeps slightly more of the tile than the larger sizes: below
// that the mark loses its interior detail entirely.
const glyphRatios = { 16: 0.72, 32: 0.66, 48: 0.64 };
// A gentle radius — enough to read as a plate rather than a bare square,
// short of a circle, which would eat the margin the glyph needs.
const radiusRatios = { 16: 0.19, 32: 0.21, 48: 0.21 };
const pngs = await Promise.all(
  SIZES.map((size) => renderSize(size, glyphRatios[size], radiusRatios[size])),
);

// ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image, then the PNGs back to back.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(SIZES.length, 4);

let offset = 6 + SIZES.length * 16;
const entries = [];
for (let i = 0; i < SIZES.length; i++) {
  const size = SIZES[i];
  const png = pngs[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // color palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // size of image data
  entry.writeUInt32LE(offset, 12); // offset of image data
  entries.push(entry);
  offset += png.length;
}

const ico = Buffer.concat([header, ...entries, ...pngs]);
writeFileSync(new URL("../app/favicon.ico", import.meta.url), ico);
console.log(`✓ app/favicon.ico (${SIZES.join("/")}px)`);
