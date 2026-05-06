const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

// IP limiter
module.exports.ipBurstLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: (_req, res) =>
    res.status(429).json({ success: false, message: "too many requests" }),
});

// User limiter
module.exports.userBurstLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.user && req.user.user_id;
    return uid ? `user:${uid}` : `ip:${ipKeyGenerator(req)}`;
  },
  handler: (_req, res) =>
    res.status(429).json({ success: false, message: "too many requests" }),
});