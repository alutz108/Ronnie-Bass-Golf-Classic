// Ronnie Bass Classic — service worker
//
// Strategy: NETWORK-FIRST for the app shell (index.html, manifest, icons) so updates are picked
// up immediately, with a cached fallback only when there's truly no signal. Firebase/Firestore
// requests are never touched here — they're cross-origin and Firestore has its own offline cache.
//
// CACHE is versioned. Bump this string any time index.html changes, so the browser detects
// sw.js itself changed and re-runs install — this is what actually pulls in a fresh shell.
// Forgetting to bump this is exactly why an installed home-screen icon can get stuck on an old
// version even after the site itself has been updated.
const CACHE = 'rbc-shell-v21';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request,{ignoreSearch:true})) // offline: fall back to last-known-good
  );
});
