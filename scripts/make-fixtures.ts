// Generates e2e/fixtures/*.jpg. Run: npx tsx scripts/make-fixtures.ts
import sharp from "sharp";

const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<rect width="100%" height="100%" fill="#e8efe3"/>
<rect y="${h * 0.7}" width="100%" height="${h * 0.3}" fill="#b5651d"/>
<ellipse cx="${w * 0.5}" cy="${h * 0.45}" rx="${w * 0.16}" ry="${h * 0.14}" fill="#2f7d32"/>
<ellipse cx="${w * 0.38}" cy="${h * 0.5}" rx="${w * 0.12}" ry="${h * 0.1}" fill="#3f9a43"/>
<ellipse cx="${w * 0.62}" cy="${h * 0.5}" rx="${w * 0.12}" ry="${h * 0.1}" fill="#388e3c"/>
</svg>`;

async function main() {
  const base = (w: number, h: number) => sharp(Buffer.from(svg(w, h))).jpeg({ quality: 85 });
  await base(1200, 900).toFile("e2e/fixtures/pilea.jpg");
  // Stored pixels landscape (1200x800) + EXIF Orientation 6 => displays portrait.
  await base(1200, 800)
    .withMetadata({ orientation: 6 })
    .toFile("e2e/fixtures/rotated-exif.jpg");
}
main();
