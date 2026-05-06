function parseBool(v, def) {
  if (v === undefined || v === null || v === "") return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return def;
}

function cookieSameSite() {
  const raw = process.env.COOKIE_SAMESITE;
  if (!raw) return process.env.NODE_ENV === "production" ? "strict" : "lax";
  const s = String(raw).trim().toLowerCase();
  if (s === "strict") return "strict";
  if (s === "lax") return "lax";
  if (s === "none") return "none";
  return "strict";
}

module.exports = {
  COOKIE_NAME: process.env.COOKIE_NAME || "token",
  COOKIE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  COOKIE_SECURE: parseBool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  COOKIE_SAMESITE: cookieSameSite(),
};

