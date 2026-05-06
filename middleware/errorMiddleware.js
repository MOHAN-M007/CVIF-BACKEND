module.exports.notFound = function notFound(req, res) {
  return res.status(404).json({ success: false, message: "not found" });
};

module.exports.errorHandler = function errorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error(err);

  const status = Number(err.statusCode || err.status || 500);
  const message =
    status >= 500 ? "internal server error" : err.message || "error";

  return res.status(status).json({ success: false, message });
};

