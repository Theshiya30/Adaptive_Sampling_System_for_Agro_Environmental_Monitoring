// SmartFarm Mobile Service Worker
const CACHE_NAME = 'smartfarm-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/smartfarm-icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll skipped non-critical assets:', err);
      });
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network first with cache fallback
self.addEventListener('fetch', (event) => {
  // Let API requests bypass cache
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('supabase') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response to cache dynamic assets if valid
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigation, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Push Notification Handler (Native Mobile Notification Tray)
self.addEventListener('push', (event) => {
  let data = {
    title: '🚨 SmartFarm Alert',
    body: 'Urgent sensor threshold exceeded!',
    icon: '/icon-192.png',
    badge: '/smartfarm-icon.svg',
    tag: 'smartfarm-alert',
    vibrate: [300, 100, 300, 100, 600],
    data: { url: '/?tab=alerts' },
    requireInteraction: true
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/smartfarm-icon.svg',
      tag: data.tag || 'smartfarm-alert',
      vibrate: data.vibrate || [300, 100, 300],
      requireInteraction: data.requireInteraction ?? true,
      data: data.data || { url: '/?tab=alerts' },
      actions: [
        { action: 'open_alerts', title: '🚨 View Alert' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// Notification Click Handler: Open app and focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/?tab=alerts';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (let client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
