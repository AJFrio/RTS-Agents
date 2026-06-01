const {
  isValidOpenCodeSessionId,
  parseJsonlEvent,
  appendStreamMessage,
  parseExportToMessages,
} = require('../../src/main/services/opencode-session-parser');

describe('opencode-session-parser', () => {
  test('isValidOpenCodeSessionId accepts ses_* ids', () => {
    expect(isValidOpenCodeSessionId('ses_494719016ffe85dkDMj0FPRbHK')).toBe(true);
    expect(isValidOpenCodeSessionId('opencode-123')).toBe(false);
    expect(isValidOpenCodeSessionId('')).toBe(false);
  });

  test('parseJsonlEvent extracts session id and text', () => {
    const line = JSON.stringify({
      type: 'text',
      sessionID: 'ses_abc123',
      timestamp: 1767036059338,
      part: { type: 'text', text: 'Hello from OpenCode' },
    });
    const result = parseJsonlEvent(line);
    expect(result.sessionId).toBe('ses_abc123');
    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toBe('Hello from OpenCode');
  });

  test('appendStreamMessage caps buffer length', () => {
    let messages = [];
    for (let i = 0; i < 250; i++) {
      messages = appendStreamMessage(messages, {
        role: 'assistant',
        content: `line ${i}`,
        timestamp: null,
      });
    }
    expect(messages.length).toBeLessThanOrEqual(200);
    expect(messages[messages.length - 1].content).toContain('249');
  });

  test('parseExportToMessages maps export fixture', () => {
    const fixture = require('../fixtures/opencode-export-sample.json');
    const messages = parseExportToMessages(fixture);
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[0].content).toContain('Fix the failing');
  });
});
