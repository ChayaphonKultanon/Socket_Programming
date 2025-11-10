const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  type: { type: String, enum: ['dm', 'group'], required: true },
  room: { type: String, required: true, index: true },
  from: { type: String, required: true },
  to: { type: String }, // for dm: target username (optional convenience)
  groupName: { type: String }, // for group messages
  text: { type: String, required: true },
  timestamp: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
