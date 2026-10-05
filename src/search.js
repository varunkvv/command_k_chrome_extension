// Ranking. Pure functions over plain items so it runs under node for tests.
import { fuzzyMatch } from './fuzzy.js';

export const SCOPES = ['all', 'tabs', 'history', 'bookmarks', 'actions'];

const SCOPE_KIND = { tabs: 'tab', history: 'history', bookmarks: 'bookmark', actions: 'action' };
const KINDS = ['tab', 'action', 'bookmark', 'history', 'closed'];
const TITLES = {
  tab: 'Tabs',
  action: 'Actions',
  bookmark: 'Bookmarks',
  history: 'History',
  closed: 'Recently closed',
  web: 'Web',
};
// nudges section order in the mixed view, where an open tab is the likeliest target
const BIAS = { tab: 45, action: 6, bookmark: 10, history: 0, closed: -4 };
const LIMIT = { tab: 8, action: 4, bookmark: 5, history: 7, closed: 3 };
const SCOPED_LIMIT = 80;
const BROWSE_LIMIT = 60;
const DAY = 864e5;

export function displayUrl(url) {
  if (!url) return '';
  let s = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  try {
    s = decodeURI(s);
  } catch {
    // keep the encoded form
  }
  if (s.endsWith('/')) s = s.slice(0, -1);
  return s.length > 140 ? s.slice(0, 140) : s;
}

export function normalizeUrl(url) {
  return (url || '').replace(/#.*$/, '').replace(/\/$/, '');
}

/** Adds the lowercased fields the matcher reads on every keystroke. */
export function item(kind, fields) {
  const it = { kind, title: '', sub: '', ...fields };
  it.title ||= it.sub;
  it.lt = it.title.toLowerCase();
  it.ls = it.sub.toLowerCase();
  it.lk = (it.keywords || '').toLowerCase();
  it.nurl = normalizeUrl(it.url);
  return it;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL = /^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i;
const DOMAIN = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i;

export function looksLikeUrl(q) {
  return !/\s/.test(q) && (SCHEME.test(q) || LOCAL.test(q) || DOMAIN.test(q));
}

export function toUrl(q) {
  if (SCHEME.test(q)) return q;
  return (LOCAL.test(q) ? 'http://' : 'https://') + q;
}

// every term has to land somewhere: title, url, or an action's keywords
function scoreText(terms, phrase, it) {
  let score = 0;
  const titlePos = [];
  const subPos = [];
  for (const term of terms) {
    const inTitle = fuzzyMatch(term, it.title, it.lt);
    const inSub = it.ls ? fuzzyMatch(term, it.sub, it.ls) : null;
    const inKeywords = it.lk ? fuzzyMatch(term, it.lk, it.lk) : null;
    const a = inTitle ? inTitle.score : -1;
    const b = inSub ? inSub.score * 0.85 : -1;
    const c = inKeywords ? inKeywords.score * 0.7 : -1;
    const best = Math.max(a, b, c);
    if (best < 0) return null;
    score += best;
    if (best === a) titlePos.push(...inTitle.positions);
    else if (best === b) subPos.push(...inSub.positions);
  }
  if (terms.length > 1 && it.lt.includes(phrase)) score += 14;
  return { score, titlePos, subPos };
}

function usageBonus(entry, now) {
  if (!entry) return 0;
  return Math.min(entry.n, 5) * 4 * Math.pow(0.5, (now - entry.t) / (14 * DAY));
}

function bonus(it, usage, now) {
  let b = usageBonus(usage[it.key], now);
  if (it.kind === 'tab') {
    b += Math.max(0, 12 - (it.rank || 0) * 1.5);
    // you're already looking at it
    if (it.current) b -= 18;
  } else if (it.kind === 'history') {
    b += Math.min(18, Math.log2(1 + (it.visitCount || 0)) * 3);
    if (it.typedCount) b += 4;
    b += 10 * Math.pow(0.5, (now - (it.lastVisitTime || 0)) / (7 * DAY));
  } else if (it.kind === 'bookmark') {
    b += 4;
  }
  return b;
}

function pools(data, scope) {
  const tabs = data.tabs || [];
  const bookmarks = data.bookmarks || [];
  // in the mixed view a url shows once, as the most useful thing it is
  const taken = new Set();
  if (scope === 'all') {
    for (const t of tabs) taken.add(t.nurl);
    for (const b of bookmarks) taken.add(b.nurl);
  }
  const history = [];
  for (const h of [...(data.history || []), ...(data.historyExtra || [])]) {
    if (taken.has(h.nurl)) continue;
    taken.add(h.nurl);
    history.push(h);
  }
  return { tab: tabs, action: data.actions || [], bookmark: bookmarks, history, closed: data.closed || [] };
}

function browse(scope, pool) {
  const section = (id, items) => (items.length ? [{ id, title: TITLES[id], items }] : []);
  switch (scope) {
    case 'tabs':
      return section('tab', pool.tab.slice(0, 200));
    case 'history':
      return section(
        'history',
        [...pool.history].sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0)).slice(0, BROWSE_LIMIT),
      );
    case 'bookmarks':
      return section(
        'bookmark',
        [...pool.bookmark].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, BROWSE_LIMIT),
      );
    case 'actions':
      return section('action', pool.action);
    default:
      return [...section('tab', pool.tab.slice(0, 50)), ...section('closed', pool.closed.slice(0, 5))];
  }
}

/**
 * @returns {{id: string, title: string, items: object[]}[]} sections, best first
 */
export function search({ query = '', scope = 'all', data = {}, usage = {}, now = Date.now() }) {
  const raw = query.trim();
  const phrase = raw.toLowerCase();
  const pool = pools(data, scope);
  if (!phrase) return browse(scope, pool);

  const terms = phrase.split(/\s+/);
  const kinds = scope === 'all' ? KINDS : [SCOPE_KIND[scope]];
  const sections = [];
  for (const kind of kinds) {
    const hits = [];
    for (const it of pool[kind]) {
      const m = scoreText(terms, phrase, it);
      if (m) hits.push({ it, m, score: m.score + bonus(it, usage, now) });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => b.score - a.score);
    const limit = scope === 'all' ? LIMIT[kind] : SCOPED_LIMIT;
    sections.push({
      id: kind,
      title: TITLES[kind],
      items: hits.slice(0, limit).map(({ it, m, score }) => ({ ...it, score, titlePos: m.titlePos, subPos: m.subPos })),
    });
  }
  if (scope !== 'all') return sections;

  sections.sort((a, b) => b.items[0].score + BIAS[b.id] - (a.items[0].score + BIAS[a.id]));
  const web = [];
  const isUrl = looksLikeUrl(raw);
  if (isUrl) {
    const url = toUrl(raw);
    web.push(item('url', { uid: 'go', key: `url:${url}`, title: `Open ${raw}`, url }));
  }
  web.push(item('search', { uid: 'search', key: 'search', title: `Search the web for "${raw}"`, query: raw }));
  const section = { id: 'web', title: TITLES.web, items: web };
  // a pasted url with a scheme is almost always meant to be opened as is
  if (isUrl && SCHEME.test(raw)) sections.unshift(section);
  else sections.push(section);
  return sections;
}
