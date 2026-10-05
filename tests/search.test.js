import test from 'node:test';
import assert from 'node:assert/strict';
import { search, item, looksLikeUrl, toUrl, displayUrl } from '../src/search.js';

const NOW = Date.UTC(2026, 0, 1);
const DAY = 864e5;

const tab = (id, title, url, extra = {}) =>
  item('tab', { uid: `tab:${id}`, key: `tab:${url}`, title, url, sub: displayUrl(url), tabId: id, rank: id, ...extra });
const visit = (id, title, url, extra = {}) =>
  item('history', { uid: `history:${id}`, key: `url:${url}`, title, url, sub: displayUrl(url), lastVisitTime: NOW - DAY, visitCount: 1, ...extra });
const bookmark = (id, title, url) =>
  item('bookmark', { uid: `bookmark:${id}`, key: `url:${url}`, title, url, sub: displayUrl(url) });
const action = (id, title, keywords) => item('action', { uid: `action:${id}`, key: `action:${id}`, id, title, keywords });

const data = {
  tabs: [
    tab(0, 'Pull requests · helm-charts', 'https://github.com/acme/helm-charts/pulls'),
    tab(1, 'Inbox', 'https://mail.google.com/mail/u/0/'),
    tab(2, 'Design review notes', 'https://docs.google.com/document/d/1'),
    tab(3, 'Current page', 'https://example.com/current', { current: true }),
  ],
  history: [
    visit(1, 'Pull requests · helm-charts', 'https://github.com/acme/helm-charts/pulls'),
    visit(2, 'GitHub status', 'https://www.githubstatus.com/', { visitCount: 40 }),
    visit(3, 'Grafana dashboards', 'https://grafana.example.com/dashboards'),
  ],
  bookmarks: [bookmark(1, 'GitHub', 'https://github.com/')],
  closed: [],
  actions: [action('new-incognito', 'New incognito window', 'private'), action('close', 'Close tab')],
};

const run = (query, scope = 'all', extra = {}) => search({ query, scope, data, now: NOW, ...extra });
const ids = (sections) => sections.map((s) => s.id);
const find = (sections, id) => sections.find((s) => s.id === id);

test('with no query, the mixed view lists open tabs', () => {
  const sections = run('');
  assert.deepEqual(ids(sections), ['tab']);
  assert.equal(sections[0].items.length, 4);
});

test('an open tab outranks the same page in history', () => {
  const sections = run('helm');
  assert.equal(sections[0].id, 'tab');
  assert.equal(find(sections, 'history'), undefined, 'history copy of an open tab is dropped');
});

test('the history scope keeps pages that are also open', () => {
  const [history] = run('helm', 'history');
  assert.equal(history.items[0].url, 'https://github.com/acme/helm-charts/pulls');
});

test('matches against the url when the title does not match', () => {
  const [tabs] = run('mail.google', 'tabs');
  assert.equal(tabs.items[0].title, 'Inbox');
  assert.ok(tabs.items[0].subPos.length > 0);
});

test('every term has to match', () => {
  assert.equal(run('design notes', 'tabs')[0].items[0].title, 'Design review notes');
  assert.deepEqual(run('design zzz', 'tabs'), []);
});

test('the current tab ranks below an equally good match', () => {
  const tabs = [tab(0, 'Example one', 'https://example.com/one', { current: true }), tab(1, 'Example two', 'https://example.com/two')];
  const [section] = search({ query: 'example', scope: 'tabs', data: { tabs }, now: NOW });
  assert.equal(section.items[0].title, 'Example two');
});

test('frequently visited history ranks higher', () => {
  const history = [visit(1, 'Status page A', 'https://a.example.com/status'), visit(2, 'Status page B', 'https://b.example.com/status', { visitCount: 200 })];
  const [section] = search({ query: 'status', scope: 'history', data: { history }, now: NOW });
  assert.equal(section.items[0].title, 'Status page B');
});

test('past picks get a boost', () => {
  const history = [visit(1, 'Alpha docs', 'https://alpha.example.com/docs'), visit(2, 'Beta docs', 'https://beta.example.com/docs')];
  const usage = { 'url:https://beta.example.com/docs': { n: 5, t: NOW } };
  const [section] = search({ query: 'docs', scope: 'history', data: { history }, usage, now: NOW });
  assert.equal(section.items[0].title, 'Beta docs');
});

test('actions match on keywords', () => {
  const [section] = run('private', 'actions');
  assert.equal(section.items[0].id, 'new-incognito');
});

test('the mixed view always ends with a web search', () => {
  const sections = run('zzzz nothing matches');
  assert.deepEqual(ids(sections), ['web']);
  assert.equal(sections[0].items[0].kind, 'search');
});

test('a url-like query offers to open it', () => {
  const web = find(run('example.org/foo'), 'web');
  assert.equal(web.items[0].kind, 'url');
  assert.equal(web.items[0].url, 'https://example.org/foo');
});

test('a pasted url with a scheme goes first', () => {
  assert.equal(run('https://github.com/acme')[0].id, 'web');
});

test('url detection', () => {
  for (const q of ['github.com', 'localhost:3000', '127.0.0.1:8080/health', 'https://x.dev/a?b=c', 'chrome://extensions']) {
    assert.ok(looksLikeUrl(q), q);
  }
  for (const q of ['hello', 'hello world.com', 'v1.2', 'node.js docs']) {
    assert.ok(!looksLikeUrl(q), q);
  }
  assert.equal(toUrl('localhost:3000'), 'http://localhost:3000');
  assert.equal(toUrl('github.com'), 'https://github.com');
});

test('display urls drop the scheme, www and trailing slash', () => {
  assert.equal(displayUrl('https://www.example.com/'), 'example.com');
  assert.equal(displayUrl('chrome://newtab/'), 'chrome://newtab');
});
