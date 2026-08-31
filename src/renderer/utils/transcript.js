/**
 * Collapse a flat message list into speaker groups, so a run of
 * consecutive assistant turns reads as one message instead of a stack
 * of disconnected fragments.
 *
 * Pure data logic, kept out of the JSX module so it can be unit-tested
 * without a JSX transform.
 *
 * @param {Array<{role: string}>} messages
 * @returns {Array<{role: string, items: Array}>}
 */
export function groupMessages(messages) {
  const groups = [];

  for (const message of messages || []) {
    const previous = groups[groups.length - 1];
    if (previous && previous.role === message.role) {
      previous.items.push(message);
    } else {
      groups.push({ role: message.role, items: [message] });
    }
  }

  return groups;
}

const MAX_TARGET_CHARS = 72;

/**
 * Shorten a tool chip's target for one-line display. A filesystem path keeps
 * its tail so the filename stays readable; anything else (shell commands,
 * URLs) keeps its head.
 *
 * Done in JS rather than with CSS `dir="rtl"`, which visually reorders quotes
 * and operators and made shell commands unreadable.
 *
 * @param {string} target
 * @returns {string}
 */
export function shortenTarget(target) {
  if (typeof target !== 'string' || target.length <= MAX_TARGET_CHARS) return target || '';

  const isPath = target.startsWith('/') || target.startsWith('~');
  return isPath
    ? `\u2026${target.slice(-(MAX_TARGET_CHARS - 1))}`
    : `${target.slice(0, MAX_TARGET_CHARS - 1)}\u2026`;
}

/**
 * Harness-generated blocks that appear inside user-role messages.
 *
 * Claude Code transcripts interleave real user input with tooling
 * bookkeeping — background task notifications, system reminders, slash
 * command echoes. All of it is stored with `role: 'user'`, so a transcript
 * viewer renders it as though the person typed it.
 *
 * Only paired tags are stripped; the content between them goes too, since a
 * notification body is meaningless without its wrapper. Image references are
 * deliberately NOT listed here — those are real user attachments.
 */
const HARNESS_BLOCK_PATTERNS = [
  /<task-notification>[\s\S]*?<\/task-notification>/g,
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,
  /<command-name>[\s\S]*?<\/command-name>/g,
  /<command-message>[\s\S]*?<\/command-message>/g,
  /<command-args>[\s\S]*?<\/command-args>/g,
];

/**
 * Remove harness bookkeeping from a transcript before display.
 *
 * Applies only to user-role messages: an assistant that *discusses* one of
 * these tags is producing real content and must not be edited. A message left
 * empty after stripping is dropped entirely.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
export function stripHarnessNoise(messages) {
  if (!Array.isArray(messages)) return [];

  const cleaned = [];
  for (const message of messages) {
    if (message?.role !== 'user' || typeof message.content !== 'string') {
      cleaned.push(message);
      continue;
    }

    let content = message.content;
    for (const pattern of HARNESS_BLOCK_PATTERNS) {
      content = content.replace(pattern, '');
    }
    content = content.trim();

    // Nothing but bookkeeping — drop the message rather than show a blank bubble.
    if (!content) continue;

    cleaned.push(content === message.content ? message : { ...message, content });
  }

  return cleaned;
}
