const { z } = require("zod");

module.exports.createAnnouncementSchema = z.object({
  message: z.string().trim().min(1, "message required").max(2000, "message too long"),
});

