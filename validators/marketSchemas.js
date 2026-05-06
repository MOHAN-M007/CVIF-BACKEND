const { z } = require("zod");
const { shopNameSchema } = require("./common");

const shopItemSchema = z.object({
  item_id: z.string().trim().min(1),
  price: z.number().positive().max(1_000_000_000),
  quantity: z.number().int().min(0).max(1_000_000),
});

module.exports.updateShopItemsSchema = z.object({
  items: z.array(shopItemSchema).max(54),
});

module.exports.updateShopNameSchema = z.object({
  name: shopNameSchema,
});

