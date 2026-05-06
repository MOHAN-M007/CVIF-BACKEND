const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ["earn"] },
    amount: { type: Number, required: true },
    source: { type: String, required: true },
    job_type: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Transaction", transactionSchema);

