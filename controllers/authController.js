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
  return { user_id: user.user_id, username: user.username, role: user.role || "player" };
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

    if (!user.web_password_hash) {
      return unauthorized(res, "website password not set");
    }

    const match = await bcrypt.compare(password, user.web_password_hash);
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

    return res.json({
      success: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role || "player",
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.setWebPassword = async function setWebPassword(req, res, next) {
  try {
    const { username, newPassword } = req.body || {};

    if (!username || typeof username !== "string") {
      return badRequest(res, "username is required");
    }
    if (!newPassword || typeof newPassword !== "string") {
      return badRequest(res, "newPassword is required");
    }
    if (newPassword.length < 6) {
      return badRequest(res, "password too short");
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "user not found" });

    user.web_password_hash = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({ success: true });
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

function sanitizeUsername(username) {
  return String(username || "").trim();
}

function defaultEmailFor(username) {
  const safe = String(username || "user").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
  return `${safe}@cvif.local`;
}

function looksLikeBcrypt(hash) {
  if (!hash || typeof hash !== "string") return false;
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

async function ensureAccounts({ userId, session }) {
  const EconomyAccount = require("../models/EconomyAccount");
  const BankAccount = require("../models/BankAccount");

  await EconomyAccount.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, balance: 0, updated_at: new Date() } },
    { upsert: true, session }
  );

  await BankAccount.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, balance: 0, created_at: new Date(), updated_at: new Date() } },
    { upsert: true, session }
  );
}

async function createSession7d({ user, ip, session }) {
  const token = jwt.sign(
    { user_id: user.user_id, username: user.username, role: user.role || "player" },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await Session.create(
    [
      {
        user_id: user.user_id,
        session_token: token,
        ip,
        created_at: now,
        expires_at: expiresAt,
      },
    ],
    { session }
  );

  return token;
}

module.exports.minecraftSync = async function minecraftSync(req, res, next) {
  try {
    const { minecraft_uuid, username, authenticated, password_hash, ip } = req.body || {};

    if (!minecraft_uuid || typeof minecraft_uuid !== "string") {
      return badRequest(res, "minecraft_uuid is required");
    }
    if (!username || typeof username !== "string") {
      return badRequest(res, "username is required");
    }
    if (authenticated !== true) {
      return badRequest(res, "authenticated must be true");
    }

    const mcUuid = String(minecraft_uuid).trim();
    const cleanUsername = sanitizeUsername(username);
    const ipAddr = normalizeIp(ip || req.ip);

    if (!mcUuid) return badRequest(res, "minecraft_uuid is required");
    if (!cleanUsername) return badRequest(res, "username is required");

    const mongoSession = await User.startSession();
    let resultUser;
    let token;

    const doWork = async (session) => {
      let user = await User.findOne({ minecraft_uuid: mcUuid }).session(session);

      // Username collision protection
      const userWithSameUsername = await User.findOne({ username: cleanUsername }).session(session);
      if (userWithSameUsername && (!user || userWithSameUsername.user_id !== user.user_id)) {
        throw Object.assign(new Error("username already exists"), { statusCode: 400 });
      }

      if (!user) {
        const newId = newUserId();

        const pwdHash = looksLikeBcrypt(password_hash)
          ? password_hash
          : await bcrypt.hash(crypto.randomUUID(), 12);

        user = await User.create(
          [
            {
              user_id: newId,
              minecraft_uuid: mcUuid,
              username: cleanUsername,
              email: defaultEmailFor(cleanUsername),
              password_hash: pwdHash,
              role: "player",
              wallet: 0,
              bank_balance: 0,
              linked: false,
              ips: ipAddr ? [ipAddr] : [],
              created_at: new Date(),
            },
          ],
          { session }
        ).then((arr) => arr[0]);

        await ensureAccounts({ userId: user.user_id, session });
      } else {
        if (user.username !== cleanUsername) {
          user.username = cleanUsername;
        }

        // Always keep minecraft_uuid set
        user.minecraft_uuid = mcUuid;

        if (ipAddr && !user.ips.includes(ipAddr)) {
          user.ips.push(ipAddr);
          // eslint-disable-next-line no-console
          console.log(`[IP] New IP for ${user.username}: ${ipAddr}`);
        }

        await user.save({ session });
        await ensureAccounts({ userId: user.user_id, session });
      }

      await invalidateOldSessions(user.user_id);
      token = await createSession7d({ user, ip: ipAddr || "unknown", session });
      resultUser = user;
    };

    try {
      await mongoSession.withTransaction(async () => doWork(mongoSession));
    } catch (err) {
      // If transactions aren't supported, fall back to non-transactional operations.
      const msg = String(err && err.message ? err.message : "");
      const isTxnUnsupported = msg.includes("Transaction") || msg.includes("replica set") || msg.includes("txn");
      if (!isTxnUnsupported) throw err;
      await doWork(undefined);
    } finally {
      mongoSession.endSession();
    }

    // eslint-disable-next-line no-console
    console.log(
      `[CVIF SYNC] user_id=${resultUser.user_id} minecraft_uuid=${mcUuid} username=${resultUser.username}`
    );
    return res.json({ success: true, token, user_id: resultUser.user_id });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
};
