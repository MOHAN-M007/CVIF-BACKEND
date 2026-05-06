const express = require("express");
const { requireSession } = require("../middleware/sessionAuthMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { createEvent, listEvents } = require("../controllers/eventController");
const { validateBody } = require("../middleware/validate");
const { createEventSchema } = require("../validators/eventSchemas");

const router = express.Router();

router.get("/", listEvents);
router.post("/", requireSession, requireRole(["admin", "owner"]), validateBody(createEventSchema), createEvent);

module.exports = router;
