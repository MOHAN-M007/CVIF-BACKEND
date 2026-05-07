const crypto = require("crypto");
const Announcement = require("../models/Announcement");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

module.exports.createAnnouncement = async function createAnnouncement(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();

    const ann = await Announcement.create({
      announcement_id: crypto.randomUUID(),
      message,
      created_by: { user_id: req.user.user_id, username: req.user.username },
      created_at: new Date(),
    });

    return res.json({ success: true, announcement: ann });
  } catch (err) {
    return next(err);
  }
};

module.exports.listAnnouncements = async function listAnnouncements(req, res, next) {
  try {
    const limitRaw = Number(req.query?.limit || 10);
    const limit = Math.min(50, Math.max(1, limitRaw || 10));
    const now = new Date();
    const data = await Announcement.find({
      $or: [{ expires_at: null }, { expires_at: { $gt: now } }],
    })
      .sort({ pinned: -1, priority: -1, created_at: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};
