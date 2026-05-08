const express = require("express");

const { register, login, me, logout, refresh, minecraftSync, setWebPassword } = require("../controllers/authController");
const { loginLimiter, registerLimiter, authLimiter } = require("../middleware/rateLimitMiddleware");
const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { validateBody } = require("../middleware/validate");
const { minecraftSyncSchema, setWebPasswordSchema } = require("../validators/authSchemas");

const router = express.Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/minecraft-sync", authLimiter, validateBody(minecraftSyncSchema), minecraftSync);
router.post("/set-web-password", authLimiter, validateBody(setWebPasswordSchema), setWebPassword);
router.get("/me", requireSession, me);
router.post("/logout", requireSession, logout);
router.post("/refresh", requireSession, authLimiter, refresh);

module.exports = router;
