// Stand-in for the chrome.* APIs so the palette runs from a plain http server.
// Dev only. Nothing in the extension loads this file.
(() => {
  const MIN = 60e3;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const now = Date.now();
  const query = new URLSearchParams(location.search);

  const dot = (color, letter) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="22.5" font-family="-apple-system,Helvetica,Arial" font-size="18" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`,
    );

  const SITES = {
    github: dot('#24292f', 'G'),
    docs: dot('#4285f4', 'D'),
    mail: dot('#ea4335', 'M'),
    linear: dot('#5e6ad2', 'L'),
    figma: dot('#a259ff', 'F'),
    yt: dot('#ff0000', 'Y'),
    hn: dot('#ff6600', 'H'),
    mdn: dot('#15141a', 'M'),
    dd: dot('#632ca6', 'D'),
    slack: dot('#4a154b', 'S'),
    cal: dot('#1a73e8', 'C'),
    wiki: dot('#6b7280', 'W'),
  };

  let nextId = 100;
  const t = (title, url, icon, extra = {}) => ({
    id: nextId++,
    windowId: 1,
    index: 0,
    groupId: -1,
    pinned: false,
    audible: false,
    active: false,
    discarded: false,
    incognito: false,
    mutedInfo: { muted: false },
    title,
    url,
    favIconUrl: icon,
    lastAccessed: now,
    ...extra,
  });

  const tabs = [
    t('Add optional local-storage volume spec · Pull Request #3206', 'https://github.com/acme/helm-charts/pull/3206', SITES.github, { lastAccessed: now - 2 * MIN, groupId: 1 }),
    t('The quarterly planning doc', 'https://docs.google.com/document/d/1x9aQ/edit', SITES.docs, { lastAccessed: now - 5 * MIN }),
    t('Inbox (3)', 'https://mail.google.com/mail/u/0/#inbox', SITES.mail, { lastAccessed: now - 9 * MIN, pinned: true }),
    t('lofi beats to deploy to', 'https://www.youtube.com/watch?v=jfKfPfyJRdk', SITES.yt, { lastAccessed: now - 12 * MIN, audible: true }),
    t('CDIT-1267 production-readiness chores', 'https://linear.app/acme/issue/CDIT-1267', SITES.linear, { lastAccessed: now - 20 * MIN, groupId: 2 }),
    t('Command bar exploration', 'https://www.figma.com/design/k3Jx/command-bar', SITES.figma, { lastAccessed: now - 31 * MIN, groupId: 2 }),
    t('Issues · acme/helm-charts', 'https://github.com/acme/helm-charts/issues', SITES.github, { lastAccessed: now - 44 * MIN, groupId: 1 }),
    t('Show HN: A command bar for every browser', 'https://news.ycombinator.com/item?id=41234567', SITES.hn, { lastAccessed: now - 50 * MIN }),
    t('KeyboardEvent: key property - Web APIs | MDN', 'https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key', SITES.mdn, { lastAccessed: now - 70 * MIN }),
    t('Sync latency | Datadog', 'https://app.datadoghq.com/dashboard/abc-123/sync-latency', SITES.dd, { lastAccessed: now - 2 * HOUR, windowId: 2 }),
    t('#cdit - Slack', 'https://app.slack.com/client/T01/C02', SITES.slack, { lastAccessed: now - 3 * HOUR, windowId: 2, mutedInfo: { muted: true } }),
    t('Calendar - Week of October 5', 'https://calendar.google.com/calendar/u/0/r/week', SITES.cal, { lastAccessed: now - 4 * HOUR }),
    t('Extensions', 'chrome://extensions/', '', { lastAccessed: now - 5 * HOUR }),
    t('How we ship: a field guide to release trains', 'https://example.com/blog/how-we-ship', '', { lastAccessed: now + 1, active: true }),
  ];
  tabs.forEach((tab, i) => (tab.index = i));
  const current = tabs[tabs.length - 1];

  const groups = [
    { id: 1, title: 'helm', color: 'blue', windowId: 1 },
    { id: 2, title: 'cdit', color: 'purple', windowId: 1 },
  ];

  let hid = 1;
  const v = (title, url, age, visitCount = 1, typedCount = 0) => ({ id: String(hid++), title, url, lastVisitTime: now - age, visitCount, typedCount });
  const history = [
    v('GitHub', 'https://github.com/', 2 * HOUR, 320, 40),
    v('Pull requests · acme/helm-charts', 'https://github.com/acme/helm-charts/pulls', 3 * HOUR, 85),
    v('Generalize nil-pruning to prevent CRD null-validation errors · Pull Request #3222', 'https://github.com/acme/helm-charts/pull/3222', 6 * HOUR, 9),
    v('Helm | Chart template guide', 'https://helm.sh/docs/chart_template_guide/', DAY, 22),
    v('Helm | Built-in objects', 'https://helm.sh/docs/chart_template_guide/builtin_objects/', 2 * DAY, 6),
    v('chrome.commands | API | Chrome for Developers', 'https://developer.chrome.com/docs/extensions/reference/api/commands', 3 * HOUR, 4),
    v('chrome.tabs | API | Chrome for Developers', 'https://developer.chrome.com/docs/extensions/reference/api/tabs', 4 * HOUR, 12),
    v('Grafana - Kafka consumer lag', 'https://grafana.example.com/d/kafka-lag', 5 * HOUR, 48),
    v('Airflow - DAGs', 'https://airflow.example.com/home', 8 * HOUR, 130, 12),
    v('Hacker News', 'https://news.ycombinator.com/', DAY, 210, 30),
    v('Gmail', 'https://mail.google.com/mail/u/0/', DAY, 400, 5),
    v('Google Calendar', 'https://calendar.google.com/', 2 * DAY, 150),
    v('Stack Overflow - How do I undo the most recent local commits in Git?', 'https://stackoverflow.com/questions/927358', 4 * DAY, 3),
    v('Postgres: Documentation: 17: 13.3. Explicit Locking', 'https://www.postgresql.org/docs/current/explicit-locking.html', 6 * DAY, 2),
    v('Kubernetes - Pod lifecycle', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/', 9 * DAY, 7),
    v('Figma', 'https://www.figma.com/files/recent', 3 * DAY, 60),
    v('Linear - My issues', 'https://linear.app/acme/my-issues', 5 * HOUR, 95),
    v('The quarterly planning doc', 'https://docs.google.com/document/d/1x9aQ/edit', 30 * MIN, 14),
    v('Wikipedia - Command palette', 'https://en.wikipedia.org/wiki/Command_palette', 12 * DAY, 1),
    v('Datadog - Monitors', 'https://app.datadoghq.com/monitors/manage', 7 * HOUR, 33),
  ];

  const bookmarks = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: 'Bookmarks bar',
          children: [
            { id: '10', title: 'GitHub', url: 'https://github.com/', dateAdded: now - 300 * DAY },
            { id: '11', title: 'Hacker News', url: 'https://news.ycombinator.com/', dateAdded: now - 200 * DAY },
            {
              id: '12',
              title: 'Work',
              children: [
                { id: '120', title: 'Airflow', url: 'https://airflow.example.com/home', dateAdded: now - 90 * DAY },
                { id: '121', title: 'Datadog dashboards', url: 'https://app.datadoghq.com/dashboard/lists', dateAdded: now - 80 * DAY },
                { id: '122', title: 'Helm chart template guide', url: 'https://helm.sh/docs/chart_template_guide/', dateAdded: now - 20 * DAY },
              ],
            },
            {
              id: '13',
              title: 'Reading',
              children: [
                { id: '130', title: 'The Twelve-Factor App', url: 'https://12factor.net/', dateAdded: now - 400 * DAY },
                { id: '131', title: 'Designing Data-Intensive Applications', url: 'https://dataintensive.net/', dateAdded: now - 10 * DAY },
              ],
            },
          ],
        },
      ],
    },
  ];

  const closed = [
    { lastModified: (now - 6 * MIN) / 1000, tab: { sessionId: 's1', title: 'Kafka consumer lag - Grafana', url: 'https://grafana.example.com/d/kafka-lag', favIconUrl: SITES.dd } },
    { lastModified: (now - 40 * MIN) / 1000, tab: { sessionId: 's2', title: 'Command palette - Wikipedia', url: 'https://en.wikipedia.org/wiki/Command_palette', favIconUrl: SITES.wiki } },
    { lastModified: (now - 3 * HOUR) / 1000, window: { sessionId: 's3', tabs: [{ title: 'Pricing' }, { title: 'Docs' }, { title: 'Changelog' }] } },
  ];

  // ?q=helm types a query once the palette is up, handy for screenshots
  if (query.get('q') && location.pathname.endsWith('harness.html')) {
    const timer = setInterval(() => {
      const input = document.querySelector('.open .query');
      if (!input) return;
      clearInterval(timer);
      input.value = query.get('q');
      input.dispatchEvent(new Event('input'));
    }, 50);
  }

  const local = { theme: query.get('theme') || 'auto', usage: {} };
  const session = { token: 'dev' };
  const log = (...args) => console.log('[mock chrome]', ...args);
  const pick = (store, keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]]));
  const event = () => {
    const listeners = [];
    return { addListener: (fn) => listeners.push(fn), listeners };
  };
  const onMessage = event();
  const call = (name) => async (...args) => log(name, ...args);

  window.chrome = {
    __toggle: () => onMessage.listeners.forEach((fn) => fn({ type: 'cmdk:toggle', token: 'dev' }, {}, () => {})),
    runtime: {
      id: 'dev',
      getURL: (path) => {
        const clean = path.replace(/^\//, '');
        if (clean.startsWith('palette.html')) return `${location.origin}/dev/harness.html${location.search}`;
        return `${location.origin}/${clean}`;
      },
      connect: () => ({ onMessage: event(), postMessage() {} }),
      sendMessage: async (msg) => log('runtime.sendMessage', msg),
      onMessage,
    },
    extension: { inIncognitoContext: false },
    storage: {
      local: { get: async (keys) => pick(local, keys), set: async (v) => Object.assign(local, v) },
      session: { get: async (keys) => pick(session, keys), set: async (v) => Object.assign(session, v) },
    },
    tabs: {
      query: async (q) => (q.active ? [current] : tabs),
      get: async (id) => tabs.find((tab) => tab.id === id),
      getCurrent: async () => current,
      remove: async (ids) => {
        for (const id of [].concat(ids)) {
          const at = tabs.findIndex((tab) => tab.id === id);
          if (at >= 0) tabs.splice(at, 1);
        }
        log('tabs.remove', ids);
      },
      update: call('tabs.update'),
      create: call('tabs.create'),
      duplicate: call('tabs.duplicate'),
      reload: call('tabs.reload'),
      goBack: call('tabs.goBack'),
      goForward: call('tabs.goForward'),
      move: call('tabs.move'),
      group: async (...args) => (log('tabs.group', ...args), 9),
      ungroup: call('tabs.ungroup'),
      discard: call('tabs.discard'),
    },
    tabGroups: { query: async () => groups, update: call('tabGroups.update') },
    windows: { update: call('windows.update'), create: call('windows.create'), getAll: async () => [] },
    sessions: { getRecentlyClosed: async () => closed, restore: call('sessions.restore') },
    bookmarks: { getTree: async () => bookmarks, create: call('bookmarks.create') },
    history: {
      search: async ({ text }) => {
        const words = text.toLowerCase().split(/\s+/).filter(Boolean);
        return history.filter((row) => words.every((w) => `${row.title} ${row.url}`.toLowerCase().includes(w)));
      },
    },
    search: { query: call('search.query') },
  };
})();
