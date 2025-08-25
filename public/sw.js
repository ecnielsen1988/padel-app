// public/sw.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 👉 Modtag push fra serveren og vis notifikation
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data?.json() || {}; } catch {}
  const title = data.title || 'Padel';
  const options = {
    body: data.body || '',
    icon: '/icons/maskable-192.png',
    badge: '/icons/maskable-192.png',
    data: { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Åbn appen ved klik
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const client = list.find(w => 'focus' in w);
    if (client) return client.focus();
    return clients.openWindow(url);
  }));
});
