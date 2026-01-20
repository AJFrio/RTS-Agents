const julesService = require('../../src/main/services/jules-service');
const cursorService = require('../../src/main/services/cursor-service');

describe('Service URL Generation', () => {
  test('JulesService.normalizeSession generates correct webUrl', () => {
    const session = {
      id: '12345',
      title: 'Test Session',
      state: 'COMPLETED'
    };
    const normalized = julesService.normalizeSession(session);
    expect(normalized.webUrl).toBe('https://jules.google.com/session/12345');
  });

  test('CursorService.normalizeAgent generates correct webUrl', () => {
    const agent = {
      id: '67890',
      name: 'Test Agent',
      status: 'FINISHED'
    };
    const normalized = cursorService.normalizeAgent(agent);
    expect(normalized.webUrl).toBe('https://cursor.com/67890');
  });
});
