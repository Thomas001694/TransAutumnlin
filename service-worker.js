// service-worker.js
// TransAutumnlin-Demo 57-web。
// Demo 57 使用新的快取名稱，確保 GitHub Pages 不會繼續顯示舊版 Demo 54/56 UI。

const CACHE_NAME = "transautumnlin-demo57-timeline-1";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=57-timeline-1",
  "./app.js?v=57-timeline-1",
  "./route-data.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-first：GitHub Pages 更新後優先取得最新版，再回寫快取。
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();

          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
        }

        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) return cachedResponse;
        if (event.request.mode === "navigate") return caches.match("./index.html");

        return Response.error();
      }),
  );
});
