function forbidden(res, message) {
  return res.status(403).json({ success: false, message });
}

module.exports.requireOwner = function requireOwner(req, res, next) {
  const user = req.user;
  if (!user) return forbidden(res, "Unauthorized");
  if (user.role !== "owner") return forbidden(res, "Access denied");
  return next();
};

