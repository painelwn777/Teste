const CACHE_NAME = 'emprestimo-v2.2';
const OFFLINE_URL = '/index.html';
const ASSETS_TO_CACHE = [
  '/', '/index.html', '/styles.css', '/script.js', '/config.js',
  '/manifest.json', '/imagens/perfil.jpg', '/imagens/icon-192.png', '/imagens/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  
  // ️ EXCLUIR APIs DO CACHE
  if (url.includes('pix.evopay.cash') || url.includes('api.evopay.cash')) return;
  if (url.includes('api.telegram.org')) return;
  if (url.includes('cdnjs.cloudflare.com')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return fetch(event.request).then(response => {
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      }).catch(() => cache.match(event.request).then(cached => cached || caches.match(OFFLINE_URL)));
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'Empréstimo Seguro', {
    body: data.body || 'Nova atualização',
    icon: '/imagens/icon-192.png',
    badge: '/imagens/icon-192.png',
    vibrate: [200, 100, 200]
  });
});