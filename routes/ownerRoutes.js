const express = require("express");

const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { requireOwner } = require("../middleware/ownerMiddleware");
const { validateBody } = require("../middleware/validate");

const owner = require("../controllers/ownerController");

const router = express.Router();

router.use(requireSession, requireOwner);

router.get("/stats", owner.getStats);

router.get("/users", owner.listUsers);
router.get("/users/:id", owner.getUser);
router.patch("/user/:id", owner.patchUser);
router.delete("/user/:id", owner.deleteUser);

router.get("/transactions", owner.listTransactions);
router.get("/logs", owner.listAuditLogs);
router.get("/live-players", owner.listLivePlayers);

// announcements (owner management)
router.get("/announcements", owner.listAnnouncements);
router.post("/announcements", owner.createAnnouncement);
router.patch("/announcements/:id", owner.updateAnnouncement);
router.delete("/announcements/:id", owner.deleteAnnouncement);

module.exports = router;
