const express = require("express");
const { earn, getBalance } = require("../controllers/economyController");
const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { ipBurstLimiter, userBurstLimiter } = require("../middleware/economyRateLimitMiddleware");

const router = express.Router();

router.post("/earn", ipBurstLimiter, requireSession, userBurstLimiter, earn);
router.get("/balance/:user_id", ipBurstLimiter, requireSession, userBurstLimiter, getBalance);

module.exports = router;
