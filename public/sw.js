const CACHE_NAME = "lejon-folgas-shell-v2";
const APP_BASE = new URL(".", self.location.href).pathname.replace(/\/$/, "");
const appPath = (path = "") => `${APP_BASE}/${path}`;
const SHELL_ASSETS = [appPath(), appPath("icon.svg"), appPath("app-icon-v2-180.png"), appPath("app-icon-v2-192.png"), appPath("app-icon-v2-512.png"), appPath("images/team-illustration-v2.png")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (url.pathname === appPath() || url.pathname === appPath("icon.svg") || url.pathname.startsWith(appPath("app-icon-v2-")) || url.pathname === appPath("images/team-illustration-v2.png")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error())),
    );
  }
});
