const mongoose = require("mongoose");

const economyAccountSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    balance: { type: Number, required: true, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

economyAccountSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("EconomyAccount", economyAccountSchema);

