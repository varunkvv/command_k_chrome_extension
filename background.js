// Opens the command bar from the shortcut or the toolbar icon. The preferred
// surface is an overlay injected into the active tab. Pages that can't be
// scripted (chrome://, the web store, the new tab page) fall back to the
// toolbar popup, then to a small standalone window.

const surfaces = new Set();
const ALL_SITES = { origins: ['<all_urls>'] };
const HOTKEY = {
  id: 'cmdk-hotkey',
  js: ['hotkey.js'],
  matches: ['<all_urls>'],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: 'document_start',
};
let syncing = Promise.resolve();

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-palette') toggle(tab);
});

// no default popup, so a click on the icon lands here and gets the overlay too
chrome.action.onClicked.addListener((tab) => toggle(tab));

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cmdk-surface') return;
  surfaces.add(port);
  port.onDisconnect.addListener(() => surfaces.delete(port));
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'cmdk:fallback') openFallback(sender.tab);
  else if (msg?.type === 'cmdk:hotkey') toggle(sender.tab);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.shortcut) syncHotkey();
});
chrome.permissions.onAdded.addListener(() => syncHotkey());
chrome.permissions.onRemoved.addListener(() => syncHotkey());
// an update orphans the copies already running in open tabs
chrome.runtime.onInstalled.addListener(() => syncHotkey({ reinject: true }));
syncHotkey();

// The browser won't let an extension rebind its own command, so a custom
// shortcut is a key listener on every page. It is registered only while a
// shortcut is set and the user has granted access to all sites for it.
function syncHotkey({ reinject = false } = {}) {
  // one at a time, the events above arrive in bursts
  syncing = syncing
    .then(async () => {
      const { shortcut } = await chrome.storage.local.get('shortcut');
      const wanted = !!shortcut && (await chrome.permissions.contains(ALL_SITES));
      const [registered] = await chrome.scripting.getRegisteredContentScripts({ ids: [HOTKEY.id] });
      if (!wanted) {
        if (registered) await chrome.scripting.unregisterContentScripts({ ids: [HOTKEY.id] });
        return;
      }
      if (!registered) await chrome.scripting.registerContentScripts([HOTKEY]);
      else if (!reinject) return;
      // a registered script only reaches pages loaded from now on
      for (const tab of await chrome.tabs.query({})) {
        chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: HOTKEY.js }).catch(() => {});
      }
    })
    .catch((err) => console.warn('[command k]', err));
  return syncing;
}

// The overlay iframe is web accessible, so any page could embed it. It only
// renders when handed this per-session token, which pages never see.
async function getToken() {
  let { token } = await chrome.storage.session.get('token');
  if (!token) {
    token = crypto.randomUUID();
    await chrome.storage.session.set({ token });
  }
  return token;
}

async function toggle(tab) {
  if (surfaces.size) {
    for (const port of surfaces) port.postMessage('close');
    return;
  }
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (tab?.id != null && (await toggleInTab(tab.id))) return;
  await openFallback(tab);
}

async function toggleInTab(tabId) {
  const msg = { type: 'cmdk:toggle', token: await getToken() };
  const send = () => chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  try {
    if ((await send())?.ok) return true;
  } catch {
    // no content script in this tab yet
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return !!(await send())?.ok;
  } catch {
    return false;
  }
}

async function openFallback(tab) {
  // the popup is set only for the moment it opens, and told which tab it is for
  const scope = tab?.id != null ? { tabId: tab.id } : {};
  try {
    await chrome.action.setPopup({ ...scope, popup: `palette.html?tab=${tab?.id ?? ''}` });
    await chrome.action.openPopup(tab ? { windowId: tab.windowId } : undefined);
    return;
  } catch {
    // no focused window, or the popup is unavailable here
  } finally {
    await chrome.action.setPopup({ ...scope, popup: '' }).catch(() => {});
  }
  const width = 680;
  const height = 480;
  const opts = { url: `palette.html?mode=window&tab=${tab?.id ?? ''}`, type: 'popup', width, height, focused: true };
  try {
    const win = tab ? await chrome.windows.get(tab.windowId) : await chrome.windows.getLastFocused();
    opts.left = Math.round(win.left + (win.width - width) / 2);
    opts.top = Math.round(win.top + Math.max(80, win.height * 0.18));
  } catch {
    // let the browser place it
  }
  await chrome.windows.create(opts);
}
