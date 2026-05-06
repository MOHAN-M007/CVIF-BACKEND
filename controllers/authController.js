const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const Session = require("../models/Session");
const { COOKIE_NAME, COOKIE_MAX_AGE_MS, COOKIE_SECURE, COOKIE_SAMESITE } = require("../config/cookies");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function unauthorized(res, message) {
  return res.status(401).json({ success: false, message });
}

function tooMany(res, message) {
  return res.status(429).json({ success: false, message });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIp(ip) {
  if (!ip) return "";
  return String(ip).trim();
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET in environment");
  return secret;
}

function newUserId() {
  return crypto.randomUUID();
}

function buildTokenPayload(user) {
  return { user_id: user.user_id, username: user.username };
}

async function invalidateOldSessions(userId) {
  await Session.deleteMany({ user_id: userId });
}

async function createSession({ user, ip }) {
  const token = jwt.sign(buildTokenPayload(user), getJwtSecret(), {
    expiresIn: "24h",
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await Session.create({
    user_id: user.user_id,
    session_token: token,
    ip,
    created_at: now,
    expires_at: expiresAt,
  });

  return token;
}

async function applyFailureDelay(failedAttemptsAfterIncrement) {
  if (failedAttemptsAfterIncrement === 2) return sleep(2000);
  if (failedAttemptsAfterIncrement === 3) return sleep(5000);
  return null;
}

module.exports.register = async function register(req, res, next) {
  try {
    const { username, email, password } = req.body || {};

    if (!username || typeof username !== "string") {
      return badRequest(res, "username is required");
    }
    if (!email || typeof email !== "string") {
      return badRequest(res, "email is required");
    }
    if (!password || typeof password !== "string") {
      return badRequest(res, "password is required");
    }
    if (password.length < 6) {
      return badRequest(res, "password must be at least 6 characters");
    }

    const existing = await User.findOne({ username }).lean();
    if (existing) return badRequest(res, "username already exists");

    const password_hash = await bcrypt.hash(password, 12);

    const user = await User.create({
      user_id: newUserId(),
      username,
      email,
      password_hash,
      ips: [],
      created_at: new Date(),
    });

    return res.status(201).json({ success: true, user_id: user.user_id });
  } catch (err) {
    return next(err);
  }
};

module.exports.login = async function login(req, res, next) {
  try {
    const { username, password, ip } = req.body || {};
    const ipAddr = normalizeIp(ip || req.ip);

    if (!username || typeof username !== "string") {
      return badRequest(res, "username is required");
    }
    if (!password || typeof password !== "string") {
      return badRequest(res, "password is required");
    }
    if (!ipAddr) {
      return badRequest(res, "ip address is required");
    }

    const user = await User.findOne({ username });
    if (!user) return unauthorized(res, "invalid username or password");

    if (user.lock_until && user.lock_until.getTime() > Date.now()) {
      return tooMany(res, "account locked. try again later");
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      user.failed_attempts = (user.failed_attempts || 0) + 1;

      await applyFailureDelay(user.failed_attempts);

      if (user.failed_attempts >= 5) {
        user.lock_until = new Date(Date.now() + 10 * 60 * 1000);
        user.failed_attempts = 0;
      }

      await user.save();
      return unauthorized(res, "invalid username or password");
    }

    // success: reset lock state
    user.failed_attempts = 0;
    user.lock_until = null;

    const isNewIp = !user.ips.includes(ipAddr);
    if (isNewIp) {
      user.ips.push(ipAddr);
      // log-only flag per spec
      // eslint-disable-next-line no-console
      console.log(`[IP] New IP for ${user.username}: ${ipAddr}`);
    }
    await user.save();

    await invalidateOldSessions(user.user_id);
    const token = await createSession({ user, ip: ipAddr });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });

    return res.json({ success: true, token, user_id: user.user_id });
  } catch (err) {
    return next(err);
  }
};

module.exports.me = async function me(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    return res.json({
      success: true,
      user: {
        user_id: req.user.user_id,
        username: req.user.username,
        role: req.user.role || "player",
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.logout = async function logout(req, res, next) {
  try {
    // best-effort cookie clear
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};
