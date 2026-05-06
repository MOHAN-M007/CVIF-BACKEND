const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    announcement_id: { type: String, required: true, unique: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    created_by: {
      user_id: { type: String, required: true },
      username: { type: String, required: true },
    },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

announcementSchema.index({ created_at: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);

