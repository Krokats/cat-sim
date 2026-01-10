/**
 * Feral Simulation - File 1: Global State & Constants
 * Updated for Turtle WoW Patch 1.18 (Feral Cat) based on Info.txt
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

// Configuration IDs mapped to UI elements (Input/Checkbox/Select)
// Used for Save/Load/Import/Export and Configuration Reading
var CONFIG_IDS = [
    // Sim Settings
    "simTime", "simCount", "calcMethod",

    // Player Stats (Manual / Base)
    "stat_str", "stat_agi", "stat_ap",
    "stat_hit", "stat_crit", "stat_haste",
    "stat_wep_dmg_min", "stat_wep_dmg_max", "stat_wep_skill",
    "mana_pool",

    // Enemy Settings
    "enemy_level", "enemy_armor", "enemy_can_bleed",
    // Boss Debuffs (Armor Reduction)
    "debuff_sunder",        // Sunder Armor x5 (-2250)
    "debuff_iea",           // Improved Exposed Armor (-2550) - usually exclusive with Sunder
    "debuff_faerie_fire",   // Faerie Fire (-505)
    "debuff_cor",           // Curse of Recklessness (-640)
    "debuff_eskhandar",     // Spirit of Eskhandar (-1200)

    // Rotation Logic (Priorities & Conditions)
    "rota_position",        // Back (Shred) vs Front (Claw)
    "rota_shred",           // Use Shred (if Behind)
    "rota_rake",            // Use Rake (Maintain DoT)
    "rota_rip",             // Use Rip (Finisher)
    "rota_bite",            // Use Ferocious Bite (Finisher)
    "rota_tf",              // Use Tiger's Fury
    "rota_shift",           // Use Powershift (Reshift)
    "rota_ff",              // Maintain Faerie Fire (if not present)
    "rota_rip_cp",          // Min CP for Rip (e.g. 4 or 5)
    "rota_bite_cp",         // Min CP for Bite
    "rota_bite_energy",     // Min Energy for Bite (Pooling)
    "rota_shift_energy",    // Max Energy threshold to Shift (e.g. < 10)

    // Talents (Inputs 0-5 etc.)
    "tal_ferocity", "tal_feral_aggression", "tal_open_wounds",
    "tal_sharpened_claws", "tal_primal_fury", "tal_blood_frenzy",
    "tal_imp_shred", "tal_predatory_strikes", "tal_ancient_brutality",
    "tal_berserk", "tal_hotw", "tal_carnage",
    "tal_lotp", "tal_furor", "tal_nat_weapons",
    "tal_nat_shapeshifter", "tal_ooc",

    // Sets & Idols
    "set_t1_3p", "set_t1_5p", "set_t1_8p",      // Cenarion
    "set_t25_3p", "set_t25_5p",                 // Genesis
    "set_t35_3p", "set_t35_5p",                 // Harness of the Talon
    "idol_selection",                           // Dropdown: Savagery, Emerald Rot, Ferocity, Laceration

    // Specific Items (Flags)
    "item_wolfshead", "item_mcp",

    // Buffs
    "buff_lotp",        // Leader of the Pack (3% Crit)
    "buff_motw",        // Mark of the Wild (Stats)
    "buff_trueshot",    // Trueshot Aura (AP)
    "buff_bok",         // Blessing of Kings (10% Stats)
    "buff_might",       // Blessing of Might (AP)
    "buff_bs",          // Battle Shout (AP)
    "buff_wf",          // Windfury Totem (Extra Attack + AP)
    "buff_goa",         // Grace of Air (Agi)
    "buff_soe",         // Strength of Earth (Str)

    // Consumables
    "cons_mongoose",        // Elixir of Mongoose (Agi/Crit)
    "cons_juju_power",      // Juju Power (Str)
    "cons_juju_might",      // Juju Might (AP) - Exclusive with Firewater
    "cons_firewater",       // Winterfall Firewater (AP)
    "cons_food_str",        // Smoked Desert Dumplings (20 Str)
    "cons_food_agi",        // Grilled Squid/Berry (10 Agi)
    "cons_food_haste",      // Tel'Abim Medley (2% Haste)
    "cons_stone_ap",        // Consecrated Sharpening Stone (100 AP)
    "cons_stone_crit",      // Elemental Sharpening Stone (2% Crit)
    "cons_blasted_str",     // R.O.I.D.S (25 Str)
    "cons_blasted_agi",     // Scorpok Assay (25 Agi)
    "cons_potion_quickness" // Potion of Quickness (Haste)
];

var SLOT_LAYOUT = {
    left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
    right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
    bottom: ["Main Hand", "Off Hand", "Idol"]
};

// Base Stats (Level 60 - from Info.txt)
const RACE_STATS = {
    "Tauren":   { str: 70, agi: 55, sta: 72, int: 95, spi: 112, baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97 },
    "NightElf": { str: 62, agi: 65, sta: 69, int: 100, spi: 110, baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97 }
};

// Combat Constants
const CONSTANTS = {
    GCD: 1.0,           // Cat GCD is 1.0s fixed
    ENERGY_TICK: 2.0,   // Energy regenerates every 2s
    TICK_AMOUNT: 20,    // 20 Energy per tick (Base)
    HIT_CAP: 9.0,       // 9% Yellow Hit Cap vs Lvl 63
    GLANCE_PENALTY_300: 0.35, // 35% penalty at 300 skill vs 315 def
};

// Simulation Object Constructor
function SimObject(id, name) {
    this.id = id;
    this.name = name;
    this.config = {};
    this.results = null;
}
