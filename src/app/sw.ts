/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Navigations: network first, so signed-in pages are never stale; /offline when both fail.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 4 }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() as { title: string; body: string; url: string } | undefined;
  if (!data) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => "focus" in w);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

serwist.addEventListeners();
