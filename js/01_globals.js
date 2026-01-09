/**
 * Feral Simulation - File 1: Global State & Constants
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

// Configuration IDs mapped to index.html inputs
var CONFIG_IDS = [
    // General
    "maxTime", "simCount", "calcMethod",
    
    // Player Stats (Manual / Overrides)
    "stat_str", "stat_agi", "stat_ap", "stat_crit", "stat_hit", "stat_haste", "stat_wps", // wps = weapon damage per second (base)
    "stat_int", "stat_mana", // For Powershifting
    "manual_stats", "char_race",
    
    // Enemy
    "enemy_level", "enemy_armor", "enemy_can_bleed",
    
    // Rotation & Tactics
    "pos_behind", "use_rake", "use_bite", "use_powershift", "aggressive_shift",
    "energy_refund_chance", // Wolfshead + Furor total energy return
    
    // Consumables / Buffs
    "buff_motw", "buff_bok", "buff_blessing_might", "buff_trueshot",
    "buff_kings", "buff_str_scroll", "buff_agi_scroll",
    "buff_food", "buff_juju_power", "buff_juju_might",
    "buff_mongoose", "buff_giants", "buff_winterfall", "buff_leader",
    
    // Weights
    "weight_ap", "weight_crit", "weight_hit", "weight_str", "weight_agi", "weight_haste"
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"]
};

// Base Stats (Level 60 Druid - Turtle/Vanilla Hybrid approximations)
const RACE_STATS = {
    "Tauren": { str: 85, agi: 55, stam: 82, int: 75, spirit: 82, hit: 0, crit: 0 }, // Higher Base HP/Str
    "NightElf": { str: 75, agi: 75, stam: 79, int: 80, spirit: 80, hit: 0, crit: 1.0 } // 1% Dodge/Crit base diff
};

// Simulation Object Constructor
function SimObject(id, name) { this.id = id; this.name = name; this.config = {}; this.results = null; }