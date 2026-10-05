// Commands shown in the Actions scope. `ctx.tab` is the tab the bar was opened on.
import { item, normalizeUrl } from './search.js';

const NO_GROUP = -1;

const site = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const inWindow = ({ tab, tabs }) => tabs.filter((t) => t.windowId === tab.windowId);
const loose = (ctx) => inWindow(ctx).filter((t) => !t.pinned && (t.groupId ?? NO_GROUP) === NO_GROUP);
const remove = (tabs) => (tabs.length ? chrome.tabs.remove(tabs.map((t) => t.id)) : null);
const open = (url) => () => chrome.tabs.create({ url });

async function closeDuplicates({ tab, tabs }) {
  const keep = new Map();
  if (tab) keep.set(normalizeUrl(tab.url), tab.id);
  const extra = [];
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    if (!keep.has(key)) keep.set(key, t.id);
    else if (keep.get(key) !== t.id && !t.pinned) extra.push(t);
  }
  await remove(extra);
}

async function mergeWindows({ tab }) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const w of windows) {
    if (w.id === tab.windowId || w.incognito !== tab.incognito) continue;
    await chrome.tabs.move(
      w.tabs.map((t) => t.id),
      { windowId: tab.windowId, index: -1 },
    );
  }
}

async function sortBySite(ctx) {
  const sorted = loose(ctx).sort(
    (a, b) => site(a.url).localeCompare(site(b.url)) || (a.title || '').localeCompare(b.title || ''),
  );
  if (sorted.length) {
    await chrome.tabs.move(
      sorted.map((t) => t.id),
      { index: -1 },
    );
  }
}

async function groupBySite(ctx) {
  const bySite = new Map();
  for (const t of loose(ctx)) {
    const s = site(t.url);
    if (!s) continue;
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s).push(t.id);
  }
  for (const [title, tabIds] of bySite) {
    if (tabIds.length < 2) continue;
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: ctx.tab.windowId } });
    await chrome.tabGroups.update(groupId, { title });
  }
}

async function ungroupAll(ctx) {
  const grouped = inWindow(ctx).filter((t) => (t.groupId ?? NO_GROUP) !== NO_GROUP);
  if (grouped.length) await chrome.tabs.ungroup(grouped.map((t) => t.id));
}

async function suspendOthers({ tab, tabs }) {
  const idle = tabs.filter((t) => t.id !== tab.id && !t.active && !t.audible && !t.discarded);
  await Promise.allSettled(idle.map((t) => chrome.tabs.discard(t.id)));
}

// tab: needs a current tab. toast: confirmation shown before the bar closes.
// stay: the bar stays open after running.
const ACTIONS = [
  { id: 'new-tab', title: 'New tab', icon: 'plus', keywords: 'open create blank', run: ({ tab }) => chrome.tabs.create(tab ? { windowId: tab.windowId } : {}) },
  { id: 'new-window', title: 'New window', icon: 'window', keywords: 'open create', run: () => chrome.windows.create({}) },
  { id: 'new-incognito', title: 'New incognito window', icon: 'incognito', keywords: 'private', run: () => chrome.windows.create({ incognito: true }) },
  { id: 'reopen', title: 'Reopen closed tab', icon: 'undo', keywords: 'restore undo', run: () => chrome.sessions.restore() },
  { id: 'duplicate', tab: true, title: 'Duplicate tab', icon: 'copy', keywords: 'clone', run: ({ tab }) => chrome.tabs.duplicate(tab.id) },
  { id: 'pin', tab: true, title: ({ tab }) => (tab.pinned ? 'Unpin tab' : 'Pin tab'), icon: 'pin', run: ({ tab }) => chrome.tabs.update(tab.id, { pinned: !tab.pinned }) },
  { id: 'mute', tab: true, title: ({ tab }) => (tab.mutedInfo?.muted ? 'Unmute tab' : 'Mute tab'), icon: 'mute', keywords: 'sound audio silence', run: ({ tab }) => chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted }) },
  { id: 'reload', tab: true, title: 'Reload tab', icon: 'reload', keywords: 'refresh', run: ({ tab }) => chrome.tabs.reload(tab.id) },
  { id: 'hard-reload', tab: true, title: 'Reload tab without cache', icon: 'reload', keywords: 'hard refresh', run: ({ tab }) => chrome.tabs.reload(tab.id, { bypassCache: true }) },
  { id: 'back', tab: true, title: 'Go back', icon: 'left', keywords: 'previous page', run: ({ tab }) => chrome.tabs.goBack(tab.id) },
  { id: 'forward', tab: true, title: 'Go forward', icon: 'right', keywords: 'next page', run: ({ tab }) => chrome.tabs.goForward(tab.id) },
  { id: 'close', tab: true, title: 'Close tab', icon: 'close', run: ({ tab }) => chrome.tabs.remove(tab.id) },
  { id: 'close-others', tab: true, title: 'Close other tabs', icon: 'close', run: (ctx) => remove(inWindow(ctx).filter((t) => t.id !== ctx.tab.id && !t.pinned)) },
  { id: 'close-right', tab: true, title: 'Close tabs to the right', icon: 'close', run: (ctx) => remove(inWindow(ctx).filter((t) => t.index > ctx.tab.index && !t.pinned)) },
  { id: 'close-duplicates', title: 'Close duplicate tabs', icon: 'close', keywords: 'dedupe', run: closeDuplicates },
  { id: 'detach', tab: true, title: 'Move tab to new window', icon: 'out', keywords: 'detach pop out', run: ({ tab }) => chrome.windows.create({ tabId: tab.id }) },
  { id: 'merge', tab: true, title: 'Merge all windows', icon: 'layers', keywords: 'combine', run: mergeWindows },
  { id: 'sort', tab: true, title: 'Sort tabs by site', icon: 'sort', keywords: 'order organize', run: sortBySite },
  { id: 'group', tab: true, title: 'Group tabs by site', icon: 'folder', keywords: 'organize', run: groupBySite },
  { id: 'ungroup', tab: true, title: 'Ungroup all tabs', icon: 'folder', run: ungroupAll },
  { id: 'suspend', tab: true, title: 'Suspend other tabs', icon: 'pause', keywords: 'discard memory sleep', run: suspendOthers },
  { id: 'copy-url', tab: true, title: 'Copy URL', icon: 'link', keywords: 'address link', toast: 'Copied URL', run: ({ tab, copy }) => copy(tab.url) },
  { id: 'copy-markdown', tab: true, title: 'Copy as markdown link', icon: 'link', keywords: 'md', toast: 'Copied link', run: ({ tab, copy }) => copy(`[${tab.title}](${tab.url})`) },
  { id: 'bookmark', tab: true, title: 'Bookmark this tab', icon: 'star', keywords: 'save favorite', toast: 'Bookmarked', run: ({ tab }) => chrome.bookmarks.create({ title: tab.title, url: tab.url }) },
  { id: 'open-history', title: 'Open history', icon: 'clock', run: open('chrome://history') },
  { id: 'open-downloads', title: 'Open downloads', icon: 'download', run: open('chrome://downloads') },
  { id: 'open-bookmarks', title: 'Open bookmark manager', icon: 'star', run: open('chrome://bookmarks') },
  { id: 'open-extensions', title: 'Open extensions', icon: 'blocks', keywords: 'addons plugins', run: open('chrome://extensions') },
  { id: 'open-settings', title: 'Open browser settings', icon: 'sliders', keywords: 'preferences', run: open('chrome://settings') },
  { id: 'shortcut', title: 'Change the Command K shortcut', icon: 'keyboard', keywords: 'keybinding hotkey', run: open('chrome://extensions/shortcuts') },
  { id: 'theme', title: ({ theme }) => `Switch theme (now ${theme})`, icon: 'theme', keywords: 'dark light appearance mode', stay: true, run: ({ cycleTheme }) => cycleTheme() },
];

const byId = new Map(ACTIONS.map((a) => [a.id, a]));

export const findAction = (id) => byId.get(id);

export function buildActions(ctx) {
  return ACTIONS.filter((a) => !a.tab || ctx.tab).map((a) =>
    item('action', {
      uid: `action:${a.id}`,
      key: `action:${a.id}`,
      id: a.id,
      title: typeof a.title === 'function' ? a.title(ctx) : a.title,
      keywords: a.keywords,
      icon: a.icon,
    }),
  );
}
