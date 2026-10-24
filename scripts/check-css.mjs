// Fails the build if the production CSS wasn't compiled by Tailwind: raw
// `@utility`/`@theme` directives left in, or no utility classes at all. This is
// what happens when Tailwind is only wired to one of the two bundlers.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = ".next/static/css";
const css = readdirSync(dir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");

const raw = /@(utility|theme|tailwind)\b/.test(css);
const compiled = /\.flex\{/.test(css);
if (raw || !compiled) {
  console.error(
    `check-css: Tailwind did not run on the production CSS (raw directives: ${raw}, utilities: ${compiled}). Check postcss.config.mjs.`,
  );
  process.exit(1);
}
console.log("check-css: Tailwind utilities present.");
