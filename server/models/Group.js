const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    owner: { type: String, required: true },
    members: [{ type: String }],
    private: { type: Boolean, default: false },
    pending: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', GroupSchema);
