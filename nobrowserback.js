// ブラウザの「戻る」でゲームから出ないようにする（ゲームの外枠のページだけ。フレームの中では何もしない）
(function () {
  if (window.top !== window) return;
  const hold = () => { try { history.pushState({ noBack: 1 }, '', location.href); } catch (e) { /* not allowed here */ } };
  hold();
  window.addEventListener('popstate', hold);
  // ブラウザは、操作のないページの履歴を飛ばすことがあるので、最初の操作でもう一度積む
  window.addEventListener('pointerdown', hold, { once: true, capture: true });
  window.addEventListener('keydown', hold, { once: true, capture: true });
})();
