// Keldra service worker — SELF-DESTRUCT.
//
// The previous version was a network-first cache that, on flaky mobile
// networks, served a stale app shell + stale JS chunks (the cache name never
// changed), so installed phones kept running an old build. This version takes
// over from it, deletes every cache, unregisters itself, and reloads open tabs
// so every device pulls the latest build from the network. There is NO fetch
// handler — nothing is intercepted or served from cache anymore.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) client.navigate(client.url);
      } catch {
        /* ignore */
      }
    })(),
  );
});
