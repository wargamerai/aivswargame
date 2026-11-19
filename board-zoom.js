'use strict';

(() => {
  const options = {capture: true, passive: false};

  window.addEventListener('wheel', event => {
    // Chromium and Firefox also report trackpad pinch as a modified wheel event.
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, options);

  // Safari exposes pinch as gesture events.
  const preventPinchZoom = event => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange']) {
    window.addEventListener(type, preventPinchZoom, options);
  }
})();
