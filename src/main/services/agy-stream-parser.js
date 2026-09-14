const { appendAgentChunk, applyToolCallUpdate } = require('./opencode-session-parser');

const AGY_CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidConversationId(id) {
  return typeof id === 'string' && AGY_CONVERSATION_ID_RE.test(id);
}

const AGY_EVENT_NAMES = new Set(['init', 'step_update', 'result']);

/**
 * Parse one line of `agy --output-format stream-json` stdout.
 * Unknown event names are silently ignored (forward-compat); malformed
 * input never throws.
 * @param {string} line
 * @returns {{ event: null } | { event: { type: 'init', conversationId: string, payload: object } | { type: 'step_update', step: object } | { type: 'result', resultData: object } }}
 */
function parseAgyStreamLine(line) {
  const trimmed = typeof line === 'string' ? line.trim() : '';
  if (!trimmed) return { event: null };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { event: null };
  }
  if (!parsed || typeof parsed !== 'object' || !AGY_EVENT_NAMES.has(parsed.event)) {
    return { event: null };
  }

  if (parsed.event === 'init') {
    return {
      event: {
        type: 'init',
        conversationId: parsed.conversation_id,
        payload: parsed.init,
      },
    };
  }

  if (parsed.event === 'step_update') {
    const {
      conversation_id: conversationId,
      step_index: stepIndex,
      state,
      step_type: stepType,
      tool_name: toolName,
      text_delta: textDelta,
      tool_info: toolInfo,
      subagent_info: subagentInfo,
    } = parsed.step_update || {};
    return {
      event: {
        type: 'step_update',
        step: {
          conversationId,
          stepIndex,
          state,
          stepType,
          toolName,
          textDelta,
          toolInfo,
          subagentInfo,
        },
      },
    };
  }

  const {
    conversation_id: conversationId,
    status,
    response,
    error,
    duration_seconds: durationSeconds,
    num_turns: numTurns,
    usage,
  } = parsed.result || {};
  return {
    event: {
      type: 'result',
      resultData: {
        conversationId,
        status,
        response,
        error,
        durationSeconds,
        numTurns,
        usage,
      },
    },
  };
}

/**
 * Fold one parsed agy stream event into a streamed transcript message list.
 * Pure: returns a new array (or the same one) and never mutates the input.
 * `result` events are passed through unchanged — the consuming service
 * finalizes the session from them.
 * @param {Array<object>} messages
 * @param {{ type: string, step?: object }} event
 * @param {string|null} timestamp
 */
function applyAgyStreamEvent(messages, event, timestamp = null) {
  if (!event || typeof event !== 'object') return messages;
  if (event.type === 'init' || event.type === 'result') return messages;
  if (event.type !== 'step_update') return messages;

  const step = event.step || {};
  if (step.stepType === 'agent_response' && typeof step.textDelta === 'string') {
    return appendAgentChunk(messages, step.textDelta, timestamp);
  }
  if (step.stepType === 'tool') {
    const toolInfo = step.toolInfo;
    return applyToolCallUpdate(
      messages,
      {
        toolCallId: `agy-tool-${step.stepIndex}`,
        title: step.toolName || toolInfo?.name || 'tool',
        kind: 'tool',
        status: step.state === 'ACTIVE' ? 'in_progress' : 'completed',
        content: toolInfo?.output ?? toolInfo?.error ?? null,
        raw: toolInfo?.parameters ?? toolInfo ?? null,
      },
      timestamp
    );
  }
  return messages;
}

module.exports = {
  AGY_CONVERSATION_ID_RE,
  isValidConversationId,
  parseAgyStreamLine,
  applyAgyStreamEvent,
};
