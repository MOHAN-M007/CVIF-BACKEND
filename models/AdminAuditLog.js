const mongoose = require("mongoose");

function parseTtlDays(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const adminAuditLogSchema = new mongoose.Schema(
  {
    actor_user_id: { type: String, required: true, index: true },
    actor_username: { type: String, required: true },
    actor_type: { type: String, required: true, enum: ["user", "system"], default: "user" },
    action: { type: String, required: true, index: true },
    target_user_id: { type: String, required: false, index: true },
    target_username: { type: String, required: false },
    previous_role: { type: String, required: false },
    new_role: { type: String, required: false },
    timestamp: { type: Date, default: Date.now, index: true },
    meta: { type: Object, default: {} },
  },
  { versionKey: false }
);

// Indexing for fast recent/admin queries
adminAuditLogSchema.index({ timestamp: -1 });
adminAuditLogSchema.index({ actor_user_id: 1 });
adminAuditLogSchema.index({ target_user_id: 1 });

// Optional TTL retention (default: no TTL). Set AUDIT_LOG_TTL_DAYS=60 for ~60 days.
const ttlDays = parseTtlDays(process.env.AUDIT_LOG_TTL_DAYS);
if (ttlDays) {
  adminAuditLogSchema.index(
    { timestamp: 1 },
    { expireAfterSeconds: ttlDays * 24 * 60 * 60 }
  );
}

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);
