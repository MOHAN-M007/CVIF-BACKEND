const express = require("express");
const { selectJobs, getJobs } = require("../controllers/jobController");
const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { ipBurstLimiter, userBurstLimiter } = require("../middleware/economyRateLimitMiddleware");

const router = express.Router();

router.post("/select", ipBurstLimiter, requireSession, userBurstLimiter, selectJobs);
router.get("/me", ipBurstLimiter, requireSession, userBurstLimiter, (req, res) => {
  return res.redirect(307, `/api/job/${req.user.user_id}`);
});
router.get("/:user_id", ipBurstLimiter, requireSession, userBurstLimiter, getJobs);

module.exports = router;
