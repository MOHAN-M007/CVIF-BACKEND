function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

module.exports.validateBody = function validateBody(schema) {
  return function validate(req, res, next) {
    try {
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        const first = parsed.error.issues && parsed.error.issues[0] ? parsed.error.issues[0] : null;
        return badRequest(res, first ? first.message : "invalid request");
      }
      req.body = parsed.data;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

