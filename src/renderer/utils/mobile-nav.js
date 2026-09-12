/**
 * Shared sidebar destinations and responsive breakpoints
 * (DESIGN.md §4, ui-shell mobile drawer).
 */

export const MD_MIN_WIDTH = 768;
export const LG_MIN_WIDTH = 1024;

/** Primary destinations shown in the desktop sidebar and the mobile drawer. */
export const SIDEBAR_NAV_ITEMS = [
  { view: 'agent', label: 'Agent' },
  { view: 'new-task', label: 'New Task' },
  { view: 'plugins', label: 'Plugins' },
  { view: 'devices', label: 'Devices' },
  { view: 'branches', label: 'Repositories' },
  { view: 'project-management', label: 'Project Management' },
  { view: 'settings', label: 'Settings' },
];

const SIDEBAR_VIEWS = new Set(SIDEBAR_NAV_ITEMS.map((item) => item.view));

export function isSidebarNavView(view) {
  return SIDEBAR_VIEWS.has(view);
}

/**
 * Views that use a stacked list/detail canvas below the `lg` breakpoint
 * (1024px), matching `lg:grid-cols-*` page layouts.
 */
export function isListDetailView(view) {
  return view === 'branches' || view === 'devices';
}
