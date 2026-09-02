// task-transcript.js is renderer ES module source. Jest here is CommonJS
// with no ESM transform, so `export` is stripped and the module evaluated
// directly — same pattern as transcript.test.js.
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/utils/task-transcript.js'),
  'utf-8'
);
const factory = new Function(`${source.replace(/export function/g, 'function')}
  return { detailsToTranscript, hasTranscriptContent };`);
const { detailsToTranscript, hasTranscriptContent } = factory();

describe('detailsToTranscript — ACP messages', () => {
  test('passes through thinking and tool calls', () => {
    const messages = detailsToTranscript({
      messages: [
        { id: 'u1', role: 'user', content: 'fix the lint', createdAt: '2026-09-01T00:00:00Z' },
        {
          id: 'a1',
          role: 'assistant',
          content: 'done',
          thinking: 'check eslint',
          toolCalls: [{ id: 't1', name: 'Bash', target: 'npm run lint', status: 'completed' }],
        },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'fix the lint' });
    expect(messages[1].thinking).toBe('check eslint');
    expect(messages[1].toolCalls[0].name).toBe('Bash');
  });

  test('prepends the prompt when there is no user turn', () => {
    const messages = detailsToTranscript(
      {
        prompt: 'Ship the dark-mode fix',
        createdAt: '2026-09-02T12:00:00Z',
        messages: [{ id: 'a1', role: 'assistant', content: 'working' }],
      },
      { prompt: 'ignored when details.prompt is set' }
    );

    expect(messages[0]).toMatchObject({
      id: 'prompt',
      role: 'user',
      content: 'Ship the dark-mode fix',
    });
    expect(messages[1].content).toBe('working');
  });

  test('does not duplicate the prompt when a user turn already exists', () => {
    const messages = detailsToTranscript({
      prompt: 'Ship the dark-mode fix',
      messages: [
        { id: 'u1', role: 'user', content: 'Ship the dark-mode fix' },
        { id: 'a1', role: 'assistant', content: 'ok' },
      ],
    });

    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(messages[0].id).toBe('u1');
  });
});

describe('detailsToTranscript — Cursor cloud', () => {
  test('prepends the prompt and maps conversation turns', () => {
    const messages = detailsToTranscript({
      prompt: 'Add a settings toggle',
      conversation: [{ id: 'run-1', isUser: false, text: 'Toggle added.' }],
    });

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('Add a settings toggle');
    expect(messages[1].content).toBe('Toggle added.');
  });

  test('attaches a Run tool chip with leftover git metadata', () => {
    const messages = detailsToTranscript({
      prompt: 'Add a settings toggle',
      conversation: [{ id: 'run-1', isUser: false, text: 'Toggle added.' }],
      activities: [
        {
          id: 'run-1',
          type: 'cursor_run',
          title: 'Run FINISHED',
          description: 'Toggle added.\n\nbranch: feat/toggle · PR: https://example.com/pr/1',
        },
      ],
    });

    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant.content).toBe('Toggle added.');
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]).toMatchObject({
      name: 'Run',
      target: 'FINISHED',
      status: 'completed',
    });
    expect(assistant.toolCalls[0].result).toContain('branch: feat/toggle');
    expect(assistant.toolCalls[0].result).not.toMatch(/^Toggle added\./);
  });

  test('maps run activities when conversation is empty', () => {
    const messages = detailsToTranscript(
      {
        prompt: 'Refactor auth',
        activities: [
          {
            id: 'run-9',
            type: 'cursor_run',
            title: 'Run RUNNING',
            description: 'Still working',
          },
        ],
      },
      { provider: 'cursor' }
    );

    expect(messages[0].role).toBe('user');
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Still working',
    });
    expect(messages[1].toolCalls[0].name).toBe('Run');
    expect(messages[1].toolCalls[0].status).toBe('in_progress');
  });
});

describe('detailsToTranscript — Jules', () => {
  test('maps plan steps to thinking and commands/files to tool calls', () => {
    const messages = detailsToTranscript(
      {
        prompt: 'Update the pricing page',
        activities: [
          {
            id: 'act-1',
            type: 'plan_generated',
            title: 'Plan generated',
            description: 'Outline the copy change',
            planSteps: [{ title: 'Edit hero', description: 'Swap the headline' }],
            commands: ['npm test'],
            fileChanges: ['src/pages/Pricing.jsx'],
          },
        ],
      },
      { provider: 'jules' }
    );

    expect(messages[0]).toMatchObject({ role: 'user', content: 'Update the pricing page' });
    expect(messages[1].thinking).toBe('Edit hero — Swap the headline');
    expect(messages[1].content).toBe('Outline the copy change');
    expect(messages[1].toolCalls.map((call) => call.name)).toEqual(['Bash', 'Edit']);
    expect(messages[1].toolCalls[0].target).toBe('npm test');
    expect(messages[1].toolCalls[1].target).toBe('src/pages/Pricing.jsx');
  });

  test('treats user_messaged activities as user turns and skips prompt prepend', () => {
    const messages = detailsToTranscript({
      prompt: 'Update the pricing page',
      activities: [
        {
          id: 'act-user',
          type: 'user_messaged',
          originator: 'user',
          message: 'Also fix the CTA',
        },
        {
          id: 'act-agent',
          type: 'agent_messaged',
          message: 'CTA updated.',
        },
      ],
    });

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('Also fix the CTA');
  });

  test('attaches jules-media cards when an activity has media', () => {
    const messages = detailsToTranscript({
      prompt: 'Capture checkout',
      activities: [
        {
          id: 'act-media',
          type: 'progress',
          title: 'Verification',
          hasMedia: true,
          mediaCount: 2,
        },
      ],
    });

    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant.cards).toEqual([
      {
        kind: 'jules-media',
        id: 'act-media',
        activityId: 'act-media',
        hasMedia: true,
        mediaCount: 2,
      },
    ]);
  });
});

describe('detailsToTranscript — fallbacks', () => {
  test('maps legacy markdown content after the prompt', () => {
    const messages = detailsToTranscript({
      prompt: 'Summarize the diff',
      content: '## Result\nLooks good.',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Summarize the diff');
    expect(messages[1]).toMatchObject({ role: 'assistant', content: '## Result\nLooks good.' });
  });

  test('returns a prompt-only user bubble', () => {
    const messages = detailsToTranscript({}, { prompt: 'Just the brief' });

    expect(messages).toEqual([
      { id: 'prompt', role: 'user', content: 'Just the brief', timestamp: null },
    ]);
    expect(hasTranscriptContent(messages)).toBe(true);
  });

  test('returns an empty list when there is nothing to show', () => {
    expect(detailsToTranscript()).toEqual([]);
    expect(detailsToTranscript(null, null)).toEqual([]);
    expect(hasTranscriptContent([])).toBe(false);
  });

  test('does not mutate the input details object', () => {
    const details = {
      prompt: 'Hi',
      messages: [{ id: 'a1', role: 'assistant', content: 'Hello' }],
    };
    const snapshot = JSON.stringify(details);

    detailsToTranscript(details);

    expect(JSON.stringify(details)).toBe(snapshot);
  });
});
