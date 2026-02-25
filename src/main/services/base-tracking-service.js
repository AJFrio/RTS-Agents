const { upsertItem } = require('../utils/collection-utils');

class BaseTrackingService {
  constructor() {
    this.trackedItems = [];
  }

  /**
   * Track an item (conversation or thread)
   * @param {object} item - The item to track
   * @param {object} options - Tracking options
   * @param {number} options.limit - Max number of items to keep (default: 100)
   */
  trackItem(item, options = {}) {
    const { limit = 100 } = options;
    this.trackedItems = upsertItem(this.trackedItems, item, { limit });
  }

  /**
   * Get all tracked items
   * @returns {Array}
   */
  getTrackedItems() {
    return this.trackedItems;
  }

  /**
   * Set tracked items (e.g. from config)
   * @param {Array} items
   */
  setTrackedItems(items) {
    this.trackedItems = items || [];
  }
}

module.exports = BaseTrackingService;
