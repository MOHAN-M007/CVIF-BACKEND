#!/usr/bin/env node

require("dotenv").config();

const readline = require("readline");

const connectDb = require("../config/db");
const User = require("../models/User");
const AdminAuditLog = require("../models/AdminAuditLog");
const { maskSecret } = require("../config/logSafety");

function parseArgs(argv) {
  const out = { force: false, dryRun: false, secret: null, username: null, email: null };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--secret") out.secret = argv[i + 1] || null, i++;
    else if (a === "--username") out.username = argv[i + 1] || null, i++;
    else if (a === "--email") out.email = argv[i + 1] || null, i++;
  }

  return out;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function confirmExact(prompt, expected) {
  const ans = await ask(prompt);
  return ans === expected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const expectedSecret = process.env.OWNER_SETUP_SECRET;
  if (!expectedSecret) {
    console.error("Missing OWNER_SETUP_SECRET in environment.");
    process.exit(1);
  }
  if (!args.secret || args.secret !== expectedSecret) {
    console.error("Invalid or missing --secret.");
    console.error("Provided secret:", maskSecret(args.secret));
    process.exit(1);
  }

  await connectDb();

  const owners = await User.find({ role: "owner" }).lean();
  const ownerExists = owners.length > 0;

  if (ownerExists && !args.force) {
    console.error("Owner already exists. Re-run with --force to replace the owner.");
    owners.forEach((o) => console.error(`- ${o.username} (${o.user_id})`));
    process.exit(1);
  }

  let query = null;
  let matchedBy = null;

  if (args.username) {
    query = { username: args.username };
    matchedBy = "username";
  } else if (args.email) {
    query = { email: args.email };
    matchedBy = "email";
  } else {
    const input = await ask("Enter username OR email to promote to OWNER: ");
    if (!input) {
      console.error("No input provided.");
      process.exit(1);
    }
    query = input.includes("@") ? { email: input } : { username: input };
    matchedBy = input.includes("@") ? "email" : "username";
  }

  const user = await User.findOne(query);
  if (!user) {
    console.error("User not found.");
    process.exit(1);
  }

  if (user.role === "owner" && !args.force) {
    console.log(`User ${user.username} is already OWNER.`);
    process.exit(0);
  }

  if (ownerExists && args.force) {
    console.log("Current owner(s):");
    owners.forEach((o) => console.log(`- ${o.username} (${o.user_id})`));

    console.warn("WARNING: You are replacing the current owner.");

    const ok1 = await confirmExact("Type YES to replace current owner and continue: ", "YES");
    if (!ok1) {
      console.log("Cancelled.");
      process.exit(0);
    }

    const ok2 = await confirmExact("Type REPLACE to confirm owner replacement: ", "REPLACE");
    if (!ok2) {
      console.log("Cancelled.");
      process.exit(0);
    }
  }

  const nextOwnerUsername = user.username;
  const nextOwnerUserId = user.user_id;
  const previousRole = user.role || "player";

  if (args.dryRun) {
    console.log("DRY RUN - no changes will be made.");
    console.log(`Would promote ${nextOwnerUsername} (${nextOwnerUserId}) from ${previousRole} -> owner`);
    if (ownerExists) {
      owners.forEach((o) => console.log(`Would demote owner ${o.username} (${o.user_id}) owner -> admin`));
    }
    process.exit(0);
  }

  // Enforce single-owner rule:
  // - If no owner exists: promote user to owner
  // - If owner exists and --force: demote existing owner(s) to admin then promote user
  if (ownerExists && args.force) {
    await User.updateMany({ role: "owner" }, { $set: { role: "admin" } });

    await AdminAuditLog.create({
      actor_user_id: "system",
      actor_username: "createOwner.js",
      actor_type: "system",
      action: "OWNER_FORCE_REPLACED",
      target_user_id: nextOwnerUserId,
      target_username: nextOwnerUsername,
      previous_role: previousRole,
      new_role: "owner",
      timestamp: new Date(),
      meta: { matchedBy, force: true },
    });
  }

  user.role = "owner";
  await user.save();

  await AdminAuditLog.create({
    actor_user_id: "system",
      actor_username: "createOwner.js",
      actor_type: "system",
    action: ownerExists ? "OWNER_CREATED_AFTER_FORCE" : "OWNER_CREATED",
    target_user_id: nextOwnerUserId,
    target_username: nextOwnerUsername,
    previous_role: previousRole,
    new_role: "owner",
    timestamp: new Date(),
    meta: { matchedBy, force: !!args.force },
  });

  console.log(`User ${user.username} is now OWNER`);
  process.exit(0);
}

main().catch((err) => {
  // Duplicate owner index protection
  if (err && err.code === 11000) {
    console.error("Only one owner allowed (duplicate key).");
    process.exit(1);
  }
  console.error("Failed to create owner:", err);
  process.exit(1);
});


