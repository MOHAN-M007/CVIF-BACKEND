const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    balance: { type: Number, required: true, default: 0, min: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

bankAccountSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("BankAccount", bankAccountSchema);