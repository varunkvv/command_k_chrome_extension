// Injected on demand when the shortcut fires. Hosts the palette in an
// extension iframe so page CSS, page CSP and page key handlers can't touch it.
(() => {
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  // a copy orphaned by an extension reload leaves the flag behind but is dead
  if (globalThis.__commandK?.()) return;
  globalThis.__commandK = alive;

  const TAG = 'command-k-root';
  const READY_TIMEOUT_MS = 2000;
  const origin = new URL(chrome.runtime.getURL('/')).origin;

  let host = null;
  let frame = null;
  let isOpen = false;
  let ready = false;
  let lastFocus = null;
  let refocusBudget = 0;
  let readyTimer = 0;

  const important = (el, styles) => {
    for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, 'important');
  };

  function mount(token) {
    document.querySelectorAll(TAG).forEach((el) => el.remove());

    host = document.createElement(TAG);
    important(host, {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      overflow: 'hidden',
      'z-index': '2147483647',
      display: 'none',
    });

    frame = document.createElement('iframe');
    frame.title = 'Command K';
    frame.allow = 'clipboard-write';
    // color-scheme must match the iframe document or chrome paints it opaque
    important(frame, {
      all: 'initial',
      display: 'block',
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      border: '0',
      background: 'transparent',
      'color-scheme': 'light',
    });
    frame.src = `${chrome.runtime.getURL('palette.html')}#${token}`;

    host.attachShadow({ mode: 'closed' }).append(frame);
    document.documentElement.append(host);
    // the top layer beats any z-index and modal <dialog>s on the page
    try {
      host.popover = 'manual';
    } catch {
      // older browsers keep the z-index fallback
    }
  }

  function unmount() {
    host?.remove();
    host = frame = null;
    ready = false;
  }

  function post(message) {
    frame?.contentWindow?.postMessage(message, origin);
  }

  function show() {
    important(host, { display: 'block' });
    try {
      host.showPopover();
    } catch {
      // not supported or already showing
    }
    refocusBudget = 6;
    frame.focus({ preventScroll: true });
    post({ cmdk: 'open', dark: matchMedia('(prefers-color-scheme: dark)').matches });
  }

  function hide() {
    isOpen = false;
    removeEventListener('keydown', onPageKeydown, true);
    removeEventListener('focusin', onPageFocusIn, true);
    if (!host) return;
    try {
      host.hidePopover();
    } catch {
      // wasn't showing as a popover
    }
    important(host, { display: 'none' });
    if (lastFocus?.isConnected && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else window.focus();
    lastFocus = null;
  }

  function toggle(token) {
    if (isOpen) {
      if (ready) post({ cmdk: 'close' });
      else hide();
      return;
    }
    isOpen = true;
    lastFocus = document.activeElement;
    addEventListener('keydown', onPageKeydown, true);
    addEventListener('focusin', onPageFocusIn, true);
    if (host?.isConnected && ready) {
      show();
      return;
    }
    mount(token);
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => {
      // the frame never loaded (blocked by the page), so use the popup instead
      hide();
      unmount();
      chrome.runtime.sendMessage({ type: 'cmdk:fallback' }).catch(() => {});
    }, READY_TIMEOUT_MS);
  }

  // these only fire when focus has escaped the iframe
  function onPageKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ready) post({ cmdk: 'close' });
      else hide();
    } else if (ready && refocusBudget-- > 0) {
      frame.focus({ preventScroll: true });
    }
  }

  function onPageFocusIn(e) {
    if (ready && e.target !== host && refocusBudget-- > 0) frame.focus({ preventScroll: true });
  }

  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origin) return;
    if (e.data?.cmdk === 'ready') {
      ready = true;
      clearTimeout(readyTimer);
      if (isOpen) show();
    } else if (e.data?.cmdk === 'hide') {
      hide();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'cmdk:toggle') return;
    toggle(msg.token);
    sendResponse({ ok: true });
  });
})();
