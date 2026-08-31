/**
 * Build one unified chronological activity feed from agent details.
 *
 * Merges `activities`, `messages`, and `conversation` into a single
 * normalized array sorted by timestamp ascending. Items without timestamps
 * sort after all timestamped ones in stable source order. Duplicate ids are
 * deduped (first occurrence wins). Pure ESM, no DOM/electron imports so it
 * stays unit-testable under Node (precedent: agent-details-cache.js).
 */

/**
 * Normalize a timestamp to epoch milliseconds.
 *
 * @param {unknown} value ISO string, epoch ms number, or anything else.
 * @returns {number|null} Epoch ms, or null when absent/unparseable.
 */
function toMillis(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Collect one source array into normalized feed items.
 *
 * @param {Array|null|undefined} list Raw source items.
 * @param {string} kind Feed item kind ('activity' | 'message' | 'conversation').
 * @param {(raw: object) => object} mapItem Maps a raw item to feed fields.
 * @returns {Array<object>} Normalized items (unsorted).
 */
function collect(list, kind, mapItem) {
  if (!Array.isArray(list)) return [];
  const items = [];
  list.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const mapped = mapItem(raw);
    items.push({
      id: raw.id != null ? String(raw.id) : `${kind}-${index}`,
      kind,
      isUser: false,
      text: null,
      timestamp: null,
      ...mapped,
      raw,
    });
  });
  return items;
}

/**
 * Merge provider details into one chronological feed.
 *
 * @param {object|null} [details] Agent details payload.
 * @param {Array} [details.activities] Provider activity rows (title/description).
 * @param {Array} [details.messages] Chat transcript messages (role/content/createdAt).
 * @param {Array} [details.conversation] Legacy conversation turns (isUser/text).
 * @returns {Array<object>} Feed items sorted timestamp-ascending; untimed
 *   items last in stable source order (activities -> messages -> conversation).
 */
export function buildUnifiedFeed(details = {}) {
  const source = details ?? {};

  const items = [
    ...collect(source.activities, 'activity', (raw) => ({
      title: raw.title ?? null,
      text: raw.description ?? null,
      timestamp: toMillis(raw.timestamp),
    })),
    ...collect(source.messages, 'message', (raw) => ({
      isUser: raw.role === 'user',
      text: raw.content ?? null,
      timestamp: toMillis(raw.createdAt),
    })),
    ...collect(source.conversation, 'conversation', (raw) => ({
      isUser: !!raw.isUser,
      text: raw.text ?? null,
      timestamp: toMillis(raw.timestamp ?? raw.createdAt),
    })),
  ];

  // Dedupe identical ids: first occurrence wins.
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  // Timestamped items by time ascending (stable for ties), then untimed
  // items in stable source order.
  const timed = deduped.filter((item) => item.timestamp != null);
  const untimed = deduped.filter((item) => item.timestamp == null);
  timed.sort((a, b) => a.timestamp - b.timestamp);
  return [...timed, ...untimed];
}
