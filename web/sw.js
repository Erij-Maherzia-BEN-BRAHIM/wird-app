// Service worker: shows push notifications and keeps the app shell available offline.
const CACHE = 'wird-shell-v2';
const SHELL = ['./', 'index.html', 'app.js', 'logic.js', 'virtues.js', 'config.js', 'style.css', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for our own files (so updates arrive), cache as the offline fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { /* ignore */ }
  e.waitUntil(
    self.registration.showNotification(data.title || 'ورد اليوم', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      lang: 'ar',
      dir: 'rtl',
      tag: data.tag || 'wird',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    }),
  );
});
