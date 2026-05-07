const bcrypt = require("bcrypt");
const crypto = require("crypto");

const User = require("../models/User");
const EconomyAccount = require("../models/EconomyAccount");
const BankAccount = require("../models/BankAccount");

function newUserId() {
  return crypto.randomUUID();
}

async function ensureAccounts(userId) {
  await EconomyAccount.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, balance: 0, updated_at: new Date() } },
    { upsert: true }
  );

  await BankAccount.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, balance: 0, created_at: new Date(), updated_at: new Date() } },
    { upsert: true }
  );
}

module.exports.seedAdminUser = async function seedAdminUser() {
  const username = "CVIF-ad";
  const existing = await User.findOne({ username }).lean();
  if (existing) return;

  const web_password_hash = await bcrypt.hash("tamilgamer-007", 12);
  // password_hash is reserved for AuthCore. Admin doesn't use AuthCore, but schema requires it.
  const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);

  const user = await User.create({
    user_id: newUserId(),
    username,
    email: "cvif-admin@local",
    role: "admin",
    password_hash,
    web_password_hash,
    wallet: 0,
    bank_balance: 0,
    linked: false,
    ips: [],
    created_at: new Date(),
  });

  await ensureAccounts(user.user_id);

  // eslint-disable-next-line no-console
  console.log(`[SEED] Created admin user ${username}`);
};

