const REWARD_MAP = Object.freeze({
  Miner: {
    "block_break:stone": { amount: 2, cooldownMs: 1000 },
  },
  Lumberjack: {
    "block_break:log": { amount: 3, cooldownMs: 1200 },
  },
  Farmer: {
    "crop_harvest": { amount: 2, cooldownMs: 1000 },
  },
  Hunter: {
    "mob_kill": { amount: 5, cooldownMs: 1500 },
  },
  Adventurer: {
    "travel_100m": { amount: 3, cooldownMs: 1500 },
  },
  Fisherman: {
    "fish_catch": { amount: 2, cooldownMs: 1500 },
  },
});

module.exports = { REWARD_MAP };
