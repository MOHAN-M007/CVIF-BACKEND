const crypto = require("crypto");

const EconomyAccount = require("../models/EconomyAccount");
const BankAccount = require("../models/BankAccount");
const Loan = require("../models/Loan");
const BankTransaction = require("../models/BankTransaction");
const {
  MIN_LOAN_AMOUNT,
  MAX_WITHDRAW_PER_TX,
  requiredCollateralDiamonds,
  DEFAULT_INTEREST_RATE_PERCENT,
  DEFAULT_LOAN_DURATION_DAYS,
  OVERDUE_PENALTY_RATE_PERCENT,
  DEFAULT_AFTER_OVERDUE_DAYS,
  calcTotalDue,
  applyOverduePenalty,
  addDays,
} = require("../config/bank");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function forbidden(res, message) {
  return res.status(403).json({ success: false, message });
}

function needsReplicaSet(res) {
  return res.status(500).json({
    success: false,
    message: "mongodb transactions require a replica set",
  });
}

function parsePositiveInt(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i <= 0) return null;
  return i;
}

async function getOrCreateWallet(user_id, session) {
  const q = { user_id };
  let wallet = await EconomyAccount.findOne(q).session(session).exec();
  if (!wallet) {
    wallet = await EconomyAccount.create([{ user_id, balance: 0, updated_at: new Date() }], { session });
    wallet = wallet[0];
  }
  return wallet;
}

async function getOrCreateBank(user_id, session) {
  const q = { user_id };
  let bank = await BankAccount.findOne(q).session(session).exec();
  if (!bank) {
    bank = await BankAccount.create(
      [{ user_id, balance: 0, created_at: new Date(), updated_at: new Date() }],
      { session }
    );
    bank = bank[0];
  }
  return bank;
}

module.exports.getBankBalance = async function getBankBalance(req, res, next) {
  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const [wallet, bank, loan] = await Promise.all([
      EconomyAccount.findOne({ user_id: user.user_id }).lean(),
      BankAccount.findOne({ user_id: user.user_id }).lean(),
      Loan.findOne({ user_id: user.user_id, status: { $in: ["active", "overdue"] } }).lean(),
    ]);

    return res.json({
      success: true,
      wallet_balance: wallet ? Number(wallet.balance || 0) : 0,
      bank_balance: bank ? Number(bank.balance || 0) : 0,
      loan_status: loan
        ? {
            active: true,
            status: loan.status,
            amount: loan.amount,
            collateral_type: loan.collateral_type,
            collateral_amount: loan.collateral_amount,
            loan_id: loan.loan_id,
          }
        : { active: false },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.deposit = async function deposit(req, res, next) {
  let session;
  try {
    session = await BankAccount.startSession();
  } catch (_e) {
    return needsReplicaSet(res);
  }

  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const amount = parsePositiveInt(req.body && req.body.amount);
    if (!amount) return badRequest(res, "invalid amount");

    await session.withTransaction(async () => {
      const wallet = await getOrCreateWallet(user.user_id, session);
      const bank = await getOrCreateBank(user.user_id, session);

      if (wallet.balance < amount) {
        const err = new Error("insufficient wallet balance");
        err.statusCode = 400;
        throw err;
      }

      wallet.balance -= amount;
      wallet.updated_at = new Date();
      await wallet.save({ session });

      bank.balance += amount;
      bank.updated_at = new Date();
      await bank.save({ session });

      await BankTransaction.create(
        [
          {
            user_id: user.user_id,
            type: "deposit",
            amount,
            balance_after: bank.balance,
            timestamp: new Date(),
            meta: { wallet_after: wallet.balance },
          },
        ],
        { session }
      );

      res.locals.result = {
        wallet_balance: wallet.balance,
        bank_balance: bank.balance,
      };
    });

    return res.json({ success: true, ...res.locals.result });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
};

module.exports.withdraw = async function withdraw(req, res, next) {
  let session;
  try {
    session = await BankAccount.startSession();
  } catch (_e) {
    return needsReplicaSet(res);
  }

  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const amount = parsePositiveInt(req.body && req.body.amount);
    if (!amount) return badRequest(res, "invalid amount");

    if (MAX_WITHDRAW_PER_TX && amount > MAX_WITHDRAW_PER_TX) {
      return badRequest(res, "amount too large");
    }

    await session.withTransaction(async () => {
      const wallet = await getOrCreateWallet(user.user_id, session);
      const bank = await getOrCreateBank(user.user_id, session);

      if (bank.balance < amount) {
        const err = new Error("insufficient bank balance");
        err.statusCode = 400;
        throw err;
      }

      bank.balance -= amount;
      bank.updated_at = new Date();
      await bank.save({ session });

      wallet.balance += amount;
      wallet.updated_at = new Date();
      await wallet.save({ session });

      await BankTransaction.create(
        [
          {
            user_id: user.user_id,
            type: "withdraw",
            amount,
            balance_after: bank.balance,
            timestamp: new Date(),
            meta: { wallet_after: wallet.balance },
          },
        ],
        { session }
      );

      res.locals.result = {
        wallet_balance: wallet.balance,
        bank_balance: bank.balance,
      };
    });

    return res.json({ success: true, ...res.locals.result });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
};

module.exports.loanRequest = async function loanRequest(req, res, next) {
  let session;
  try {
    session = await Loan.startSession();
  } catch (_e) {
    return needsReplicaSet(res);
  }

  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const amount = parsePositiveInt(req.body && req.body.amount);
    if (!amount) return badRequest(res, "invalid amount");
    if (amount < MIN_LOAN_AMOUNT) return badRequest(res, "amount below minimum");

    const collateral = requiredCollateralDiamonds(amount);
    if (!collateral) return badRequest(res, "invalid amount");

    const clientCollateral = req.body && req.body.collateral_amount;
    if (clientCollateral != null) {
      const cc = parsePositiveInt(clientCollateral);
      if (!cc || cc !== collateral) return badRequest(res, "collateral mismatch");
    }

    await session.withTransaction(async () => {
      const existing = await Loan.findOne({ user_id: user.user_id, status: "active" }).session(session).exec();
      if (existing) {
        const err = new Error("active loan exists");
        err.statusCode = 400;
        throw err;
      }

      const bank = await getOrCreateBank(user.user_id, session);

      const loanId = crypto.randomUUID();
      const interestRate = Number(DEFAULT_INTEREST_RATE_PERCENT || 0);

      const totalDue = calcTotalDue(amount, interestRate);
      if (!totalDue) {
        const err = new Error("invalid amount");
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();
      const dueDate = addDays(now, DEFAULT_LOAN_DURATION_DAYS || 5);

      await Loan.create([
        {
          loan_id: loanId,
          user_id: user.user_id,
          amount,
          interest_rate: interestRate,
          total_due_amount: totalDue,
          due_date: dueDate,
          collateral_type: "diamond",
          collateral_amount: collateral,
          status: "active",
          created_at: now,
          updated_at: now,
          },
        ],
        { session }
      );

      bank.balance += amount;
      bank.updated_at = new Date();
      await bank.save({ session });

      await BankTransaction.create(
        [
          {
            user_id: user.user_id,
            type: "loan_credit",
            amount,
            balance_after: bank.balance,
            timestamp: new Date(),
            meta: { loan_id: loanId, collateral_amount: collateral },
          },
        ],
        { session }
      );

      res.locals.result = {
        loan_id: loanId,
        bank_balance: bank.balance,
        collateral_amount: collateral,
        total_due: totalDue,
        due_date: dueDate,
        interest_rate: interestRate,
      };
    });

    return res.status(201).json({ success: true, ...res.locals.result });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ success: false, message: "active loan exists" });
    }
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
};

module.exports.loanRepay = async function loanRepay(req, res, next) {
  let session;
  try {
    session = await Loan.startSession();
  } catch (_e) {
    return needsReplicaSet(res);
  }

  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    await session.withTransaction(async () => {
      let loan = await Loan.findOne({ user_id: user.user_id, status: { $in: ["active", "overdue"] } }).session(session).exec();
      if (loan) loan = await normalizeLoanStatus(loan, session);
      if (!loan) {
        const err = new Error("no active loan");
        err.statusCode = 404;
        throw err;
      }

      const bank = await getOrCreateBank(user.user_id, session);
      if (!loan) {
        const err = new Error("no active loan");
        err.statusCode = 404;
        throw err;
      }
      if (loan.status === "defaulted") {
        const err = new Error("loan defaulted");
        err.statusCode = 400;
        throw err;
      }

      const amount = Number(loan.total_due_amount);
      if (bank.balance < amount) {
        const err = new Error("insufficient bank balance");
        err.statusCode = 400;
        throw err;
      }

      bank.balance -= amount;
      bank.updated_at = new Date();
      await bank.save({ session });

      loan.status = "paid";
      loan.updated_at = new Date();
      await loan.save({ session });

      await BankTransaction.create(
        [
          {
            user_id: user.user_id,
            type: "loan_repay",
            amount,
            balance_after: bank.balance,
            timestamp: new Date(),
            meta: { loan_id: loan.loan_id, collateral_amount: loan.collateral_amount },
          },
        ],
        { session }
      );

      res.locals.result = {
        loan_id: loan.loan_id,
        bank_balance: bank.balance,
        collateral_amount: loan.collateral_amount,
      };
    });

    return res.json({ success: true, ...res.locals.result });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
};

module.exports.getLoanStatus = async function getLoanStatus(req, res, next) {
  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const loan = await Loan.findOne({ user_id: user.user_id, status: { $in: ["active", "overdue"] } }).lean();
    if (!loan) return res.json({ success: true, active: false });

    return res.json({ success: true, ...loanStatusResponse(loan) });
  } catch (err) {
    return next(err);
  }
};
async function normalizeLoanStatus(loan, session) {
  if (!loan) return null;
  const now = new Date();

  // If already closed
  if (loan.status === "paid" || loan.status === "defaulted") return loan;

  const due = loan.due_date ? new Date(loan.due_date) : null;
  if (!due) return loan;

  if (now.getTime() <= due.getTime()) {
    if (loan.status !== "active") {
      loan.status = "active";
      await loan.save({ session });
    }
    return loan;
  }

  const overdueDays = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  const defaultAfter = Math.max(0, Number(DEFAULT_AFTER_OVERDUE_DAYS || 0));

  if (defaultAfter > 0 && overdueDays >= defaultAfter) {
    loan.status = "defaulted";
    loan.meta = { ...(loan.meta || {}), defaulted_at: now };
    await loan.save({ session });
    return loan;
  }

  // Overdue but not defaulted: apply one-time penalty (stored in meta)
  if (loan.status !== "overdue") {
    loan.status = "overdue";
  }

  const meta = loan.meta || {};

  if (!loan.penalty_applied) {
    const ap = applyOverduePenalty(loan.total_due_amount, OVERDUE_PENALTY_RATE_PERCENT);
    if (ap && ap.penalty > 0) {
      loan.total_due_amount = ap.newTotalDue;
      loan.penalty_applied = true;
      loan.meta = { ...meta, penalty_amount: ap.penalty, penalty_rate: OVERDUE_PENALTY_RATE_PERCENT, penalty_applied_at: now };
      await loan.save({ session });
      return loan;
    }
  }

  // ensure saved status
  await loan.save({ session });
  return loan;
}

function loanStatusResponse(loan) {
  if (!loan) return { active: false };
  const now = Date.now();
  const due = loan.due_date ? new Date(loan.due_date).getTime() : null;
  const msRemaining = due != null ? (due - now) : null;
  const daysRemaining = msRemaining != null ? Math.ceil(msRemaining / (24 * 60 * 60 * 1000)) : null;
  const meta = loan.meta || {};

  return {
    active: loan.status === "active" || loan.status === "overdue",
    status: loan.status,
    loan_id: loan.loan_id,
    amount: loan.amount,
    interest_rate: loan.interest_rate,
    total_due: loan.total_due_amount,
    due_date: loan.due_date,
    days_remaining: daysRemaining,
    penalty: loan.penalty_applied ? { amount: meta.penalty_amount || 0, rate: meta.penalty_rate || 0 } : null,
    collateral_type: loan.collateral_type,
    collateral_amount: loan.collateral_amount,
  };
}