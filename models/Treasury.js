const mongoose = require("mongoose");

const treasurySchema = new mongoose.Schema(
  {
    treasury_id: { type: String, required: true, unique: true, index: true },
    total_balance: { type: Number, required: true, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

treasurySchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("Treasury", treasurySchema);
