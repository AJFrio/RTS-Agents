/**
 * Normalize provider task-detail payloads into the ChatTranscript message
 * shape used by the Agent tab: user turns, thinking, and expandable tool calls.
 *
 * Pure data logic (no DOM/Electron) so Jest can load it the same way as
 * transcript.js.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function timestampOf(value) {
  if (value == null || value === '') return null;
  return value;
}

/**
 * @param {object} message
 * @returns {boolean}
 */
function messageHasBody(message) {
  if (!message || typeof message !== 'object') return false;
  return !!(
    trimText(message.content) ||
    trimText(message.thinking) ||
    (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) ||
    (Array.isArray(message.cards) && message.cards.length > 0)
  );
}

/**
 * @param {unknown} messages
 * @returns {boolean}
 */
function hasStructuredMessages(messages) {
  return Array.isArray(messages) && messages.some(messageHasBody);
}

/**
 * @param {Array} toolCalls
 * @param {string} messageId
 * @returns {Array|undefined}
 */
function mapToolCalls(toolCalls, messageId) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return undefined;
  return toolCalls.map((call, index) => ({
    id: call.id ?? `${messageId}-tool-${index}`,
    name: call.name || call.tool || 'tool',
    target: call.target,
    input: call.input ?? call.args,
    result: call.result,
    status: call.status,
  }));
}

/**
 * @param {Array} cards
 * @returns {Array|undefined}
 */
function mapCards(cards) {
  return Array.isArray(cards) && cards.length > 0 ? cards : undefined;
}

/**
 * @param {string} prompt
 * @param {unknown} timestamp
 * @returns {object}
 */
function promptMessage(prompt, timestamp) {
  return {
    id: 'prompt',
    role: 'user',
    content: prompt,
    timestamp: timestampOf(timestamp),
  };
}

/**
 * Prepend the dispatched prompt when the transcript has no user turn.
 *
 * @param {Array<object>} messages
 * @param {string} prompt
 * @param {unknown} timestamp
 * @returns {Array<object>}
 */
function prependPromptIfNeeded(messages, prompt, timestamp) {
  if (!prompt) return messages;
  const hasUser = messages.some((message) => message.role === 'user' && trimText(message.content));
  if (hasUser) return messages;
  return [promptMessage(prompt, timestamp), ...messages];
}

/**
 * @param {Array} messages
 * @returns {Array<object>}
 */
function mapStructuredMessages(messages) {
  return messages.map((msg, index) => {
    const id = msg.id ?? `msg-${index}`;
    return {
      id,
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content ?? '',
      thinking: msg.thinking || undefined,
      toolCalls: mapToolCalls(msg.toolCalls, id),
      cards: mapCards(msg.cards),
      timestamp: timestampOf(msg.timestamp ?? msg.createdAt),
    };
  });
}

/**
 * @param {string} status
 * @returns {string}
 */
function mapCursorRunStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'finished' || normalized === 'completed') return 'completed';
  if (
    normalized === 'running' ||
    normalized === 'in_progress' ||
    normalized === 'creating' ||
    normalized === 'inprogress'
  ) {
    return 'in_progress';
  }
  if (normalized === 'pending' || normalized === 'queued') return 'pending';
  return 'completed';
}

/**
 * @param {object} activity
 * @returns {string}
 */
function cursorRunStatus(activity) {
  return trimText(String(activity?.title || '').replace(/^Run\s+/i, '')) || 'UNKNOWN';
}

/**
 * Git / run leftover after the conversation already used the result text.
 *
 * @param {object} activity
 * @param {string} [conversationText]
 * @returns {string}
 */
function cursorRunGitNote(activity, conversationText) {
  const description = trimText(activity?.description);
  if (!description) return '';
  const spoken = trimText(conversationText);
  if (spoken && description.startsWith(spoken)) {
    return description.slice(spoken.length).trim();
  }
  if (spoken && description === spoken) return '';
  return description;
}

/**
 * @param {object} activity
 * @param {string} [conversationText]
 * @returns {Array|undefined}
 */
function cursorRunToolCalls(activity, conversationText) {
  if (!activity || typeof activity !== 'object') return undefined;
  const status = cursorRunStatus(activity);
  const result = cursorRunGitNote(activity, conversationText);
  if (!result && !activity.description && status === 'UNKNOWN') return undefined;
  if (!result && conversationText) return undefined;
  return [
    {
      id: `${activity.id || 'run'}-run`,
      name: 'Run',
      target: status,
      result: result || activity.description || undefined,
      status: mapCursorRunStatus(status),
    },
  ];
}

/**
 * @param {object} activity
 * @param {number} index
 * @returns {object}
 */
function mapCursorActivity(activity, index) {
  const id = activity.id ?? `run-${index}`;
  const content = trimText(activity.description) || trimText(activity.title);
  return {
    id,
    role: 'assistant',
    content,
    toolCalls: cursorRunToolCalls(activity),
    timestamp: timestampOf(activity.timestamp ?? activity.createdAt ?? activity.updatedAt),
  };
}

/**
 * Cursor cloud: prompt + conversation turns, with run activities as tool chips.
 *
 * @param {object} details
 * @param {string} prompt
 * @param {unknown} promptTimestamp
 * @returns {Array<object>}
 */
function mapCursorCloud(details, prompt, promptTimestamp) {
  const conversation = Array.isArray(details.conversation) ? details.conversation : [];
  const activities = Array.isArray(details.activities) ? details.activities : [];
  const activitiesById = new Map(
    activities.filter((item) => item && item.id != null).map((item) => [String(item.id), item])
  );

  const mapped = [];
  if (conversation.length) {
    conversation.forEach((turn, index) => {
      if (!turn || typeof turn !== 'object') return;
      const id = turn.id ?? `conversation-${index}`;
      const activity = activitiesById.get(String(turn.id));
      const text = turn.text ?? turn.content ?? '';
      mapped.push({
        id,
        role: turn.isUser || turn.role === 'user' ? 'user' : 'assistant',
        content: text,
        toolCalls: activity ? cursorRunToolCalls(activity, text) : undefined,
        timestamp: timestampOf(turn.timestamp ?? turn.createdAt ?? activity?.timestamp),
      });
    });
  } else {
    activities.forEach((activity, index) => {
      if (!activity || typeof activity !== 'object') return;
      mapped.push(mapCursorActivity(activity, index));
    });
  }

  return prependPromptIfNeeded(mapped, prompt, promptTimestamp);
}

/**
 * @param {Array} steps
 * @returns {string}
 */
function formatPlanSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return '';
  return steps
    .map((step) => {
      if (!step || typeof step !== 'object') return '';
      const title = trimText(step.title);
      const description = trimText(step.description);
      if (title && description) return `${title} — ${description}`;
      return title || description;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {unknown} file
 * @returns {string}
 */
function fileChangePath(file) {
  if (typeof file === 'string') return file;
  if (file && typeof file === 'object') {
    return file.path || file.file || file.filename || '';
  }
  return '';
}

/**
 * @param {object} activity
 * @param {number} index
 * @returns {object|null}
 */
function mapJulesActivity(activity, index) {
  if (!activity || typeof activity !== 'object') return null;
  const id = activity.id ?? `activity-${index}`;
  const isUser =
    activity.type === 'user_messaged' ||
    activity.originator === 'user' ||
    activity.originator === 'USER';

  const thinking = formatPlanSteps(activity.planSteps);
  const content =
    trimText(activity.message) ||
    trimText(activity.description) ||
    (isUser ? '' : trimText(activity.title));

  const toolCalls = [];
  (activity.commands || []).forEach((command, commandIndex) => {
    const target = typeof command === 'string' ? command : command?.command || '';
    if (!target) return;
    toolCalls.push({
      id: `${id}-bash-${commandIndex}`,
      name: 'Bash',
      target,
      status: 'completed',
    });
  });
  (activity.fileChanges || []).forEach((file, fileIndex) => {
    const target = fileChangePath(file);
    if (!target) return;
    toolCalls.push({
      id: `${id}-edit-${fileIndex}`,
      name: 'Edit',
      target,
      status: 'completed',
    });
  });

  const cards = activity.hasMedia
    ? [
        {
          kind: 'jules-media',
          id,
          activityId: activity.id ?? id,
          hasMedia: true,
          mediaCount: activity.mediaCount,
        },
      ]
    : undefined;

  const mapped = {
    id,
    role: isUser ? 'user' : 'assistant',
    content,
    thinking: thinking || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    cards,
    timestamp: timestampOf(activity.timestamp ?? activity.createTime ?? activity.createdAt),
  };

  return messageHasBody(mapped) ? mapped : null;
}

/**
 * @param {object} details
 * @param {string} prompt
 * @param {unknown} promptTimestamp
 * @returns {Array<object>}
 */
function mapJulesActivities(details, prompt, promptTimestamp) {
  const activities = Array.isArray(details.activities) ? details.activities : [];
  const mapped = activities.map(mapJulesActivity).filter(Boolean);
  return prependPromptIfNeeded(mapped, prompt, promptTimestamp);
}

/**
 * @param {Array} activities
 * @param {string} provider
 * @returns {boolean}
 */
function looksLikeJules(activities, provider) {
  if (provider === 'jules') return true;
  const julesTypes = new Set([
    'plan_generated',
    'plan_approved',
    'user_messaged',
    'agent_messaged',
    'progress',
    'completed',
    'session_failed',
  ]);
  return (activities || []).some(
    (activity) =>
      activity &&
      (activity.hasMedia ||
        (Array.isArray(activity.commands) && activity.commands.length > 0) ||
        (Array.isArray(activity.fileChanges) && activity.fileChanges.length > 0) ||
        (Array.isArray(activity.planSteps) && activity.planSteps.length > 0) ||
        julesTypes.has(activity.type))
  );
}

/**
 * True when the transcript has anything ChatTranscript can render.
 *
 * @param {Array<object>} messages
 * @returns {boolean}
 */
export function hasTranscriptContent(messages) {
  return Array.isArray(messages) && messages.some(messageHasBody);
}

/**
 * Map `agents:get-details` (plus the list-card task) into ChatTranscript messages.
 *
 * @param {object} [details]
 * @param {object} [task]
 * @returns {Array<object>}
 */
export function detailsToTranscript(details = {}, task = {}) {
  const source = details && typeof details === 'object' ? details : {};
  const card = task && typeof task === 'object' ? task : {};
  const prompt = trimText(source.prompt) || trimText(card.prompt);
  const promptTimestamp = source.createdAt || card.createdAt || null;
  const provider = source.provider || card.provider || '';

  if (hasStructuredMessages(source.messages)) {
    return prependPromptIfNeeded(mapStructuredMessages(source.messages), prompt, promptTimestamp);
  }

  const conversation = Array.isArray(source.conversation) ? source.conversation : [];
  const activities = Array.isArray(source.activities) ? source.activities : [];

  if (conversation.length > 0 || (activities.length > 0 && !looksLikeJules(activities, provider))) {
    return mapCursorCloud(source, prompt, promptTimestamp);
  }

  if (activities.length > 0) {
    return mapJulesActivities(source, prompt, promptTimestamp);
  }

  if (trimText(source.content)) {
    return prependPromptIfNeeded(
      [
        {
          id: 'content',
          role: 'assistant',
          content: source.content,
          timestamp: timestampOf(source.updatedAt || source.createdAt),
        },
      ],
      prompt,
      promptTimestamp
    );
  }

  if (prompt) {
    return [promptMessage(prompt, promptTimestamp)];
  }

  return [];
}
