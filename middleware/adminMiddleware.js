module.exports.requireAdmin = function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "authentication required",
      code: "UNAUTHORIZED",
    });
  }

  // Only owner has access to admin routes
  if (req.user.role !== "owner" && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "admin access required",
      code: "FORBIDDEN",
    });
  }

  return next();
};
