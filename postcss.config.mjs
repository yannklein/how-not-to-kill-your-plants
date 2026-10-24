// Tailwind runs through PostCSS so both bundlers process it: Turbopack in dev
// and webpack in `next build --webpack` (needed by Serwist).
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
