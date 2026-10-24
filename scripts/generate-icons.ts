// Generates the PWA icons into public/icons. Run: npx tsx scripts/generate-icons.ts
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const GREEN = "#2f7d4f";
const LEAF = "#ffffff";
const OUT = path.resolve(import.meta.dirname, "../public/icons");

// A white leaf on a green field. `inset` shrinks the glyph for the maskable
// variant so it stays inside the safe zone (central 80%).
function svg(size: number, opts: { rounded: boolean; inset: number }) {
  const s = (size * (1 - opts.inset * 2)) / 100;
  const o = size * opts.inset;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${opts.rounded ? size * 0.22 : 0}" fill="${GREEN}"/>
  <g transform="translate(${o} ${o}) scale(${s})">
    <path d="M50 12 C78 28 84 58 50 86 C16 58 22 28 50 12 Z" fill="${LEAF}"/>
    <path d="M50 28 L50 92" stroke="${GREEN}" stroke-width="4" stroke-linecap="round" fill="none"/>
  </g>
</svg>`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const jobs: [string, number, { rounded: boolean; inset: number }][] = [
    ["icon-192.png", 192, { rounded: true, inset: 0.12 }],
    ["icon-512.png", 512, { rounded: true, inset: 0.12 }],
    ["maskable-512.png", 512, { rounded: false, inset: 0.22 }],
    ["apple-touch-icon.png", 180, { rounded: false, inset: 0.14 }],
  ];
  for (const [name, size, opts] of jobs) {
    await sharp(svg(size, opts)).png().toFile(path.join(OUT, name));
  }
}

main();
