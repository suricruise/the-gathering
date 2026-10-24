/* Generated from scripts/pwa/service-worker.js. Offline cache is an explicit public allowlist. */
const CACHE_PREFIX = "gathering-pwa-";
const CACHE_NAME = CACHE_PREFIX + "5ef614bb5af2eb25";
const PUBLIC_FILES = [
  "/offline.html", "/pwa/offline.css", "/pwa/offline.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png", "/favicon.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Omit cookies, reject redirects/errors, and never save authenticated documents.
    const responses = await Promise.all(PUBLIC_FILES.map(async (path) => {
      const response = await fetch(new Request(path, { credentials: "omit", cache: "reload", redirect: "error" }));
      if (!response.ok || response.type === "opaque" || response.headers.has("set-cookie")) throw Error("Offline assets unavailable");
      return [path, response];
    }));
    await Promise.all(responses.map(([path, response]) => cache.put(path, response)));
  })());
  // No automatic skipWaiting: updates must not reload/disconnect active voice rooms.
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // API, Auth, RSC, media, mutation and external requests remain untouched.
  if (PUBLIC_FILES.includes(url.pathname) && !url.search && !request.headers.has("range")) {
    event.respondWith((async () => (await caches.open(CACHE_NAME)).match(url.pathname).then((response) => response || fetch(request)))());
    return;
  }
  if (request.mode !== "navigate" || /^\/(api|auth|_next)(\/|$)/.test(url.pathname)) return;
  event.respondWith((async () => {
    try { return await fetch(request, { cache: "no-store" }); }
    catch {
      const fallback = await (await caches.open(CACHE_NAME)).match("/offline.html");
      return fallback || new Response("You are offline. Reconnect to use The Gathering.", { status: 503, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
  })());
});
