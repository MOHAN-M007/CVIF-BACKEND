const express = require("express");
const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { createAnnouncement, listAnnouncements } = require("../controllers/announcementController");
const { validateBody } = require("../middleware/validate");
const { createAnnouncementSchema } = require("../validators/announcementSchemas");

const router = express.Router();

router.get("/", listAnnouncements);
router.post("/", requireSession, requireRole(["admin", "owner"]), validateBody(createAnnouncementSchema), createAnnouncement);

module.exports = router;
