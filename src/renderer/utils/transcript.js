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
