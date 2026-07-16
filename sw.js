/* ════════════════════════════════════════════════════════════════
   SW.JS — Service Worker VoypatiGestoria
   Estrategia deliberadamente simple y segura para Safari/iOS:
   - Nunca intercepta llamadas a Supabase (deja pasar el catálogo real).
   - Network-first para HTML (para no atrapar a nadie en una versión vieja).
   - Cache-first para assets estáticos propios (CSS/JS/imágenes del sitio).
   - Se auto-limpia versiones anteriores del caché.
════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'voypati-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './supabase-config.js',
  './manifest.json',
  './logo-voypati.webp',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // nunca bloquear la instalación por un asset faltante
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear/interceptar Supabase ni dominios externos: el catálogo
  // y el panel de admin siempre deben ir directo a la red.
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, con fallback a caché si no hay conexión.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Assets estáticos propios: cache-first, actualizando en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
