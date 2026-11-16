const CACHE = "family-hub-shell-v13";
const SHELL = ["./", "./index.html", "./app.js?v=iphone-widget-1", "./widget-settings.js?v=iphone-widget-1", "./widget-setup.html", "./widget-setup.js", "./widgets/Family-Hub.js", "./assets/icon-180.png", "./assets/icon-192.png", "./assets/icon-512.png", "./ai-outing-ui.js?v=ai-weather-3", "./outing-browser.js", "./styles.css?v=iphone-widget-1", "./ui.js?v=iphone-widget-1", "./family-extra.js", "./schedule-calendar.js", "./apple-sync.js", "./manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(new URL(path, self.location.href), {cache: "reload"})))));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("family-hub-shell-") && k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, {cache: "no-cache"}).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
