const CACHE_NAME = 'manabi-dojo-v38';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/utils.js',
  './js/audio.js',
  './js/questions.js',
  './js/kotowaza.js',
  './js/expansion3.js',
  './js/expansion.js',
  './js/generator.js',
  './js/tower.js',
  './js/guild.js',
  './js/arena.js',
  './js/firebase-config.js',
  './js/cloud.js',
  './js/ui.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // ここで自動的に skipWaiting() しない。
  // 新しいsw.jsは一度「待機中（waiting）」の状態にとどまり、
  // ユーザーが画面上の更新バナーをタップしたときだけ即時切り替える。
  // （自動で切り替えると、既に開いているページのJSは古いままなのに
  //   途中からキャッシュだけ新しくなり、挙動が不安定になるため）
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ページ側（ui.js）から SKIP_WAITING が送られてきたら、待機中のSWを即座に有効化する
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
