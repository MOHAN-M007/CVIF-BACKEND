const mongoose = require("mongoose");
const { JOBS } = require("../config/constants");

const playerJobSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    jobs: {
      type: [String],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 2,
        message: "jobs must have at most 2 entries",
      },
      default: [],
    },
    levels: { type: Map, of: Number, default: {} },
    xp: { type: Map, of: Number, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

playerJobSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

playerJobSchema.path("jobs").validate((arr) => {
  if (!arr) return true;
  for (const job of arr) {
    if (!JOBS.includes(job)) return false;
  }
  return true;
}, "jobs contains invalid job");

module.exports = mongoose.model("PlayerJob", playerJobSchema);

