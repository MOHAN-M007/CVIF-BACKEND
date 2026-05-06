const express = require("express");

const { register, login, me, logout } = require("../controllers/authController");
const { loginLimiter, registerLimiter } = require("../middleware/rateLimitMiddleware");
const { requireSession } = require("../middleware/sessionAuthMiddleware");

const router = express.Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.get("/me", requireSession, me);
router.post("/logout", requireSession, logout);

module.exports = router;
