/* Apply the same UTF-8 file budget to reports saved from the games. */
window.GameReportLimit = (() => {
  const limit = 50000;
  const encoder = new TextEncoder();
  const size = value => encoder.encode(value).length;

  function prefix(text, budget) {
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (size(text.slice(0, mid)) <= budget) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo).replace(/[\uD800-\uDBFF]$/, '');
  }

  function text(value) {
    if (size(value) <= limit) return value;
    const footer = '\n…';
    const kept = prefix(value, limit - size(footer));
    const line = kept.lastIndexOf('\n');
    return (line > 0 ? kept.slice(0, line) : kept) + footer;
  }

  function html(value, { discard = [], history = [], summary = '', footer = '' } = {}) {
    if (size(value) <= limit) return value;
    const page = new DOMParser().parseFromString(value, 'text/html');
    const serialize = () => '<!doctype html>\n' + page.documentElement.outerHTML;
    const notice = page.createElement('p');
    notice.textContent = page.documentElement.lang === 'ja'
      ? '5万バイトに収めるため、一部の図や詳細を省略しました。'
      : 'Some figures or details were omitted to keep this report within 50,000 bytes.';
    const result = Array.from(summary ? page.querySelectorAll(summary) : [])
      .map(node => node.textContent.trim()).join('\n');
    const footerNode = footer ? page.querySelector(footer) : null;
    if (footerNode) footerNode.before(notice);
    else page.body.append(notice);

    for (const selector of discard) {
      for (const node of page.querySelectorAll(selector)) node.remove();
      const reduced = serialize();
      if (size(reduced) <= limit) return reduced;
    }

    let bytes = size(serialize());
    for (const selector of history) {
      for (const node of page.querySelectorAll(selector)) {
        bytes -= size(node.outerHTML);
        node.remove();
        if (bytes <= limit) return serialize();
      }
    }

    // Use the explicitly chosen results if a single detail or asset fills the file.
    const heading = page.body.querySelector('h1, h2')?.textContent || page.title;
    page.head.replaceChildren();
    const charset = page.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    page.head.append(charset);
    const title = page.createElement('h1');
    title.textContent = heading;
    const body = page.createElement('pre');
    page.body.replaceChildren(title, body, notice);
    if (footerNode) page.body.append(footerNode);
    body.textContent = prefix(result, 7000);
    if (size(serialize()) > limit) title.textContent = prefix(heading, 2000);
    return serialize();
  }

  return { size, limit, html, text };
})();
