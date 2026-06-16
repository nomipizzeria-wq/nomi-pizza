// Nomi Pizza — Service Worker
// Cache version — bump this to invalidate cache on deploy
const CACHE_VERSION = 'nomi-v1'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const API_CACHE     = `${CACHE_VERSION}-api`

// Files to cache immediately on install
const PRECACHE = [
  '/nomi-customer-app.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-apple.png'
]

// ── Install: precache static assets ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('nomi-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: smart routing strategy ────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // API calls → network first, no caching (always fresh data)
  if(url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    return
  }

  // External resources (fonts, CDN) → cache first
  if(!url.hostname.includes('nomipizza')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(response => {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone))
          return response
        }).catch(() => cached)
      )
    )
    return
  }

  // App HTML → network first, fall back to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone()
        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone))
        return response
      })
      .catch(() => caches.match(request))
  )
})

// ── Push notifications (ready for future use) ─────────────────
self.addEventListener('push', event => {
  if(!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nomi Pizza', {
      body:    data.body || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    data
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/nomi-customer-app.html')
  )
})
