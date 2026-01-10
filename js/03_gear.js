/**
 * Feral Simulation - File 3: Gear Planner Logic & Database
 * Updated for Turtle WoW 1.18 (Feral Cat) based on Info.txt
 */

var ITEM_ID_MAP = {}; // Performance cache for lookups

// ============================================================================
// GEAR PLANNER LOGIC
// ============================================================================

async function loadDatabase() {
    showProgress("Loading Database...");
    try {
        updateProgress(20);

        // Load Items and Enchants
        const [rItems, rEnchants] = await Promise.all([
            fetch('data/items.json'),
            fetch('data/enchants.json')
        ]);

        if (!rItems.ok) throw new Error("Items DB Error " + rItems.status);
        if (!rEnchants.ok) throw new Error("Enchants DB Error " + rEnchants.status);

        const items = await rItems.json();
        const enchants = await rEnchants.json();
        updateProgress(60);

        ITEM_DB = items.filter(i => {
            // Basic Filters
            i.itemLevel = i.level || i.itemLevel || 0;
            if ((i.quality || 0) < 2) return false;
            if (i.itemLevel < 30 && i.slot !== "Relic" && i.slot !== "Idol" && i.slot !== "Trinket" && i.slot !== "Neck" && i.slot !== "Finger") return false;

            // Class Filter: 1024 = Druid (bitmask varies by DB, usually 1024 or checks class name)
            // Assuming DB has allowableClasses. If not, skip check.
            if (i.allowableClasses && i.allowableClasses !== -1 && (i.allowableClasses & 1024) === 0) return false;

            // Armor Filter: Cloth(1), Leather(2) or None(0)
            if (i.armorType && i.armorType > 2) return false;

            // Weapon Filter
            // Feral uses: Daggers(13), Maces(4/5), Polearms(6), Staves(10), Fist Weapons(13/15?)
            // Exclude Shields, Swords, Axes
            if (i.slot === "Weapon" || i.slot === "TwoHand" || i.slot === "MainHand" || i.slot === "OneHand") {
                // If DB has weaponType ID:
                // 0=Axe, 2=Bow, 4=Mace1H, 5=Mace2H, 6=Polearm, 7=Sword1H, 8=Sword2H, 10=Staff, 13=Fist, 15=Dagger
                // Allow: 4, 5, 6, 10, 13, 15
                if (i.weaponType !== undefined) {
                    var valid = [4, 5, 6, 10, 13, 15];
                    if (valid.indexOf(i.weaponType) === -1) return false;
                }
            }
            if (i.slot === "Shield") return false;

            return true;
        });

        // Build Map
        ITEM_ID_MAP = {};
        ITEM_DB.forEach(i => { ITEM_ID_MAP[i.id] = i; });

        ENCHANT_DB = enchants;

        initGearPlannerUI();
        var statusEl = document.getElementById("dbStatus");
        if (statusEl) {
            statusEl.innerText = "Loaded (" + ITEM_DB.length + " items, " + ENCHANT_DB.length + " enchants)";
            statusEl.style.color = "#4caf50";
        }
        updateProgress(100);
    } catch (e) {
        console.error("DB Load Failed:", e);
        var statusEl = document.getElementById("dbStatus");
        if (statusEl) statusEl.innerText = "Error loading database files.";
    } finally { hideProgress(); }
}

function initGearPlannerUI() {
    if (!document.getElementById('charLeftCol')) return;
    renderSlotColumn("left", "charLeftCol");
    renderSlotColumn("right", "charRightCol");
    renderSlotColumn("bottom", "charBottomRow");
    calculateGearStats();
}

function getIconUrl(iconName) {
    if (!iconName) return "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg";
    var cleanName = iconName.replace(/\\/g, "/").split("/").pop().replace(/\.jpg|\.png/g, "").toLowerCase();
    return "data/wow-icons/" + cleanName + ".jpg";
}

function renderSlotColumn(pos, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    SLOT_LAYOUT[pos].forEach(function (slotName) {
        var itemId = GEAR_SELECTION[slotName];
        if (itemId && typeof itemId === 'object' && itemId.id) itemId = itemId.id;

        var item = itemId ? ITEM_ID_MAP[itemId] : null;
        var enchantId = ENCHANT_SELECTION[slotName];
        var enchant = enchantId ? ENCHANT_DB.find(e => e.id == enchantId) : null;

        var div = document.createElement("div");
        div.className = "char-slot";

        div.onmouseenter = function (e) { showTooltip(e, item); };
        div.onmousemove = function (e) { moveTooltip(e); };
        div.onmouseleave = function () { hideTooltip(); };

        var iconUrl = "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg";
        var rarityClass = "q0";
        var displayName = slotName;
        var statText = "Empty Slot";
        var linkHtml = "";

        if (item) {
            iconUrl = getIconUrl(item.icon);
            rarityClass = "q" + (item.quality || 1);
            displayName = item.name;
            var s = calculateItemScore(item, slotName);
            statText = "EP: " + s.toFixed(1) + " | iLvl: " + item.itemLevel;

            if (item.url) {
                linkHtml = '<a href="' + item.url + '" target="_blank" class="slot-link-btn" title="Open in Database" onclick="event.stopPropagation()">🔗</a>';
            }
        }

        var canEnchant = true;
        if (slotName.includes("Trinket") || slotName.includes("Idol") || slotName.includes("Relic") || slotName.includes("Off") || slotName.includes("Finger") || slotName.includes("Neck")) {
            // Note: Finger enchants exist in TBC/Turtle custom? Assuming vanilla standard: No finger enchants except ZG?
            // Keeping simple: Allow enchants if DB has them for the slot.
            // For now, restricting typical non-enchant slots.
            if (!slotName.includes("Finger")) canEnchant = false; 
            // Actually, let's check if there are enchants for this slot in DB logic, but UI-wise usually Trinket/Neck/Idol are no-go.
            if (slotName.includes("Finger")) canEnchant = false; // Disable finger for now unless ZG
        }
        if (slotName === "Off Hand" && item && item.slot === "Shield") canEnchant = true; // Shields can be enchanted

        var enchantHtml = "";
        if (canEnchant) {
            var enchName = enchant ? enchant.name : "+ Enchant";
            var enchStyle = enchant ? "color:#0f0; font-size:0.75rem;" : "color:#555; font-size:0.7rem; font-style:italic;";
            var eIdPass = enchant ? enchant.id : 0;
            enchantHtml = '<div class="slot-enchant-click" onmouseenter="showEnchantTooltip(event, ' + eIdPass + ')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" onclick="event.stopPropagation(); openEnchantSelector(\'' + slotName + '\')" style="' + enchStyle + '; margin-top:2px; cursor:pointer;">' + enchName + '</div>';
        }

        var html = '<div class="slot-icon ' + rarityClass + '" onclick="openItemSelector(\'' + slotName + '\')"><img src="' + iconUrl + '" style="width:100%; height:100%; border-radius:3px;"></div>' +
            '<div class="slot-info">' +
            '<div class="slot-name" onclick="openItemSelector(\'' + slotName + '\')" style="color: ' + getItemColor(item ? item.quality : 0) + '; cursor:pointer;">' + displayName + '</div>' +
            '<span class="slot-stats">' + statText + '</span>' +
            enchantHtml +
            '</div>' +
            linkHtml;
        div.innerHTML = html;
        container.appendChild(div);
    });
}

function getItemColor(q) {
    var colors = ["#9d9d9d", "#ffffff", "#1eff00", "#0070dd", "#a335ee", "#ff8000"];
    return colors[q] || "#9d9d9d";
}

// ============================================================================
// TOOLTIPS
// ============================================================================

function showTooltip(e, item) {
    if (!item) return;
    var tt = document.getElementById("wowTooltip");
    if (!tt) return;
    tt.style.display = "block";

    var qualityColor = getItemColor(item.quality);
    var iconUrl = getIconUrl(item.icon);

    var html = '<div class="tt-header"><div class="tt-icon-small" style="background-image:url(\'' + iconUrl + '\')"></div><div style="flex:1"><div class="tt-name" style="color:' + qualityColor + '">' + item.name + '</div></div></div>';
    if (item.itemLevel) html += '<div class="tt-white">Item Level ' + item.itemLevel + '</div>';
    if (item.slot) html += '<div class="tt-white">' + item.slot + '</div>';
    if (item.armor) html += '<div class="tt-white">' + item.armor + ' Armor</div>';
    html += '<div class="tt-spacer"></div>';

    // Stats
    if (item.strength) html += '<div class="tt-white">+' + item.strength + ' Strength</div>';
    if (item.agility) html += '<div class="tt-white">+' + item.agility + ' Agility</div>';
    if (item.stamina) html += '<div class="tt-white">+' + item.stamina + ' Stamina</div>';
    if (item.intellect) html += '<div class="tt-white">+' + item.intellect + ' Intellect</div>';
    if (item.spirit) html += '<div class="tt-white">+' + item.spirit + ' Spirit</div>';

    html += '<div class="tt-spacer"></div>';

    if (item.effects) {
        var eff = item.effects;
        if (eff.hit) html += '<div class="tt-green">Equip: Improves your chance to hit by ' + eff.hit + '%.</div>';
        if (eff.crit) html += '<div class="tt-green">Equip: Improves your chance to get a critical strike by ' + eff.crit + '%.</div>';
        if (eff.attackPower) html += '<div class="tt-green">Equip: + ' + eff.attackPower + ' Attack Power.</div>';
        // Feral AP on Weapons (Standard Vanilla/Turtle convention)
        if (eff.feralAttackPower) html += '<div class="tt-green">Equip: + ' + eff.feralAttackPower + ' Attack Power in Cat, Bear, and Dire Bear forms only.</div>';
        
        if (eff.custom && Array.isArray(eff.custom)) {
            eff.custom.forEach(function (line) {
                html += '<div class="tt-green">' + line + '</div>';
            });
        }
    }

    // Set Info
    if (item.setName) {
        html += '<div class="tt-spacer"></div>';
        var siblings = ITEM_DB.filter(function (i) { return i.setName === item.setName; });
        var equippedCount = 0;
        for (var slot in GEAR_SELECTION) {
            var gid = GEAR_SELECTION[slot];
            if (gid && ITEM_ID_MAP[gid] && ITEM_ID_MAP[gid].setName === item.setName) equippedCount++;
        }
        html += '<div class="tt-gold">' + item.setName + ' (' + equippedCount + '/' + siblings.length + ')</div>';
        siblings.forEach(function (sItem) {
            var isEquipped = false;
            for (var slot in GEAR_SELECTION) {
                if (GEAR_SELECTION[slot] == sItem.id) isEquipped = true;
            }
            var color = isEquipped ? '#ffff99' : '#888';
            html += '<div style="color:' + color + '; margin-left:10px;">' + sItem.name + '</div>';
        });
        
        // Show set bonuses (Simplified)
        if (item.setBonuses) {
            html += '<div class="tt-spacer"></div>';
            var keys = Object.keys(item.setBonuses).sort();
            keys.forEach(function (k) {
               var cnt = parseInt(k);
               var col = (equippedCount >= cnt) ? '#0f0' : '#888';
               html += '<div style="color:' + col + '">(' + k + ') Set Bonus</div>';
            });
        }
    }

    tt.innerHTML = html;
    moveTooltip(e);
}

function showEnchantTooltip(e, enchantId) {
    if (!enchantId || enchantId === 0) return;
    var ench = ENCHANT_DB.find(x => x.id == enchantId);
    if (!ench) return;

    var tt = document.getElementById("wowTooltip");
    if (!tt) return;
    tt.style.display = "block";

    var html = '<div class="tt-header"><div style="flex:1"><div class="tt-name" style="color:#1eff00">' + ench.name + '</div></div></div>';
    html += '<div class="tt-white">Enchant</div>';
    if (ench.text) html += '<div class="tt-green">' + ench.text + '</div>';
    else if (ench.effects) {
        var ef = ench.effects;
        if (ef.strength) html += '<div class="tt-green">+' + ef.strength + ' Strength</div>';
        if (ef.agility) html += '<div class="tt-green">+' + ef.agility + ' Agility</div>';
        if (ef.attackPower) html += '<div class="tt-green">+' + ef.attackPower + ' Attack Power</div>';
    }

    tt.innerHTML = html;
    moveTooltip(e);
}

function moveTooltip(e) {
    var tt = document.getElementById("wowTooltip");
    if (!tt) return;
    var width = tt.offsetWidth;
    var height = tt.offsetHeight;
    var x = e.clientX + 15;
    var y = e.clientY + 15;
    if (x + width > window.innerWidth) x = e.clientX - width - 15;
    if (y + height > window.innerHeight) {
        var yUp = e.clientY - height - 10;
        y = (yUp < 0) ? 10 : yUp;
    }
    tt.style.left = x + "px";
    tt.style.top = y + "px";
}

function hideTooltip() { var tt = document.getElementById("wowTooltip"); if (tt) tt.style.display = "none"; }

// ============================================================================
// STAT CALCULATION
// ============================================================================

function calculateGearStats() {
    // 1. Base Stats (Race) [from Info.txt]
    var raceSel = document.getElementById("char_race");
    var raceName = raceSel ? raceSel.value : "Tauren";
    var baseStats = RACE_STATS[raceName] || RACE_STATS["Tauren"];

    // Accumulators
    // Str, Agi, Int are Attributes. AP, Crit, Hit, Haste are Secondary.
    var stats = {
        str: baseStats.str,
        agi: baseStats.agi,
        int: baseStats.int,
        // Base AP is a starting value (295), stats add to it.
        ap: baseStats.baseAp, 
        crit: baseStats.baseCrit,
        hit: 0,
        haste: 0,
        wepMin: baseStats.minDmg,
        wepMax: baseStats.maxDmg
    };

    // Track Set Counts
    var setCounts = {};
    var hasWolfshead = false;
    var hasMCP = false;

    // 2. ITEMS
    for (var slot in GEAR_SELECTION) {
        var id = GEAR_SELECTION[slot];
        if (id && typeof id === 'object' && id.id) id = id.id;

        if (id && id !== 0) {
            var item = ITEM_ID_MAP[id];
            if (item) {
                var e = item.effects || {};
                
                // Primary Stats
                stats.str += (item.strength || 0);
                stats.agi += (item.agility || 0);
                stats.int += (item.intellect || 0);
                
                // Secondary Stats
                stats.ap += (e.attackPower || 0);
                stats.ap += (e.feralAttackPower || 0); // Feral Weapons
                stats.crit += (e.crit || 0);
                stats.hit += (e.hit || 0);
                stats.haste += (e.haste || 0);

                // Set Tracking
                if (item.setName) {
                    if (!setCounts[item.setName]) setCounts[item.setName] = 0;
                    setCounts[item.setName]++;
                }

                // Special Items
                if (item.name === "Wolfshead Helm") hasWolfshead = true; // or ID check
                if (item.name === "Manual Crowd Pummeler") hasMCP = true;
            }
        }
    }

    // 3. ENCHANTS
    for (var slot in ENCHANT_SELECTION) {
        var eid = ENCHANT_SELECTION[slot];
        if (eid && eid !== 0) {
            var ench = ENCHANT_DB.find(e => e.id == eid);
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
    }

    // 4. BUFFS & CONSUMABLES (Flat Adds)
    // Values based on Info.txt
    
    // -- Class Buffs --
    if (getVal("buff_motw")) { stats.str += 16; stats.agi += 16; stats.int += 16; } // Imp MotW
    if (getVal("buff_bok")) { /* Multiplier handled later */ }
    if (getVal("buff_might")) { stats.ap += 240; } // Improved (240 from text)
    if (getVal("buff_bs")) { stats.ap += 290; } // Improved Battle Shout (290 from text)
    if (getVal("buff_trueshot")) { stats.ap += 100; } // Vanilla Standard (Text ambiguous, assuming Rank 3)
    if (getVal("buff_goa")) { stats.agi += 77; } // Grace of Air
    if (getVal("buff_soe")) { stats.str += 77; } // Strength of Earth
    
    // -- Consumables --
    if (getVal("cons_mongoose")) { stats.agi += 25; stats.crit += 2; }
    if (getVal("cons_juju_power")) { stats.str += 30; }
    if (getVal("cons_juju_might")) { stats.ap += 40; }
    if (getVal("cons_firewater")) { stats.ap += 35; }
    if (getVal("cons_food_str")) { stats.str += 20; }
    if (getVal("cons_food_agi")) { stats.agi += 10; } // Text says 10 for berry
    if (getVal("cons_food_haste")) { stats.haste += 2; } // Medley
    if (getVal("cons_stone_ap")) { stats.ap += 100; }
    if (getVal("cons_stone_crit")) { stats.crit += 2; }
    if (getVal("cons_blasted_str")) { stats.str += 25; }
    if (getVal("cons_blasted_agi")) { stats.agi += 25; }
    if (getVal("cons_potion_quickness")) { stats.haste += 5; } // Treat as flat stat? Usually temp buff. Adding to stats for now.

    // 5. TALENTS & MULTIPLIERS
    
    [cite_start]// Heart of the Wild: +20% Str/Int [cite: 14]
    var talHotw = parseInt(getVal("tal_hotw")) || 0; // 0-5
    if (talHotw > 0) {
        var mod = 1 + (talHotw * 0.04); // 4% per point -> 20% max
        stats.str *= mod;
        stats.int *= mod;
    }

    [cite_start]// Blessing of Kings: +10% All Stats [cite: 25]
    if (getVal("buff_bok")) {
        stats.str *= 1.10;
        stats.agi *= 1.10;
        stats.int *= 1.10;
        // Sta/Spi irrelevant for DPS
    }

    // 6. DERIVED STATS (Scaling)
    [cite_start]// AP = Base + Agi + 2*Str + Items + Buffs [cite: 1]
    // Note: stats.ap currently holds BaseAP + Items + Buffs.
    // We need to add Attribute contribution.
    stats.ap += (stats.str * 2) + (stats.agi * 1);

    [cite_start]// Predatory Strikes: Increase AP by 10% [cite: 11]
    // Usually applies to TOTAL AP.
    var talPred = parseInt(getVal("tal_predatory_strikes")) || 0; // 0-3
    // Text: "Increase attack power by 10%." (At 3/3? Assuming scaling 3.33% per point or flat multiplier? Vanilla is % per point)
    // Let's assume max rank gives 10%, so ~3.33% per point? Or is it 10% total?
    // Vanilla DB: Predatory Strikes Rank 3 = 150% of level? No, that's Moonkin. Feral is % AP. 
    // Info.txt says "Increase attack power by 10%". Let's assume linear scaling 3.33% per point.
    if (talPred > 0) {
        // Multiplier: 1 + (0.10 * (talPred / 3)) ?? Or just apply if max?
        // Let's assume 10% at max rank.
        var predMod = 1 + (0.10 * (talPred / 3));
        stats.ap *= predMod;
    }

    [cite_start]// Crit = BaseCrit + 0.05*AGI + Equip + Buffs [cite: 1]
    // Note: stats.crit currently holds BaseCrit + Items + Buffs.
    // 0.05 * AGI means 1% per 20 Agi.
    stats.crit += (stats.agi * 0.05);

    [cite_start]// Leader of the Pack: +3% Crit [cite: 16]
    if (getVal("buff_lotp")) {
        stats.crit += 3;
    }
    
    [cite_start]// Sharpened Claws: +2% * # [cite: 7]
    var talSharp = parseInt(getVal("tal_sharpened_claws")) || 0;
    stats.crit += (talSharp * 2);

    // 7. SET BONUSES & SPECIALS UPDATE
    // Check Sets
    // T1 (Cenarion)
    var countT1 = setCounts["Cenarion Harness"] || 0;
    document.getElementById("set_t1_3p").checked = (countT1 >= 3);
    document.getElementById("set_t1_5p").checked = (countT1 >= 5);
    document.getElementById("set_t1_8p").checked = (countT1 >= 8);

    // T2.5 (Genesis)
    var countT25 = setCounts["Genesis Harness"] || 0;
    document.getElementById("set_t25_3p").checked = (countT25 >= 3);
    document.getElementById("set_t25_5p").checked = (countT25 >= 5);

    // T3.5 (Harness of the Talon) - Name from Info.txt
    var countT35 = setCounts["Harness of the Talon"] || 0;
    document.getElementById("set_t35_3p").checked = (countT35 >= 3);
    document.getElementById("set_t35_5p").checked = (countT35 >= 5);

    // Update Special Flags
    document.getElementById("item_wolfshead").checked = hasWolfshead;
    document.getElementById("item_mcp").checked = hasMCP;

    // 8. UPDATE UI INPUTS (Manual Override Logic)
    var isManual = document.getElementById("manual_stats") ? document.getElementById("manual_stats").checked : false;

    var setInput = function(id, val, isPct) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!isManual) {
            el.value = isPct ? val.toFixed(2) : Math.floor(val);
            el.disabled = true;
        } else {
            el.disabled = false;
        }
    };

    setInput("stat_str", stats.str, false);
    setInput("stat_agi", stats.agi, false);
    setInput("stat_ap", stats.ap, false);
    setInput("stat_crit", stats.crit, true);
    setInput("stat_hit", stats.hit, false); // No base hit logic in info.txt, purely gear
    setInput("stat_haste", stats.haste, true);
    
    // Update Gear Planner Preview Box
    var elGP_AP = document.getElementById("gp_ap"); if (elGP_AP) elGP_AP.innerText = Math.floor(stats.ap);
    var elGP_Crit = document.getElementById("gp_crit"); if (elGP_Crit) elGP_Crit.innerText = stats.crit.toFixed(2) + "%";
    var elGP_Hit = document.getElementById("gp_hit"); if (elGP_Hit) elGP_Hit.innerText = stats.hit.toFixed(1) + "%";
    var elGP_GS = document.getElementById("gp_gs"); 
    
    // Simple EP Score for Planner View (AP + Crit*22 + Hit*18 + Str*2 + Agi*2.5)
    // Approximate weights for display
    if (elGP_GS) {
        // Recalculate pure gear EP from 'items' only? 
        // Or just use the final stats? Usually EP is gear-based.
        // Let's iterate gear again simply for score or use accumulated values
        // This display usually shows the score of EQUIPPED items.
        // We can just sum the 'simScore' of selected items.
        var totalScore = 0;
        for(var slot in GEAR_SELECTION) {
            var id = GEAR_SELECTION[slot];
            if(id && ITEM_ID_MAP[id]) {
                totalScore += calculateItemScore(ITEM_ID_MAP[id], slot);
            }
        }
        elGP_GS.innerText = Math.floor(totalScore);
    }
}

// ============================================================================
// ITEM SCORING (EP)
// ============================================================================

function calculateItemScore(item, slotName) {
    if (!item) return 0;
    
    // Default Feral Weights (can be overridden by UI inputs if added later)
    // Derived from standard Vanilla Feral knowledge + Info.txt relations
    // Str = 2 AP. Agi = 1 AP + ~0.05% Crit. 
    // 1 Crit ~ 22 AP. 1 Hit ~ 18 AP (Soft cap). Haste ~ 10 AP?
    
    var wStr = parseFloat(getVal("weight_str") || 2.4); 
    var wAgi = parseFloat(getVal("weight_agi") || 2.5); // Slightly better than Str due to Crit
    var wAP = parseFloat(getVal("weight_ap") || 1.0);
    var wCrit = parseFloat(getVal("weight_crit") || 22.0);
    var wHit = parseFloat(getVal("weight_hit") || 18.0);
    var wHaste = parseFloat(getVal("weight_haste") || 12.0);

    var score = 0;
    var e = item.effects || {};

    // Stats
    score += (item.strength || 0) * wStr;
    score += (item.agility || 0) * wAgi;
    score += (e.attackPower || 0) * wAP;
    score += (e.feralAttackPower || 0) * wAP;
    score += (e.crit || 0) * wCrit;
    score += (e.hit || 0) * wHit;
    score += (e.haste || 0) * wHaste;

    // Set Bonuses (simplified prediction: if this item completes a set, add value?)
    // Complex to predict in list view. We skip set bonus EP in individual item tooltip usually,
    // or add a flat bonus if it belongs to a good set.
    
    // Special Items
    if (item.name === "Wolfshead Helm") score += 200; // Massive value
    if (item.name === "Manual Crowd Pummeler") score += 500; // BiS

    return score;
}

// Helper to get UI values safely
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    if (el.type === "checkbox") return el.checked ? 1 : 0;
    return parseFloat(el.value) || 0;
}

// Modal & Selection Logic (Standard)
var CURRENT_SELECTING_SLOT = null;
function openItemSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("itemSelectorModal");
    var title = document.getElementById("modalTitle");
    var input = document.getElementById("itemSearchInput");
    if (modal) {
        title.innerText = "Select " + slotName;
        modal.classList.remove("hidden");
        input.value = ""; input.focus();
        renderItemList();
    }
}
function closeItemModal() { document.getElementById("itemSelectorModal").classList.add("hidden"); }

function renderItemList(filter) {
    var list = document.getElementById("modalItemList");
    list.innerHTML = "";
    
    // Unequip Option
    var unequip = document.createElement("div");
    unequip.className = "item-row";
    unequip.innerHTML = '<div class="item-row-name" style="color:#888">- Unequip -</div>';
    unequip.onclick = function() { selectItem(0); };
    list.appendChild(unequip);

    var slotKey = CURRENT_SELECTING_SLOT;
    if (slotKey.includes("Finger")) slotKey = "Finger";
    if (slotKey.includes("Trinket")) slotKey = "Trinket";

    var items = ITEM_DB.filter(i => {
        // Slot Match
        if (slotKey === "Main Hand" || slotKey === "Off Hand") {
             // Complex weapon handling matches loadDatabase filter
             if (i.slot === "Weapon" || i.slot === "TwoHand" || i.slot === "MainHand" || i.slot === "OneHand") return slotKey === "Main Hand";
             if (i.slot === "Shield" || i.slot === "HeldInOffHand" || i.slot === "OffHand") return slotKey === "Off Hand";
        }
        return i.slot === slotKey;
    });

    if (filter) {
        var lower = filter.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(lower));
    }

    // Sort by Score
    items.forEach(i => i._score = calculateItemScore(i));
    items.sort((a,b) => b._score - a._score);

    // Limit display
    items.slice(0, 50).forEach(item => {
        var row = document.createElement("div");
        row.className = "item-row";
        row.innerHTML = `
            <div class="item-row-icon" style="background-image:url('${getIconUrl(item.icon)}')"></div>
            <div class="item-row-details">
                <div class="item-row-name" style="color:${getItemColor(item.quality)}">${item.name}</div>
                <div class="item-row-sub">iLvl: ${item.itemLevel} | EP: ${item._score.toFixed(1)}</div>
            </div>
        `;
        row.onclick = function() { selectItem(item.id); };
        row.onmouseenter = function(e) { showTooltip(e, item); };
        row.onmouseleave = function() { hideTooltip(); };
        list.appendChild(row);
    });
}

function filterItemList() {
    renderItemList(document.getElementById("itemSearchInput").value);
}

function selectItem(id) {
    if (CURRENT_SELECTING_SLOT) {
        GEAR_SELECTION[CURRENT_SELECTING_SLOT] = id;
        // 2H Logic
        if (CURRENT_SELECTING_SLOT === "Main Hand" && id !== 0) {
            var item = ITEM_ID_MAP[id];
            if (item && (item.slot === "TwoHand" || item.weaponType === 5 || item.weaponType === 6 || item.weaponType === 10)) {
                GEAR_SELECTION["Off Hand"] = 0; // Unequip Offhand
            }
        }
    }
    closeItemModal();
    initGearPlannerUI();
}

// Enchant Modal Logic (Simplified)
function openEnchantSelector(slot) {
    CURRENT_SELECTING_SLOT = slot;
    document.getElementById("enchantSelectorModal").classList.remove("hidden");
    renderEnchantList();
}
function closeEnchantModal() { document.getElementById("enchantSelectorModal").classList.add("hidden"); }

function renderEnchantList() {
    var list = document.getElementById("modalEnchantList");
    list.innerHTML = "";
    var unequip = document.createElement("div");
    unequip.className = "item-row";
    unequip.innerHTML = '<div class="item-row-name" style="color:#888">- No Enchant -</div>';
    unequip.onclick = function() { selectEnchant(0); };
    list.appendChild(unequip);

    // Filter Enchants by Slot
    var validEnchants = ENCHANT_DB.filter(e => {
        // Map slot names if necessary
        return true; // Simplified for now, assuming DB matches
    });
    
    validEnchants.forEach(e => {
        var row = document.createElement("div");
        row.className = "item-row";
        row.innerHTML = `<div class="item-row-name" style="color:#1eff00">${e.name}</div>`;
        row.onclick = function() { selectEnchant(e.id); };
        row.onmouseenter = function(e) { showEnchantTooltip(e, e.id); };
        row.onmouseleave = function() { hideTooltip(); };
        list.appendChild(row);
    });
}

function selectEnchant(id) {
    ENCHANT_SELECTION[CURRENT_SELECTING_SLOT] = id;
    closeEnchantModal();
    initGearPlannerUI();
}
