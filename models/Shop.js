const mongoose = require("mongoose");

const shopItemSchema = new mongoose.Schema(
  {
    item_id: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const shopSchema = new mongoose.Schema(
  {
    shop_id: { type: String, required: true, unique: true, index: true },
    owner_user_id: { type: String, required: true, index: true },
    plot_id: { type: String, required: true, unique: true, index: true },
    shop_name: { type: String, default: null },
    items: { type: [shopItemSchema], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

shopSchema.pre("save", function preSave(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model("Shop", shopSchema);
