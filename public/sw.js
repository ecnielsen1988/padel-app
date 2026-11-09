self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function appUrl(value) {
  try {
    const url = new URL(value || '/beskeder', self.location.origin);
    if (url.origin === self.location.origin && ['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return new URL('/beskeder', self.location.origin).href;
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Padelhuset', {
    body: data.body || '',
    icon: '/Icons/maskable-192.png',
    badge: '/Icons/maskable-192.png',
    data: { url: appUrl(data.url) },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (client && 'navigate' in client) {
      const navigated = await client.navigate(url);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url);
  })());
});
