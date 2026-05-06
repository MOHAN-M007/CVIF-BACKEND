const mongoose = require("mongoose");

const bankTransactionSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["deposit", "withdraw", "loan_credit", "loan_repay"],
    },
    amount: { type: Number, required: true },
    balance_after: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    meta: { type: Object, default: {} },
  },
  { versionKey: false }
);

bankTransactionSchema.index({ user_id: 1, timestamp: -1 });

module.exports = mongoose.model("BankTransaction", bankTransactionSchema);