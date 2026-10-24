import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// @serwist/next needs webpack, so `build` runs `next build --webpack`. The SW is
// off in dev, where Turbopack is used.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/offline", revision: process.env.npm_package_version ?? "1" }],
});

const nextConfig: NextConfig = {
  // The e2e server builds into its own folder so it can run next to a developer's `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  cacheComponents: false,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default withSerwist(withNextIntl(nextConfig));
