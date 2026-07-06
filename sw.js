// ============================================================
// SERVICE WORKER - Empréstimo Seguro PWA v2.1
// ============================================================
const CACHE_NAME = 'emprestimo-v2.1';
const OFFLINE_URL = '/index.html';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/config.js',
  '/manifest.json',
  '/imagens/perfil.jpg',
  '/imagens/icon-192.png',
  '/imagens/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Erro cache:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  
  // ⚠️ EXCLUIR API PIX DO CACHE
  if (url.includes('api/pix.php')) return;
  if (url.includes('api.telegram.org')) return;
  if (url.includes('evopay.cash')) return;
  if (url.includes('cdnjs.cloudflare.com')) return;

  const isHTML = event.request.destination === 'document';
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (isHTML) {
        try {
          const networkRes = await fetch(event.request);
          if (networkRes.ok) {
            await cache.put(event.request, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          const cached = await cache.match(event.request);
          return cached || cache.match(OFFLINE_URL);
        }
      } else {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then(networkRes => {
          if (networkRes.ok) {
            cache.put(event.request, networkRes.clone());
          }
          return networkRes;
        }).catch(() => cached);
        return cached || fetchPromise;
      }
    })()
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    console.log('[SW] Sincronizando mensagens pendentes');
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Empréstimo Seguro';
  const options = {
    body: data.body || 'Nova atualização',
    icon: '/imagens/icon-192.png',
    badge: '/imagens/icon-192.png',
    vibrate: [200, 100, 200],
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(event.notification.data) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data);
    })
  );
});