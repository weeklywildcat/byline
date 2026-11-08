/**
 * Measures the publication recipe's WebP quality against real photographs, so
 * `src/publication-media/recipe.ts` can be tuned from evidence (R7 and iPhone
 * originals, dark stadium, gym and stage light) instead of a guess.
 *
 *   npm run benchmark:publication-media --workspace @byline/newsroom -- <folder of photos> [width=1920] [qualities=70,75,80,85,90]
 *
 * For each photo and quality it reports bytes per output and PSNR (dB, higher
 * is closer) against an uncompressed resize of the same oriented source. Pick
 * the lowest quality whose worst-case PSNR on dark, noisy scenes is
 * acceptable, set it in the recipe and bump PUBLICATION_MEDIA_RECIPE_VERSION.
 * Read-only: it writes nothing.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PUBLICATION_RECIPE } from "../src/publication-media/recipe";

const [folder, widthArg, qualityArg] = process.argv.slice(2);
if (!folder) {
  console.error("Usage: benchmark-publication-media <folder> [width] [qualities]");
  process.exit(1);
}
const width = Number(widthArg ?? 1920);
const qualities = (qualityArg ?? "70,75,80,85,90").split(",").map(Number);

function psnr(a: Buffer, b: Buffer) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  const mse = sum / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const files = (await readdir(folder)).filter((name) => /\.(jpe?g|png|webp|avif|heic)$/i.test(name)).sort();
console.log(`recipe v${PUBLICATION_RECIPE.version}: current quality ${PUBLICATION_RECIPE.webp.quality}, width ${width}`);
console.log(["file", ...qualities.map((q) => `q${q} KB / dB`)].join("\t"));
for (const name of files) {
  const input = await readFile(path.join(folder, name));
  const reference = await sharp(input).autoOrient().toColourspace("srgb").resize({ width, withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const row = [name];
  for (const quality of qualities) {
    const encoded = await sharp(reference.data, { raw: reference.info }).webp({ ...PUBLICATION_RECIPE.webp, quality }).toBuffer();
    const decoded = await sharp(encoded).removeAlpha().raw().toBuffer();
    row.push(`${(encoded.length / 1024).toFixed(0)} / ${psnr(reference.data, decoded).toFixed(1)}`);
  }
  console.log(row.join("\t"));
}
