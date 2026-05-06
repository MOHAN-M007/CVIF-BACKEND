const { z } = require("zod");
const { amountSchema } = require("./common");

module.exports.depositSchema = z.object({
  amount: amountSchema,
});

module.exports.withdrawSchema = z.object({
  amount: amountSchema,
});

module.exports.loanRequestSchema = z.object({
  amount: amountSchema,
  collateral_amount: z.number().int().positive().max(1_000_000),
});

