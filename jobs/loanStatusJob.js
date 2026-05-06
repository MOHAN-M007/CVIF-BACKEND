const Loan = require("../models/Loan");
const { applyOverduePenalty, DEFAULT_AFTER_OVERDUE_DAYS, OVERDUE_PENALTY_RATE_PERCENT } = require("../config/bank");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processLoan(loan, now) {
  const due = loan.due_date ? new Date(loan.due_date).getTime() : null;
  if (!due) return;

  // ACTIVE -> OVERDUE (+ one-time penalty)
  if (loan.status === "active" && now > due) {
    const updates = {
      status: "overdue",
      updated_at: new Date(now),
    };

    if (!loan.penalty_applied) {
      const ap = applyOverduePenalty(loan.total_due_amount, OVERDUE_PENALTY_RATE_PERCENT);
      if (ap && ap.penalty > 0) {
        updates.total_due_amount = ap.newTotalDue;
        updates.penalty_applied = true;
        updates.meta = {
          ...(loan.meta || {}),
          penalty_amount: ap.penalty,
          penalty_rate: OVERDUE_PENALTY_RATE_PERCENT,
          penalty_applied_at: new Date(now),
        };
      }
    }

    // Conditional update so we don't double-apply penalty under races.
    const res = await Loan.updateOne(
      {
        loan_id: loan.loan_id,
        status: "active",
        ...(loan.penalty_applied ? {} : { penalty_applied: false }),
      },
      { $set: updates }
    );
    return res.modifiedCount > 0;
  }

  // OVERDUE -> DEFAULTED after window (no collateral return)
  if (loan.status === "overdue") {
    const defaultAfterDays = Math.max(0, Number(DEFAULT_AFTER_OVERDUE_DAYS || 0));
    const defaultAfterMs = defaultAfterDays * 24 * 60 * 60 * 1000;
    if (defaultAfterMs > 0 && now > due + defaultAfterMs) {
      const res = await Loan.updateOne(
        { loan_id: loan.loan_id, status: "overdue" },
        {
          $set: {
            status: "defaulted",
            updated_at: new Date(now),
            meta: {
              ...(loan.meta || {}),
              defaulted_at: new Date(now),
              default_reason: "overdue_deadline_exceeded",
            },
          },
        }
      );
      return res.modifiedCount > 0;
    }
  }
}

module.exports.startLoanStatusJob = function startLoanStatusJob(options = {}) {
  const intervalMs = Number(options.intervalMs || 5 * 60 * 1000); // default 5 minutes
  const batchSize = Number(options.batchSize || 200);
  const enabled = options.enabled !== false;

  if (!enabled) return { stop() {} };

  let timer = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      let page = 0;

      // Cursor-like paging using _id sort for stability.
      let lastId = null;
      for (;;) {
        const query = { status: { $in: ["active", "overdue"] } };
        if (lastId) query._id = { $gt: lastId };

        const loans = await Loan.find(query)
          .sort({ _id: 1 })
          .limit(batchSize)
          .lean();

        if (!loans.length) break;
        page += 1;
        lastId = loans[loans.length - 1]._id;

        for (const loan of loans) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await processLoan(loan, now);
          } catch (_e) {
            // best-effort; continue
          }
          // tiny yield to keep event loop responsive under large sets
          // eslint-disable-next-line no-await-in-loop
          await sleep(0);
        }
      }
    } finally {
      running = false;
    }
  };

  // Start quickly, then interval.
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
};

