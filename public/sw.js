const CACHE_NAME = 'territorios-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js'
];

// Instalar y guardar en caché los archivos básicos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Interceptar peticiones para cargar rápido
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la versión en caché si existe, sino va a internet
        return response || fetch(event.request);
      })
  );
});