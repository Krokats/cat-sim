/**
 * Feral Simulation - File 1: Global State & Constants
 * Updated for Turtle WoW Patch 1.18 (Feral Cat)
 * Strict adherence to provided formulas.
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
    "mana_pool",

    // Enemy Settings
    "enemy_level", "enemy_armor", "enemy_can_bleed",

    // Rotation / Logic - Updated based on Prompt
    "rota_position",      // Back vs Front
    
    // Rotation Toggles & Thresholds
    "use_rip", "rip_cp",  // "Rip_active", "RipCP"
    "use_fb", "fb_energy", // "FB_active", "FB_Energylvl"
    "use_reshift", "reshift_energy", // "RS_active", "Reshift_Energylv"
    "use_tf", // "TF_active"
    "use_rake", // "Rake_active"
    "use_shred", // "Shred_active"
    "use_claw", // "Claw_active"
    "use_ff", // "FF_active"

    // Gear Specifics / Sets
    "set_t05_4p",         
    "meta_wolfshead",     
    "item_mcp",           

    // Buffs & Consumables
    "buff_motw", "buff_bok", "buff_might", "buff_battle_shout",
    "buff_trueshot", "buff_leader_pack", 
    "buff_mongoose", "buff_juju_power", "buff_juju_might", "buff_winterfall",
    "buff_zandalar", "buff_onyxia", "buff_songflower", "buff_warchief",
    "buff_food_str", "buff_food_agi",

    // Talents
    "tal_ferocity",         // #/5
    "tal_feral_aggression", // #/5
    "tal_open_wounds",      // 3/3 (Const) - treated as active if logic dictates, but we keep ID for potential override
    "tal_sharpened_claws",  // 3/3 (Const)
    "tal_primal_fury",      // 2/2 (Const)
    "tal_blood_frenzy",     // 2/2 (Const)
    "tal_imp_shred",        // #/2
    "tal_predatory_strikes",// 3/3 (Const)
    "tal_ancient_brutality",// 2/2 (Const)
    "tal_berserk",          // 1/1 (Const)
    "tal_hotw",             // 5/5 (Const)
    "tal_carnage",          // 2/2 (Const)
    "tal_lotp",             // 1/2 (Const) - usually provided via buff, but tracked here
    "tal_furor",            // 5/5 (Const)
    "tal_nat_wep",          // 3/3 (Const)
    "tal_nat_shapeshifter", // #/3
    "tal_omen"              // 1/1 (Const)
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"]
};

// Base Stats (Level 60 - Turtle WoW 1.18)
// Provided in Prompt
const RACE_STATS = {
    "Tauren": { 
        str: 70, agi: 55, sta: 72, int: 95, spi: 112, 
        ap: 295, crit: 3.65, speed: 1.0, 
        minDmg: 72, maxDmg: 97 
    }, 
    "NightElf": { 
        str: 62, agi: 65, sta: 69, int: 100, spi: 110, 
        ap: 295, crit: 3.65, speed: 2.0, 
        minDmg: 72, maxDmg: 97 
    }
};

// Combat Constants
const CONSTANTS = {
    GCD: 1.0,           // Cat GCD is 1.0s fixed
    ENERGY_TICK: 2.0,   // Energy regenerates every 2s
    TICK_AMOUNT: 20,    // 20 Energy per tick (Standard, modified by Berserk)
    HIT_CAP: 9.0,       // Standard Yellow Hit Cap against Boss (Lvl 63)
    GLANCE_PENALTY: 0.3 // Base Glancing Penalty (will be calculated in engine)
};

// Simulation Object Constructor
function SimObject(id, name) { 
    this.id = id; 
    this.name = name; 
    this.config = {}; 
    this.results = null; 
}