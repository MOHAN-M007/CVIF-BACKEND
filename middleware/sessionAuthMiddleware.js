const Session = require("../models/Session");
const User = require("../models/User");
const { COOKIE_NAME } = require("../config/cookies");

function unauthorized(res, message) {
  return res.status(401).json({ success: false, message });
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

    if (!token) return unauthorized(res, "Unauthorized");

    const session = await Session.findOne({ session_token: token }).lean();
    if (!session) return unauthorized(res, "Unauthorized");
    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      return unauthorized(res, "session expired");
    }

    const user = await User.findOne({ user_id: session.user_id }).lean();
    if (!user) return unauthorized(res, "Unauthorized");

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
