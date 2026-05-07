const crypto = require("crypto");
const bcrypt = require("bcrypt");

const User = require("../models/User");
const Session = require("../models/Session");
const EconomyAccount = require("../models/EconomyAccount");
const BankAccount = require("../models/BankAccount");
const Transaction = require("../models/Transaction");
const BankTransaction = require("../models/BankTransaction");
const ShopTransaction = require("../models/ShopTransaction");
const AdminAuditLog = require("../models/AdminAuditLog");
const Announcement = require("../models/Announcement");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function notFound(res, message) {
  return res.status(404).json({ success: false, message });
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function parsePage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function maskUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    username: user.username,
    role: user.role || "player",
    minecraft_uuid: user.minecraft_uuid || null,
    email: user.email,
    ips: user.ips || [],
    failed_attempts: user.failed_attempts || 0,
    lock_until: user.lock_until || null,
    created_at: user.created_at,
    linked: Boolean(user.linked),
    wallet: Number(user.wallet || 0),
    bank_balance: Number(user.bank_balance || 0),
    web_password_set: Boolean(user.web_password_hash),
  };
}

async function audit({ actor, action, target, previous_role, new_role, meta }) {
  try {
    await AdminAuditLog.create({
      actor_user_id: actor.user_id,
      actor_username: actor.username,
      actor_type: "user",
      action,
      target_user_id: target ? target.user_id : null,
      target_username: target ? target.username : null,
      previous_role: previous_role || null,
      new_role: new_role || null,
      timestamp: new Date(),
      meta: meta || {},
    });
  } catch (_e) {
    // best effort
  }
}

module.exports.getStats = async function getStats(req, res, next) {
  try {
    const now = Date.now();
    const [totalUsers, totalShops, totalEconomyTx, totalBankTx, totalShopTx] = await Promise.all([
      User.countDocuments({}),
      // Shop model may have both shop_id and owner_user_id, but count works regardless
      require("../models/Shop").countDocuments({}),
      Transaction.countDocuments({}),
      BankTransaction.countDocuments({}),
      ShopTransaction.countDocuments({}),
    ]);

    const [walletAgg, bankAgg] = await Promise.all([
      EconomyAccount.aggregate([{ $group: { _id: null, sum: { $sum: "$balance" } } }]),
      BankAccount.aggregate([{ $group: { _id: null, sum: { $sum: "$balance" } } }]),
    ]);

    // Online players approximation: active sessions not expired
    const onlinePlayers = await Session.countDocuments({ expires_at: { $gt: new Date() } });
    const recentLogins = await Session.find({}).sort({ created_at: -1 }).limit(20).lean();
    const recentAnnouncements = await Announcement.find({}).sort({ created_at: -1 }).limit(10).lean();

    return res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        online_players: onlinePlayers,
        total_wallet_balance: walletAgg && walletAgg[0] ? Number(walletAgg[0].sum || 0) : 0,
        total_bank_balance: bankAgg && bankAgg[0] ? Number(bankAgg[0].sum || 0) : 0,
        total_shops: totalShops,
        total_transactions: totalEconomyTx + totalBankTx + totalShopTx,
        totals: {
          economy: totalEconomyTx,
          bank: totalBankTx,
          shop: totalShopTx,
        },
      },
      recent_logins: recentLogins.map((s) => ({
        user_id: s.user_id,
        ip: s.ip,
        created_at: s.created_at,
        expires_at: s.expires_at,
      })),
      recent_announcements: recentAnnouncements,
      suspicious_summary: { generated_at: new Date(now).toISOString(), items: [] },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.listUsers = async function listUsers(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (q) {
      filter.$or = [
        { username: { $regex: q, $options: "i" } },
        { user_id: q },
        { minecraft_uuid: q },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: users.map(maskUser),
      pagination: { page, limit, total },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.getUser = async function getUser(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return badRequest(res, "invalid user id");

    const user = await User.findOne({ user_id: id }).lean();
    if (!user) return notFound(res, "user not found");

    const [wallet, bank, sessions, audits] = await Promise.all([
      EconomyAccount.findOne({ user_id: user.user_id }).lean(),
      BankAccount.findOne({ user_id: user.user_id }).lean(),
      Session.find({ user_id: user.user_id }).sort({ created_at: -1 }).limit(20).lean(),
      AdminAuditLog.find({ target_user_id: user.user_id }).sort({ timestamp: -1 }).limit(50).lean(),
    ]);

    return res.json({
      success: true,
      user: {
        ...maskUser(user),
        wallet_balance: wallet ? Number(wallet.balance || 0) : 0,
        bank_balance_actual: bank ? Number(bank.balance || 0) : 0,
      },
      sessions: sessions.map((s) => ({
        ip: s.ip,
        created_at: s.created_at,
        expires_at: s.expires_at,
      })),
      audit: audits,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.patchUser = async function patchUser(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return badRequest(res, "invalid user id");

    const actor = req.user;
    const user = await User.findOne({ user_id: id });
    if (!user) return notFound(res, "user not found");

    // Owner safety rules
    if (user.role === "owner") {
      // prevent self-demotion and modifying other owners
      if (String(user.user_id) !== String(actor.user_id)) {
        return res.status(403).json({ success: false, message: "cannot modify another owner" });
      }
    }

    const patch = req.body || {};

    // role change
    if (patch.role !== undefined) {
      const allowed = ["player", "officer", "admin", "owner"];
      if (!allowed.includes(patch.role)) return badRequest(res, "invalid role");

      if (user.role === "owner" && patch.role !== "owner") {
        return res.status(403).json({ success: false, message: "cannot demote owner" });
      }

      const prev = user.role || "player";
      user.role = patch.role;
      await user.save();
      await audit({ actor, action: "role_change", target: user, previous_role: prev, new_role: user.role });
    }

    // lock/unlock
    if (patch.locked !== undefined) {
      const locked = Boolean(patch.locked);
      user.lock_until = locked ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) : null;
      user.failed_attempts = 0;
      await user.save();
      await audit({ actor, action: locked ? "lock_user" : "unlock_user", target: user });
    }

    // reset website password
    if (patch.reset_web_password === true) {
      user.web_password_hash = null;
      await user.save();
      await audit({ actor, action: "reset_web_password", target: user });
    }

    // wallet/bank edits (authoritative in accounts)
    const walletAmount = patch.wallet_balance;
    const bankAmount = patch.bank_balance;
    if (walletAmount !== undefined) {
      const n = Number(walletAmount);
      if (!Number.isFinite(n) || n < 0) return badRequest(res, "invalid wallet_balance");
      await EconomyAccount.updateOne(
        { user_id: user.user_id },
        { $set: { balance: Math.floor(n), updated_at: new Date() } },
        { upsert: true }
      );
      user.wallet = Math.floor(n);
      await user.save();
      await audit({ actor, action: "edit_wallet", target: user, meta: { wallet_balance: Math.floor(n) } });
    }
    if (bankAmount !== undefined) {
      const n = Number(bankAmount);
      if (!Number.isFinite(n) || n < 0) return badRequest(res, "invalid bank_balance");
      await BankAccount.updateOne(
        { user_id: user.user_id },
        { $set: { balance: Math.floor(n), updated_at: new Date() } },
        { upsert: true }
      );
      user.bank_balance = Math.floor(n);
      await user.save();
      await audit({ actor, action: "edit_bank", target: user, meta: { bank_balance: Math.floor(n) } });
    }

    return res.json({ success: true, user: maskUser(await User.findOne({ user_id: id }).lean()) });
  } catch (err) {
    return next(err);
  }
};

module.exports.deleteUser = async function deleteUser(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return badRequest(res, "invalid user id");
    const actor = req.user;

    const user = await User.findOne({ user_id: id });
    if (!user) return notFound(res, "user not found");
    if (user.role === "owner") return res.status(403).json({ success: false, message: "cannot delete owner" });

    await Promise.all([
      User.deleteOne({ user_id: id }),
      Session.deleteMany({ user_id: id }),
      EconomyAccount.deleteOne({ user_id: id }),
      BankAccount.deleteOne({ user_id: id }),
    ]);

    await audit({ actor, action: "delete_user", target: { user_id: id, username: user.username } });

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

module.exports.listAuditLogs = async function listAuditLogs(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const userId = String(req.query.user_id || "").trim();

    const filter = {};
    if (userId) filter.$or = [{ actor_user_id: userId }, { target_user_id: userId }];

    const [total, data] = await Promise.all([
      AdminAuditLog.countDocuments(filter),
      AdminAuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, data, pagination: { page, limit, total } });
  } catch (err) {
    return next(err);
  }
};

module.exports.listTransactions = async function listTransactions(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const type = String(req.query.type || "all").trim();

    const skip = (page - 1) * limit;

    if (type === "economy") {
      const [total, data] = await Promise.all([
        Transaction.countDocuments({}),
        Transaction.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ]);
      return res.json({ success: true, data, pagination: { page, limit, total } });
    }
    if (type === "bank") {
      const [total, data] = await Promise.all([
        BankTransaction.countDocuments({}),
        BankTransaction.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ]);
      return res.json({ success: true, data, pagination: { page, limit, total } });
    }
    if (type === "shop") {
      const [total, data] = await Promise.all([
        ShopTransaction.countDocuments({}),
        ShopTransaction.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ]);
      return res.json({ success: true, data, pagination: { page, limit, total } });
    }

    // best-effort merged list (no strict paging)
    const [economy, bank, shop] = await Promise.all([
      Transaction.find({}).sort({ timestamp: -1 }).limit(50).lean(),
      BankTransaction.find({}).sort({ timestamp: -1 }).limit(50).lean(),
      ShopTransaction.find({}).sort({ timestamp: -1 }).limit(50).lean(),
    ]);

    const merged = []
      .concat(economy.map((t) => ({ ...t, _kind: "economy" })))
      .concat(bank.map((t) => ({ ...t, _kind: "bank" })))
      .concat(shop.map((t) => ({ ...t, _kind: "shop" })))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const sliced = merged.slice(skip, skip + limit);
    return res.json({ success: true, data: sliced, pagination: { page, limit, total: merged.length } });
  } catch (err) {
    return next(err);
  }
};

module.exports.listLivePlayers = async function listLivePlayers(req, res, next) {
  try {
    const limit = clampLimit(req.query.limit);
    const sessions = await Session.find({ expires_at: { $gt: new Date() } })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const userIds = [...new Set(sessions.map((s) => s.user_id))];
    const users = await User.find({ user_id: { $in: userIds } }).lean();
    const byId = new Map(users.map((u) => [u.user_id, u]));

    return res.json({
      success: true,
      data: sessions.map((s) => {
        const u = byId.get(s.user_id);
        return {
          user_id: s.user_id,
          username: u ? u.username : null,
          role: u ? u.role : null,
          ip: s.ip,
          created_at: s.created_at,
          expires_at: s.expires_at,
        };
      }),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.listAnnouncements = async function ownerListAnnouncements(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);
    const includeExpired = String(req.query.include_expired || "false") === "true";

    const filter = {};
    if (!includeExpired) {
      const now = new Date();
      filter.$or = [{ expires_at: null }, { expires_at: { $gt: now } }];
    }

    const [total, data] = await Promise.all([
      Announcement.countDocuments(filter),
      Announcement.find(filter)
        .sort({ pinned: -1, priority: -1, created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, data, pagination: { page, limit, total } });
  } catch (err) {
    return next(err);
  }
};

module.exports.createAnnouncement = async function ownerCreateAnnouncement(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return badRequest(res, "message required");

    const priority = Number(req.body?.priority || 0);
    const pinned = Boolean(req.body?.pinned || false);
    const expires_at = req.body?.expires_at ? new Date(req.body.expires_at) : null;

    const ann = await Announcement.create({
      announcement_id: crypto.randomUUID(),
      message,
      created_by: { user_id: req.user.user_id, username: req.user.username },
      created_at: new Date(),
      updated_at: new Date(),
      pinned,
      priority: Number.isFinite(priority) ? Math.floor(priority) : 0,
      expires_at: expires_at && !Number.isNaN(expires_at.getTime()) ? expires_at : null,
    });

    await audit({ actor: req.user, action: "announcement_create", target: null, meta: { announcement_id: ann.announcement_id } });

    return res.json({ success: true, announcement: ann });
  } catch (err) {
    return next(err);
  }
};

module.exports.updateAnnouncement = async function ownerUpdateAnnouncement(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    const ann = await Announcement.findOne({ announcement_id: id });
    if (!ann) return notFound(res, "announcement not found");

    const patch = req.body || {};
    if (patch.message !== undefined) {
      const m = String(patch.message || "").trim();
      if (!m) return badRequest(res, "message required");
      ann.message = m;
    }
    if (patch.priority !== undefined) {
      const p = Number(patch.priority);
      if (!Number.isFinite(p)) return badRequest(res, "invalid priority");
      ann.priority = Math.floor(p);
    }
    if (patch.pinned !== undefined) {
      ann.pinned = Boolean(patch.pinned);
    }
    if (patch.expires_at !== undefined) {
      if (patch.expires_at === null || patch.expires_at === "") {
        ann.expires_at = null;
      } else {
        const d = new Date(patch.expires_at);
        if (Number.isNaN(d.getTime())) return badRequest(res, "invalid expires_at");
        ann.expires_at = d;
      }
    }
    ann.updated_at = new Date();
    await ann.save();

    await audit({ actor: req.user, action: "announcement_update", target: null, meta: { announcement_id: id } });
    return res.json({ success: true, announcement: ann });
  } catch (err) {
    return next(err);
  }
};

module.exports.deleteAnnouncement = async function ownerDeleteAnnouncement(req, res, next) {
  try {
    const id = String(req.params.id || "").trim();
    const ann = await Announcement.findOne({ announcement_id: id }).lean();
    if (!ann) return notFound(res, "announcement not found");
    await Announcement.deleteOne({ announcement_id: id });
    await audit({ actor: req.user, action: "announcement_delete", target: null, meta: { announcement_id: id } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};
