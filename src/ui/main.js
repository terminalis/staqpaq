// Application boot module (loaded by index.html). Mounts the root <sq-app> into
// #app. All registration + booting happens inside <sq-app>.

import './icons/sq-icon.js';
import './app.js';

async function warmServiceWorkerCache(registration) {
  if (!registration || !registration.active) return;
  const scope = registration.scope;
  const urls = new Set([new URL('../../index.html', import.meta.url).href]);
  for (const entry of performance.getEntriesByType('resource')) {
    try {
      const url = new URL(entry.name);
      if (url.origin === location.origin && url.href.startsWith(scope)) {
        url.hash = '';
        urls.add(url.href);
      }
    } catch {
      /* Ignore non-URL performance entries. */
    }
  }
  registration.active.postMessage({
    type: 'STAQPAQ_CACHE_URLS',
    urls: [...urls],
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url));
  const readyRegistration = await navigator.serviceWorker.ready;
  warmServiceWorkerCache(readyRegistration);
  window.addEventListener('load', () => {
    window.setTimeout(() => warmServiceWorkerCache(readyRegistration), 0);
  }, { once: true });
}

const mount = document.getElementById('app');
if (mount && !mount.querySelector('sq-app')) {
  mount.appendChild(document.createElement('sq-app'));
}

registerServiceWorker().catch(() => {
  /* The app remains fully usable if a host or browser disallows service workers. */
});
