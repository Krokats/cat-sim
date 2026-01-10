/**
 * Feral Simulation - File 1: Global State & Constants
 * Updated for Turtle WoW Patch 1.18 (Feral Cat)
 * Includes new Buffs, Consumables, and Debuff Logic.
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

    // Enemy Settings
    "enemy_level", "enemy_armor", "enemy_can_bleed",
    "enemy_type", // New: Undead or Other

    // Enemy Debuffs (New)
    "debuff_major_armor", // Sunder vs IEA
    "debuff_eskhandar",
    "debuff_ff",
    "debuff_cor",

    // Rotation / Logic
    "rota_position",
    "use_rip", "rip_cp",
    "use_fb", "fb_energy",
    "use_reshift", "reshift_energy",
    "use_tf",
    "use_rake",
    "use_shred", "use_claw",
    "use_ff",

    // Gear Specifics
    "set_t05_4p", "meta_wolfshead", "item_mcp",           

    // Buffs & Consumables (Reorganized)
    
    // Selectors (Mutually Exclusive)
    "consum_wep",       // Consecrated vs Elemental
    "consum_blasted",   // Scorpok vs ROIDS
    "consum_juju",      // Firewater vs Might
    "consum_food",      // Str vs Agi vs Haste
    
    // Checkboxes
    "consum_mongoose",
    "consum_juju_power", // Stackable
    "consum_potion_quickness",

    // Raid Buffs
    "buff_lotp",
    "buff_motw",        // Select: None, Reg, Imp
    "buff_kings",
    "buff_might",       // Select: None, Reg, Imp
    "buff_tsa",         // Select: None, Reg, Mod(%)
    "buff_bs",          // Select: None, Reg, Imp
    "buff_wf_totem",
    "buff_goa_totem",
    "buff_soe_totem",
    
    // Talents
    "tal_ferocity", "tal_feral_aggression", "tal_open_wounds",
    "tal_sharpened_claws", "tal_primal_fury", "tal_blood_frenzy",
    "tal_imp_shred", "tal_predatory_strikes", "tal_ancient_brutality",
    "tal_berserk", "tal_hotw", "tal_carnage", "tal_lotp",
    "tal_furor", "tal_nat_wep", "tal_nat_shapeshifter", "tal_omen"
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"]
};

// Base Stats (Level 60 - Turtle WoW 1.18)
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

const CONSTANTS = {
    GCD: 1.0,
    ENERGY_TICK: 2.0,
    TICK_AMOUNT: 20,
    HIT_CAP: 9.0,
    GLANCE_PENALTY: 0.3
};

function SimObject(id, name) { 
    this.id = id; 
    this.name = name; 
    this.config = {}; 
    this.results = null; 
}