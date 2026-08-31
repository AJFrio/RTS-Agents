// transcript.js is renderer ES module source. Jest here is CommonJS with no
// ESM transform configured, so the single `export` keyword is stripped and the
// module evaluated directly — this keeps the runtime source ESM (what Vite
// needs) without adding a Babel/ESM pipeline for one pure helper.
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/utils/transcript.js'),
  'utf-8'
);
const factory = new Function(`${source.replace(/export function/g, 'function')}
  return { groupMessages, shortenTarget, stripHarnessNoise, isNearBottom };`);
const { groupMessages, shortenTarget, stripHarnessNoise, isNearBottom } = factory();

describe('groupMessages', () => {
  test('merges consecutive assistant turns into one group', () => {
    // Arrange
    const messages = [
      { id: '1', role: 'user', content: 'hi' },
      { id: '2', role: 'assistant', content: 'one' },
      { id: '3', role: 'assistant', content: 'two' },
      { id: '4', role: 'assistant', content: 'three' },
    ];

    // Act
    const groups = groupMessages(messages);

    // Assert
    expect(groups).toHaveLength(2);
    expect(groups[1].items).toHaveLength(3);
  });

  test('starts a new group when the speaker changes back', () => {
    const groups = groupMessages([
      { id: '1', role: 'assistant', content: 'a' },
      { id: '2', role: 'user', content: 'b' },
      { id: '3', role: 'assistant', content: 'c' },
    ]);

    expect(groups.map((g) => g.role)).toEqual(['assistant', 'user', 'assistant']);
  });

  test('preserves original message order within a group', () => {
    const groups = groupMessages([
      { id: '1', role: 'assistant', content: 'first' },
      { id: '2', role: 'assistant', content: 'second' },
    ]);

    expect(groups[0].items.map((m) => m.content)).toEqual(['first', 'second']);
  });

  test('does not mutate the input messages', () => {
    const messages = [
      { id: '1', role: 'assistant', content: 'a' },
      { id: '2', role: 'assistant', content: 'b' },
    ];
    const snapshot = JSON.stringify(messages);

    groupMessages(messages);

    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  test('handles empty and missing input without throwing', () => {
    expect(groupMessages([])).toEqual([]);
    expect(groupMessages(undefined)).toEqual([]);
  });
});

describe('shortenTarget', () => {
  const long = '/Users/jsnapoli1/Documents/work/simplifai/pipeline/packages/build/src/prompt.ts';

  test('leaves short targets untouched', () => {
    expect(shortenTarget('npm test')).toBe('npm test');
  });

  test('keeps the filename visible when truncating a path', () => {
    const result = shortenTarget(long);

    expect(result.startsWith('\u2026')).toBe(true);
    expect(result.endsWith('prompt.ts')).toBe(true);
  });

  test('keeps the head of a long shell command so it reads left to right', () => {
    const command = `grep -rn "executablePath" ${'x'.repeat(120)}`;
    const result = shortenTarget(command);

    expect(result.startsWith('grep -rn "executablePath"')).toBe(true);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  test('handles empty and non-string input', () => {
    expect(shortenTarget('')).toBe('');
    expect(shortenTarget(undefined)).toBe('');
  });
});

describe('stripHarnessNoise', () => {
  test('drops a message that is only a task-notification block', () => {
    const messages = [
      { role: 'user', content: 'real question' },
      {
        role: 'user',
        content:
          '<task-notification>\n<task-id>abc</task-id>\n<status>stopped</status>\n</task-notification>',
      },
      { role: 'assistant', content: 'real answer' },
    ];

    expect(stripHarnessNoise(messages)).toEqual([
      { role: 'user', content: 'real question' },
      { role: 'assistant', content: 'real answer' },
    ]);
  });

  test('strips a harness block but keeps the user text around it', () => {
    const messages = [
      {
        role: 'user',
        content:
          '<task-notification>\n<task-id>abc</task-id>\n</task-notification>\nTesting this from the actual RTS app.',
      },
    ];

    const [message] = stripHarnessNoise(messages);
    expect(message.content).toBe('Testing this from the actual RTS app.');
  });

  test('strips system-reminder and local-command wrappers', () => {
    const messages = [
      { role: 'user', content: '<system-reminder>bookkeeping</system-reminder>keep me' },
      {
        role: 'user',
        content:
          '<local-command-stdout>noise</local-command-stdout><command-name>/clear</command-name>',
      },
    ];

    const result = stripHarnessNoise(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('keep me');
  });

  test('keeps image references, which are real user content', () => {
    const messages = [
      { role: 'user', content: '[Image: source: /tmp/shot.png] what is this?' },
    ];
    expect(stripHarnessNoise(messages)).toEqual(messages);
  });

  test('leaves assistant messages untouched even if they quote a tag', () => {
    // The assistant discussing a tag is real content, not harness plumbing.
    const messages = [
      { role: 'assistant', content: 'The <task-notification> block is from the harness.' },
    ];
    expect(stripHarnessNoise(messages)).toEqual(messages);
  });

  test('returns an empty array for empty or missing input', () => {
    expect(stripHarnessNoise([])).toEqual([]);
    expect(stripHarnessNoise(null)).toEqual([]);
  });
});

describe('isNearBottom', () => {
  test('true when the scroll position is within the threshold of the end', () => {
    // 1000 tall content, 400 viewport, scrolled to 580 -> 20px from bottom.
    expect(isNearBottom({ scrollTop: 580, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  test('false when scrolled well above the end', () => {
    expect(isNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
  });

  test('true when content is shorter than the viewport', () => {
    // Nothing to scroll: the user is already seeing everything.
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
  });

  test('true at the exact bottom', () => {
    expect(isNearBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  test('false for a missing element', () => {
    expect(isNearBottom(null)).toBe(false);
  });
});
