importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const configParam = new URL(self.location.href).searchParams.get('firebaseConfig');
if (!configParam) {
  throw new Error('Firebase messaging config is missing.');
}

firebase.initializeApp(JSON.parse(configParam));
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'StayManager';
  const options = {
    body: payload.notification?.body ?? '',
    icon: '/android-chrome-192x192.png',
    data: { link: payload.data?.link ?? '/my-reservations' },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? '/my-reservations';
  const target = new URL(link, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
