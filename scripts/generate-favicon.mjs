// Generates app/favicon.ico from app/icon.svg — on a white ground, since
// browser tabs are overwhelmingly light chrome and the dark-ground variant
// disappears into a light tab bar.
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
const BG = { r: 255, g: 255, b: 255, alpha: 1 }; // white
const SIZES = [16, 32, 48];

async function renderSize(size, glyphRatio) {
  const glyphSize = Math.round(size * glyphRatio);
  const glyph = await sharp(SVG).resize(glyphSize, glyphSize).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: glyph, gravity: "centre" }])
    .png()
    .toBuffer();
}

const glyphRatios = { 16: 0.86, 32: 0.8, 48: 0.78 };
const pngs = await Promise.all(SIZES.map((size) => renderSize(size, glyphRatios[size])));

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
