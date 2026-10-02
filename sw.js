// Ronnie Bass Classic: service worker
//
// OPEN INSTANTLY: the app (index.html, manifest, icons, pictures) is served from the phone's saved copy first and refreshed
// in the background, so reopening it takes about a second even with one bar of signal. When the background check finds a
// newer version it tells the open page ("A new version is ready") and the next reload uses it.
// Fonts and the Firebase library are saved after their first download (they never change), so the app also starts offline.
// Firestore, sign-in and Storage requests are never touched here (Firestore has its own offline cache).
//
// Bump CACHE in this file on EVERY release (it is what makes browsers pick up a changed service worker and drop the old
// copy). Picture file names carry a fingerprint, so a changed picture gets a new name and is fetched fresh.
const CACHE = 'rbc-shell-v30';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './img/logo.6751ba0b.webp',
  './img/team27-lutz.18e04487.webp',
  './img/team27-guad.b461fa84.webp',
  './img/team25-lutz.362c3286.webp',
  './img/team25-guad.b89f2d08.webp',
  './img/team26-lutz.923efae1.webp',
  './img/team26-guad.0321b878.webp',
  './img/p-Belon.97c024ec.jpg',
  './img/p-Weidaw.557054e8.jpg',
  './img/p-Justin.746be0c3.jpg',
  './img/p-Bradio.e010210c.jpg',
  './img/p-Fogel.e644c142.jpg',
  './img/p-Bustin.a8928a2b.jpg',
  './img/p-Brett.b1d385f2.jpg',
  './img/p-Bill.d32c03e1.jpg',
  './img/p-Tim.3f1385c3.jpg',
  './img/p-Guad.fb1519e2.jpg',
  './img/p-Nils.847990b7.jpg',
  './img/p-Bryce.2b417b40.jpg',
  './img/p-Lutz.327f618d.jpg',
  './img/p-Mannone.6add4de8.jpg'];

self.addEventListener('install', e => {
  // one missing file (for example an icon that was never uploaded) must not stop the rest from being saved
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

const isStatic = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' ||
  (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'));
const tag = r => r && (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length'));

async function tell() {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage({ t: 'shell-updated' }));
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const same = url.origin === self.location.origin;
  if (!same && !isStatic(url)) return; // Firestore, auth, storage: not ours

  // pictures, fonts, the Firebase library: saved copy first, download once
  if (!same || url.pathname.indexOf('/img/') >= 0) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch (err) { return Response.error(); }
    }));
    return;
  }

  // the app itself: saved copy first, check for a newer one in the background
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res && res.status === 200) {
        const was = hit && tag(hit), now = tag(res);
        c.put(key, res.clone());
        if (was && now && was !== now) tell();
      }
      return res;
    }).catch(() => null);
    e.waitUntil(net);
    if (hit) return hit;
    return (await net) || (await c.match('./index.html', { ignoreSearch: true })) || Response.error();
  }));
});
