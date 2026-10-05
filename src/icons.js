// 16px stroke icons, drawn for this project.
const PATHS = {
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  globe: '<circle cx="8" cy="8" r="5.75"/><path d="M2.25 8h11.5M8 2.25c-3.2 3.3-3.2 8.2 0 11.5M8 2.25c3.2 3.3 3.2 8.2 0 11.5"/>',
  tab: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 6.5h12"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  window: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M4.5 5.75h.01M6.75 5.75h.01"/>',
  incognito: '<path d="M2 8.5h12M4.5 8.5 5.6 4h4.8l1.1 4.5"/><circle cx="5.25" cy="11.5" r="1.6"/><circle cx="10.75" cy="11.5" r="1.6"/><path d="M6.85 11.5h2.3"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  pin: '<path d="M6 2.5h4l-.6 4 2.1 2.5h-7l2.1-2.5zM8 9v4.5"/>',
  volume: '<path d="M2.5 6.25h2L8 3.5v9l-3.5-2.75h-2zM10.5 6a2.8 2.8 0 0 1 0 4M12.25 4.25a5.3 5.3 0 0 1 0 7.5"/>',
  mute: '<path d="M2.5 6.25h2L8 3.5v9l-3.5-2.75h-2zM10.75 6.25l3 3.5M13.75 6.25l-3 3.5"/>',
  reload: '<path d="M13 8a5 5 0 1 1-1.5-3.55"/><path d="M13 2.5V5h-2.5"/>',
  undo: '<path d="M3 8a5 5 0 1 0 1.5-3.55"/><path d="M3 2.5V5h2.5"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.75"/><path d="M10.5 5.5V4.25A1.75 1.75 0 0 0 8.75 2.5h-4.5A1.75 1.75 0 0 0 2.5 4.25v4.5a1.75 1.75 0 0 0 1.75 1.75H5.5"/>',
  star: '<path d="m8 2.25 1.75 3.6 3.95.55-2.85 2.8.68 3.95L8 11.28l-3.53 1.87.68-3.95L2.3 6.4l3.95-.55z"/>',
  clock: '<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/>',
  download: '<path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10"/>',
  blocks: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  sliders: '<path d="M2.5 5h5M11 5h2.5M2.5 11H5M8.5 11h5"/><circle cx="9.25" cy="5" r="1.75"/><circle cx="6.75" cy="11" r="1.75"/>',
  keyboard: '<rect x="1.75" y="4" width="12.5" height="8" rx="2"/><path d="M4.5 7h.01M7 7h.01M9.5 7h.01M11.75 7h.01M5.5 9.5h5"/>',
  left: '<path d="M13 8H3M7 4 3 8l4 4"/>',
  right: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  out: '<path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.25 3.75 7.5 8.5"/>',
  layers: '<path d="m8 2.5 5.5 3L8 8.5l-5.5-3zM2.5 8.25 8 11.25l5.5-3M2.5 10.75l5.5 3 5.5-3"/>',
  sort: '<path d="M3 4.5h10M3 8h7M3 11.5h4"/>',
  folder: '<path d="M2.5 5a1.5 1.5 0 0 1 1.5-1.5h2.25L7.75 5H12a1.5 1.5 0 0 1 1.5 1.5V11a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 11z"/>',
  pause: '<circle cx="8" cy="8" r="5.75"/><path d="M6.5 6v4M9.5 6v4"/>',
  theme: '<circle cx="8" cy="8" r="5.75"/><path d="M8 2.25v11.5a5.75 5.75 0 0 0 0-11.5z" fill="currentColor"/>',
  link: '<path d="M6.75 9.25 9.25 6.75M7.25 4.75l1-1a2.83 2.83 0 0 1 4 4l-1 1M8.75 11.25l-1 1a2.83 2.83 0 0 1-4-4l1-1"/>',
  check: '<path d="m3.5 8.5 3 3 6-7"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.globe}</svg>`;
}
