const express = require("express");

const {
  listTransactions,
  listActions,
  suspicious,
  setUserRole,
  adminListShops,
  adminGetShop,
  adminDeleteShop,
  adminListUsers,
  adminListLoans,
} = require("../controllers/adminController");

const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { adminApiLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

router.use(adminApiLimiter);

router.get("/transactions", requireSession, requireRole(["admin", "owner"]), listTransactions);
router.get("/actions", requireSession, requireRole(["admin", "owner"]), listActions);
router.get("/suspicious", requireSession, requireRole(["officer", "admin", "owner"]), suspicious);
router.post("/role", requireSession, requireRole(["owner"]), setUserRole);

router.get("/shops", requireSession, requireRole(["admin", "owner"]), adminListShops);
router.get("/shops/:shop_id", requireSession, requireRole(["admin", "owner"]), adminGetShop);
router.delete("/shops/:shop_id", requireSession, requireRole(["admin", "owner"]), adminDeleteShop);

router.get("/users", requireSession, requireRole(["admin", "owner"]), adminListUsers);
router.get("/loans", requireSession, requireRole(["admin", "owner"]), adminListLoans);

module.exports = router;
