const ROLE_ORDER = Object.freeze(["player", "officer", "admin", "owner"]);
const ROLE_RANK = Object.freeze(
  ROLE_ORDER.reduce((acc, role, idx) => {
    acc[role] = idx;
    return acc;
  }, {})
);

function normalizeRole(role) {
  return typeof role === "string" ? role : "";
}

function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_RANK, role);
}

function maxAllowedRank(allowedRoles) {
  let max = -1;
  for (const r of allowedRoles) {
    const role = normalizeRole(r);
    if (!isValidRole(role)) continue;
    max = Math.max(max, ROLE_RANK[role]);
  }
  return max;
}

module.exports.requireRole = function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [];
  const threshold = maxAllowedRank(allowed);

  return function roleGuard(req, res, next) {
    const role = req.user ? normalizeRole(req.user.role) : "";

    if (!isValidRole(role) || threshold < 0) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Hierarchy: allow if user's rank is >= highest required rank in allowedRoles
    if (ROLE_RANK[role] < threshold) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return next();
  };
};

module.exports.ROLES = ROLE_ORDER;
module.exports.isValidRole = isValidRole;
module.exports.ROLE_RANK = ROLE_RANK;
