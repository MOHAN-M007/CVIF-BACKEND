const crypto = require("crypto");
const Event = require("../models/Event");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

module.exports.createEvent = async function createEvent(req, res, next) {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const date = new Date(req.body?.date);

    const ev = await Event.create({
      event_id: crypto.randomUUID(),
      title,
      description,
      date,
      created_by: { user_id: req.user.user_id, username: req.user.username },
      created_at: new Date(),
    });

    return res.json({ success: true, event: ev });
  } catch (err) {
    return next(err);
  }
};

module.exports.listEvents = async function listEvents(req, res, next) {
  try {
    const now = Date.now();
    const upcomingOnly = String(req.query?.upcoming || "true").toLowerCase() !== "false";
    const limitRaw = Number(req.query?.limit || 50);
    const limit = Math.min(100, Math.max(1, limitRaw || 50));

    const query = upcomingOnly ? { date: { $gte: new Date(now - 24 * 60 * 60 * 1000) } } : {};

    const events = await Event.find(query).sort({ date: 1 }).limit(limit).lean();
    return res.json({ success: true, data: events });
  } catch (err) {
    return next(err);
  }
};
