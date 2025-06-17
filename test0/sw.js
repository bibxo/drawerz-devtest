// Enhanced Service Worker for Drawerz Beta 3
const CACHE_NAME = 'drawerz-v1.2.0';
const STATIC_CACHE = 'drawerz-static-v1.2.0';
const DYNAMIC_CACHE = 'drawerz-dynamic-v1.2.0';

// Resources to cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// COOP/COEP headers for SharedArrayBuffer support
const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('🚀 Drawerz SW: Installing v1.2.0...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.addAll(STATIC_ASSETS);
        console.log('✅ Drawerz SW: Static assets cached');
        await self.skipWaiting();
      } catch (error) {
        console.error('❌ Drawerz SW: Cache installation failed:', error);
      }
    })()
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('🔄 Drawerz SW: Activating...');
  
  event.waitUntil(
    (async () => {
      try {
        // Clean old caches
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => 
          name.startsWith('drawerz-') && 
          !name.includes('v1.2.0')
        );
        
        await Promise.all(
          oldCaches.map(cacheName => {
            console.log(`🗑️ Drawerz SW: Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
        );
        
        // Take control of all clients
        await self.clients.claim();
        
        // Notify clients of activation
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ 
            type: 'SW_ACTIVATED', 
            version: '1.2.0',
            timestamp: Date.now()
          });
        });
        
        console.log('✅ Drawerz SW: Activated successfully');
      } catch (error) {
        console.error('❌ Drawerz SW: Activation failed:', error);
      }
    })()
  );
});

// Enhanced fetch handler with intelligent caching
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle navigation requests with security headers
  if (request.mode === 'navigate' && request.destination === 'document') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  
  // Handle static assets
  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }
  
  // Handle external CDN resources
  if (isExternalResource(url)) {
    event.respondWith(handleExternalResource(request));
    return;
  }
  
  // Default: network first for everything else
  event.respondWith(fetch(request));
});

// Handle navigation requests with security headers
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.type === 'opaque') {
      return networkResponse;
    }
    
    // Clone response and add security headers
    const headers = new Headers(networkResponse.headers);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    return new Response(networkResponse.body, {
      status: networkResponse.status,
      statusText: networkResponse.statusText,
      headers
    });
  } catch (error) {
    console.error('🌐 Drawerz SW: Navigation request failed:', error);
    
    // Try to serve from cache as fallback
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match('./index.html');
    
    if (cachedResponse) {
      console.log('📦 Drawerz SW: Serving cached fallback');
      return cachedResponse;
    }
    
    throw error;
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Serve from cache and update in background
      updateCacheInBackground(request, cache);
      return cachedResponse;
    }
    
    // Not in cache, fetch and cache
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('📦 Drawerz SW: Static asset request failed:', error);
    throw error;
  }
}

// Handle external resources with stale-while-revalidate
async function handleExternalResource(request) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    // Always try network first for external resources
    const networkPromise = fetch(request).then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    
    const networkResponse = await networkPromise;
    
    // Return network response if available, otherwise cached
    return networkResponse || cachedResponse || fetch(request);
  } catch (error) {
    console.error('🌍 Drawerz SW: External resource request failed:', error);
    throw error;
  }
}

// Background cache update
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silent fail for background updates
    console.warn('🔄 Drawerz SW: Background cache update failed:', error);
  }
}

// Utility functions
function isStaticAsset(url) {
  const staticExtensions = ['.css', '.js', '.html', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) || 
         url.pathname === '/' || 
         url.pathname.endsWith('/');
}

function isExternalResource(url) {
  const externalDomains = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'unpkg.com'];
  return externalDomains.some(domain => url.hostname.includes(domain));
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  const { data } = event;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: '1.2.0' });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
  }
});

// Clear all caches
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  const drawerCaches = cacheNames.filter(name => name.startsWith('drawerz-'));
  
  await Promise.all(
    drawerCaches.map(cacheName => caches.delete(cacheName))
  );
  
  console.log('🗑️ Drawerz SW: All caches cleared');
}