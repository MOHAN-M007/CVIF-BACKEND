const mongoose = require("mongoose");

const actionLogSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    action: { type: String, required: true },
    last_time: { type: Date, required: true },
  },
  { versionKey: false }
);

actionLogSchema.index({ user_id: 1, action: 1 }, { unique: true });

module.exports = mongoose.model("ActionLog", actionLogSchema);
