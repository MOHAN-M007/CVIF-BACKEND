const rateLimit = require("express-rate-limit");

module.exports.authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res
      .status(429)
      .json({ success: false, message: "too many requests" }),
});

function jsonHandler(message) {
  return (_req, res) => res.status(429).json({ success: false, message });
}

module.exports.loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("too many login attempts"),
});

module.exports.registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("too many registrations"),
});

module.exports.adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("too many admin requests"),
});
