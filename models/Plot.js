const mongoose = require("mongoose");

const plotSchema = new mongoose.Schema(
  {
    plot_id: { type: String, required: true, unique: true, index: true },
    owner_user_id: { type: String, default: null, index: true },
    size: { type: String, required: true, enum: ["small", "medium", "large"] },
    location: {
      world: { type: String, required: true, default: "market" },
      x1: { type: Number, required: true },
      z1: { type: Number, required: true },
      x2: { type: Number, required: true },
      z2: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    occupied: { type: Boolean, required: true, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

plotSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("Plot", plotSchema);
