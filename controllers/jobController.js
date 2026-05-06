const PlayerJob = require("../models/PlayerJob");
const { JOBS } = require("../config/constants");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

module.exports.selectJobs = async function selectJobs(req, res, next) {
  try {
    const { user_id, job1, job2 } = req.body || {};
    const uid = (req.user && req.user.user_id) || null;

    if (!uid) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!job1 || !job2) return badRequest(res, "job1 and job2 are required");
    if (job1 === job2) return badRequest(res, "cannot select same job twice");
    if (!JOBS.includes(job1) || !JOBS.includes(job2)) return badRequest(res, "invalid job");

    const doc = await PlayerJob.findOneAndUpdate(
      { user_id: uid },
      {
        $set: {
          user_id: uid,
          jobs: [job1, job2],
        },
        $setOnInsert: {
          levels: {},
          xp: {},
          created_at: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, user_id: uid, jobs: doc.jobs });
  } catch (err) {
    return next(err);
  }
};

module.exports.getJobs = async function getJobs(req, res, next) {
  try {
    const { user_id } = req.params;
    if (req.user && req.user.user_id && req.user.user_id !== user_id) {
      return res.status(403).json({ success: false, message: "forbidden" });
    }

    const doc = await PlayerJob.findOne({ user_id }).lean();
    if (!doc) return res.json({ success: true, user_id, jobs: [] });
    return res.json({ success: true, user_id, jobs: doc.jobs, levels: doc.levels, xp: doc.xp });
  } catch (err) {
    return next(err);
  }
};



