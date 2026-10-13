// Runs on every page. Listens for the shortcut and asks the background to
// toggle the bar. It reads nothing from the page.
(() => {
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  // a copy orphaned by an extension reload leaves the flag behind but is dead
  if (globalThis.__commandKHotkey?.()) return;
  globalThis.__commandKHotkey = alive;

  // a content script can't import, so this repeats defaultShortcut() from src/shortcut.js
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const DEFAULT = { code: 'KeyK', ctrl: !mac, meta: mac, alt: false, shift: false };

  let shortcut = null;
  chrome.storage.local.get('shortcut').then((stored) => (shortcut = stored.shortcut || DEFAULT));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.shortcut) shortcut = changes.shortcut.newValue || DEFAULT;
  });

  function onKeydown(e) {
    if (!alive()) {
      removeEventListener('keydown', onKeydown, true);
      return;
    }
    // same test as matches() in src/shortcut.js
    const s = shortcut;
    if (!s || e.code !== s.code || e.ctrlKey !== s.ctrl || e.metaKey !== s.meta || e.altKey !== s.alt || e.shiftKey !== s.shift) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) chrome.runtime.sendMessage({ type: 'cmdk:hotkey' }).catch(() => {});
  }

  addEventListener('keydown', onKeydown, true);
})();
