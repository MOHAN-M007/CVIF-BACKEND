module.exports = {
  MARKET_WORLD: "market",
  TAX_RATE: Number(process.env.MARKET_TAX_RATE || 0.05),
  TREASURY_ID: "main",
  PLOT_LIMIT_DEFAULT: Number(process.env.MARKET_PLOT_LIMIT || 1),
  // flat market spawn + bounds (used by Fabric side for regioning, not enforced here)
  MARKET_BOUNDS: {
    minX: Number(process.env.MARKET_MIN_X || -500),
    maxX: Number(process.env.MARKET_MAX_X || 500),
    minZ: Number(process.env.MARKET_MIN_Z || -500),
    maxZ: Number(process.env.MARKET_MAX_Z || 500),
  },
};
