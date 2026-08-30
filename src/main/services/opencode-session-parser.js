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

/**
 * Append one streamed agent text chunk to a message list, coalescing it
 * into the previous assistant message when one is already open. ACP
 * adapters emit token-level chunks; without coalescing every chunk would
 * render as its own transcript block.
 */
function appendAgentChunk(messages, text, timestamp = null) {
  if (!text || !text.trim()) return messages;
  const previous = messages[messages.length - 1];
  if (previous && previous.role === 'assistant') {
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
  parseExportToMessages,
};
