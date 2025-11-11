/**
 * messageService
 * Wraps message persistence (if MongoDB is enabled). Keeps API small for saving messages.
 */
const mongoose = require('mongoose');
let MessageModel = null;
try {
  MessageModel = require('../models/Message');
} catch (e) {
  /* model may not exist */
}

module.exports = {
  save: async (message) => {
    try {
      if (mongoose.connection.readyState !== 1 || !MessageModel) return null;
      return await MessageModel.create(message);
    } catch (e) {
      // swallow DB errors to avoid blocking socket handlers
      console.error('Failed to save message:', e.message);
    }
    return null;
  },
};
