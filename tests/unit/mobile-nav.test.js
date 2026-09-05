const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../../src/renderer/utils/mobile-nav.js');
let code = fs.readFileSync(sourcePath, 'utf8');
code = code.replace(/^export /gm, '');
code += `
module.exports = {
  MD_MIN_WIDTH,
  LG_MIN_WIDTH,
  PRIMARY_NAV_ITEMS,
  MORE_NAV_ITEMS,
  isPrimaryNavView,
  isMoreNavView,
  isListDetailView,
};
`;

const tempPath = path.join(__dirname, 'temp_mobile_nav.js');
fs.writeFileSync(tempPath, code);

try {
  const {
    MD_MIN_WIDTH,
    LG_MIN_WIDTH,
    PRIMARY_NAV_ITEMS,
    MORE_NAV_ITEMS,
    isPrimaryNavView,
    isMoreNavView,
    isListDetailView,
  } = require(tempPath);

  describe('mobile-nav', () => {
    afterAll(() => {
      fs.unlinkSync(tempPath);
    });

    test('keeps five primary destinations including Tasks and More overflow', () => {
      expect(PRIMARY_NAV_ITEMS).toHaveLength(4);
      expect(PRIMARY_NAV_ITEMS.map((item) => item.view)).toEqual([
        'agent',
        'new-task',
        'dashboard',
        'branches',
      ]);
      expect(MORE_NAV_ITEMS.map((item) => item.view)).toEqual([
        'plugins',
        'pull-requests',
        'devices',
        'settings',
      ]);
    });

    test('classifies primary vs more views without overlap', () => {
      expect(isPrimaryNavView('agent')).toBe(true);
      expect(isPrimaryNavView('settings')).toBe(false);
      expect(isMoreNavView('settings')).toBe(true);
      expect(isMoreNavView('plugins')).toBe(true);
      expect(isMoreNavView('agent')).toBe(false);
      expect(isMoreNavView('task-detail')).toBe(false);
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
