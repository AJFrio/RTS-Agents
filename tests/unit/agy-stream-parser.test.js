const {
  AGY_CONVERSATION_ID_RE,
  isValidConversationId,
  parseAgyStreamLine,
  applyAgyStreamEvent,
} = require('../../src/main/services/agy-stream-parser');

const CONV_ID = 'c3b66b04-872b-4fbe-a3a4-058a026ef20a';
const ERROR_CONV_ID = '4fae3a70-db14-4c5f-abbb-1bf03f8120a7';

const INIT_LINE = JSON.stringify({
  event: 'init',
  conversation_id: CONV_ID,
  init: {
    cwd: '/home/user/project',
    tools: ['ask_permission', 'run_command', 'write_to_file'],
    permission_mode: 'request-review',
  },
});

const AGENT_ACTIVE_LINE = JSON.stringify({
  event: 'step_update',
  step_update: {
    conversation_id: CONV_ID,
    step_index: 3,
    state: 'ACTIVE',
    step_type: 'agent_response',
    text_delta: 'Git rebase destructively rewrites',
  },
});

const AGENT_DONE_LINE = JSON.stringify({
  event: 'step_update',
  step_update: {
    conversation_id: CONV_ID,
    step_index: 3,
    state: 'DONE',
    step_type: 'agent_response',
    text_delta: '\n',
    duration_seconds: 6.28,
    usage: {
      input_tokens: 10302,
      output_tokens: 582,
      thinking_tokens: 551,
      cache_read_tokens: 8113,
      total_tokens: 10884,
    },
  },
});

const TOOL_ACTIVE_LINE = JSON.stringify({
  event: 'step_update',
  step_update: {
    conversation_id: CONV_ID,
    step_index: 4,
    state: 'ACTIVE',
    step_type: 'tool',
    tool_name: 'run_command',
  },
});

const TOOL_DONE_LINE = JSON.stringify({
  event: 'step_update',
  step_update: {
    conversation_id: CONV_ID,
    step_index: 4,
    state: 'DONE',
    step_type: 'tool',
    tool_name: 'run_command',
    duration_seconds: 0.07,
    tool_info: {
      name: 'run_command',
      parameters: { CommandLine: 'echo hello' },
      output: 'hello\r\n',
    },
  },
});

const RESULT_LINE = JSON.stringify({
  event: 'result',
  result: {
    conversation_id: CONV_ID,
    status: 'SUCCESS',
    response: 'All done',
    duration_seconds: 6.88,
    num_turns: 1,
    usage: {
      input_tokens: 10302,
      output_tokens: 582,
      thinking_tokens: 551,
      cache_read_tokens: 8113,
      total_tokens: 10884,
    },
  },
});

const ERROR_RESULT_LINE = JSON.stringify({
  event: 'result',
  result: {
    conversation_id: ERROR_CONV_ID,
    status: 'ERROR',
    response: '',
    error: '/model is answered by the CLI itself',
    duration_seconds: 0,
    num_turns: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      thinking_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 0,
    },
  },
});

describe('agy-stream-parser', () => {
  test('isValidConversationId accepts UUID ids and rejects others', () => {
    expect(isValidConversationId('055a398f-db14-4c5f-abbb-1bf03f8120a7')).toBe(true);
    expect(isValidConversationId('ses_abc')).toBe(false);
    expect(isValidConversationId(123)).toBe(false);
    expect(isValidConversationId('')).toBe(false);
  });

  test('AGY_CONVERSATION_ID_RE is case-insensitive', () => {
    expect(AGY_CONVERSATION_ID_RE.test('C3B66B04-872B-4FBE-A3A4-058A026EF20A')).toBe(true);
  });

  test('parseAgyStreamLine parses init with top-level conversation_id', () => {
    const parsed = parseAgyStreamLine(INIT_LINE);
    expect(parsed.event.type).toBe('init');
    expect(parsed.event.conversationId).toBe(CONV_ID);
    expect(parsed.event.payload).toEqual({
      cwd: '/home/user/project',
      tools: ['ask_permission', 'run_command', 'write_to_file'],
      permission_mode: 'request-review',
    });
  });

  test('parseAgyStreamLine maps agent_response step_update fields', () => {
    const parsed = parseAgyStreamLine(AGENT_ACTIVE_LINE);
    expect(parsed.event.type).toBe('step_update');
    expect(parsed.event.step.conversationId).toBe(CONV_ID);
    expect(parsed.event.step.stepIndex).toBe(3);
    expect(parsed.event.step.state).toBe('ACTIVE');
    expect(parsed.event.step.stepType).toBe('agent_response');
    expect(parsed.event.step.textDelta).toBe('Git rebase destructively rewrites');
  });

  test('parseAgyStreamLine maps tool step_update with tool_info', () => {
    const parsed = parseAgyStreamLine(TOOL_DONE_LINE);
    expect(parsed.event.type).toBe('step_update');
    expect(parsed.event.step.stepIndex).toBe(4);
    expect(parsed.event.step.stepType).toBe('tool');
    expect(parsed.event.step.toolName).toBe('run_command');
    expect(parsed.event.step.toolInfo).toEqual({
      name: 'run_command',
      parameters: { CommandLine: 'echo hello' },
      output: 'hello\r\n',
    });
  });

  test('parseAgyStreamLine maps result fields', () => {
    const parsed = parseAgyStreamLine(RESULT_LINE);
    expect(parsed.event.type).toBe('result');
    expect(parsed.event.resultData.conversationId).toBe(CONV_ID);
    expect(parsed.event.resultData.status).toBe('SUCCESS');
    expect(parsed.event.resultData.response).toBe('All done');
    expect(parsed.event.resultData.durationSeconds).toBe(6.88);
    expect(parsed.event.resultData.numTurns).toBe(1);
  });

  test('parseAgyStreamLine maps error result fields', () => {
    const parsed = parseAgyStreamLine(ERROR_RESULT_LINE);
    expect(parsed.event.type).toBe('result');
    expect(parsed.event.resultData.status).toBe('ERROR');
    expect(parsed.event.resultData.response).toBe('');
    expect(parsed.event.resultData.error).toBe('/model is answered by the CLI itself');
    expect(parsed.event.resultData.numTurns).toBe(0);
  });

  test('parseAgyStreamLine returns { event: null } for garbage, unknown, and empty lines', () => {
    expect(parseAgyStreamLine('not json')).toEqual({ event: null });
    expect(parseAgyStreamLine('{"event":"mystery","x":1}')).toEqual({ event: null });
    expect(parseAgyStreamLine('')).toEqual({ event: null });
    expect(parseAgyStreamLine('   \t  ')).toEqual({ event: null });
  });

  test('applyAgyStreamEvent coalesces ACTIVE + DONE agent_response into one assistant message', () => {
    let messages = [];
    for (const line of [INIT_LINE, AGENT_ACTIVE_LINE, AGENT_DONE_LINE]) {
      const { event } = parseAgyStreamLine(line);
      messages = applyAgyStreamEvent(messages, event, null);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toBe('Git rebase destructively rewrites');
  });

  test('applyAgyStreamEvent marks ACTIVE tool call in_progress with id agy-tool-4', () => {
    const { event: agentEvent } = parseAgyStreamLine(AGENT_ACTIVE_LINE);
    let messages = applyAgyStreamEvent([], agentEvent, null);
    const { event: toolEvent } = parseAgyStreamLine(TOOL_ACTIVE_LINE);
    messages = applyAgyStreamEvent(messages, toolEvent, null);
    expect(messages[0].toolCalls).toHaveLength(1);
    expect(messages[0].toolCalls[0].id).toBe('agy-tool-4');
    expect(messages[0].toolCalls[0].status).toBe('in_progress');
    expect(messages[0].toolCalls[0].name).toBe('run_command');
  });

  test('applyAgyStreamEvent upserts tool call to completed with captured output', () => {
    let messages = [];
    for (const line of [AGENT_ACTIVE_LINE, TOOL_ACTIVE_LINE, TOOL_DONE_LINE]) {
      const { event } = parseAgyStreamLine(line);
      messages = applyAgyStreamEvent(messages, event, null);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].toolCalls).toHaveLength(1);
    expect(messages[0].toolCalls[0].id).toBe('agy-tool-4');
    expect(messages[0].toolCalls[0].name).toBe('run_command');
    expect(messages[0].toolCalls[0].status).toBe('completed');
    expect(messages[0].toolCalls[0].result).toContain('hello');
    expect(messages[0].toolCalls[0].input).toEqual({ CommandLine: 'echo hello' });
  });

  test('applyAgyStreamEvent leaves messages unchanged for init and result events', () => {
    const { event: agentEvent } = parseAgyStreamLine(AGENT_ACTIVE_LINE);
    const messages = applyAgyStreamEvent([], agentEvent, null);
    const { event: initEvent } = parseAgyStreamLine(INIT_LINE);
    const { event: resultEvent } = parseAgyStreamLine(RESULT_LINE);
    expect(applyAgyStreamEvent(messages, initEvent, null)).toEqual(messages);
    expect(applyAgyStreamEvent(messages, resultEvent, null)).toEqual(messages);
  });

  test('applyAgyStreamEvent does not mutate the input messages array', () => {
    const { event } = parseAgyStreamLine(AGENT_ACTIVE_LINE);
    const input = [];
    const out = applyAgyStreamEvent(input, event, null);
    expect(input).toHaveLength(0);
    expect(out).toHaveLength(1);
  });

  test('applyAgyStreamEvent silently skips checkpoint and user_input step updates', () => {
    const checkpointEvent = {
      event: {
        type: 'step_update',
        step: { conversationId: CONV_ID, stepIndex: 1, state: 'DONE', stepType: 'checkpoint' },
      },
    };
    const userInputEvent = {
      event: {
        type: 'step_update',
        step: { conversationId: CONV_ID, stepIndex: 2, state: 'DONE', stepType: 'user_input' },
      },
    };
    const messages = [{ role: 'user', content: 'hi', id: 'stream-0' }];
    expect(() => applyAgyStreamEvent(messages, checkpointEvent, null)).not.toThrow();
    expect(applyAgyStreamEvent(messages, checkpointEvent, null)).toEqual(messages);
    expect(applyAgyStreamEvent(messages, userInputEvent, null)).toEqual(messages);
  });
});
