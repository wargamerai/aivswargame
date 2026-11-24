/* Convert the game's report document into a downloadable image. */
window.ReportImage = (() => {
  'use strict';

  const vendor = new URL('vendor/html2canvas/html2canvas-1.4.1.min.js', document.currentScript.src).href;
  let renderer;

  function loadRenderer() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!renderer) {
      renderer = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = vendor;
        script.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('Renderer unavailable'));
        script.onerror = () => reject(new Error('Renderer could not load'));
        document.head.appendChild(script);
      }).catch(error => {
        renderer = null;
        throw error;
      });
    }
    return renderer;
  }

  function reportDocument(html, scripts = false) {
    const report = new DOMParser().parseFromString(html, 'text/html');
    report.querySelectorAll('base, iframe, object, embed, meta[http-equiv], script[src]').forEach(node => node.remove());
    if (!scripts) report.querySelectorAll('script').forEach(node => node.remove());
    const policy = report.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'none'; script-src " +
      (scripts ? "'unsafe-inline'" : "'none'");
    report.head.prepend(policy);
    return report;
  }

  function createFrame(markup, sandbox, width) {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', sandbox);
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;top:0;left:-" + (width + 100) +
      "px;width:" + width + "px;height:1px;border:0;pointer-events:none;";
    frame.srcdoc = '<!doctype html>' + markup;
    return frame;
  }

  function frameReady(frame) {
    return new Promise((resolve, reject) => {
      const expired = setTimeout(() => reject(new Error('Report did not load')), 12000);
      frame.addEventListener('load', () => {
        clearTimeout(expired);
        resolve();
      }, { once: true });
      document.body.appendChild(frame);
    });
  }

  // Interactive reports run in their own origin. Only their rendered markup
  // is passed back to the script-free capture frame.
  async function snapshot(html, prepare, width) {
    const report = reportDocument(html, true);
    const callback = report.createElement('script');
    callback.textContent = prepare + '\nparent.postMessage({reportImageSnapshot: document.documentElement.outerHTML}, "*");';
    report.body.appendChild(callback);
    const frame = createFrame(report.documentElement.outerHTML, 'allow-scripts', width);
    try {
      return await new Promise((resolve, reject) => {
        const receive = event => {
          if (event.source !== frame.contentWindow || typeof event.data?.reportImageSnapshot !== 'string') return;
          clearTimeout(expired);
          window.removeEventListener('message', receive);
          resolve(event.data.reportImageSnapshot);
        };
        const expired = setTimeout(() => {
          window.removeEventListener('message', receive);
          reject(new Error('Interactive report did not render'));
        }, 12000);
        window.addEventListener('message', receive);
        document.body.appendChild(frame);
      });
    } finally {
      frame.remove();
    }
  }

  function imageType(language = document.documentElement.lang) {
    return /^ja(?:-|$)/i.test(language) ? 'image/jpeg' : 'image/png';
  }

  function formatLabel(language) {
    return imageType(language) === 'image/jpeg' ? 'JPEG' : 'PNG';
  }

  async function render(html, { width = 1100, prepare = '', language } = {}) {
    const draw = await loadRenderer();
    const report = reportDocument(prepare ? await snapshot(html, prepare, width) : html);
    const type = imageType(language || report.documentElement.lang || document.documentElement.lang);
    for (const details of report.querySelectorAll('details')) details.open = true;
    const frame = createFrame(report.documentElement.outerHTML, 'allow-same-origin', width);
    let canvas;
    try {
      await frameReady(frame);
      const page = frame.contentDocument;
      await page.fonts?.ready;
      await Promise.allSettled(Array.from(page.images, image => image.decode ? image.decode() : Promise.resolve()));

      const root = page.documentElement;
      const height = Math.ceil(Math.max(root.scrollHeight, page.body.scrollHeight));
      if (!height) throw new Error('Report is empty');
      // Choose a size that stays within mobile canvas limits, even for long logs.
      const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(12000000 / (width * height)));
      canvas = await draw(root, {
        width, height, scale, windowWidth: width, windowHeight: height,
        scrollX: 0, scrollY: 0, allowTaint: false, logging: false, backgroundColor: '#fff',
      });
      return await new Promise((resolve, reject) => canvas.toBlob(
        blob => blob?.size && blob.type === type ? resolve(blob) : reject(new Error('Image encoding failed')),
        type, type === 'image/jpeg' ? 0.92 : undefined));
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      frame.remove();
    }
  }

  async function download(html, filename, button, options) {
    if (button) button.disabled = true;
    try {
      const blob = await render(html, options);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const extension = blob.type === 'image/jpeg' ? '.jpeg' : '.png';
      link.download = filename.replace(/\.(?:html?|png|jpe?g)$/i, '') + extension;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 3000);
    } catch (error) {
      console.warn('Could not export report image', error);
      const japanese = document.documentElement.lang === 'ja';
      alert(options?.error || (japanese ? 'レポートの画像を保存できませんでした。' : 'Could not save the report image.'));
    } finally {
      if (button) button.disabled = false;
    }
  }

  return { download, render, formatLabel };
})();
