// Read Later offline helper ("service worker").
// It keeps a copy of the app's own files so the app still opens with no internet.
// It never sees your documents: those live in the phone's page storage, not in these files.
//
// Strategy: try the internet first (so you always get the newest version of the app),
// and fall back to the saved copy when you're offline or the internet takes over 3 seconds.

const CACHE = 'readlater-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

// First install: save a copy of the app files.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// Clean out copies from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// How long to wait for the internet before opening the saved copy. On weak signal (a subway, plane
// Wi-Fi) a request can hang for a long time without failing, which used to leave a blank screen.
const NET_WAIT_MS = 3000;
const fromCache = (req) => caches.match(req).then((hit) => hit || caches.match('index.html'));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle this app's own files; leave everything else alone.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(new Promise((resolve, reject) => {
    let done = false;
    const answer = (res) => { if (!done && res) { done = true; resolve(res); } };
    // The internet answer still saves a fresh copy even if it arrives after the saved copy was shown,
    // so the next launch gets the newest version.
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
        answer(res);
      })
      .catch((err) => fromCache(req).then((hit) => {
        if (hit) answer(hit);
        else if (!done) { done = true; reject(err); }
      }));
    // Too slow: show the saved copy if there is one (if not, keep waiting for the internet).
    setTimeout(() => { if (!done) fromCache(req).then(answer); }, NET_WAIT_MS);
  }));
});
