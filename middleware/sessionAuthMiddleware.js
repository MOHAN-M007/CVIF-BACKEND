const Session = require("../models/Session");
const User = require("../models/User");
const { COOKIE_NAME } = require("../config/cookies");

function unauthorized(res, message, code = "UNAUTHORIZED") {
  return res.status(401).json({ success: false, message, code });
}

function forbidden(res, message, code = "FORBIDDEN") {
  return res.status(403).json({ success: false, message, code });
}

module.exports.requireSession = async function requireSession(req, res, next) {
  try {
    const cookieToken = req.cookies ? String(req.cookies[COOKIE_NAME] || "") : "";
    const authHeader = String(req.headers.authorization || "");
    const headerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    // Backward compatible: cookie preferred, but allow header (Fabric)
    const token = cookieToken || headerToken;

    if (!token) return unauthorized(res, "authentication required");

    const session = await Session.findOne({ session_token: token }).lean();
    if (!session) return unauthorized(res, "invalid or expired session", "SESSION_INVALID");

    // Check expiry with clearer error code
    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      return unauthorized(res, "session expired", "SESSION_EXPIRED");
    }

    const user = await User.findOne({ user_id: session.user_id }).lean();
    if (!user) return unauthorized(res, "user not found", "USER_NOT_FOUND");

    req.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role || "player",
      token,
    };

    return next();
  } catch (err) {
    return next(err);
  }
};
