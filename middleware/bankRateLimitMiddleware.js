const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const createLimiter = (limitValue) =>
  rateLimit({
    windowMs: 10 * 1000,
    limit: limitValue,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req),
    handler: (_req, res) =>
      res.status(429).json({ success: false, message: "too many requests" }),
  });

module.exports.bankLimiter = createLimiter(20);
module.exports.loanLimiter = createLimiter(10);