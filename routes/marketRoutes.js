const express = require("express");

const {
  createShop,
  updateShopItems,
  updateShopName,
  getShop,
  buyFromShop,
  adminRemoveShop,
  listMyPlots,
  listMyShops,
  adminListPlots,
  getTreasury,
  getShopAnalytics,
  getShopHistory,
} = require("../controllers/marketController");

const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { ipBurstLimiter, userBurstLimiter } = require("../middleware/economyRateLimitMiddleware");
const { shopUpdateLimiter } = require("../middleware/shopUpdateRateLimitMiddleware");
const { validateBody } = require("../middleware/validate");
const { updateShopItemsSchema, updateShopNameSchema } = require("../validators/marketSchemas");

const router = express.Router();

router.post("/shops", ipBurstLimiter, requireSession, userBurstLimiter, createShop);
router.get("/shops/mine", ipBurstLimiter, requireSession, userBurstLimiter, listMyShops);
router.get("/plots/mine", ipBurstLimiter, requireSession, userBurstLimiter, listMyPlots);
router.get(
  "/plots",
  ipBurstLimiter,
  requireSession,
  requireRole(["admin", "owner"]),
  adminListPlots
);

router.get("/treasury", ipBurstLimiter, requireSession, userBurstLimiter, getTreasury);
router.get("/shops/:shop_id", ipBurstLimiter, requireSession, userBurstLimiter, getShop);
router.get("/shops/:shop_id/analytics", ipBurstLimiter, requireSession, userBurstLimiter, getShopAnalytics);
router.get("/shops/:shop_id/history", ipBurstLimiter, requireSession, userBurstLimiter, getShopHistory);

router.put(
  "/shops/:shop_id/items",
  ipBurstLimiter,
  requireSession,
  userBurstLimiter,
  shopUpdateLimiter,
  validateBody(updateShopItemsSchema),
  updateShopItems
);
router.put(
  "/shops/:shop_id/name",
  ipBurstLimiter,
  requireSession,
  userBurstLimiter,
  shopUpdateLimiter,
  validateBody(updateShopNameSchema),
  updateShopName
);
router.post("/shops/:shop_id/buy", ipBurstLimiter, requireSession, userBurstLimiter, buyFromShop);

router.delete(
  "/shops/:shop_id",
  ipBurstLimiter,
  requireSession,
  requireRole(["admin", "owner"]),
  adminRemoveShop
);

module.exports = router;
