const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    announcement_id: { type: String, required: true, unique: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    pinned: { type: Boolean, default: false, index: true },
    priority: { type: Number, default: 0, index: true },
    expires_at: { type: Date, default: null, index: true },
    created_by: {
      user_id: { type: String, required: true },
      username: { type: String, required: true },
    },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

announcementSchema.index({ created_at: -1 });
announcementSchema.index({ pinned: -1, priority: -1, created_at: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
