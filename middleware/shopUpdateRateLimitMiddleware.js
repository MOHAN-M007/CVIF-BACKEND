const WINDOW_MS = 60 * 1000;
const MAX_REQ = 10;

const byUser = new Map();

function nowMs() {
  return Date.now();
}

function keyFromReq(req) {
  const user = req.user;
  return user && user.user_id ? String(user.user_id) : null;
}

module.exports.shopUpdateLimiter = function shopUpdateLimiter(req, res, next) {
  const key = keyFromReq(req);
  if (!key) return res.status(401).json({ success: false, message: "Unauthorized" });

  const n = nowMs();
  const cur = byUser.get(key);
  if (!cur || n - cur.startMs >= WINDOW_MS) {
    byUser.set(key, { startMs: n, count: 1 });
    return next();
  }

  cur.count += 1;
  if (cur.count > MAX_REQ) {
    return res.status(429).json({ success: false, message: "Too many shop updates" });
  }

  return next();
};