/* Cyprus MU Supporters Club — web push service worker */

self.addEventListener('push', (event) => {
  let data = { title: 'Club news', body: 'New update from Cyprus Manchester United Supporters Club', url: '/news', icon: '/logo.jpg' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/logo.jpg',
      badge: '/logo.jpg',
      data: { url: data.url || '/news' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url || '/news'
  const targetUrl = new URL(path, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
