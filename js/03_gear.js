/**
 * Turtle WoW Feral Sim - File 3: Gear Planner Logic & Database
 * Handles Item Loading, Selection, and Stat Aggregation for Feral
 */

var ITEM_ID_MAP = {}; // Cache for fast lookup
var GEAR = {
    Head: null, Neck: null, Shoulder: null, Back: null, Chest: null, Wrist: null,
    Hands: null, Waist: null, Legs: null, Feet: null, Finger1: null, Finger2: null,
    Trinket1: null, Trinket2: null, MainHand: null, OffHand: null, Idol: null
};

// ============================================================================
// DATABASE LOADING
// ============================================================================

async function loadDatabase() {
    showProgress("Loading Database...");
    try {
        updateProgress(20);

        // Fetch JSONs
        const [rItems, rEnchants] = await Promise.all([
            fetch('items.json'), // Ensure this file has physical stats!
            fetch('enchants.json')
        ]);

        if (!rItems.ok) throw new Error("Items DB Error " + rItems.status);
        if (!rEnchants.ok) throw new Error("Enchants DB Error " + rEnchants.status);

        const items = await rItems.json();
        const enchants = await rEnchants.json();
        updateProgress(60);

        // Process Items
        ITEM_DB = items.filter(i => {
            // Filter Logic for Feral
            // 1. Must be equippable by Druid (Class Mask 1024/512 or generic)
            // Note: DB usually uses bitmask. Let's assume standard checks or "allowableClasses"
            
            // 2. Remove pure Cloth caster trash (low armor, no str/agi) if desirable
            // But keep high level items.
            if ((i.quality || 0) < 3 && i.slot !== "Idol" && i.slot !== "Relic") return false; // Only Rare+
            if (i.level < 40 && i.slot !== "Idol") return false; 

            // 3. Stat check: Needs Str, Agi, AP, Hit, or Crit
            // If an item has ONLY Int and Spirit and SpellPower, filter it out to reduce list size
            // (Simplified check)
            var hasPhysStats = (i.strength > 0 || i.agility > 0 || hasEffect(i, "attackPower") || hasEffect(i, "crit") || hasEffect(i, "hit"));
            var isWeapon = (i.slot === "MainHand" || i.slot === "TwoHand");
            var isIdol = (i.slot === "Idol" || i.slot === "Relic");
            
            // Keep if it has physical stats OR is a weapon/idol
            if (!hasPhysStats && !isWeapon && !isIdol) return false;

            return true;
        });

        // Sort by Item Level desc
        ITEM_DB.sort((a, b) => b.level - a.level);

        // Build Map
        ITEM_DB.forEach(i => ITEM_ID_MAP[i.id] = i);
        ENCHANT_DB = enchants;

        updateProgress(100);
        showProgress("Database Ready");
        
        // Hide overlay after short delay
        setTimeout(() => { document.getElementById("progressOverlay").classList.add("hidden"); }, 500);

        // Init UI Selectors
        buildGearUI();
        
        // Load defaults if empty (Optional)
        // loadDefaultGear();

    } catch (e) {
        console.error(e);
        showProgress("Error: " + e.message);
    }
}

function hasEffect(item, effectName) {
    if (!item.effects) return false;
    // Check direct effect keys if flat structure
    if (item.effects[effectName]) return true;
    // Check array if "custom" or list
    return false;
}

// ============================================================================
// GEAR CALCULATION
// ============================================================================

function calcGearStats() {
    // 1. Reset Totals
    var stats = {
        str: 0,
        agi: 0,
        ap: 0,
        crit: 0,
        hit: 0,
        haste: 0,
        weaponDps: 55.0, // Default paw
        weaponSpeed: 1.0, // Base
    };

    // 2. Iterate Equipped Items
    for (var slot in GEAR) {
        var item = GEAR[slot];
        if (item) {
            // Base Stats
            stats.str += item.strength || 0;
            stats.agi += item.agility || 0;
            
            // Weapon Info
            if (slot === "MainHand" || slot === "TwoHand") {
                // For Druids, Weapon DPS only matters if "Feral Attack Power" exists
                // OR for Omen procs (Speed). 
                // Turtle WoW specific: Some weapons have Feral AP.
                // Standard Logic:
                if (item.dps) stats.weaponDps = item.dps; // Placeholder
                if (item.speed) stats.weaponSpeed = item.speed;
            }

            // Effects (AP, Crit, Hit)
            if (item.effects) {
                stats.ap += (item.effects.attackPower || 0);
                stats.crit += (item.effects.crit || 0); // Assuming standardized naming in JSON
                stats.hit += (item.effects.hit || 0);
                stats.haste += (item.effects.haste || 0);
                
                // Turtle Specific: Feral AP
                stats.ap += (item.effects.feralAttackPower || 0);
            }
        }
    }

    // 3. Apply Buffs (Basic ones that add flat stats)
    // Note: Buffs are usually handled in Global State or separately, 
    // but if we want them in the UI inputs, we add them here.
    // For now, we stick to GEAR stats in the "Character Stats" inputs, 
    // and Buffs are separate checkboxes that the Engine applies? 
    // OR we sum everything here. 
    // DECISION: Inputs should reflect "Unbuffed" or "Current Gear" stats. 
    // Buffs like MotW are calculated in Engine or here?
    // Let's calculate TOTAL here to fill the inputs, so the User sees the final values.

    if (getVal("buff_motw")) { stats.str += 12; stats.agi += 12; } // Improved MotW Rank 7
    if (getVal("buff_kings")) { /* Multiplier handled later or here? Usually multiplier. */ }
    if (getVal("buff_might")) { stats.ap += 185; } // Imp Might
    if (getVal("buff_juju_power")) { stats.str += 30; }
    if (getVal("buff_juju_might")) { stats.ap += 40; }
    if (getVal("buff_mongoose")) { stats.agi += 25; stats.crit += 2; }
    
    // 4. Convert Attributes to Combat Stats
    // Formula: 
    // Str -> 2 AP
    // Agi -> 1 AP (Turtle?) + 0.05% Crit
    
    var totalStr = stats.str;
    var totalAgi = stats.agi;
    
    // Kings (+10% Stats)
    if (getVal("buff_kings")) {
        totalStr *= 1.1;
        totalAgi *= 1.1;
    }

    var derivedAP = (totalStr * 2); 
    // Note: On Standard Vanilla, Agi does NOT give AP to Druids. 
    // If Turtle WoW changed this, uncomment the next line:
    // derivedAP += totalAgi; 

    var totalAP = stats.ap + derivedAP;
    var totalCrit = stats.crit + (totalAgi * 0.05);
    
    // 5. Update UI Inputs
    updateInput("stat_strength", Math.floor(totalStr));
    updateInput("stat_agility", Math.floor(totalAgi));
    updateInput("stat_ap", Math.floor(totalAP));
    updateInput("stat_crit", totalCrit, true);
    updateInput("stat_hit", stats.hit, true);
    updateInput("stat_haste", stats.haste, true);
    
    // Weapon details (User might want to see them)
    // Only update if not manual
    if (!document.getElementById("manual_stats").checked) {
        // We write back to the inputs
        // Note: For Feral, Weapon DPS input in UI usually refers to "Feral Wpn Dmg"
        // which is calculated from AP. 
        // But the input "weapon_dps" might refer to the EQUIPPED weapon's dps for Omen calcs.
        document.getElementById("weapon_speed").value = stats.weaponSpeed.toFixed(1);
    }
}

function updateInput(id, val, isFloat) {
    var el = document.getElementById(id);
    if (!el) return;
    
    var isManual = document.getElementById("manual_stats").checked;
    if (isManual) {
        el.disabled = false;
        return; // Don't overwrite
    }
    
    el.disabled = true;
    el.value = isFloat ? val.toFixed(2) : Math.floor(val);
}

// ============================================================================
// UI BUILDER
// ============================================================================

function buildGearUI() {
    var container = document.getElementById("gearListContainer");
    if (!container) return;
    container.innerHTML = ""; // Clear
    
    var slots = ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", 
                 "Hands", "Waist", "Legs", "Feet", "Finger1", "Finger2", 
                 "Trinket1", "Trinket2", "MainHand", "OffHand", "Idol"];
                 
    slots.forEach(slot => {
        var div = document.createElement("div");
        div.className = "gear-slot-row";
        
        var label = document.createElement("span");
        label.className = "slot-label";
        label.innerText = slot;
        
        var select = document.createElement("select");
        select.className = "gear-select";
        select.dataset.slot = slot;
        select.onchange = (e) => equipItem(slot, e.target.value);
        
        // Populate Options
        var slotItems = filterItemsBySlot(slot);
        
        var defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.innerText = "- None -";
        select.appendChild(defaultOpt);
        
        slotItems.forEach(item => {
            var opt = document.createElement("option");
            opt.value = item.id;
            opt.innerText = item.name; // + " (ilvl " + item.level + ")";
            select.appendChild(opt);
        });
        
        div.appendChild(label);
        div.appendChild(select);
        container.appendChild(div);
    });
}

function filterItemsBySlot(slot) {
    // Basic mapping
    var lookupSlot = slot;
    if (slot === "Finger1" || slot === "Finger2") lookupSlot = "Finger";
    if (slot === "Trinket1" || slot === "Trinket2") lookupSlot = "Trinket";
    
    return ITEM_DB.filter(i => i.slot === lookupSlot || (lookupSlot === "MainHand" && i.slot === "TwoHand"));
}

function equipItem(slot, id) {
    if (!id) {
        GEAR[slot] = null;
    } else {
        GEAR[slot] = ITEM_ID_MAP[id];
    }
    calcGearStats();
}

// Global hook for manual checkbox
document.getElementById("manual_stats").addEventListener("change", calcGearStats);