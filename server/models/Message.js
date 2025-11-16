const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    // include 'world' so world chat messages can be persisted when desired
    type: { type: String, enum: ['dm', 'group', 'world'], required: true },
    room: { type: String, required: true, index: true },
    from: { type: String, required: true },
    to: { type: String }, // for dm: target username (optional convenience)
    groupName: { type: String }, // for group messages
    text: { type: String, required: true },
    timestamp: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', MessageSchema);
