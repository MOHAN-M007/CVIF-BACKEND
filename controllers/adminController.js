const Transaction = require("../models/Transaction");
const ActionLog = require("../models/ActionLog");
const User = require("../models/User");
const AdminAuditLog = require("../models/AdminAuditLog");
const Shop = require("../models/Shop");
const Plot = require("../models/Plot");
const ShopTransaction = require("../models/ShopTransaction");
const Loan = require("../models/Loan");
const { ROLES, isValidRole } = require("../middleware/roleMiddleware");

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(100, Math.floor(n));
}

function parsePage(page) {
  const n = Number(page);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function parseDateMaybe(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports.listTransactions = async function listTransactions(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);

    const filter = {};
    if (req.query.user_id) filter.user_id = String(req.query.user_id);
    if (req.query.action) filter.source = String(req.query.action);

    const start = parseDateMaybe(req.query.start_date);
    const end = parseDateMaybe(req.query.end_date);
    if (start || end) {
      filter.timestamp = {};
      if (start) filter.timestamp.$gte = start;
      if (end) filter.timestamp.$lte = end;
    }

    const total = await Transaction.countDocuments(filter);
    const data = await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.listActions = async function listActions(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);

    const filter = {};
    if (req.query.user_id) filter.user_id = String(req.query.user_id);
    if (req.query.action) filter.action = String(req.query.action);

    const total = await ActionLog.countDocuments(filter);
    const data = await ActionLog.find(filter)
      .sort({ last_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.suspicious = async function suspicious(req, res, next) {
  try {
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 60 * 1000);
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000);

    const freq = await Transaction.aggregate([
      { $match: { timestamp: { $gte: oneMinuteAgo } } },
      { $group: { _id: "$user_id", count: { $sum: 1 } } },
      { $match: { count: { $gte: 25 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

    const spikes = await Transaction.aggregate([
      { $match: { timestamp: { $gte: tenMinutesAgo } } },
      { $group: { _id: "$user_id", totalAmount: { $sum: "$amount" } } },
      { $match: { totalAmount: { $gte: 250 } } },
      { $sort: { totalAmount: -1 } },
      { $limit: 50 },
    ]);

    const issues = [];
    for (const row of freq) {
      issues.push({ user_id: row._id, issue: "Too many earn events per minute", severity: "high" });
    }

    for (const row of spikes) {
      issues.push({ user_id: row._id, issue: "Unusual earning spike (10m)", severity: "medium" });
    }

    return res.json({ success: true, data: issues });
  } catch (err) {
    return next(err);
  }
};

module.exports.setUserRole = async function setUserRole(req, res, next) {
  try {
    const actor = req.user;
    const { user_id, username, role } = req.body || {};

    if (!actor || actor.role !== "owner") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (!role || typeof role !== "string" || !isValidRole(role)) {
      return res.status(400).json({ success: false, message: "invalid role" });
    }

    const query = {};
    if (user_id && typeof user_id === "string") query.user_id = user_id;
    else if (username && typeof username === "string") query.username = username;
    else {
      return res.status(400).json({ success: false, message: "user_id or username required" });
    }

    const target = await User.findOne(query);
    if (!target) return res.status(404).json({ success: false, message: "user not found" });

    const previousRole = target.role || "player";

    if (previousRole === "owner") {
      return res.status(403).json({ success: false, message: "Owner role cannot be changed" });
    }

    if (role === "owner") {
      const ownerExists = await User.findOne({ role: "owner" }).lean();
      if (ownerExists) {
        return res.status(403).json({ success: false, message: "Only one owner allowed" });
      }
    }

    target.role = role;
    await target.save();

    await AdminAuditLog.create({
      actor_user_id: actor.user_id,
      actor_username: actor.username,
      actor_type: "user",
      action: "ROLE_CHANGED",
      target_user_id: target.user_id,
      target_username: target.username,
      previous_role: previousRole,
      new_role: role,
      timestamp: new Date(),
      meta: {},
    });

    // eslint-disable-next-line no-console
    console.log(`OWNER ${actor.username} changed role of ${target.username}: ${previousRole} -> ${role}`);

    return res.json({
      success: true,
      user_id: target.user_id,
      username: target.username,
      role: target.role,
      allowed_roles: ROLES,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(403).json({ success: false, message: "Only one owner allowed" });
    }
    return next(err);
  }
};

module.exports.adminListShops = async function adminListShops(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);

    const filter = {};
    if (req.query.owner_user_id) filter.owner_user_id = String(req.query.owner_user_id);
    if (req.query.plot_id) filter.plot_id = String(req.query.plot_id);

    const total = await Shop.countDocuments(filter);
    const data = await Shop.find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ success: true, data, pagination: { page, limit, total } });
  } catch (err) {
    return next(err);
  }
};

module.exports.adminGetShop = async function adminGetShop(req, res, next) {
  try {
    const { shop_id } = req.params;
    const txLimit = Math.min(200, Math.max(1, Number(req.query.tx_limit || 50)));

    const shop = await Shop.findOne({ shop_id }).lean();
    if (!shop) return res.status(404).json({ success: false, message: "shop not found" });

    const owner = await User.findOne({ user_id: shop.owner_user_id }).lean();
    const tx = await ShopTransaction.find({ shop_id })
      .sort({ created_at: -1 })
      .limit(txLimit)
      .lean();

    return res.json({
      success: true,
      data: {
        shop,
        owner_username: owner ? owner.username : null,
        transactions: tx,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.adminDeleteShop = async function adminDeleteShop(req, res, next) {
  try {
    const { shop_id } = req.params;
    const shop = await Shop.findOne({ shop_id });
    if (!shop) return res.status(404).json({ success: false, message: "shop not found" });

    await Plot.findOneAndUpdate(
      { plot_id: shop.plot_id },
      { $set: { owner_user_id: null, occupied: false, updated_at: new Date() } }
    );
    await Shop.deleteOne({ shop_id });

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

module.exports.adminListUsers = async function adminListUsers(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);

    const filter = {};
    if (req.query.role) filter.role = String(req.query.role);
    if (req.query.username) filter.username = String(req.query.username);
    if (req.query.user_id) filter.user_id = String(req.query.user_id);

    const total = await User.countDocuments(filter);
    const data = await User.find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("user_id username email role created_at")
      .lean();

    return res.json({ success: true, data, pagination: { page, limit, total } });
  } catch (err) {
    return next(err);
  }
};

module.exports.adminListLoans = async function adminListLoans(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const limit = clampLimit(req.query.limit);

    const filter = {};
    if (req.query.user_id) filter.user_id = String(req.query.user_id);
    if (req.query.status) filter.status = String(req.query.status);

    const total = await Loan.countDocuments(filter);
    const data = await Loan.find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        "loan_id user_id amount interest_rate total_due_amount due_date collateral_type collateral_amount status created_at updated_at"
      )
      .lean();

    return res.json({ success: true, data, pagination: { page, limit, total } });
  } catch (err) {
    return next(err);
  }
};
