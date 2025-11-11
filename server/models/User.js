const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
    // map of room id -> Date when the user last read that room
    lastRead: { type: Map, of: Date, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
