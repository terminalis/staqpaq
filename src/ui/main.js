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

  // When an updated worker takes control (sw.js does skipWaiting + claim),
  // the running page still executes the old modules over a cache the new
  // worker has already replaced. Reload once so shell and cache agree. The
  // draft is write-through persisted (IndexedDB), so a reload loses at most
  // an uncommitted text edit. The first-ever install also fires
  // controllerchange (claim on an uncontrolled page); that page is already
  // current and must NOT reload.
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url));

  // Installed-PWA windows can live for days without a navigation, so the
  // browser's on-navigation update check never runs for them. Re-check when
  // the window regains visibility: update-driven reloads then land at
  // launch/return moments, never mid-interaction.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration.update().catch(() => {});
    }
  });

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
