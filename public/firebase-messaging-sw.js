/* LUGA HUB Firebase Cloud Messaging Service Worker */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'LUGA HUB Call', body: event.data.text() } };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || 'LUGA HUB Call';
  const body = notif.body || data.body || 'Incoming audio or video call on LUGA HUB';
  const callId = data.callId || '';

  const options = {
    body,
    icon: '/luga-logo-enhanced.jpg',
    badge: '/luga-logo-enhanced.jpg',
    tag: callId ? `luga-call-${callId}` : 'luga-call',
    renotify: true,
    requireInteraction: data.type === 'incoming_call',
    data: {
      url: data.url || '/',
      callId,
      callType: data.callType || 'audio',
    },
    actions:
      data.type === 'incoming_call'
        ? [
            { action: 'open', title: 'Answer / Open' },
            { action: 'dismiss', title: 'Dismiss' },
          ]
        : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'LUGA_CALL_NOTIFICATION_CLICK',
            callId: event.notification.data?.callId || null,
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
