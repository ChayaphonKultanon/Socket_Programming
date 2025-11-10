const { Schema, model } = require("mongoose");

const MessageSchema = new Schema(
  {
    room: { type: String, required: true },
    type: { type: String, enum: ["dm", "group"], required: true },
    from: { type: String, required: true },
    text: { type: String, required: true },
    groupName: { type: String },
    timestamp: { type: Number, default: () => Date.now() },
  },
  { timestamps: true }
);

module.exports = model("Message", MessageSchema);
