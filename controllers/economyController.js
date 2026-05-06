const EconomyAccount = require("../models/EconomyAccount");
const PlayerJob = require("../models/PlayerJob");
const Transaction = require("../models/Transaction");
const ActionLog = require("../models/ActionLog");
const { REWARD_MAP } = require("../config/rewards");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function unauthorized(res, message) {
  return res.status(401).json({ success: false, message });
}

function tooMany(res, message) {
  return res.status(429).json({ success: false, message });
}

module.exports.earn = async function earn(req, res, next) {
  try {
    if (!req.user || !req.user.user_id) return unauthorized(res, "Unauthorized");

    const { action, job_type } = req.body || {};
    const user_id = req.user.user_id;

    if (!action || typeof action !== "string") return badRequest(res, "Invalid action");
    if (!job_type || typeof job_type !== "string") return badRequest(res, "Job mismatch");

    const jobsDoc = await PlayerJob.findOne({ user_id }).lean();
    const jobs = (jobsDoc && jobsDoc.jobs) || [];
    if (!jobs.includes(job_type)) return badRequest(res, "Job mismatch");

    const jobRewards = REWARD_MAP[job_type];
    if (!jobRewards) return badRequest(res, "Invalid action");
    const reward = jobRewards[action];
    if (!reward) return badRequest(res, "Invalid action");

    const cooldownMs = Number(reward.cooldownMs || 0);
    const now = new Date();

    if (cooldownMs > 0) {
      const existing = await ActionLog.findOne({ user_id, action }).lean();
      if (existing && existing.last_time) {
        const elapsed = now.getTime() - new Date(existing.last_time).getTime();
        if (elapsed < cooldownMs) {
          return tooMany(res, "Action cooldown active");
        }
      }

      await ActionLog.findOneAndUpdate(
        { user_id, action },
        { $set: { last_time: now } },
        { upsert: true, new: false }
      );
    }

    const amount = Number(reward.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, "Invalid action");

    const account = await EconomyAccount.findOneAndUpdate(
      { user_id },
      { $inc: { balance: amount }, $set: { updated_at: now } },
      { upsert: true, new: true }
    ).lean();

    await Transaction.create({
      user_id,
      type: "earn",
      amount,
      source: action,
      job_type,
      timestamp: now,
    });

    return res.json({ success: true, user_id, balance: account.balance });
  } catch (err) {
    return next(err);
  }
};

module.exports.getBalance = async function getBalance(req, res, next) {
  try {
    if (!req.user || !req.user.user_id) return unauthorized(res, "Unauthorized");

    const { user_id } = req.params;
    if (req.user.user_id !== user_id) {
      return res.status(403).json({ success: false, message: "forbidden" });
    }

    const account = await EconomyAccount.findOne({ user_id }).lean();
    const balance = account ? account.balance : 0;
    return res.json({ success: true, user_id, balance });
  } catch (err) {
    return next(err);
  }
};
