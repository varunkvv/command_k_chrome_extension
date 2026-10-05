// Opens the command bar. The preferred surface is an overlay injected into the
// active tab. Pages that can't be scripted (chrome://, the web store, the new
// tab page) fall back to the toolbar popup, then to a small standalone window.

const surfaces = new Set();

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-palette') toggle(tab);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cmdk-surface') return;
  surfaces.add(port);
  port.onDisconnect.addListener(() => surfaces.delete(port));
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'cmdk:fallback') openFallback(sender.tab);
});

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
  try {
    await chrome.action.openPopup();
    return;
  } catch {
    // no focused window, or the popup is unavailable here
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
