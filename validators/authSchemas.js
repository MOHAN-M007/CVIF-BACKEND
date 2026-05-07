const { z } = require("zod");

// Basic MC username rules (offline/cracked compatible): letters/numbers/_ only.
const usernameSchema = z
  .string()
  .trim()
  .min(3, "username too short")
  .max(16, "username too long")
  .regex(/^[A-Za-z0-9_]+$/, "invalid username");

const uuidSchema = z
  .string()
  .trim()
  .min(1, "minecraft_uuid is required")
  // accept dashed UUIDs
  .regex(/^[0-9a-fA-F-]{32,36}$/, "invalid minecraft_uuid");

module.exports.minecraftSyncSchema = z.object({
  minecraft_uuid: uuidSchema,
  username: usernameSchema,
  authenticated: z.literal(true),
  // optional: if Fabric sends AuthCore hash info for website compatibility
  password_hash: z.string().trim().min(1).max(500).optional(),
  password_encryption: z.string().trim().min(1).max(50).optional(),
  ip: z.string().trim().min(1).max(100).optional(),
});

module.exports.setWebPasswordSchema = z.object({
  username: usernameSchema,
  newPassword: z.string().min(6, "password too short").max(200),
});
