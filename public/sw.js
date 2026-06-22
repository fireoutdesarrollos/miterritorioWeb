// Estrategia: Network First (Primero internet, luego caché)
// Esto asegura que la PWA no se quede trabada con código viejo mientras desarrollas.

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
