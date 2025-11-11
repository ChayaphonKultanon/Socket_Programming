/**
 * Database configuration and connection helper
 * Loads MONGO_URI from project root .env (already loaded by server.js)
 */
const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  connect: async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.warn('MONGO_URI not set; running without persistence');
      return;
    }
    try {
      await mongoose.connect(uri, { dbName: 'socket_chat' });
      console.log('MongoDB connected');
    } catch (e) {
      console.error('MongoDB connection error:', e.message);
    }
  },
};
