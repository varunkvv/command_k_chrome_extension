# command k

a command bar for chrome, brave and other chromium browsers. press `cmd+k` to switch tabs, search history and bookmarks, and run tab actions from the keyboard. the idea comes from arc's command bar.

![command k searching for "helm"](docs/light.png)

![command k in dark mode](docs/dark.png)

## install

it isn't on the chrome web store, so load it unpacked.

1. `git clone https://github.com/varunkvv/command_k_chrome_extension.git`
2. open `chrome://extensions` (`brave://extensions` in brave) and turn on developer mode
3. click "load unpacked" and pick the cloned folder

the shortcut is `cmd+k` on mac and `ctrl+k` everywhere else. you can change it, see [changing the shortcut](#changing-the-shortcut).

tabs that were open before you installed it work right away, no reload needed. clicking the toolbar icon does the same thing as the shortcut.

try it on a regular page first. `chrome://extensions`, where you just were, is one of the pages where the shortcut can't be heard (see limits). the toolbar icon works there.

## features

- switch to any open tab in any window. tabs are listed most recently used first, so `cmd+k` then `enter` goes back to the last tab
- fuzzy search over tab titles and urls, history and bookmarks. `gpr` finds "GitHub Pull Requests"
- reopen recently closed tabs and windows
- tab group, pinned, audio and other-window markers on each tab
- around 30 actions: new / duplicate / pin / mute / reload / close tabs, close duplicates, close tabs to the right, sort or group tabs by site, merge windows, suspend background tabs, copy the url or a markdown link, bookmark the page, jump to history / downloads / extensions / settings
- type a url to open it, or anything else to search with your default search engine
- results you pick often float up
- light and dark, following the system. the "switch theme" action overrides it
- a settings page where you record your own shortcut

## keys

| key | does |
| --- | --- |
| `cmd+k` / `ctrl+k`, or your own shortcut | open or close the bar |
| `up` `down`, or `ctrl+n` `ctrl+p` on mac | move |
| `enter` | switch to the tab, or open the result in a new tab |
| `cmd+enter` / `ctrl+enter` | open in the current tab |
| `shift+enter` | open in a new window |
| `tab` / `shift+tab` | cycle scope: all, tabs, history, bookmarks, actions |
| `>` | jump to actions |
| `cmd+x` / `ctrl+x` | close the selected tab and keep the bar open |
| `cmd+c` / `ctrl+c` | copy the selected url |
| `esc` | close |

if the url you pick is already open, `enter` switches to that tab instead of opening a second copy.

## changing the shortcut

run "change the command k shortcut" from the bar, or open the extension's options. click the recorder, press the keys you want and save. the new keys replace the old ones, and "reset to default" goes back to `cmd+k` / `ctrl+k`.

the extension listens for the shortcut on the page itself. chrome has its own shortcuts for extensions, but an extension can't change those, so a setting like this couldn't be built on them.

keep in mind - a page can't hear keys on `chrome://` pages, the new tab page or while the address bar has focus. if you want the bar there too, set a browser shortcut at `chrome://extensions/shortcuts` (the settings page links to it). it can be the same keys.

## permissions

| permission | why |
| --- | --- |
| `<all_urls>` | `hotkey.js` runs on every page to listen for the shortcut. it compares keydowns to your keys and reads nothing from the page |
| `activeTab`, `scripting` | show the bar on the page you're on. the bar itself isn't added to a page until you open it there |
| `tabs`, `tabGroups` | list, switch, close and group tabs |
| `history`, `bookmarks`, `sessions` | search them, and reopen closed tabs |
| `favicon` | icons from the browser's local favicon cache |
| `search` | hand a query to your default search engine |
| `storage` | theme, your shortcut, and how often you've picked a result |
| `clipboardWrite` | the copy url actions |

nothing leaves your machine. there are no network requests, no analytics and no remote code.

in incognito (if you allow it there) the bar only sees incognito tabs, and nothing you pick is written to storage.

## how it works

`hotkey.js` runs on every page and listens for the shortcut. when it fires, `background.js` injects `content.js` into that tab. the content script adds one element in the top layer holding an iframe that points at `palette.html`.

the iframe is an extension page, which is why it's built this way. page css can't restyle it, a strict content security policy can't block it, and page key handlers never see what you type. it also means the same page works as the toolbar popup.

ranking is in `src/search.js` and `src/fuzzy.js`. both are plain functions with no browser dependencies.

## development

there is no build step and no dependencies.

```bash
npm test
```

runs the unit tests for matching and ranking (node 20.11+).

```bash
npm run dev
```

serves the repo on http://127.0.0.1:4173. open `/dev/page.html` to try the bar against fake tabs and history without loading the extension. `?theme=dark` and `?q=helm` are there for screenshots.

```bash
CHROME_BIN=/path/to/chromium npm run e2e
```

loads the real extension in headless chrome and checks the overlay, search, tab switching, a strict csp page, the shortcut setting and the popup fallback. it needs chrome for testing or chromium, because branded chrome ignores `--load-extension`.

after editing, hit reload on the extension card in `chrome://extensions`.

## limits

- browsers don't let extensions run on `chrome://` pages, the new tab page or the web store. the shortcut isn't heard there unless you also set one in the browser (see changing the shortcut), and the bar opens as a popup under the toolbar icon. chrome decides that popup's position and shape, so it can't be centered or rounded
- firefox and safari aren't supported. it uses chromium-only apis (`tabGroups`, `sessions`, `_favicon`)
- history search covers the 2,500 most recent pages with fuzzy matching, and falls back to the browser's own word matching for older ones

## license

MIT
