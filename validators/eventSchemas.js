const { z } = require("zod");

module.exports.createEventSchema = z.object({
  title: z.string().trim().min(1, "title required").max(80, "title too long"),
  description: z.string().trim().max(2000, "description too long").optional().default(""),
  date: z.string().datetime({ message: "invalid date" }),
});

