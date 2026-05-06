const express = require("express");

const {
  getBankBalance,
  deposit,
  withdraw,
  loanRequest,
  loanRepay,
  getLoanStatus,
} = require("../controllers/bankController");

const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { ipBurstLimiter } = require("../middleware/economyRateLimitMiddleware");
const { bankLimiter, loanLimiter } = require("../middleware/bankRateLimitMiddleware");
const { requireIdempotencyKey } = require("../middleware/idempotencyMiddleware");
const { validateBody } = require("../middleware/validate");
const { depositSchema, withdrawSchema, loanRequestSchema } = require("../validators/bankSchemas");

const router = express.Router();

router.get("/balance", ipBurstLimiter, requireSession, bankLimiter, getBankBalance);
router.post("/deposit", ipBurstLimiter, requireSession, requireIdempotencyKey(), bankLimiter, validateBody(depositSchema), deposit);
router.post("/withdraw", ipBurstLimiter, requireSession, requireIdempotencyKey(), bankLimiter, validateBody(withdrawSchema), withdraw);

router.post("/loan/request", ipBurstLimiter, requireSession, requireIdempotencyKey(), loanLimiter, validateBody(loanRequestSchema), loanRequest);
router.post("/loan/repay", ipBurstLimiter, requireSession, requireIdempotencyKey(), loanLimiter, loanRepay);
router.get("/loan/status", ipBurstLimiter, requireSession, bankLimiter, getLoanStatus);

module.exports = router;
