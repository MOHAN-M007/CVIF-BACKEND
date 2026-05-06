const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    loan_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },

    amount: { type: Number, required: true, min: 1 },

    // Phase 5.1
    interest_rate: { type: Number, required: true, min: 0 },
    total_due_amount: { type: Number, required: true, min: 1 },
    due_date: { type: Date, required: true },

    collateral_type: { type: String, required: true, enum: ["diamond"] },
    collateral_amount: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      required: true,
      enum: ["active", "overdue", "paid", "defaulted"],
      index: true,
    },

    // Final hardening: prevent duplicate penalty application
    penalty_applied: { type: Boolean, default: false },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    meta: { type: Object, default: {} },
  },
  { versionKey: false }
);

// Max 1 active-ish loan per user
loanSchema.index(
  { user_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["active", "overdue"] },
    },
  }
);

loanSchema.index({ user_id: 1, status: 1 });

loanSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("Loan", loanSchema);
