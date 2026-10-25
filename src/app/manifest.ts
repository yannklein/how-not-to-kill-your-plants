import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "How Not To Kill Your Plants",
    short_name: "Plants",
    description: "Plant care reminders for the household.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f0",
    theme_color: "#4a7a5d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
