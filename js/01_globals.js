/**
 * Feral Simulation - File 1: Global State & Constants
 * Updated for Turtle WoW Patch 1.18 (Feral Cat)
 * Includes Boss Armor Database
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
    "simTime", "simCount", 
    
    // Player Stats
    "stat_str", "stat_agi", "stat_ap", 
    "stat_hit", "stat_crit", "stat_haste",
    "stat_wep_dmg_min", "stat_wep_dmg_max", "stat_wep_skill",
    "mana_pool",

    // Enemy Settings
    "enemy_level", "enemy_armor", "enemy_can_bleed",
    "enemy_type", 
    "enemy_boss_select",

    // Enemy Debuffs
    "debuff_major_armor", 
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

    // Buffs & Consumables (UPDATED to Checkboxes)
    "consum_elemental", "consum_consecrated",
    "consum_mongoose", "consum_potion_quickness",
    
    "consum_food_str", "consum_food_agi", "consum_food_haste",
    
    "consum_scorpok", "consum_roids",
    
    "consum_juju_might", "consum_firewater", "consum_juju_power",

    // Raid Buffs
    "buff_motw", "buff_kings", "buff_might", "buff_bs",
    "buff_lotp", "buff_tsa", 
    "buff_wf_totem", "buff_goa_totem", "buff_soe_totem",
    "buff_warchief", // New
    
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
    // Removed Idol as requested
    bottom: ["Main Hand", "Off Hand"]
};

// Base Stats (Level 60 - Turtle WoW 1.18)
const RACE_STATS = {
    "Tauren": { str: 70, agi: 55, sta: 72, int: 95, spi: 112, ap: 295, crit: 3.65, speed: 1.0, minDmg: 72, maxDmg: 97 }, 
    "NightElf": { str: 62, agi: 65, sta: 69, int: 100, spi: 110, ap: 295, crit: 3.65, speed: 2.0, minDmg: 72, maxDmg: 97 }
};

// Combat Constants
const CONSTANTS = {
    GCD: 1.0,
    ENERGY_TICK: 2.0,
    TICK_AMOUNT: 20,
    HIT_CAP: 9.0,
    GLANCE_PENALTY: 0.3
};

// Simulation Object
function SimObject(id, name) { 
    this.id = id; 
    this.name = name; 
    this.config = {}; 
    this.results = null; 
}

// Boss Armor Database
const BOSS_PRESETS = [
    { group: "World", name: "Apprentice Training Dummy", armor: 100 },
    { group: "World", name: "Expert Training Dummy", armor: 3000 },
    { group: "World", name: "Heroic Training Dummy", armor: 4211 },
    
    { group: "Naxxramas", name: "Most Bosses", armor: 4211 },
    { group: "Naxxramas", name: "Loatheb, Patch, Thaddius", armor: 4611 },
    { group: "Naxxramas", name: "Faerlina, Noth", armor: 3850 },
    { group: "Naxxramas", name: "Gothik, Kel'Thuzad", armor: 3402 },

    { group: "AQ40", name: "Most Bosses", armor: 4211 },
    { group: "AQ40", name: "Emperor Vek'lor", armor: 3833 },
    { group: "AQ40", name: "The Prophet Skeram", armor: 3402 },

    { group: "BWL", name: "All Bosses", armor: 4211 },

    { group: "Molten Core", name: "Most Bosses", armor: 4211 },
    { group: "Molten Core", name: "Sulfuron Harbinger", armor: 4786 },
    { group: "Molten Core", name: "Gehennas, Lucifron, Shazzrah", armor: 3402 },

    { group: "Kara 40", name: "Most Bosses", armor: 4211 },
    { group: "Kara 40", name: "Krull", armor: 4752 },
    { group: "Kara 40", name: "Rook, Rupturan, Mephistroth", armor: 4611 },
    { group: "Kara 40", name: "Echo, Sanv Tasdal", armor: 3850 },
    { group: "Kara 40", name: "Bishop", armor: 3402 },

    { group: "Emerald Sanctum", name: "Solnius", armor: 4712 },
    { group: "Emerald Sanctum", name: "Erennius", armor: 4912 },

    { group: "Zul'Gurub", name: "Most Bosses", armor: 3402 },
    { group: "Zul'Gurub", name: "Bloodlord Mandokir", armor: 4211 },
    { group: "Zul'Gurub", name: "High Priest Thekal", armor: 3850 },

    { group: "AQ20", name: "Most Bosses", armor: 4211 },
    { group: "AQ20", name: "Moam", armor: 4113 },
    { group: "AQ20", name: "Buru the Gorger", armor: 3402 },

    { group: "Kara 10", name: "Lord Blackwald", armor: 4325 },
    { group: "Kara 10", name: "Howlfang, Moroes", armor: 3892 },
    { group: "Kara 10", name: "Grizikil, Araxxna", armor: 3044 },

    { group: "World Bosses", name: "Ostarius", armor: 5980 },
    { group: "World Bosses", name: "Dark Reaver of Karazhan", armor: 4285 },
    { group: "World Bosses", name: "Azuregos", armor: 4211 },
    { group: "World Bosses", name: "Nightmare Dragons", armor: 4211 },
    { group: "World Bosses", name: "Lord Kazzak", armor: 4211 },
    { group: "World Bosses", name: "Omen", armor: 4186 },
    { group: "World Bosses", name: "Nerubian Overseer", armor: 3761 },

    { group: "Silithus", name: "Prince Thunderaan", armor: 4213 },
    { group: "Silithus", name: "Lord Skwol", armor: 4061 },

    { group: "Other", name: "Onyxia", armor: 4211 },
    { group: "Other", name: "UBRS: Gyth", armor: 4061 },
    { group: "Other", name: "UBRS: Lord Valthalak", armor: 3400 },
    { group: "Other", name: "Strat UD: Atiesh", armor: 3850 }
];