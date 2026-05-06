const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    session_token: { type: String, required: true, unique: true, index: true },
    ip: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true, index: true },
  },
  { versionKey: false }
);

sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);

