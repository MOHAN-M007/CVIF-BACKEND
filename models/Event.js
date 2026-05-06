const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    date: { type: Date, required: true, index: true },

    created_by: {
      user_id: { type: String, required: true },
      username: { type: String, required: true },
    },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

eventSchema.index({ date: 1 });

module.exports = mongoose.model("Event", eventSchema);

