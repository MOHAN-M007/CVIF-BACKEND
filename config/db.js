const mongoose = require("mongoose");

module.exports = async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI in environment");

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
};

