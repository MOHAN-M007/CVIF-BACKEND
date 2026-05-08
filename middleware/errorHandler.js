function getErrorCode(err) {
  if (err?.code) return err.code;
  const status = Number(err?.statusCode || err?.status || 500);
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

function safeMessage(err) {
  const status = Number(err?.statusCode || err?.status || 500);
  const msg = String(err?.message || "error");
  
  // Never expose internal error details
  if (status >= 500) return "internal server error";
  if (status === 404) return "resource not found";
  if (status === 403) return "access denied";
  
  // Safe user-facing messages for known errors
  return msg || "error";
}

module.exports.globalErrorHandler = function globalErrorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error("[ERROR]", err.message || err);
  
  const status = Number(err?.statusCode || err?.status || 500);
  const code = getErrorCode(err);
  const message = safeMessage(err);
  
  return res.status(status).json({
    success: false,
    message,
    code,
  });
};

