/**
 * Feral Simulation - File 1: Global State & Constants
 * Updated for Turtle WoW Patch 1.18 (Feral Cat)
 */

// ============================================================================
// 1. GLOBAL STATE
// ============================================================================
var SIM_LIST = [];
var ACTIVE_SIM_INDEX = 0;
var SIM_DATA = null;
var CURRENT_VIEW = 'avg';
var toastTimer = null;

var ITEM_DB = [];
var ENCHANT_DB = [];
var GEAR_SELECTION = {};
var ENCHANT_SELECTION = {};

// Configuration IDs mapped to UI elements
var CONFIG_IDS = [
    // Sim Settings
    "simTime", "simCount", "calcMethod",
    
    // Player Stats
    "stat_str", "stat_agi", "stat_ap", 
    "stat_hit", "stat_crit", "stat_haste",
    "stat_wep_dmg_min", "stat_wep_dmg_max", "stat_wep_skill",
    "mana_pool",

    // Enemy
    "boss_preset", "enemy_armor", 
    "debuff_sunder", "debuff_faerie", "debuff_cor", "debuff_eskhandar",

    // Rotation Settings
    "rota_position",
    "use_ff",
    "use_rip", "rota_rip_cp",
    "use_fb", "rota_fb_energy",
    "use_reshift", "rota_reshift_energy",
    "use_tf",
    "use_rake",
    "use_shred", "use_claw",

    // Gear
    "set_t05_4p", "meta_wolfshead", "item_mcp",

    // Buffs
    "buff_motw", "buff_bok", "buff_might", "buff_battle_shout",
    "buff_trueshot", "buff_leader_pack", "buff_warchief",
    "buff_mongoose", "buff_juju_power", "buff_juju_might", "buff_winterfall",
    "buff_zandalar", "buff_onyxia", "buff_songflower", "buff_dm_north",
    "buff_food_str", "buff_food_agi",

    // Talents (Optionale)
    "tal_ferocity", "tal_feral_aggression", "tal_imp_shred", "tal_nat_shapeshifter"
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"]
};

// Base Stats (Level 60 - Turtle WoW Feral 1.18)
const RACE_STATS = {
    "Tauren":   { str: 70, agi: 55, sta: 72, int: 95,  spi: 112, ap: 295, crit: 3.65, speed: 1.0, minDmg: 72, maxDmg: 97 }, 
    "NightElf": { str: 62, agi: 65, sta: 69, int: 100, spi: 110, ap: 295, crit: 3.65, speed: 2.0, minDmg: 72, maxDmg: 97 }
};

// Boss Armor Database
const BOSS_DB = [
    { name: "Apprentice Training Dummy", armor: 100 },
    { name: "Expert Training Dummy", armor: 3000 },
    { name: "Heroic Training Dummy", armor: 4211 },
    { name: "Kara40: Krull", armor: 4752 },
    { name: "Kara40: Rook, Rupturan...", armor: 4611 },
    { name: "Kara40: Standard Boss", armor: 4211 },
    { name: "Kara40: Echo, Sanv Tasdal", armor: 3850 },
    { name: "Kara40: Bishop", armor: 3402 },
    { name: "Naxx: Loatheb, Patch...", armor: 4611 },
    { name: "Naxx: Standard Boss", armor: 4211 },
    { name: "Naxx: Faerlina, Noth", armor: 3850 },
    { name: "Naxx: Gothik, KT", armor: 3402 },
    { name: "AQ40: Standard Boss", armor: 4211 },
    { name: "AQ40: Vek'lor", armor: 3833 },
    { name: "AQ40: Skeram", armor: 3402 },
    { name: "ES: Solnius", armor: 4712 },
    { name: "ES: Erennius", armor: 4912 },
    { name: "BWL: All Bosses", armor: 4211 },
    { name: "MC: Harbinger", armor: 4786 },
    { name: "MC: Standard Boss", armor: 4211 },
    { name: "MC: Gehennas, Lucifron...", armor: 3402 },
    { name: "AQ20: Standard Boss", armor: 4211 },
    { name: "AQ20: Moam", armor: 4113 },
    { name: "AQ20: Buru", armor: 3402 },
    { name: "Kara10: Blackwald", armor: 4325 },
    { name: "Kara10: Howlfang, Moroes", armor: 3892 },
    { name: "ZG: Mandokir", armor: 4211 },
    { name: "ZG: Thekal, Atiesh", armor: 3850 },
    { name: "ZG: Standard Boss", armor: 3402 },
    { name: "Onyxia / Nefarian", armor: 4211 },
    { name: "World: Ostarius", armor: 5980 },
    { name: "World: Dark Reaver", armor: 4285 },
    { name: "World: Azuregos/Dragons", armor: 4211 },
    { name: "World: Lord Skwol, Gyth", armor: 4061 },
    { name: "World: Thunderaan", armor: 4213 },
];

const DEBUFF_VALUES = {
    sunder: 2550, // IEA/Sunder
    eskhandar: 1200,
    faerie: 505,
    cor: 640
};

// Simulation Object Constructor
function SimObject(id, name) { 
    this.id = id; 
    this.name = name; 
    this.config = {}; 
    this.results = null; 
}