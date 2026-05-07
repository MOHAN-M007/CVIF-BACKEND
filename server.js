require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const connectDb = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const jobRoutes = require("./routes/jobRoutes");
const economyRoutes = require("./routes/economyRoutes");
const marketRoutes = require("./routes/marketRoutes");
const adminRoutes = require("./routes/adminRoutes");
const bankRoutes = require("./routes/bankRoutes");
const eventRoutes = require("./routes/eventRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const { notFound } = require("./middleware/errorMiddleware");
const { globalErrorHandler } = require("./middleware/errorHandler");
const { startLoanStatusJob } = require("./jobs/loanStatusJob");
const { seedAdminUser } = require("./config/adminSeed");

const app = express();

app.set("trust proxy", true);
app.use(helmet());
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());

const corsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) {
        // Dev fallback: allow any origin. For production, set CORS_ORIGINS.
        return cb(null, true);
      }
      return cb(null, corsOrigins.includes(origin));
    },
    credentials: true,
  })
);

app.use(morgan("combined"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/job", jobRoutes);
app.use("/api/economy", economyRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bank", bankRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/announcements", announcementRoutes);

app.use(notFound);
app.use(globalErrorHandler);

const port = Number(process.env.PORT || 3000);

connectDb()
  .then(() => {
    seedAdminUser().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[SEED] Failed to seed admin user:", err);
    });
    startLoanStatusJob();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Auth backend listening on :${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", err);
    process.exit(1);
  });
