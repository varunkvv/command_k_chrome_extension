// Reads tabs, sessions, bookmarks and history into searchable items.
import { item, displayUrl } from './search.js';

const SELF = chrome.runtime.getURL('palette.html');
const BLANK = /^(chrome|brave|edge|vivaldi|opera|arc):\/\/(newtab|new-tab-page|startpage)|^about:(blank|newtab|home)/i;
const HISTORY_CACHE = 2500;

const safe = async (fn, fallback = null) => {
  try {
    return (await fn()) ?? fallback;
  } catch {
    return fallback;
  }
};

export const isBlankTab = (tab) => !tab?.url || BLANK.test(tab.url);

export function faviconUrl(it) {
  if (it.favIconUrl?.startsWith('data:')) return it.favIconUrl;
  if (!/^(https?|file):/.test(it.url || '')) return null;
  // served from the browser's local favicon cache, no network request
  return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(it.url)}&size=32`;
}

async function findCurrent(hintTabId) {
  if (hintTabId) {
    const hinted = await safe(() => chrome.tabs.get(hintTabId));
    if (hinted) return hinted;
  }
  // set when running as the overlay iframe inside a tab
  const own = await safe(() => chrome.tabs.getCurrent());
  if (own && !own.url?.startsWith(SELF)) return own;
  // "current window" is unreliable from a popup when several windows are open
  for (const where of [{ currentWindow: true }, { lastFocusedWindow: true }]) {
    const [active] = await safe(() => chrome.tabs.query({ active: true, ...where }), []);
    if (active && !active.url?.startsWith(SELF)) return active;
  }
  return null;
}

/** Open tabs, most recently used first, with the current tab last. */
export async function loadContext(hintTabId) {
  const [all, groups, current] = await Promise.all([
    safe(() => chrome.tabs.query({}), []),
    safe(() => chrome.tabGroups.query({}), []),
    findCurrent(hintTabId),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const rawTabs = all.filter((t) => !(t.url || '').startsWith(SELF));
  const ordered = [...rawTabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const at = ordered.findIndex((t) => t.id === current?.id);
  if (at >= 0) ordered.push(...ordered.splice(at, 1));

  const tabs = ordered.map((t, rank) => {
    const group = groupById.get(t.groupId);
    return item('tab', {
      uid: `tab:${t.id}`,
      key: `tab:${t.url}`,
      title: t.title,
      url: t.url,
      sub: displayUrl(t.url),
      favIconUrl: t.favIconUrl,
      tabId: t.id,
      windowId: t.windowId,
      rank,
      current: t.id === current?.id,
      otherWindow: !!current && t.windowId !== current.windowId,
      pinned: t.pinned,
      audible: t.audible && !t.mutedInfo?.muted,
      muted: !!t.mutedInfo?.muted,
      group: group ? { title: group.title, color: group.color } : null,
    });
  });
  return { tabs, rawTabs, current };
}

export async function loadClosed() {
  const sessions = await safe(() => chrome.sessions.getRecentlyClosed({ maxResults: 25 }), []);
  const out = [];
  for (const s of sessions) {
    const time = (s.lastModified || 0) * 1000;
    if (s.tab) {
      const t = s.tab;
      out.push(
        item('closed', {
          uid: `closed:${t.sessionId}`,
          key: `url:${t.url}`,
          title: t.title,
          url: t.url,
          sub: displayUrl(t.url),
          favIconUrl: t.favIconUrl,
          sessionId: t.sessionId,
          time,
        }),
      );
    } else if (s.window) {
      const w = s.window;
      const count = w.tabs?.length || 0;
      out.push(
        item('closed', {
          uid: `closed:${w.sessionId}`,
          key: `closed-window`,
          title: `Window with ${count} tab${count === 1 ? '' : 's'}`,
          sub: (w.tabs || [])
            .slice(0, 3)
            .map((t) => t.title)
            .join(', '),
          sessionId: w.sessionId,
          isWindow: true,
          time,
        }),
      );
    }
  }
  return out;
}

export async function loadBookmarks() {
  const tree = await safe(() => chrome.bookmarks.getTree(), []);
  const out = [];
  const walk = (nodes, path) => {
    for (const node of nodes) {
      if (node.children) {
        walk(node.children, node.title ? [...path, node.title] : path);
      } else if (node.url && !/^(javascript|data):/i.test(node.url)) {
        out.push(
          item('bookmark', {
            uid: `bookmark:${node.id}`,
            key: `url:${node.url}`,
            title: node.title,
            url: node.url,
            sub: displayUrl(node.url),
            folder: path[path.length - 1] || '',
            dateAdded: node.dateAdded,
          }),
        );
      }
    }
  };
  walk(tree, []);
  return out;
}

const historyItem = (h) =>
  item('history', {
    uid: `history:${h.id}`,
    key: `url:${h.url}`,
    title: h.title,
    url: h.url,
    sub: displayUrl(h.url),
    visitCount: h.visitCount,
    typedCount: h.typedCount,
    lastVisitTime: h.lastVisitTime,
    time: h.lastVisitTime,
  });

/** The most recent slice of history, matched locally so it can be fuzzy. */
export async function loadHistory() {
  const rows = await safe(() => chrome.history.search({ text: '', startTime: 0, maxResults: HISTORY_CACHE }), []);
  return rows.map(historyItem);
}

/** Asks the browser for older matches the local slice doesn't hold. */
export async function searchHistory(text) {
  const rows = await safe(() => chrome.history.search({ text, startTime: 0, maxResults: 40 }), []);
  return rows.map(historyItem);
}
