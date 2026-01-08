/**
 * Turtle WoW Feral Sim - File 1: Global State & Constants
 * Updated for Patch 1.17.2+ (Reshift, Open Wounds, etc.)
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

// Defines all HTML Input IDs that are saved/loaded and used in calculation
var CONFIG_IDS = [
    // Simulation Settings
    "simTime", "simIter", "calcMethod",

    // Player Stats (Base & Gear)
    "stat_strength", "stat_agility", "stat_ap", 
    "stat_crit", "stat_hit", "stat_haste",
    "weapon_dps", "weapon_speed", // Important for White Hits
    
    // Enemy
    "enemy_level", "enemy_armor", 

    // Talents & Turtle Specifics
    "talent_furor",         // 5/5 Furor -> 40 Energy on shift
    "talent_open_wounds",   // Open Wounds (Claw ignores armor / dmg boost on bleeding targets?) -> Turtle changed this: Rake buffs Claw
    "talent_imp_shred",     // Improved Shred cost reduction
    "talent_imp_claws",     // Crit chance for Claw/Rake
    "talent_omen",          // Omen of Clarity
    "meta_wolfshead",       // Wolfshead Helm Effect (Item or Enchant on Turtle)
    "meta_reshift",         // Uses "Reshift" Spell instead of Macro (Turtle specific)

    // Rotation Priority
    "conf_prio_rip",        // Use Rip?
    "conf_prio_bite",       // Use Ferocious Bite?
    "conf_use_rake",        // Maintain Rake (Crucial for Open Wounds)
    "conf_min_energy",      // Pool Energy threshold
    "conf_use_tigersfury",  // Use Tiger's Fury logic

    // Buffs & Consumables
    "buff_motw", "buff_kings", "buff_might", "buff_horn",
    "buff_mongoose", "buff_giants", "buff_juju_power", "buff_juju_might",
    "buff_winterfall", "buff_dumpling", "buff_scorpok",
    "buff_blasted_str", "buff_blasted_agi",
    "buff_elemental_stone" // Elemental Sharpening Stone
];

// ============================================================================
// 2. SIMULATION STATE OBJECT (The "Engine" State)
// ============================================================================
var State = {
    t: 0,               // Current Time
    duration: 60,       // Max Duration
    
    // Resources
    energy: 100,        // 0 - 100
    combo: 0,           // 0 - 5
    mana: 2000,         // Mana pool (relevant for Shifting costs)
    
    // Timers
    gcdEnd: 0,          // Global Cooldown Finish Time
    swingTimer: 0,      // Next Auto-Attack Time
    energyTick: 0,      // Next Energy Regen Tick (2s interval)
    
    // Auras (Buffs/Debuffs) - Value is expiration timestamp (0 = inactive)
    buff_tigersfury: 0,
    buff_clearcasting: 0, // Omen of Clarity proc
    
    debuff_faeriefire: 0,
    debuff_rake: 0,
    debuff_rip: 0,
    
    // Cooldowns - Value is ready timestamp
    cd_tigersfury: 0,
    cd_reshift: 0,      // Generic Shifting CD
    cd_faeriefire: 0,
    
    // Stats Snapshot (Dynamic stats during combat)
    currentAP: 0,
    currentCrit: 0,
    currentHit: 0,
    currentHaste: 1.0,  // Multiplier (1.0 = 100%)
};

// ============================================================================
// 3. CONSTANTS & MAPPINGS
// ============================================================================

// Standard Level-Based Constants (Lvl 60)
var LEVEL_STATS = {
    60: { critPerAgi: 0.05, hitCap: 9.0, glancePenalty: 0.35 } 
    // Note: Turtle might differ slightly, but 0.05% crit per Agi is standard vanilla
};

// Energy
var ENERGY_TICK_RATE = 2.0;
var ENERGY_PER_TICK = 20;

// Ability Costs (Base)
var COSTS = {
    shred: 60,      // -12 with talent
    claw: 45,       // -5 with talent
    rake: 40,       // -5 with talent
    rip: 30,
    bite: 35,
    tigersfury: 30,
    faeriefire: 0,  // In Form
    shift: 400      // Mana Cost estimate
};

// Turtle WoW Specifics
// "Open Wounds": Rake increases Claw damage. 
// Values need to be calibrated in Engine based on latest patch data.