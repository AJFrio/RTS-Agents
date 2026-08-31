const OPENCODE_SESSION_ID_RE = /^ses_[A-Za-z0-9]+$/;
const MAX_STREAM_MESSAGES = 200;
const MAX_DETAIL_MESSAGES = 150;

function isValidOpenCodeSessionId(id) {
  return typeof id === 'string' && OPENCODE_SESSION_ID_RE.test(id);
}

/**
 * @param {string} line
 * @returns {{ sessionId?: string, message?: { role: string, content: string, timestamp: string|null } }}
 */
function parseJsonlEvent(line) {
  const trimmed = line.trim();
  if (!trimmed) return {};
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return {};
  }

  const sessionId =
    typeof event.sessionID === 'string' && isValidOpenCodeSessionId(event.sessionID)
      ? event.sessionID
      : typeof event.sessionId === 'string' && isValidOpenCodeSessionId(event.sessionId)
        ? event.sessionId
        : null;

  let message = null;
  if (event.type === 'text' && event.part?.text) {
    message = {
      role: 'assistant',
      content: String(event.part.text),
      timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : null,
    };
  }

  return { sessionId, message };
}

function appendStreamMessage(messages, message) {
  if (!message?.content?.trim()) return messages;
  const next = [...messages, { ...message, id: `stream-${messages.length}` }];
  if (next.length > MAX_STREAM_MESSAGES) {
    return next.slice(-MAX_STREAM_MESSAGES);
  }
  return next;
}

const MAX_MERGED_CHUNK_CONTENT = 20000;
const MAX_MERGED_THOUGHT_CONTENT = 20000;
const MAX_TOOL_RESULT_CHARS = 4000;

/**
 * Append one streamed agent text chunk to a message list, coalescing it
 * into the previous assistant message when one is already open. ACP
 * adapters emit token-level chunks; without coalescing every chunk would
 * render as its own transcript block. A message that already received a
 * tool call is marked closed, so post-tool text starts a fresh message.
 */
function appendAgentChunk(messages, text, timestamp = null) {
  if (!text || !text.trim()) return messages;
  const previous = messages[messages.length - 1];
  if (previous && previous.role === 'assistant' && !previous._closed) {
    const merged = previous.content + text;
    const next = messages.slice();
    next[next.length - 1] = {
      ...previous,
      content: merged.length > MAX_MERGED_CHUNK_CONTENT ? merged.slice(-MAX_MERGED_CHUNK_CONTENT) : merged,
    };
    return next;
  }
  const next = [
    ...messages,
    { role: 'assistant', content: text, timestamp, id: `stream-${messages.length}` },
  ];
  if (next.length > MAX_STREAM_MESSAGES) {
    return next.slice(-MAX_STREAM_MESSAGES);
  }
  return next;
}

/** Text of an ACP content block/string/array of blocks. */
function extractUpdateText(content) {
  if (typeof content === 'string') return content;
  if (typeof content?.text === 'string') return content.text;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (typeof block?.text === 'string') return block.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Append one streamed reasoning chunk, coalescing into the previous
 * assistant message's `thinking` field so the UI can show it collapsed.
 */
function appendThoughtChunk(messages, text, timestamp = null) {
  if (!text || !text.trim()) return messages;
  const previous = messages[messages.length - 1];
  if (previous && previous.role === 'assistant' && !previous._closed) {
    const merged = (previous.thinking || '') + text;
    const next = messages.slice();
    next[next.length - 1] = {
      ...previous,
      thinking:
        merged.length > MAX_MERGED_THOUGHT_CONTENT
          ? merged.slice(-MAX_MERGED_THOUGHT_CONTENT)
          : merged,
    };
    return next;
  }
  const next = [
    ...messages,
    { role: 'assistant', content: '', thinking: text, timestamp, id: `stream-${messages.length}` },
  ];
  if (next.length > MAX_STREAM_MESSAGES) {
    return next.slice(-MAX_STREAM_MESSAGES);
  }
  return next;
}

/** Short human summary of a tool call's raw input for the collapsed row. */
function summarizeToolRaw(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.slice(0, 72);
  if (typeof raw === 'object') {
    const candidates = [
      raw.command,
      raw.cmd,
      raw.file_path,
      raw.filePath,
      raw.path,
      raw.file,
      raw.pattern,
      raw.query,
      raw.url,
      raw.description,
      raw.prompt,
    ];
    const hit = candidates.find((value) => typeof value === 'string' && value.trim());
    if (hit) return hit.slice(0, 72);
    if (Array.isArray(raw.command) && raw.command.length) {
      return String(raw.command.join(' ')).slice(0, 72);
    }
  }
  try {
    return JSON.stringify(raw).slice(0, 72);
  } catch {
    return '';
  }
}

/**
 * Upsert an ACP `tool_call` / `tool_call_update` into the last assistant
 * message's `toolCalls` list. `toolCall` shape (ACP v1):
 * { toolCallId, title, kind, status, content: Block[], raw }
 */
function applyToolCallUpdate(messages, toolCall, timestamp = null) {
  const id = toolCall?.toolCallId || toolCall?.id || `call-${Date.now()}`;
  const previous = messages[messages.length - 1];
  let base = previous;
  if (!base || base.role !== 'assistant') {
    base = { role: 'assistant', content: '', timestamp, id: `stream-${messages.length}` };
    messages = [...messages, base];
  }
  const toolCalls = Array.isArray(base.toolCalls) ? [...base.toolCalls] : [];
  const index = toolCalls.findIndex((call) => call.id === id);
  const result = extractUpdateText(toolCall?.content).slice(0, MAX_TOOL_RESULT_CHARS);
  const entry = {
    id,
    name: toolCall?.title || (index >= 0 ? toolCalls[index].name : 'tool'),
    target: summarizeToolRaw(toolCall?.raw) || (index >= 0 ? toolCalls[index].target : ''),
    input: toolCall?.raw ?? (index >= 0 ? toolCalls[index].input : {}),
    status: toolCall?.status || (index >= 0 ? toolCalls[index].status : 'in_progress'),
    result,
  };
  if (index >= 0) {
    toolCalls[index] = { ...toolCalls[index], ...entry };
  } else {
    toolCalls.push(entry);
  }
  const next = messages.slice();
  next[next.length - 1] = {
    ...base,
    toolCalls,
    // Text chunks arriving after a tool call belong to a new message.
    _closed: true,
  };
  return next;
}

/**
 * Apply one ACP `session/update` notification to a streamed message list:
 * text chunks, thought chunks, and tool calls all land on structured
 * transcript messages the renderer renders with tool-call and thinking
 * blocks (collapsed by default, expandable in the UI).
 */
function applySessionUpdate(messages, update, timestamp = null) {
  if (!update || typeof update !== 'object') return messages;
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      return appendAgentChunk(messages, extractUpdateText(update.content), timestamp);
    case 'agent_thought_chunk':
      return appendThoughtChunk(messages, extractUpdateText(update.content), timestamp);
    case 'tool_call':
    case 'tool_call_update':
      return applyToolCallUpdate(messages, update.toolCall, timestamp);
    default:
      return messages;
  }
}

function extractTextContent(part) {
  if (!part) return '';
  if (typeof part === 'string') return part;
  if (typeof part.text === 'string') return part.text;
  if (typeof part.content === 'string') return part.content;
  if (Array.isArray(part.content)) {
    return part.content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (typeof block?.text === 'string') return block.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function normalizeRole(raw) {
  const role = String(raw || '').toLowerCase();
  if (role === 'user' || role === 'human') return 'user';
  if (role === 'assistant' || role === 'claude' || role === 'agent' || role === 'model') {
    return 'assistant';
  }
  return null;
}

/**
 * Map `opencode export` JSON into AgentModal message rows.
 * @param {unknown} exportJson
 * @returns {Array<{ id?: string, role: string, content: string, timestamp: string|null }>}
 */
function parseExportToMessages(exportJson) {
  const rawMessages =
    exportJson?.messages ||
    exportJson?.conversation ||
    exportJson?.transcript ||
    (Array.isArray(exportJson) ? exportJson : []);

  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const out = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    const role = normalizeRole(msg?.role || msg?.type || msg?.author);
    if (!role) continue;

    const content =
      extractTextContent(msg) ||
      extractTextContent(msg?.content) ||
      (typeof msg?.message === 'string' ? msg.message : '');

    if (!String(content).trim()) continue;

    out.push({
      id: msg.id || `export-${i}`,
      role,
      content: String(content).trim(),
      timestamp: msg.timestamp || msg.createdAt || msg.time || null,
    });
  }

  if (out.length > MAX_DETAIL_MESSAGES) {
    return out.slice(-MAX_DETAIL_MESSAGES);
  }
  return out;
}

module.exports = {
  OPENCODE_SESSION_ID_RE,
  MAX_STREAM_MESSAGES,
  MAX_DETAIL_MESSAGES,
  isValidOpenCodeSessionId,
  parseJsonlEvent,
  appendStreamMessage,
  appendAgentChunk,
  appendThoughtChunk,
  applyToolCallUpdate,
  applySessionUpdate,
  parseExportToMessages,
};
