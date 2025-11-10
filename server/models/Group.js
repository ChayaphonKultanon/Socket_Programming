const { Schema, model } = require("mongoose");

const GroupSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    members: [{ type: String }], // store usernames
  },
  { timestamps: true }
);

module.exports = model("Group", GroupSchema);
