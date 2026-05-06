const mongoose = require("mongoose");

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    endpoint: { type: String, required: true },
    created_at: { type: Date, default: Date.now, index: true },
    // store last response for safe retries
    response_status: { type: Number, default: null },
    response_body: { type: Object, default: null },
  },
  { versionKey: false }
);

idempotencyKeySchema.index({ key: 1, user_id: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model("IdempotencyKey", idempotencyKeySchema);