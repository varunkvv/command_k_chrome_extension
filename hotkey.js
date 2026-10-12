// Listens for the custom shortcut and asks the background to toggle the bar.
// Only registered while a custom shortcut is set, see syncHotkey in background.js.
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

  let shortcut = null;
  chrome.storage.local.get('shortcut').then((stored) => (shortcut = stored.shortcut));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.shortcut) shortcut = changes.shortcut.newValue;
  });

  function onKeydown(e) {
    if (!alive()) {
      removeEventListener('keydown', onKeydown, true);
      return;
    }
    // same test as matches() in src/shortcut.js, which a content script can't import
    const s = shortcut;
    if (!s || e.code !== s.code || e.ctrlKey !== s.ctrl || e.metaKey !== s.meta || e.altKey !== s.alt || e.shiftKey !== s.shift) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) chrome.runtime.sendMessage({ type: 'cmdk:hotkey' }).catch(() => {});
  }

  addEventListener('keydown', onKeydown, true);
})();
