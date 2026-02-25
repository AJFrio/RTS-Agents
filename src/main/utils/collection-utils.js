/**
 * Collection utilities for managing arrays of items with limits and upsert logic
 */

/**
 * Upsert an item into an array and maintain a maximum size.
 * If the item exists (matched by idKey), it's updated.
 * If it doesn't exist, it's added to the beginning of the array.
 *
 * @param {Array} array - The array to modify
 * @param {Object} item - The item to add or update
 * @param {Object} options - Options for upserting
 * @param {string} options.idKey - The key to use for matching existing items (default: 'id')
 * @param {number} options.limit - The maximum number of items to keep (default: 100)
 * @returns {Array} The new array
 */
function upsertItem(array, item, options = {}) {
  const { idKey = 'id', limit = 100 } = options;
  const newArray = [...(array || [])];

  const existingIndex = newArray.findIndex(i => i[idKey] === item[idKey]);

  if (existingIndex >= 0) {
    newArray[existingIndex] = { ...newArray[existingIndex], ...item };
  } else {
    newArray.unshift(item);
  }

  if (limit > 0 && newArray.length > limit) {
    return newArray.slice(0, limit);
  }

  return newArray;
}

module.exports = {
  upsertItem
};
