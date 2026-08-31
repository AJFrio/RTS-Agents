// format.js is renderer ES module source; Jest here is CommonJS with no ESM
// transform, so the source is evaluated directly (same approach as
// transcript.test.js).
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/utils/format.js'),
  'utf-8'
);
const factory = new Function(
  `${source.replace(/export function/g, 'function').replace(/export const/g, 'const')}
   return { repoLabel };`
);
const { repoLabel } = factory();

describe('repoLabel', () => {
  test('keeps owner/repo for a GitHub URL', () => {
    expect(repoLabel('https://github.com/AJFrio/RTS-Agents')).toBe('AJFrio/RTS-Agents');
  });

  test('keeps owner/repo for a GitHub URL with a .git suffix', () => {
    expect(repoLabel('https://github.com/AJFrio/RTS-Agents.git')).toBe('AJFrio/RTS-Agents');
  });

  test('uses the directory name for a local absolute path', () => {
    expect(repoLabel('/Users/me/Documents/projects/sellout')).toBe('sellout');
  });

  test('ignores a trailing slash on a local path', () => {
    expect(repoLabel('/Users/me/projects/sellout/')).toBe('sellout');
  });

  test('handles a Windows-style path', () => {
    expect(repoLabel('C:\\Users\\me\\projects\\sellout')).toBe('sellout');
  });

  test('returns an empty string for missing input', () => {
    expect(repoLabel('')).toBe('');
    expect(repoLabel(null)).toBe('');
    expect(repoLabel(undefined)).toBe('');
  });

  test('passes through a bare name unchanged', () => {
    expect(repoLabel('my-project')).toBe('my-project');
  });
});
