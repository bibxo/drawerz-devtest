
const CACHE_NAME = 'drawerz-cache-v1';
const COOP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp
};

self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  console.log('Drawerz Service Worker: Installing...');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); 
  console.log('Drawerz Service Worker: Activated.');

  self.clients.matchAll({ type: 'window' }).then(windowClients => {
    windowClients.forEach(windowClient => {
      windowClient.postMessage({ type: 'SW_ACTIVATED' });
    });
  });
});

self.addEventListener('fetch', (event) => {

  if (event.request.mode === 'navigate' && 
      event.request.destination === 'document' &&
      (event.request.url.endsWith('/') || event.request.url.endsWith('.html'))) {
    
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          

          if (networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const newHeaders = new Headers(networkResponse.headers);
          for (const key in COOP_HEADERS) {
            newHeaders.set(key, COOP_HEADERS[key]);
          }
          

          return new Response(networkResponse.body, {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            headers: newHeaders,
          });
        } catch (error) {
          console.error('Drawerz Service Worker: Fetch error for navigation request:', error, event.request.url);

          return fetch(event.request); 
        }
      })()
    );
  } else {
    // For all other requests (JS, CSS, images, API calls, etc.),
    // let them pass through normally. The document loading them needs the headers.
    event.respondWith(fetch(event.request));
  }
});
