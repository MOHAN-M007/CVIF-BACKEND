const MIN_LOAN_AMOUNT = 10000;
const DIAMOND_PER_10000 = 50;
const MAX_WITHDRAW_PER_TX = 500000; // optional safety cap

// Phase 5.1
const DEFAULT_INTEREST_RATE_PERCENT = 5;
const DEFAULT_LOAN_DURATION_DAYS = 5; // 3-7 recommended
const OVERDUE_PENALTY_RATE_PERCENT = 10;
const DEFAULT_AFTER_OVERDUE_DAYS = 2; // after this many overdue days -> defaulted

function requiredCollateralDiamonds(amount) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null;
  return Math.ceil(a / 10000) * DIAMOND_PER_10000;
}

function calcTotalDue(principal, interestRatePercent) {
  const p = Number(principal);
  const r = Number(interestRatePercent);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (!Number.isFinite(r) || r < 0) return null;
  return Math.ceil(p * (1 + r / 100));
}

function applyOverduePenalty(totalDue, penaltyRatePercent) {
  const d = Number(totalDue);
  const r = Number(penaltyRatePercent);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (!Number.isFinite(r) || r < 0) return null;
  const penalty = Math.ceil(d * (r / 100));
  return { penalty, newTotalDue: d + penalty };
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

module.exports = {
  MIN_LOAN_AMOUNT,
  DIAMOND_PER_10000,
  MAX_WITHDRAW_PER_TX,
  DEFAULT_INTEREST_RATE_PERCENT,
  DEFAULT_LOAN_DURATION_DAYS,
  OVERDUE_PENALTY_RATE_PERCENT,
  DEFAULT_AFTER_OVERDUE_DAYS,
  requiredCollateralDiamonds,
  calcTotalDue,
  applyOverduePenalty,
  addDays,
};