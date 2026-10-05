// The command bar UI. Runs as an extension page in three places: an iframe
// overlaid on the current tab, the toolbar popup, and a standalone window.
import { search, normalizeUrl, SCOPES } from './search.js';
import { loadContext, loadClosed, loadBookmarks, loadHistory, searchHistory, faviconUrl, isBlankTab } from './sources.js';
import { buildActions, findAction } from './actions.js';
import { icon } from './icons.js';

const embedded = window.parent !== window;
const params = new URLSearchParams(location.search);
const mode = embedded ? 'embed' : params.get('mode') === 'window' ? 'window' : 'popup';
const hintTabId = Number(params.get('tab')) || null;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const CLOSE_MS = 110;

const THEMES = ['auto', 'light', 'dark'];
const SCOPE_LABEL = { all: 'All', tabs: 'Tabs', history: 'History', bookmarks: 'Bookmarks', actions: 'Actions' };
const PLACEHOLDER = {
  all: 'Search tabs, history and bookmarks',
  tabs: 'Search open tabs',
  history: 'Search history',
  bookmarks: 'Search bookmarks',
  actions: 'Run an action',
};
const EMPTY = {
  all: 'Nothing to show yet',
  tabs: 'No matching tabs',
  history: 'No matching history',
  bookmarks: 'No matching bookmarks',
  actions: 'No matching actions',
};
const HINT = { tab: 'Switch to tab', closed: 'Reopen', bookmark: 'Open', history: 'Open', url: 'Open', search: 'Search', action: 'Run' };
const GLYPH = { tab: 'globe', closed: 'undo', bookmark: 'star', history: 'clock', url: 'out', search: 'search' };
const GROUP_COLORS = {
  grey: '#8a8f98',
  blue: '#4c8df6',
  red: '#e5534b',
  yellow: '#d9a514',
  green: '#3fa45b',
  pink: '#e05fa8',
  purple: '#9b6cf0',
  cyan: '#2aa9b8',
  orange: '#e8873a',
};

const state = {
  query: '',
  scope: 'all',
  selected: 0,
  moved: false,
  sections: [],
  rows: [],
  data: {},
  usage: {},
  theme: 'auto',
  osDark: false,
  seq: 0,
};

let root, panel, input, list, scopesEl, keysEl, toastEl, escEl;
let deepTimer = 0;
const favicons = new Map();

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    // only ever static markup from icons.js
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function marked(text, positions) {
  if (!positions?.length) return [text];
  const hits = [...new Set(positions)].sort((a, b) => a - b);
  const out = [];
  let from = 0;
  for (let p = 0; p < hits.length; p++) {
    const start = hits[p];
    let end = start;
    while (hits[p + 1] === end + 1) end = hits[++p];
    if (start > from) out.push(text.slice(from, start));
    out.push(h('mark', null, text.slice(start, end + 1)));
    from = end + 1;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

function ago(time) {
  const s = Math.max(0, (Date.now() - time) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

const kbd = (...keys) => keys.map((k) => h('kbd', { class: 'kbd' }, k));
const badge = (name, label) => h('span', { class: 'badge', title: label, 'aria-label': label, html: icon(name) });

function build() {
  root = document.getElementById('app');
  root.dataset.mode = mode;
  input = h('input', {
    class: 'query',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'results',
    'aria-autocomplete': 'list',
    'aria-label': 'Command bar',
  });
  toastEl = h('span', { class: 'toast', hidden: true, role: 'status' });
  escEl = h('kbd', { class: 'kbd' }, 'esc');
  list = h('div', { class: 'list', id: 'results', role: 'listbox', 'aria-label': 'Results' });
  scopesEl = h(
    'div',
    { class: 'scopes' },
    SCOPES.map((s) => h('button', { type: 'button', tabindex: '-1', 'data-scope': s }, SCOPE_LABEL[s])),
  );
  keysEl = h('div', { class: 'keys' });
  panel = h(
    'div',
    { class: 'panel', role: 'dialog', 'aria-label': 'Command K' },
    h('div', { class: 'bar' }, h('span', { class: 'glyph', html: icon('search') }), input, toastEl, escEl),
    list,
    h('div', { class: 'foot' }, scopesEl, keysEl),
  );
  const stage = h('div', { class: 'stage' }, panel);
  root.append(h('div', { class: 'scrim' }), stage);

  input.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  stage.addEventListener('mousedown', (e) => {
    if (e.target === stage) close();
    // keep focus in the input when clicking rows and chips
    else if (e.target !== input) e.preventDefault();
  });
  list.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.row');
    if (row && +row.dataset.i !== state.selected) {
      state.moved = true;
      select(+row.dataset.i, false);
    }
  });
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const it = state.rows[+row.dataset.i]?.item;
    if (e.target.closest('.x')) closeTab(it);
    else activate(it, e);
  });
  scopesEl.addEventListener('click', (e) => {
    const scope = e.target.closest('button')?.dataset.scope;
    if (scope) setScope(scope);
  });
}

function renderRow(it, i) {
  const lead = h('span', { class: 'lead' });
  const glyph = () => {
    lead.classList.add('glyph');
    lead.innerHTML = icon(it.icon || (it.isWindow ? 'window' : GLYPH[it.kind]));
  };
  const src = it.kind === 'action' || it.kind === 'search' || it.kind === 'url' ? null : faviconUrl(it);
  // null marks a favicon that already failed to load
  if (!src || favicons.get(it.uid) === null) {
    glyph();
  } else {
    // reuse the element across renders so favicons don't blink while typing
    let img = favicons.get(it.uid);
    if (!img) {
      img = h('img', { src, alt: '', width: '16', height: '16', decoding: 'async' });
      img.addEventListener('error', () => {
        favicons.set(it.uid, null);
        const holder = img.parentNode;
        if (!holder) return;
        holder.classList.add('glyph');
        holder.innerHTML = icon(GLYPH[it.kind]);
      });
      favicons.set(it.uid, img);
    }
    lead.append(img);
  }

  const meta = [];
  if (it.kind === 'tab') {
    if (it.group) {
      const chip = h('span', { class: 'group' }, it.group.title || 'Group');
      chip.style.setProperty('--g', GROUP_COLORS[it.group.color] || GROUP_COLORS.grey);
      meta.push(chip);
    }
    if (it.audible) meta.push(badge('volume', 'Playing audio'));
    if (it.muted) meta.push(badge('mute', 'Muted'));
    if (it.pinned) meta.push(badge('pin', 'Pinned'));
    if (it.otherWindow) meta.push(badge('window', 'In another window'));
    if (it.current) meta.push(h('span', { class: 'note' }, 'Current'));
  } else if (it.kind === 'bookmark') {
    if (it.folder) meta.push(h('span', { class: 'note' }, it.folder));
  } else if (it.time) {
    meta.push(h('span', { class: 'note' }, ago(it.time)));
  }

  return h(
    'div',
    { class: `row ${it.kind}`, role: 'option', id: `row-${i}`, 'data-i': String(i), 'aria-selected': 'false' },
    lead,
    h(
      'span',
      { class: 'text' },
      h('span', { class: 'title' }, marked(it.title, it.titlePos)),
      it.sub && h('span', { class: 'sub' }, marked(it.sub, it.subPos)),
    ),
    h('span', { class: 'meta' }, meta, h('span', { class: 'hint' }, HINT[it.kind], kbd('↵'))),
    it.kind === 'tab' &&
      h('button', { class: 'x', type: 'button', tabindex: '-1', title: 'Close tab', 'aria-label': 'Close tab', html: icon('close') }),
  );
}

function render() {
  const frag = document.createDocumentFragment();
  state.rows = [];
  for (const section of state.sections) {
    frag.append(h('div', { class: 'sec', role: 'presentation' }, section.title));
    for (const it of section.items) {
      const el = renderRow(it, state.rows.length);
      state.rows.push({ item: it, el });
      frag.append(el);
    }
  }
  if (!state.rows.length && state.loaded) frag.append(h('div', { class: 'empty' }, EMPTY[state.scope]));
  list.replaceChildren(frag);
  root.classList.toggle('searching', !!state.query.trim());
}

function renderKeys() {
  const it = current();
  const hints = [];
  if (it?.kind === 'tab') hints.push(['Close tab', MOD, 'X']);
  else if (it && it.kind !== 'action' && it.kind !== 'closed') hints.push(['Open here', MOD, '↵']);
  hints.push(['Scope', '⇥']);
  keysEl.replaceChildren(...hints.map(([label, ...keys]) => h('span', null, label, kbd(...keys))));
}

const current = () => state.rows[state.selected]?.item;

function select(i, scroll = true) {
  const { rows } = state;
  rows[state.selected]?.el.setAttribute('aria-selected', 'false');
  if (!rows.length) {
    state.selected = 0;
    input.removeAttribute('aria-activedescendant');
    renderKeys();
    return;
  }
  state.selected = Math.max(0, Math.min(rows.length - 1, i));
  const { el } = rows[state.selected];
  el.setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', el.id);
  if (scroll) {
    if (state.selected === 0) list.scrollTop = 0;
    else el.scrollIntoView({ block: 'nearest' });
  }
  renderKeys();
}

function move(delta, wrap = true) {
  const n = state.rows.length;
  if (!n) return;
  state.moved = true;
  const next = state.selected + delta;
  select(wrap ? (next + n) % n : next);
}

// keep: data arrived in the background, so don't yank a selection the user made
function refresh({ keep = false, at = null } = {}) {
  const held = keep && state.moved ? current()?.uid : null;
  state.sections = search({ query: state.query, scope: state.scope, data: state.data, usage: state.usage });
  render();
  let i = at ?? 0;
  if (held) {
    const found = state.rows.findIndex((r) => r.item.uid === held);
    if (found >= 0) i = found;
  }
  select(i, !held);
}

function setScope(scope) {
  state.scope = scope;
  state.moved = false;
  for (const b of scopesEl.children) b.setAttribute('aria-pressed', String(b.dataset.scope === scope));
  input.placeholder = PLACEHOLDER[scope];
  refresh();
  scheduleDeepHistory();
}

function onInput() {
  let value = input.value;
  if (state.scope !== 'actions' && value.startsWith('>')) {
    value = input.value = value.slice(1).trimStart();
    state.query = value;
    setScope('actions');
    return;
  }
  state.query = value;
  state.moved = false;
  refresh();
  scheduleDeepHistory();
}

function scheduleDeepHistory() {
  clearTimeout(deepTimer);
  const query = state.query.trim();
  if (query.length < 2 || (state.scope !== 'all' && state.scope !== 'history')) return;
  const seq = state.seq;
  deepTimer = setTimeout(async () => {
    const extra = await searchHistory(query);
    if (seq !== state.seq || query !== state.query.trim()) return;
    state.data.historyExtra = extra;
    refresh({ keep: true });
  }, 140);
}

function onKey(e) {
  if (e.isComposing) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const emacs = isMac && e.ctrlKey && !e.metaKey && !e.altKey;
  const noSelection = input.selectionStart === input.selectionEnd;
  const it = current();
  switch (e.key) {
    case 'Escape':
      close();
      break;
    case 'ArrowDown':
      move(1);
      break;
    case 'ArrowUp':
      move(-1);
      break;
    case 'PageDown':
      move(8, false);
      break;
    case 'PageUp':
      move(-8, false);
      break;
    case 'Tab': {
      const step = e.shiftKey ? SCOPES.length - 1 : 1;
      setScope(SCOPES[(SCOPES.indexOf(state.scope) + step) % SCOPES.length]);
      break;
    }
    case 'Enter':
      activate(it, e);
      break;
    case 'Backspace':
      if (input.value || state.scope === 'all') return;
      setScope('all');
      break;
    case 'n':
    case 'j':
      if (!emacs) return;
      move(1);
      break;
    case 'p':
    case 'k':
      if (!emacs) return;
      move(-1);
      break;
    case 'x':
      // with nothing selected in the input, cut would be a no-op anyway
      if (!mod || !noSelection || it?.kind !== 'tab') return;
      closeTab(it);
      break;
    case 'c':
      if (!mod || !noSelection || !it?.url) return;
      copy(it.url).then(() => toast('Copied URL'));
      break;
    default:
      return;
  }
  e.preventDefault();
}

function remember(key) {
  // nothing from an incognito window gets written to disk
  if (!key || chrome.extension?.inIncognitoContext) return;
  const usage = state.usage;
  usage[key] = { n: (usage[key]?.n || 0) + 1, t: Date.now() };
  const keys = Object.keys(usage);
  if (keys.length > 400) {
    for (const k of keys.sort((a, b) => usage[a].t - usage[b].t).slice(0, 100)) delete usage[k];
  }
  chrome.storage.local.set({ usage });
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    input.focus();
  }
}

function toast(message) {
  toastEl.replaceChildren(h('span', { class: 'glyph', html: icon('check') }), message);
  toastEl.hidden = false;
  escEl.hidden = true;
}

const actionContext = () => ({
  tab: state.data.current,
  tabs: state.data.rawTabs || [],
  theme: state.theme,
  copy,
  cycleTheme,
});

function cycleTheme() {
  state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
  chrome.storage.local.set({ theme: state.theme });
  applyTheme();
}

function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && state.osDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

// The overlay hides before acting so a stale bar isn't waiting when you come
// back to the tab. The popup has to act first, since closing it kills the page.
async function finish(act) {
  if (mode === 'embed') {
    close({ instant: true });
    await act();
  } else {
    await act();
    close();
  }
}

function switchTo(tab) {
  return Promise.all([
    chrome.tabs.update(tab.tabId, { active: true }),
    chrome.windows.update(tab.windowId, { focused: true }),
  ]);
}

function openUrl(url, where) {
  const cur = state.data.current;
  if (where === 'window') return chrome.windows.create({ url });
  if (where === 'new') {
    const target = normalizeUrl(url);
    const already = (state.data.tabs || []).find((t) => t.nurl === target);
    if (already) return switchTo(already);
    if (!cur) return chrome.tabs.create({ url });
    if (!isBlankTab(cur)) return chrome.tabs.create({ url, windowId: cur.windowId, index: cur.index + 1 });
  }
  return cur ? chrome.tabs.update(cur.id, { url }) : chrome.tabs.create({ url });
}

function webSearch(text, where) {
  const cur = state.data.current;
  if (where === 'window') return chrome.search.query({ text, disposition: 'NEW_WINDOW' });
  if (cur && (where === 'current' || isBlankTab(cur))) return chrome.search.query({ text, tabId: cur.id });
  return chrome.search.query({ text, disposition: 'NEW_TAB' });
}

async function runAction(it) {
  const action = findAction(it.id);
  if (action.stay) {
    await action.run(actionContext());
    state.data.actions = buildActions(actionContext());
    refresh({ at: state.selected });
  } else if (action.toast) {
    await action.run(actionContext());
    toast(action.toast);
    setTimeout(() => close(), 650);
  } else {
    await finish(() => action.run(actionContext()));
  }
}

async function activate(it, e) {
  if (!it) return;
  const where = e.metaKey || e.ctrlKey ? 'current' : e.shiftKey ? 'window' : 'new';
  remember(it.key);
  try {
    if (it.kind === 'action') await runAction(it);
    else if (it.kind === 'tab') await finish(() => switchTo(it));
    else if (it.kind === 'closed') await finish(() => chrome.sessions.restore(it.sessionId));
    else if (it.kind === 'search') await finish(() => webSearch(it.query, where));
    else await finish(() => openUrl(it.url, where));
  } catch (err) {
    console.warn('[command k]', err);
  }
}

async function closeTab(it) {
  if (it?.kind !== 'tab') return;
  try {
    await chrome.tabs.remove(it.tabId);
  } catch {
    // already gone
  }
  state.data.tabs = state.data.tabs.filter((t) => t.tabId !== it.tabId);
  state.data.rawTabs = state.data.rawTabs.filter((t) => t.id !== it.tabId);
  refresh({ at: state.selected });
}

function focusInput() {
  window.focus();
  input.focus({ preventScroll: true });
}

async function open({ dark } = {}) {
  const seq = ++state.seq;
  state.osDark = !!dark;
  applyTheme();
  Object.assign(state, { query: '', moved: false, loaded: false, data: {} });
  input.value = '';
  toastEl.hidden = true;
  escEl.hidden = false;
  favicons.clear();
  setScope('all');
  root.hidden = false;
  focusInput();

  const context = await loadContext(hintTabId);
  if (seq !== state.seq) return;
  Object.assign(state.data, context);
  state.data.actions = buildActions(actionContext());
  state.loaded = true;
  refresh();
  root.classList.add('open');
  // some pages grab focus back right after the overlay appears
  setTimeout(() => seq === state.seq && focusInput(), 60);

  const late = async (key, load) => {
    const value = await load();
    if (seq !== state.seq) return;
    state.data[key] = value;
    refresh({ keep: true });
  };
  late('closed', loadClosed);
  late('bookmarks', loadBookmarks);
  late('history', loadHistory);
}

function close({ instant = false } = {}) {
  if (mode !== 'embed') {
    window.close();
    return;
  }
  const seq = ++state.seq;
  clearTimeout(deepTimer);
  root.classList.remove('open');
  const done = () => {
    if (seq !== state.seq) return;
    root.hidden = true;
    parent.postMessage({ cmdk: 'hide' }, '*');
  };
  if (instant) done();
  else setTimeout(done, CLOSE_MS);
}

async function boot() {
  if (embedded) {
    // refuse to render for a page that framed us itself
    const { token } = await chrome.storage.session.get('token');
    if (!token || location.hash.slice(1) !== token) return;
  }
  build();
  const stored = await chrome.storage.local.get(['usage', 'theme']);
  state.usage = stored.usage || {};
  state.theme = THEMES.includes(stored.theme) ? stored.theme : 'auto';

  if (embedded) {
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      if (e.data?.cmdk === 'open') open(e.data);
      else if (e.data?.cmdk === 'close') close();
    });
    // don't leave a stale bar open on a tab the user walked away from
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !root.hidden) close({ instant: true });
    });
    parent.postMessage({ cmdk: 'ready' }, '*');
    return;
  }
  // lets the shortcut close an already open popup instead of stacking another
  const port = chrome.runtime.connect({ name: 'cmdk-surface' });
  port.onMessage.addListener((msg) => msg === 'close' && window.close());
  if (mode === 'window') window.addEventListener('blur', () => window.close());
  open({ dark: matchMedia('(prefers-color-scheme: dark)').matches });
}

boot();
