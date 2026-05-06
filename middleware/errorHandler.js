function safeMessage(err) {
  const status = Number(err?.statusCode || err?.status || 500);
  const msg = String(err?.message || "error");
  if (status >= 500) return "internal server error";
  return msg || "error";
}

module.exports.globalErrorHandler = function globalErrorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = Number(err?.statusCode || err?.status || 500);
  return res.status(status).json({ success: false, message: safeMessage(err) });
};

