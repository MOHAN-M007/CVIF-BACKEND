const crypto = require("crypto");

const IdempotencyKey = require("../models/IdempotencyKey");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function tooMany(res, message) {
  return res.status(429).json({ success: false, message });
}

function normalizeKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // keep it bounded
  if (s.length > 128) return null;
  // allow typical uuid/base64-ish keys
  if (!/^[A-Za-z0-9._:-]+$/.test(s)) return null;
  return s;
}

module.exports.requireIdempotencyKey = function requireIdempotencyKey() {
  return async function idempotency(req, res, next) {
    try {
      if (!req.user || !req.user.user_id) return next();

      const raw = req.headers["idempotency-key"];
      const key = normalizeKey(raw);
      if (!key) return badRequest(res, "Idempotency-Key required");

      const endpoint = `${req.method} ${req.originalUrl.split("?")[0]}`;

      // If already exists and has response stored -> replay
      const existing = await IdempotencyKey.findOne({ key, user_id: req.user.user_id, endpoint }).lean();
      if (existing) {
        if (existing.response_status && existing.response_body) {
          return res.status(existing.response_status).json(existing.response_body);
        }
        // In-flight or previous run without stored response
        return tooMany(res, "duplicate request");
      }

      // Reserve key (create doc). If race, unique index will throw.
      try {
        await IdempotencyKey.create({
          key,
          user_id: req.user.user_id,
          endpoint,
          created_at: new Date(),
        });
      } catch (e) {
        if (e && e.code === 11000) {
          return tooMany(res, "duplicate request");
        }
        throw e;
      }

      // Patch res.json to capture response
      const oldJson = res.json.bind(res);
      res.json = (body) => {
        res.locals.__idemBody = body;
        return oldJson(body);
      };

      res.on("finish", async () => {
        try {
          const status = res.statusCode;
          const body = res.locals.__idemBody;
          if (body !== undefined) {
            await IdempotencyKey.updateOne(
              { key, user_id: req.user.user_id, endpoint },
              { $set: { response_status: status, response_body: body } }
            );
          }
        } catch (_e) {
          // best-effort
        }
      });

      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports.makeIdempotencyKey = function makeIdempotencyKey() {
  return crypto.randomUUID();
};