const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },

    // AuthCore bridge
    minecraft_uuid: { type: String, unique: true, sparse: true, index: true },

    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    password_hash: { type: String, required: true },

    // Denormalized balances for dashboard convenience (authoritative balances live in EconomyAccount/BankAccount)
    wallet: { type: Number, default: 0 },
    bank_balance: { type: Number, default: 0 },

    role: {
      type: String,
      required: true,
      enum: ["player", "officer", "admin", "owner"],
      default: "player",
    },

    linked: { type: Boolean, default: false },

    ips: { type: [String], default: [] },
    failed_attempts: { type: Number, default: 0 },
    lock_until: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// DB-level single-owner guarantee.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "owner" } }
);

module.exports = mongoose.model("User", userSchema);