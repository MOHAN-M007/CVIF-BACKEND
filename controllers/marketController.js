const crypto = require("crypto");

const Plot = require("../models/Plot");
const Shop = require("../models/Shop");
const ShopTransaction = require("../models/ShopTransaction");
const Treasury = require("../models/Treasury");
const EconomyAccount = require("../models/EconomyAccount");
const User = require("../models/User");
const { TAX_RATE, TREASURY_ID, PLOT_LIMIT_DEFAULT } = require("../config/market");

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function forbidden(res, message) {
  return res.status(403).json({ success: false, message });
}

function notFound(res, message) {
  return res.status(404).json({ success: false, message });
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function rectsOverlap(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.z2 < b.z1 || a.z1 > b.z2);
}

async function creditTreasury(session, amount) {
  await Treasury.findOneAndUpdate(
    { treasury_id: TREASURY_ID },
    { $inc: { total_balance: amount }, $set: { updated_at: new Date() } },
    { upsert: true, new: true, session }
  );
}

function safeLimit(rawLimit, def = 20, max = 100) {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.floor(n));
}

module.exports.createShop = async function createShop(req, res, next) {
  try {
    const user = req.user;
    if (!user) return forbidden(res, "Access denied");

    const { plot_id, size, location } = req.body || {};
    if (!plot_id || typeof plot_id !== "string") return badRequest(res, "plot_id required");
    if (!size || !["small", "medium", "large"].includes(size)) return badRequest(res, "invalid size");

    const limit = Number(PLOT_LIMIT_DEFAULT || 1);
    const ownedCount = await Plot.countDocuments({ owner_user_id: user.user_id, occupied: true });
    if (ownedCount >= limit) return forbidden(res, "plot limit reached");

    const existingPlot = await Plot.findOne({ plot_id }).lean();

    const loc = location || (existingPlot && existingPlot.location);
    if (!loc || typeof loc !== "object") return badRequest(res, "location required");

    const candidates = await Plot.find({
      "location.world": loc.world || "market",
      occupied: true,
      plot_id: { $ne: plot_id },
    }).lean();

    for (const cpl of candidates) {
      if (cpl.location && rectsOverlap(loc, cpl.location)) {
        return badRequest(res, "plot overlaps existing plot");
      }
    }

    if (existingPlot && existingPlot.occupied) return badRequest(res, "plot already occupied");

    const plot = await Plot.findOneAndUpdate(
      { plot_id },
      {
        $set: {
          plot_id,
          owner_user_id: user.user_id,
          size,
          location: loc,
          occupied: true,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true, new: true }
    ).lean();

    const shop_id = crypto.randomUUID();
    const shop = await Shop.create({
      shop_id,
      owner_user_id: user.user_id,
      plot_id: plot.plot_id,
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
    });

    return res.status(201).json({ success: true, shop_id: shop.shop_id, plot_id: plot.plot_id });
  } catch (err) {
    if (err && err.code === 11000) {
      return badRequest(res, "shop already exists for plot");
    }
    return next(err);
  }
};

module.exports.updateShopItems = async function updateShopItems(req, res, next) {
  try {
    const user = req.user;
    const { shop_id } = req.params;
    const { items } = req.body || {};

    if (!shop_id) return badRequest(res, "shop_id required");
    if (!Array.isArray(items)) return badRequest(res, "items must be array");

    const shop = await Shop.findOne({ shop_id });
    if (!shop) return notFound(res, "shop not found");
    if (shop.owner_user_id !== user.user_id) return forbidden(res, "Access denied");

    const clean = [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const item_id = String(it.item_id || "").trim();
      const price = Number(it.price);
      const quantity = Number(it.quantity);
      if (!item_id) continue;
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!Number.isFinite(quantity) || quantity < 0) continue;
      clean.push({ item_id, price: roundMoney(price), quantity: Math.floor(quantity) });
    }

    shop.items = clean;
    shop.updated_at = new Date();
    await shop.save();

    return res.json({ success: true, shop_id: shop.shop_id, items: shop.items });
  } catch (err) {
    return next(err);
  }
};

module.exports.updateShopName = async function updateShopName(req, res, next) {
  try {
    const user = req.user;
    const { shop_id } = req.params;
    const { name } = req.body || {};

    if (!shop_id) return badRequest(res, "shop_id required");
    if (typeof name !== "string") return badRequest(res, "name required");

    const clean = name.trim();
    if (!clean) return badRequest(res, "name required");
    if (clean.length > 20) return badRequest(res, "name too long");
    if (!/^[a-zA-Z0-9 ]+$/.test(clean)) return badRequest(res, "invalid name");

    // prevent duplicate shop names (global)
    const dup = await Shop.findOne({ shop_name: clean, shop_id: { $ne: shop_id } }).lean();
    if (dup) return badRequest(res, "shop name already taken");

    const shop = await Shop.findOne({ shop_id });
    if (!shop) return notFound(res, "shop not found");
    if (shop.owner_user_id !== user.user_id) return forbidden(res, "Access denied");

    shop.shop_name = clean;
    shop.updated_at = new Date();
    await shop.save();

    return res.json({ success: true, shop_id: shop.shop_id, shop_name: shop.shop_name });
  } catch (err) {
    return next(err);
  }
};
module.exports.getShop = async function getShop(req, res, next) {
  try {
    const { shop_id } = req.params;
    const shop = await Shop.findOne({ shop_id }).lean();
    if (!shop) return notFound(res, "shop not found");

    const owner = await User.findOne({ user_id: shop.owner_user_id }).lean();

    return res.json({
      success: true,
      data: {
        shop_id: shop.shop_id,
        plot_id: shop.plot_id,
        owner_user_id: shop.owner_user_id,
        owner_username: owner ? owner.username : null,
        shop_name: shop.shop_name || null,
        items: shop.items || [],
        created_at: shop.created_at,
        updated_at: shop.updated_at,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.buyFromShop = async function buyFromShop(req, res, next) {
  let session;
  try {
    session = await Shop.startSession();
  } catch (_e) {
    return res.status(500).json({ success: false, message: "db session unavailable" });
  }

  try {
    const user = req.user;
    const { shop_id } = req.params;
    const { item_id, quantity } = req.body || {};

    if (!shop_id) return badRequest(res, "shop_id required");
    if (!item_id || typeof item_id !== "string") return badRequest(res, "item_id required");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return badRequest(res, "invalid quantity");

    await session.withTransaction(async () => {
      const shop = await Shop.findOne({ shop_id }).session(session);
      if (!shop) throw Object.assign(new Error("shop not found"), { statusCode: 404 });

      const sellerId = shop.owner_user_id;
      if (sellerId === user.user_id) throw Object.assign(new Error("cannot buy from own shop"), { statusCode: 400 });

      const idx = shop.items.findIndex((i) => i.item_id === item_id);
      if (idx < 0) throw Object.assign(new Error("item not found"), { statusCode: 404 });

      const item = shop.items[idx];
      const available = Number(item.quantity);
      const unitPrice = Number(item.price);

      if (!Number.isFinite(available) || available < qty) {
        throw Object.assign(new Error("insufficient stock"), { statusCode: 400 });
      }

      const gross = roundMoney(unitPrice * qty);
      const tax = roundMoney(gross * TAX_RATE);
      const net = roundMoney(gross - tax);

      const buyer = await EconomyAccount.findOneAndUpdate(
        { user_id: user.user_id, balance: { $gte: gross } },
        { $inc: { balance: -gross }, $set: { updated_at: new Date() } },
        { new: true, session }
      );
      if (!buyer) throw Object.assign(new Error("insufficient balance"), { statusCode: 400 });

      await EconomyAccount.findOneAndUpdate(
        { user_id: sellerId },
        { $inc: { balance: net }, $set: { updated_at: new Date() } },
        { upsert: true, new: true, session }
      );

      await creditTreasury(session, tax);

      shop.items[idx].quantity = available - qty;
      shop.updated_at = new Date();
      await shop.save({ session });

      await ShopTransaction.create(
        [
          {
            tx_id: crypto.randomUUID(),
            shop_id: shop.shop_id,
            plot_id: shop.plot_id,
            buyer_user_id: user.user_id,
            seller_user_id: sellerId,
            item_id,
            quantity: qty,
            unit_price: unitPrice,
            gross_amount: gross,
            tax_amount: tax,
            net_amount: net,
            created_at: new Date(),
            meta: {},
          },
        ],
        { session }
      );

      res.locals.buyResult = { gross, tax, net, new_balance: buyer.balance };
    });

    return res.json({ success: true, ...res.locals.buyResult });
  } catch (err) {
    const msg = String(err && err.message ? err.message : "");
    if (msg.includes("Transaction numbers are only allowed") || msg.includes("replica set")) {
      return res.status(500).json({ success: false, message: "mongodb transactions require a replica set" });
    }
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    session.endSession();
  }
};

module.exports.adminRemoveShop = async function adminRemoveShop(req, res, next) {
  try {
    const { shop_id } = req.params;
    const shop = await Shop.findOne({ shop_id });
    if (!shop) return notFound(res, "shop not found");

    await Plot.findOneAndUpdate(
      { plot_id: shop.plot_id },
      { $set: { owner_user_id: null, occupied: false, updated_at: new Date() } }
    );
    await Shop.deleteOne({ shop_id });

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

module.exports.listMyPlots = async function listMyPlots(req, res, next) {
  try {
    const user = req.user;
    const plots = await Plot.find({ owner_user_id: user.user_id, occupied: true }).lean();
    return res.json({ success: true, data: plots });
  } catch (err) {
    return next(err);
  }
};

module.exports.listMyShops = async function listMyShops(req, res, next) {
  try {
    const user = req.user;
    const limit = safeLimit(req.query.limit, 50, 200);
    const shops = await Shop.find({ owner_user_id: user.user_id })
      .sort({ updated_at: -1, created_at: -1 })
      .limit(limit)
      .select("shop_id plot_id shop_name created_at updated_at")
      .lean();
    return res.json({ success: true, data: shops });
  } catch (err) {
    return next(err);
  }
};

module.exports.adminListPlots = async function adminListPlots(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const plots = await Plot.find({ occupied: true }).sort({ updated_at: -1 }).limit(limit).lean();
    return res.json({ success: true, data: plots });
  } catch (err) {
    return next(err);
  }
};

module.exports.getTreasury = async function getTreasury(req, res, next) {
  try {
    const now = new Date();
    const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const treasury = await Treasury.findOne({ treasury_id: TREASURY_ID }).lean();
    const total = treasury ? Number(treasury.total_balance || 0) : 0;

    const [last24Agg, last7Agg] = await Promise.all([
      ShopTransaction.aggregate([
        { $match: { created_at: { $gte: d24 } } },
        { $group: { _id: null, sum: { $sum: "$tax_amount" } } },
      ]),
      ShopTransaction.aggregate([
        { $match: { created_at: { $gte: d7 } } },
        { $group: { _id: null, sum: { $sum: "$tax_amount" } } },
      ]),
    ]);

    const last_24h = last24Agg && last24Agg[0] ? roundMoney(last24Agg[0].sum) : 0;
    const last_7d = last7Agg && last7Agg[0] ? roundMoney(last7Agg[0].sum) : 0;

    return res.json({
      success: true,
      total_tax_collected: roundMoney(total),
      last_24h,
      last_7d,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.getShopAnalytics = async function getShopAnalytics(req, res, next) {
  try {
    const { shop_id } = req.params;
    const shop = await Shop.findOne({ shop_id }).lean();
    if (!shop) return notFound(res, "shop not found");

    const txAgg = await ShopTransaction.aggregate([
      { $match: { shop_id } },
      {
        $group: {
          _id: null,
          total_sales: { $sum: 1 },
          total_earnings: { $sum: "$net_amount" },
          total_tax_paid: { $sum: "$tax_amount" },
        },
      },
    ]);

    const totals = txAgg && txAgg[0] ? txAgg[0] : { total_sales: 0, total_earnings: 0, total_tax_paid: 0 };

    const mostSoldAgg = await ShopTransaction.aggregate([
      { $match: { shop_id } },
      { $group: { _id: "$item_id", qty: { $sum: "$quantity" } } },
      { $sort: { qty: -1 } },
      { $limit: 1 },
    ]);

    const most_sold_item = mostSoldAgg && mostSoldAgg[0] ? mostSoldAgg[0]._id : null;

    return res.json({
      success: true,
      data: {
        shop_id,
        total_sales: Number(totals.total_sales || 0),
        total_earnings: roundMoney(totals.total_earnings || 0),
        total_tax_paid: roundMoney(totals.total_tax_paid || 0),
        most_sold_item,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports.getShopHistory = async function getShopHistory(req, res, next) {
  try {
    const { shop_id } = req.params;
    const limit = safeLimit(req.query.limit, 20, 100);

    const shop = await Shop.findOne({ shop_id }).lean();
    if (!shop) return notFound(res, "shop not found");

    const tx = await ShopTransaction.find({ shop_id })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, data: tx });
  } catch (err) {
    return next(err);
  }
};
