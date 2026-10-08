/**
 * Derives the web files of the brand from the approved artwork (ADR 0043): crops, scales and
 * makes the flat background transparent, never redrawing a shape or changing a color. The
 * package of originals stays out of the repository; only what this writes is committed. When a
 * professional SVG exists, it replaces these files and this script goes.
 *
 *   pnpm --filter @financas/web brand-assets -- <path to CodeLelis_Master_Visual_Package>
 *
 * Writes `public/brand/` (symbol and logos, PNG and WebP) and the app icons in `public/`.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Region, type Sharp } from 'sharp';

const source = process.argv.at(-1);
if (!source || source.endsWith('.ts')) {
  throw new Error('Pass the path of the CodeLelis_Master_Visual_Package folder.');
}
const art = (file: string) => join(source, file);
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const BRAND = join(PUBLIC, 'brand');
mkdirSync(BRAND, { recursive: true });

type Rgb = [number, number, number];

/** The background: the median of the four corners, where the artwork never reaches. */
function backgroundOf(data: Buffer, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const size = Math.round(Math.min(width, height) * 0.02);
  for (const [x0, y0] of [
    [0, 0],
    [width - size, 0],
    [0, height - size],
    [width - size, height - size],
  ] as const) {
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        const i = (y * width + x) * 3;
        samples.push([data[i]!, data[i + 1]!, data[i + 2]!]);
      }
    }
  }
  const median = (channel: 0 | 1 | 2) =>
    samples.map((sample) => sample[channel]).sort((a, b) => a - b)[samples.length >> 1]!;
  return [median(0), median(1), median(2)];
}

/**
 * "Color to alpha": for each pixel, the smallest opacity that, laid over the background,
 * gives back exactly that pixel, and the color that does it. Over the original background the
 * result is the original image; elsewhere, only the background is gone. A tiny opacity (noise
 * in the flat background) becomes fully transparent, and a nearly full one (the artwork's own
 * body, 99% over a 254 white) fully opaque: the same to the eye, and it compresses far better.
 */
/**
 * The pixels at least `radius` away from the edge of the artwork's silhouette (opacity of at
 * least `threshold`): a square erosion, done as a horizontal then a vertical minimum.
 */
function interiorOf(
  raw: Float32Array,
  width: number,
  height: number,
  threshold: number,
  radius: number,
) {
  const solid = new Uint8Array(width * height);
  for (let p = 0; p < raw.length; p++) solid[p] = raw[p]! >= threshold ? 1 : 0;
  const across = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let all = 1;
      for (let dx = -radius; dx <= radius && all; dx++) {
        const xx = x + dx;
        all = xx >= 0 && xx < width ? solid[y * width + xx]! : 0;
      }
      across[y * width + x] = all;
    }
  }
  const interior = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let all = 1;
      for (let dy = -radius; dy <= radius && all; dy++) {
        const yy = y + dy;
        all = yy >= 0 && yy < height ? across[yy * width + x]! : 0;
      }
      interior[y * width + x] = all;
    }
  }
  return interior;
}

/**
 * `silhouette`: the opacity from which a pixel belongs to the artwork's shape. Inside the
 * shape, past its edge, every pixel is the original one, fully opaque: the artwork's own light
 * tones (the mint highlights of the CL, close to a white background) must not turn see-through
 * and take the color of whatever is behind. Only the edge keeps the gradual opacity that
 * smooths the cut.
 */
async function withoutBackground(file: string, silhouette = 0.25) {
  const { data, info } = await sharp(art(file))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const background = backgroundOf(data, width, height);
  // First the raw opacity of every pixel against the background.
  const raw = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    let alpha = 0;
    for (let c = 0; c < 3; c++) {
      const b = background[c]!;
      const v = data[p * 3 + c]!;
      // Near the end of the scale (a 254 white, a 3 black) there is no room to go further:
      // a pixel past the background there is noise, not artwork, and must not count.
      const room = v > b ? 255 - b : b;
      const needed = room > 16 ? Math.abs(v - b) / room : 0;
      alpha = Math.max(alpha, needed);
    }
    raw[p] = alpha;
  }
  // What counts as background: measured on the outer band of the image, where there is no
  // artwork. A flat white gives almost nothing; the dark artwork's vignette gives a little, and
  // that much opacity is dropped everywhere, so it does not turn into a haze. The glow around
  // the symbol, stronger, stays.
  const band: number[] = [];
  const edge = Math.round(Math.min(width, height) * 0.06);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < edge || y < edge || x >= width - edge || y >= height - edge)
        band.push(raw[y * width + x]!);
    }
  }
  band.sort((a, b) => a - b);
  const NOISE = Math.max(0.04, band[Math.floor(band.length * 0.995)]! + 0.02);
  const SOLID = 0.95;
  const interior = interiorOf(raw, width, height, silhouette, 3);
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    if (interior[p]) {
      out[p * 4] = data[p * 3]!;
      out[p * 4 + 1] = data[p * 3 + 1]!;
      out[p * 4 + 2] = data[p * 3 + 2]!;
      out[p * 4 + 3] = 255;
      continue;
    }
    const r = raw[p]!;
    const alpha = r <= NOISE ? 0 : r >= SOLID ? 1 : (r - NOISE) / (SOLID - NOISE);
    for (let c = 0; c < 3; c++) {
      const b = background[c]!;
      out[p * 4 + c] =
        alpha === 0
          ? 0
          : Math.max(0, Math.min(255, Math.round((data[p * 3 + c]! - (1 - alpha) * b) / alpha)));
    }
    out[p * 4 + 3] = Math.round(alpha * 255);
  }
  return sharp(out, { raw: { width, height, channels: 4 } });
}

/** Trims the transparent margin, keeping a little room around the artwork. */
async function trimmed(image: Sharp, region?: Region) {
  const png = await (region ? image.extract(region) : image).png().toBuffer();
  return sharp(await sharp(png).trim({ threshold: 1 }).png().toBuffer());
}

/** PNG and WebP of one mark, `width` pixels wide (about 3x the size it is shown at). */
async function write(image: Sharp, name: string, width: number) {
  const resized = image.resize({ width, withoutEnlargement: true });
  await resized
    .clone()
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(join(BRAND, `${name}.png`));
  await resized
    .clone()
    .webp({ quality: 85, alphaQuality: 90 })
    .toFile(join(BRAND, `${name}.webp`));
}

// The symbol: from the vertical logo, where the CL stands apart from the words above them.
const vertical = await withoutBackground('03_Financas/CodeLelis-Financas-vertical-claro.png');
const symbol = await trimmed(vertical.clone(), { left: 0, top: 0, width: 1254, height: 860 });
await write(symbol.clone(), 'cl-symbol', 192);

// The logos: light (dark words) and dark (light words, with its glow).
await write(await trimmed(vertical.clone()), 'logo-vertical-light', 480);
await write(
  await trimmed(await withoutBackground('03_Financas/CodeLelis-Financas-horizontal-claro.png')),
  'logo-horizontal-light',
  720,
);
await write(
  await trimmed(
    await withoutBackground('03_Financas/CodeLelis-Financas-horizontal-escuro.png', 0.6),
  ),
  'logo-horizontal-dark',
  720,
);

// Browser tab icon: the symbol alone, square, transparent.
const symbolPng = await symbol.clone().png().toBuffer();
for (const size of [32, 48]) {
  await sharp(symbolPng)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(PUBLIC, `favicon-${size}.png`));
}

// Installed app icons: the approved light app icon, cropped to its rounded square (the system
// applies its own mask), and a "maskable" one with the symbol inside the safe zone.
const appIcon = sharp(art('04_App_Icons/CodeLelis-app-icon-light.png')).extract({
  left: 100,
  top: 104,
  width: 1054,
  height: 1054,
});
const appIconPng = await appIcon.png().toBuffer();
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
] as const) {
  await sharp(appIconPng)
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(join(PUBLIC, file));
}
const inner = await sharp(symbolPng)
  .resize(320, 320, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(join(PUBLIC, 'icon-maskable-512.png'));

console.log(`Arquivos da marca gerados em ${PUBLIC}`);
