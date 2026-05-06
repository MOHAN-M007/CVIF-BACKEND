const { z } = require("zod");

module.exports.amountSchema = z.number().int().positive().max(1_000_000_000);

module.exports.shopNameSchema = z
  .string()
  .trim()
  .min(1, "name required")
  .max(20, "name too long")
  .regex(/^[A-Za-z0-9 ]+$/, "invalid name");

