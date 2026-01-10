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

// Configuration IDs mapped to UI elements (Input/Checkbox)
// Used for Save/Load/Import/Export
var CONFIG_IDS = [
    // Sim Settings
    "simTime", "simCount", "calcMethod",
    
    // Player Stats (Manual Overrides / Base)
    "stat_str", "stat_agi", "stat_ap", 
    "stat_hit", "stat_crit", "stat_haste",
    "stat_wep_dmg_min", "stat_wep_dmg_max", "stat_wep_skill",
    "mana_pool", // For powershifting limits

    // Enemy Settings
    "enemy_level", "enemy_armor", "enemy_can_bleed",

    // Rotation / Logic
    "rota_position",      // Back (Shred) vs Front (Claw)
    "rota_powershift",    // Enable Powershifting
    "rota_rake",          // Use Rake (Open Wounds)
    "rota_bite",          // Use Ferocious Bite at 5 CP
    "rota_aggressive_shift", // Ignore energy tick timer

    // Gear Specifics / Sets (Auto-detected or Manual)
    "set_t05_4p",         // Energy restore proc
    "meta_wolfshead",     // Wolfshead Helm effect
    "item_mcp",           // Manual Crowd Pummeler active

    // Buffs & Consumables
    "buff_motw", "buff_bok", "buff_might", "buff_battle_shout",
    "buff_trueshot", "buff_leader_pack", 
    "buff_mongoose", "buff_juju_power", "buff_juju_might", "buff_winterfall",
    "buff_zandalar", "buff_onyxia", "buff_songflower", "buff_warchief",
    "buff_food_str", "buff_food_agi",

    // Talents
    "tal_ferocity", "tal_feral_aggression", "tal_open_wounds", "tal_sharpened_claws",
    "tal_primal_fury", "tal_blood_frenzy", "tal_imp_shred", "tal_predatory_strikes",
    "tal_ancient_brutality", "tal_berserk", "tal_hotw", "tal_carnage",
    "tal_lotp", "tal_furor", "tal_nat_wep", "tal_nat_shapeshifter", "tal_omen",

    // Rotation Settings
    "use_rip", "rip_cp",
    "use_fb", "fb_energy",
    "use_reshift", "reshift_energy",
    "use_tf",
    "use_rake",
    "use_shred", "use_claw",
    "use_ff"
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"] // Added Idol for 1.18
};

// Base Stats (Level 60 - Turtle WoW Feral)
const RACE_STATS = {
    "Tauren":   { str: 70, agi: 55, sta: 72, int: 95,  spi: 112, ap: 295, crit: 3.65, speed: 1.0, minDmg: 72, maxDmg: 97 }, 
    "NightElf": { str: 62, agi: 65, sta: 69, int: 100, spi: 110, ap: 295, crit: 3.65, speed: 2.0, minDmg: 72, maxDmg: 97 }
};

// Combat Constants
const CONSTANTS = {
    GCD: 1.0,           // Cat GCD is 1.0s fixed
    ENERGY_TICK: 2.0,   // Energy regenerates every 2s
    TICK_AMOUNT: 20,    // 20 Energy per tick
    HIT_CAP: 8.0,       // Turtle WoW 1.18 Hit Cap for yellow attacks (Special)
    GLANCE_PENALTY: 0.35 // Base Glancing Blow penalty (reduced by weapon skill)
};

// Simulation Object Constructor
function SimObject(id, name) { 
    this.id = id; 
    this.name = name; 
    this.config = {}; 
    this.results = null; 
}