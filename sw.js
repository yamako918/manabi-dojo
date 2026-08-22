const CACHE_NAME = 'manabi-dojo-v25';
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
  './js/firebase-config.js',
  './js/cloud.js',
  './js/ui.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // 縺薙％縺ｧ閾ｪ蜍慕噪縺ｫ skipWaiting() 縺励↑縺・・
  // 譁ｰ縺励＞sw.js縺ｯ荳蠎ｦ縲悟ｾ・ｩ滉ｸｭ・・aiting・峨阪・迥ｶ諷九↓縺ｨ縺ｩ縺ｾ繧翫・
  // 繝ｦ繝ｼ繧ｶ繝ｼ縺檎判髱｢荳翫・譖ｴ譁ｰ繝舌リ繝ｼ繧偵ち繝・・縺励◆縺ｨ縺阪□縺大叉譎ょ・繧頑崛縺医ｋ縲・
  // ・郁・蜍輔〒蛻・ｊ譖ｿ縺医ｋ縺ｨ縲∵里縺ｫ髢九＞縺ｦ縺・ｋ繝壹・繧ｸ縺ｮJS縺ｯ蜿､縺・∪縺ｾ縺ｪ縺ｮ縺ｫ
  //   騾比ｸｭ縺九ｉ繧ｭ繝｣繝・す繝･縺縺第眠縺励￥縺ｪ繧翫∵嫌蜍輔′荳榊ｮ牙ｮ壹↓縺ｪ繧九◆繧・ｼ・
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 繝壹・繧ｸ蛛ｴ・・i.js・峨°繧・SKIP_WAITING 縺碁√ｉ繧後※縺阪◆繧峨∝ｾ・ｩ滉ｸｭ縺ｮSW繧貞叉蠎ｧ縺ｫ譛牙柑蛹悶☆繧・
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
