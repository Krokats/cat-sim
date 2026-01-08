/**
 * Feral Simulation - File 3: Gear Planner Logic & Database
 */

var ITEM_ID_MAP = {}; // Cache für schnelle Lookups

// ============================================================================
// GEAR PLANNER LOGIC
// ============================================================================

async function loadDatabase() {
    showProgress("Lade Datenbank...");
    try {
        updateProgress(20);

        // Lade Items und Verzauberungen
        // Wir nutzen relative Pfade, da die Dateien im gleichen Ordner oder Unterordner liegen
        // Falls du sie lokal testest, stelle sicher, dass ein lokaler Server läuft oder die Dateien erreichbar sind.
        // Wir nehmen an, die JSONs sind sauber formatiert wie im Moonkin-Sim.
        const [rItems, rEnchants] = await Promise.all([
            fetch('data/items.json'),
            fetch('data/enchants.json')
        ]);

        if (!rItems.ok) throw new Error("Items DB Error " + rItems.status);
        if (!rEnchants.ok) throw new Error("Enchants DB Error " + rEnchants.status);

        const items = await rItems.json();
        const enchants = await rEnchants.json();
        updateProgress(60);

        // --- ITEM FILTERING FOR FERAL ---
        ITEM_DB = items.filter(i => {
            i.itemLevel = i.level || i.itemLevel || 0;
            
            // Filter Junk
            if ((i.quality || 0) < 2) return false;
            // Level Filter: Nur High-Level Gear (außer spezifische Items wie Wolfshead)
            if (i.itemLevel < 40 && i.id !== 8345 && i.slot !== "Trinket" && i.slot !== "Neck" && i.slot !== "Finger") return false; 

            // CLASS FILTER: 1024 (Druid bitmask check, oder einfach Class-Check wenn vorhanden)
            // Turtle JSONs haben oft 'allowableClasses'. Druid ist oft Bit 11 (1024) oder anders.
            // Wir lassen dies locker, da Feral oft Rogue-Leder trägt.
            
            // SLOT FILTER
            if (!SLOT_IDS.includes(i.slot) && i.slot !== "TwoHand" && i.slot !== "OneHand" && i.slot !== "MainHand") return false;

            // ARMOR TYPE FILTER
            // Feral trägt Leather (2) oder Cloth (1) - aber Cloth selten sinnvoll.
            // Weapons: Mace, Staff, Dagger, Fist, Polearm
            if (i.class === "Weapon" || i.slot === "TwoHand" || i.slot === "MainHand" || i.slot === "OneHand") {
                // Check subclass if available, otherwise allow all typical druid weapons
                // Druids: Mace (1H/2H), Staff, Dagger, Fist, Polearm (Turtle?)
                // Wir filtern grob nach Stats, das sortiert falsche Waffen aus.
            } else if (i.slot !== "Neck" && i.slot !== "Finger" && i.slot !== "Trinket" && i.slot !== "Back" && i.slot !== "Idol") {
                // Rüstungsslots: Nur Leder oder Stoff
                if (i.armorType > 2) return false; // Mail/Plate weg
            }

            // STAT FILTER: Feral needs Str, Agi, AP, Crit, Hit
            // Ignoriere Items, die nur Int/Spirit/Spellpower haben (Heiler Gear)
            let hasFeralStats = (i.strength > 0 || i.agility > 0 || (i.effects && (i.effects.attackPower > 0 || i.effects.crit > 0 || i.effects.hit > 0)));
            // Wolfshead Helm ID 8345 explizit erlauben
            if (i.id === 8345) hasFeralStats = true;
            // Manual Crowd Pummeler ID 9449 explizit erlauben
            if (i.id === 9449) hasFeralStats = true;

            return hasFeralStats;
        });

        // Add "Score" for Sorting (Simple Weighting)
        ITEM_DB.forEach(item => {
            let score = 0;
            score += (item.strength || 0) * 2;   // 1 Str = 2 AP
            score += (item.agility || 0) * 2.2; // 1 Agi > 2 AP (wegen Crit)
            
            // Parse Effects
            if (item.effects) {
                score += (item.effects.attackPower || 0) * 1;
                score += (item.effects.crit || 0) * 25; // 1% Crit ~ 25 AP (grob)
                score += (item.effects.hit || 0) * 20;  // 1% Hit ~ 20 AP
                
                // Turtle Feral AP Check (Custom Field or Text)
                if (item.effects.feralAttackPower) {
                    item.feralAp = item.effects.feralAttackPower;
                    score += item.feralAp * 1;
                }
            }
            
            // Text Parsing für Feral AP (Fallback)
            if (!item.feralAp && item.text && item.text.includes("Feral Attack Power")) {
                let match = item.text.match(/\+(\d+)\s+Feral Attack Power/i);
                if (match) {
                    item.feralAp = parseInt(match[1]);
                    score += item.feralAp * 1;
                }
            }

            // Special Items
            if (item.id === 8345) score += 500; // Wolfshead Helm (BiS forever)
            if (item.id === 9449) score += 500; // MCP (BiS Burst)

            item._score = score;
            ITEM_ID_MAP[item.id] = item;
        });

        // --- ENCHANT FILTERING ---
        // Filtere nur relevante Enchants (Str, Agi, AP, Haste, Hit)
        ENCHANT_DB = enchants.filter(e => {
            let stats = e.effects || {};
            let useful = (stats.strength > 0 || stats.agility > 0 || stats.attackPower > 0 || stats.crit > 0 || stats.hit > 0 || stats.haste > 0);
            // Turtle Specifics like "Sigil" handling could go here
            return useful;
        });

        updateProgress(80);
        updateGearUI();
        updateProgress(100);
        hideProgress();
        
        // Initial Calc
        updatePlayerStats();

    } catch (err) {
        console.error(err);
        showProgress("Fehler beim Laden: " + err.message);
    }
}

// ============================================================================
// UI UPDATES (Dropdowns)
// ============================================================================

function updateGearUI() {
    SLOT_IDS.forEach(slot => {
        let sel = document.getElementById("sel_" + slot);
        if (!sel) return;

        // Clear
        sel.innerHTML = "";
        
        // Add "None"
        let optNone = document.createElement("option");
        optNone.value = "";
        optNone.text = "- None -";
        sel.appendChild(optNone);

        // Filter Items for Slot
        // Mapping Slot Names to DB Slot Names if necessary
        let dbSlot = slot;
        if (slot === "Finger1" || slot === "Finger2") dbSlot = "Finger";
        if (slot === "Trinket1" || slot === "Trinket2") dbSlot = "Trinket";
        if (slot === "MainHand") dbSlot = ["MainHand", "TwoHand", "OneHand"]; // Allow 2H for MainHand slot

        let slotItems = ITEM_DB.filter(i => {
            if (Array.isArray(dbSlot)) return dbSlot.includes(i.slot);
            return i.slot === dbSlot;
        });

        // Sort by Score
        slotItems.sort((a, b) => b._score - a._score);

        // Populate
        slotItems.forEach(item => {
            let opt = document.createElement("option");
            opt.value = item.id;
            opt.text = item.name; // + " (Score: " + Math.floor(item._score) + ")";
            sel.appendChild(opt);
        });

        // Restore Selection
        let savedId = GEAR_SELECTION[slot];
        if (savedId && ITEM_ID_MAP[savedId]) {
            sel.value = savedId;
        }

        // --- ENCHANTS ---
        let enchSel = document.getElementById("ench_" + slot);
        if (enchSel) {
            enchSel.innerHTML = "";
            let optE = document.createElement("option");
            optE.value = "";
            optE.text = "-";
            enchSel.appendChild(optE);

            // Filter Enchants for Slot
            let slotEnchants = ENCHANT_DB.filter(e => e.slot === slot || e.slot === dbSlot || (Array.isArray(dbSlot) && dbSlot.includes(e.slot)));
            
            slotEnchants.forEach(e => {
                let opt = document.createElement("option");
                opt.value = e.id; // Or effectId depending on DB structure
                opt.text = e.name; // e.text (description)
                enchSel.appendChild(opt);
            });

            if (ENCHANT_SELECTION[slot]) {
                enchSel.value = ENCHANT_SELECTION[slot];
            }
        }
    });
}

// ============================================================================
// STAT CALCULATION ENGINE
// ============================================================================

/**
 * Berechnet die Stats basierend auf Gear + Buffs und updatet die UI.
 * Wird aufgerufen wenn Gear geändert wird oder "Berechnen" im Sim.
 */
function updatePlayerStats() {
    // 1. Basis Stats (Tauren/Nightelf Druid Lvl 60 Base)
    // Nightelf: Str 62, Agi 75, Int 100 approx
    // Tauren: Str 70, Agi 65... 
    // Wir nehmen einen Durchschnitt oder Standardwert für Level 60
    let stats = {
        str: 70,
        agi: 75,
        int: 110,
        ap: 0,
        crit: 0,
        hit: 0,
        haste: 0,
        skill: 0,
        feralAp: 0
    };

    // 2. Sum Gear Stats
    for (let slot in GEAR_SELECTION) {
        let id = GEAR_SELECTION[slot];
        if (!id) continue;
        let item = ITEM_ID_MAP[id];
        if (!item) continue;

        stats.str += (item.strength || 0);
        stats.agi += (item.agility || 0);
        stats.int += (item.intellect || 0);

        if (item.effects) {
            stats.ap += (item.effects.attackPower || 0);
            stats.crit += (item.effects.crit || 0);
            stats.hit += (item.effects.hit || 0);
            // stats.haste += (item.effects.haste || 0); // Rare in Vanilla items directly
        }

        if (item.feralAp) stats.feralAp += item.feralAp;

        // Weapon Skill (Items like Belt of Preserved Heads etc.)
        if (item.effects && item.effects.weaponSkill) {
             stats.skill += item.effects.weaponSkill;
        }
        
        // Manual Crowd Pummeler Haste Effect handled in Buffs or rotation?
        // Usually MCP is an "Use" effect. We treat it as a static haste buff if equipped for simplicity OR specific checkbox.
        // For now, static stats.
    }

    // 3. Sum Enchants
    for (let slot in ENCHANT_SELECTION) {
        let eId = ENCHANT_SELECTION[slot];
        if (!eId) continue;
        // Find enchant in DB (could be slow linearly, optimize later if needed)
        let ench = ENCHANT_DB.find(e => e.id == eId); 
        if (ench && ench.effects) {
            stats.str += (ench.effects.strength || 0);
            stats.agi += (ench.effects.agility || 0);
            stats.int += (ench.effects.intellect || 0);
            stats.ap += (ench.effects.attackPower || 0);
            stats.crit += (ench.effects.crit || 0);
            stats.hit += (ench.effects.hit || 0);
            stats.haste += (ench.effects.haste || 0);
        }
    }

    // 4. Set Bonuses (Simplified Placeholder)
    // if (countSet("Devilsaur") >= 2) stats.hit += 2;
    // if (countSet("Lieutenant Commander") >= 2) stats.str += 20; 

    // 5. Apply Buffs
    // Checkboxes abfragen
    let bMotw = getVal("buff_motw");
    let bBok = getVal("buff_bok"); // Blessing of Kings (+10% Stats)
    let bMight = getVal("buff_might"); // Blessing of Might (AP)
    let bMongoose = getVal("buff_mongoose"); // +25 Agi, +2% Crit
    let bJuju = getVal("buff_juju"); // Strength
    let bRoids = getVal("buff_roids"); // +25 Str
    let bSong = getVal("buff_songflower"); // +15 All, +5% Crit
    let bWcb = getVal("buff_wcb"); // +15% Haste (Melee)

    // Flat Adds
    if (bMotw) { stats.str += 12; stats.agi += 12; stats.int += 12; }
    if (bMongoose) { stats.agi += 25; stats.crit += 2; }
    if (bJuju) { stats.str += 30; }
    if (bRoids) { stats.str += 25; }
    if (bSong) { stats.str += 15; stats.agi += 15; stats.int += 15; stats.crit += 5; }

    // Multipliers (Kings)
    if (bBok) {
        stats.str *= 1.10;
        stats.agi *= 1.10;
        stats.int *= 1.10;
    }

    // AP Buffs (After stat calc usually, but Might is flat AP)
    let bonusAp = 0;
    if (bMight) bonusAp += 185; // Rank 7 approx
    if (bMotw) bonusAp += 0; // MotW gives stats, not raw AP directly usually in Vanilla (later patches yes)

    // 6. Final Calculation (Attributes -> Combat Stats)
    // STR -> AP (1 Str = 2 AP)
    let apFromStr = stats.str * 2;
    
    // AGI -> AP (1 Agi = 1 AP) & Crit (20 Agi = 1%)
    let apFromAgi = stats.agi * 1;
    let critFromAgi = stats.agi / 20.0;

    stats.totalAp = apFromStr + apFromAgi + stats.ap + stats.feralAp + bonusAp;
    stats.totalCrit = stats.crit + critFromAgi;
    
    // Leader of the Pack (3% Crit) - Assuming always in group
    stats.totalCrit += 3.0; 

    stats.totalHit = stats.hit;
    
    // Haste
    if (bWcb) stats.haste += 15;
    // MCP Check: If MainHand is MCP (9449), add 50% haste? 
    // Usually active effect. Let's add it if user checks "Manual Stats" or we can automate it later.
    // For now, let's leave MCP as active rotation choice or static.

    // 7. Update UI Inputs (Auto Mode)
    let isManual = document.getElementById("manual_stats").checked;
    
    if (!isManual) {
        document.getElementById("statStr").value = Math.floor(stats.str);
        document.getElementById("statAgi").value = Math.floor(stats.agi);
        document.getElementById("statInt").value = Math.floor(stats.int);
        document.getElementById("statAp").value = Math.floor(stats.totalAp);
        document.getElementById("statCrit").value = stats.totalCrit.toFixed(2);
        document.getElementById("statHit").value = stats.totalHit.toFixed(2);
        document.getElementById("statHaste").value = stats.haste.toFixed(0);
        document.getElementById("statWpnSkill").value = 300 + stats.skill;
        document.getElementById("statFeralAp").value = stats.feralAp;
    }

    // Save for Simulation Use
    window.CURRENT_STATS = stats;
}

// Global Listener for Gear Changes
document.addEventListener("change", function(e) {
    if (e.target.classList.contains("item-select")) {
        let slot = e.target.id.replace("sel_", "");
        GEAR_SELECTION[slot] = e.target.value;
        // Icon update
        let item = ITEM_ID_MAP[e.target.value];
        let iconEl = document.getElementById("icon_" + slot);
        if (iconEl && item) {
            // Wir nutzen hier ein Placeholder oder URL Schema. 
            // Turtle Database nutzt oft Icons.
            iconEl.style.backgroundImage = "url('https://database.turtle-wow.org/images/icons/large/" + item.icon + ".jpg')"; 
            // Falls item.icon nur der Name ist (z.B. "inv_misc_...").
            // Hinweis: Falls keine Icons laden, ist die URL ggf. anzupassen.
        }
        updatePlayerStats();
    }
    if (e.target.classList.contains("enchant-select")) {
        let slot = e.target.id.replace("ench_", "");
        ENCHANT_SELECTION[slot] = e.target.value;
        updatePlayerStats();
    }
});