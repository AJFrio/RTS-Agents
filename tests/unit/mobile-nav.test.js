const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../../src/renderer/utils/mobile-nav.js');
let code = fs.readFileSync(sourcePath, 'utf8');
code = code.replace(/^export /gm, '');
code += `
module.exports = {
  MD_MIN_WIDTH,
  LG_MIN_WIDTH,
  SIDEBAR_NAV_ITEMS,
  isSidebarNavView,
  isListDetailView,
};
`;

const tempPath = path.join(__dirname, 'temp_mobile_nav.js');
fs.writeFileSync(tempPath, code);

try {
  const {
    MD_MIN_WIDTH,
    LG_MIN_WIDTH,
    SIDEBAR_NAV_ITEMS,
    isSidebarNavView,
    isListDetailView,
  } = require(tempPath);

  describe('mobile-nav', () => {
    afterAll(() => {
      fs.unlinkSync(tempPath);
    });

    test('exposes every sidebar destination in one list', () => {
      expect(SIDEBAR_NAV_ITEMS.map((item) => item.view)).toEqual([
        'agent',
        'new-task',
        'plugins',
        'devices',
        'branches',
        'project-management',
        'settings',
      ]);
    });

    test('classifies sidebar destinations including overflow views', () => {
      expect(isSidebarNavView('agent')).toBe(true);
      expect(isSidebarNavView('settings')).toBe(true);
      expect(isSidebarNavView('project-management')).toBe(true);
      expect(isSidebarNavView('plugins')).toBe(true);
      expect(isSidebarNavView('dashboard')).toBe(false);
      expect(isSidebarNavView('task-detail')).toBe(false);
    });

    test('marks stacked list/detail canvases', () => {
      expect(isListDetailView('branches')).toBe(true);
      expect(isListDetailView('devices')).toBe(true);
      expect(isListDetailView('dashboard')).toBe(false);
    });

    test('uses the documented Tailwind breakpoints', () => {
      expect(MD_MIN_WIDTH).toBe(768);
      expect(LG_MIN_WIDTH).toBe(1024);
    });
  });
} catch (err) {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  throw err;
}
