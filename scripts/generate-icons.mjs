// Generates the PWA/home-screen icon set from app/icon.svg.
//
// The source mark is a solid path with the check knocked out via
// fill-rule="evenodd", so it rasterises to a clean alpha channel. We use that
// alpha as a mask and tint it the brand emerald on the dark page background —
// which is why the mark must read as one filled silhouette: a stroked check
// laid over the shield would be tinted the same colour and disappear.
//   public/icon-192.png           — manifest icon (any)
//   public/icon-512.png           — manifest icon (any)
//   public/icon-maskable-512.png  — manifest icon (maskable, 80% safe zone)
//   app/apple-icon.png            — iOS home screen (Next.js file convention)
//
// Run: npm run icons
import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const SVG = readFileSync(new URL("../app/icon.svg", import.meta.url));
const BG = { r: 3, g: 7, b: 18, alpha: 1 };      // gray-950 #030712
const FG = { r: 52, g: 211, b: 153, alpha: 1 };  // emerald-400 #34d399

// Render the glyph at `glyphSize`, tint it FG, centre it on a BG square of `size`.
async function makeIcon(size, glyphRatio, out) {
  const glyphSize = Math.round(size * glyphRatio);
  const alpha = await sharp(SVG)
    .resize(glyphSize, glyphSize)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  const tinted = await sharp({
    create: { width: glyphSize, height: glyphSize, channels: 3, background: FG },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();

  const outPath = new URL(`../${out}`, import.meta.url).pathname;
  // The extension icons land in a directory that is not committed (it holds only
  // generated files), so it may not exist on a fresh clone.
  mkdirSync(dirname(outPath), { recursive: true });

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: tinted, gravity: "centre" }])
    .png()
    .toFile(outPath);

  console.log(`✓ ${out} (${size}px)`);
}

await makeIcon(192, 0.78, "public/icon-192.png");
await makeIcon(512, 0.78, "public/icon-512.png");
// Maskable: keep the glyph inside the 80% safe zone so circular masks don't clip it.
await makeIcon(512, 0.6, "public/icon-maskable-512.png");
await makeIcon(180, 0.72, "app/apple-icon.png");

// WebExtension toolbar and store icons.
//
// Same mark, same recipe — a separate source would be a second thing to keep in
// step with the brand for no gain. The sizes are the three the manifest
// declares; Chrome, Firefox and Edge all pick from them, and the Safari wrapper
// takes the 128 as its app icon (see below).
//
// A larger glyph ratio at 16px: the mark is rendered into very few pixels there,
// and the padding that reads as breathing room at 128px reads as a shrunken
// smudge in a toolbar.
await makeIcon(16, 0.86, "extension/icons/icon-16.png");
await makeIcon(48, 0.8, "extension/icons/icon-48.png");
await makeIcon(128, 0.78, "extension/icons/icon-128.png");

// The Safari wrapper app's icon.
//
// `safari-web-extension-converter` generates an Xcode project that references
// `Resources/Icon.png` but never creates it — the build fails outright without
// one, where Chrome and Firefox merely render a placeholder. Written into the
// extension build so the converter picks it up as an ordinary resource.
await makeIcon(512, 0.78, "extension/icons/Icon.png");
