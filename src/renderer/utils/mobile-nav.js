/**
 * Mobile bottom-nav destinations (DESIGN.md §4, ui-shell mobile).
 * Primary tabs stay on the bar; overflow destinations live in the More sheet.
 */

export const MD_MIN_WIDTH = 768;
export const LG_MIN_WIDTH = 1024;

export const PRIMARY_NAV_ITEMS = [
  { view: 'agent', label: 'Agent' },
  { view: 'new-task', label: 'New Task' },
  { view: 'dashboard', label: 'Tasks' },
  { view: 'branches', label: 'Repos' },
];

export const MORE_NAV_ITEMS = [
  { view: 'plugins', label: 'Plugins' },
  { view: 'pull-requests', label: 'Pull Requests' },
  { view: 'devices', label: 'Devices' },
  { view: 'settings', label: 'Settings' },
];

const PRIMARY_VIEWS = new Set(PRIMARY_NAV_ITEMS.map((item) => item.view));
const MORE_VIEWS = new Set(MORE_NAV_ITEMS.map((item) => item.view));

export function isPrimaryNavView(view) {
  return PRIMARY_VIEWS.has(view);
}

export function isMoreNavView(view) {
  return MORE_VIEWS.has(view);
}

/**
 * Views that use a stacked list/detail canvas below the `lg` breakpoint
 * (1024px), matching `lg:grid-cols-*` page layouts.
 */
export function isListDetailView(view) {
  return view === 'branches' || view === 'devices';
}
