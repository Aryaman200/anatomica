const CACHE_NAME = 'anatomy101-cache-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/anatomy.html',
  '/medications.html',
  '/conditions.html',
  '/quiz.html',
  '/css/styles.css',
  '/css/pages.css',
  '/css/quiz.css',
  '/js/chrome.js',
  '/js/main.js',
  '/js/quiz.js',
  '/js/scene.js',
  '/js/ui.js',
  '/js/loader.js',
  '/js/config.js',
  '/js/data/medications.js',
  '/js/data/habits.js',
  '/assets/icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const requests = ASSETS.map(url => new Request(url, { cache: 'no-cache' }));
      return cache.addAll(requests);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
