/*
 * 영어 서재 서비스 워커
 * - 앱 화면(HTML·JS·CSS·아이콘)을 저장해 두어 인터넷이 없어도 앱이 열리게 합니다.
 * - 구글 드라이브·Claude API 요청은 절대 저장하지 않습니다(항상 네트워크).
 * - 버전을 바꾸면 옛 캐시는 자동으로 지워집니다.
 */
const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
// 하위 경로(GitHub Pages)에서도 동작하도록 서비스 워커의 위치를 기준으로 경로를 만듦
const BASE = new URL('./', self.location.href).pathname; // 예: '/' 또는 '/english-library/'
const SHELL_URLS = [BASE, BASE + 'manifest.webmanifest', BASE + 'icons/icon-192.png', BASE + 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('google.com') ||
    url.hostname.endsWith('gstatic.com') ||
    url.hostname.endsWith('anthropic.com')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  // 화면 이동: 네트워크 우선, 실패하면 저장본
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(BASE)))
    );
    return;
  }

  // 정적 파일: 저장본을 바로 주고, 뒤에서 새로 받아 갱신
  if (url.pathname.startsWith(BASE + '_next/') || url.pathname.startsWith(BASE + 'icons/') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.png')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
