// Deixa o app abrir rápido e instalável. Os dados financeiros nunca passam por aqui.
const CACHE = "gerencial-v1";
const ARQS = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icons/icon.svg",
  "vendor/supabase.min.js", "vendor/html2canvas.min.js", "vendor/jspdf.umd.min.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
