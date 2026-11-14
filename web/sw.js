// Casita Stock — permite abrir la app sin conexión y cargarla rápido.
// En cada publicación cambia VERSION aquí y el número ?v= en index.html y en la lista APP,
// para que los teléfonos descarguen los archivos nuevos.
const VERSION = "casita-v1.5.0";
const APP = [
  "/", "/index.html", "/css/app.css?v=1.5.0",
  "/js/config-nativo.js?v=1.5.0", "/js/voz.js?v=1.5.0", "/js/plataforma.js?v=1.5.0", "/js/app.js?v=1.5.0", "/js/asistente.js?v=1.5.0", "/js/facturas.js?v=1.5.0",
  "/vendor/supabase-2.45.4.js", "/vendor/zxing-0.21.3.min.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon.png", "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca guardar en caché la IA, la configuración ni la base de datos
  if (url.pathname.startsWith("/api/") || url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;

  // Páginas: primero la red (para tener siempre la última versión), si no hay conexión, la copia guardada
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("/index.html", copy)); return r; })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Archivos de la app, librerías y fuentes: copia guardada al instante y actualización en segundo plano
  const cacheable = url.origin === location.origin || /(cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(
    caches.open(VERSION).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }))
  );
});
