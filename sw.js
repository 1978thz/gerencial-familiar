// Deixa o app abrir rápido e instalável. Os dados financeiros nunca passam por aqui.
const CACHE = "gerencial-v4";
const ARQS = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icons/icon.svg",
  "vendor/supabase.min.js", "icons/icon-192.png", "icons/icon-512.png", "vendor/html2canvas.min.js", "vendor/jspdf.umd.min.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Android: extratos enviados pelo botão Compartilhar de outro app chegam aqui (share_target do manifest).
// Ficam guardados no cache até o app abrir e importar; nada vai para servidor nenhum.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "POST" || !u.pathname.endsWith("/compartilhar")) return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData(), c = await caches.open("gf-compartilhado");
      let i = 0;
      for (const f of fd.getAll("arquivos")) {
        if (!f || typeof f === "string") continue;
        await c.put(new Request(`compartilhado/${Date.now()}-${i++}`), new Response(f, {headers: {"x-nome": encodeURIComponent(f.name || "extrato")}}));
      }
    } catch (err) {}
    return Response.redirect(new URL("./?compartilhado=1", self.registration.scope).href, 303);
  })());
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
