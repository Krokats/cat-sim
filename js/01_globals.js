/**
 * Feral Simulation - File 1: Global State & Constants
 */

// ============================================================================
// 1. GLOBAL STATE
// ============================================================================
var SIM_LIST = [];
var ACTIVE_SIM_INDEX = 0;
var SIM_DATA = null;
var CURRENT_VIEW = 'avg'; // 'avg' or 'log'
var toastTimer = null;

var ITEM_DB = [];
var ENCHANT_DB = [];
var GEAR_SELECTION = {};
var ENCHANT_SELECTION = {};

// Diese Liste definiert, welche HTML-IDs beim Speichern/Laden und für die Simulation
// berücksichtigt werden. IDs müssen exakt mit index.html übereinstimmen.
var CONFIG_IDS = [
    // --- General Sim Settings ---
    "maxTime", "simCount", "calcMethod",

    // --- Player Stats (Manual Overrides) ---
    "manual_stats",
    "statStr", "statAgi", "statInt", 
    "statAp", "statCrit", "statHit", "statHaste",
    "statWpnSkill", "statFeralAp",

    // --- Buffs & Consumables ---
    "buff_motw", "buff_bok", "buff_might",
    "buff_mongoose", "buff_juju", "buff_roids",
    "buff_songflower", "buff_wcb",

    // --- Enemy Settings ---
    "enemy_level", "conf_armor", "conf_canBleed",

    // --- Feral Rotation / Logic ---
    "conf_behind",      // Shred vs Claw
    "conf_reshift",     // Powershift Logic
    "conf_useRake",     // Open Wounds support
    "conf_useBite",     // Finisher logic
    "conf_aggroShift"   // Ignore Energy Ticks
];

// Mapping für Gear Slots (Standardisiert)
var SLOT_IDS = [
    "Head", "Neck", "Shoulder", "Back", "Chest", "Wrist",
    "Hands", "Waist", "Legs", "Feet", "Finger1", "Finger2",
    "Trinket1", "Trinket2", "MainHand", "Idol" // OffHand existiert für Ferals meist nicht (2H Waffen)
];