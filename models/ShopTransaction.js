const mongoose = require("mongoose");

const shopTransactionSchema = new mongoose.Schema(
  {
    tx_id: { type: String, required: true, unique: true, index: true },
    shop_id: { type: String, required: true, index: true },
    plot_id: { type: String, required: true, index: true },
    buyer_user_id: { type: String, required: true, index: true },
    seller_user_id: { type: String, required: true, index: true },
    item_id: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    gross_amount: { type: Number, required: true },
    tax_amount: { type: Number, required: true },
    net_amount: { type: Number, required: true },
    created_at: { type: Date, default: Date.now, index: true },
    meta: { type: Object, default: {} },
  },
  { versionKey: false }
);

module.exports = mongoose.model("ShopTransaction", shopTransactionSchema);
