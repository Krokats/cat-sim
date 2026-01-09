/**
 * Feral Simulation - File 3: Gear Planner Logic & Database
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
            // FIX: Some JSONs use 'level', some 'itemLevel'
            i.itemLevel = i.level || i.itemLevel || 0;
            // Filter Junk
            if ((i.quality || 0) < 2) return false;
            // Allow low level idols, otherwise filter low level gear
            if (i.itemLevel < 35 && i.slot !== "Idol" && i.slot !== "Relic") return false;

            // CLASS FILTER: 512 = Druid
            if (i.allowableClasses && i.allowableClasses !== -1 && (i.allowableClasses & 512) === 0) return false;

            // ARMOR FILTER: Leather(2), Cloth(1), None(0) - No Mail/Plate
            if (i.armorType && i.armorType > 2) return false;
            return true;
        });

        // Build Map for O(1) lookup
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
    // Use local folder
    return "data/wow-icons/" + cleanName + ".jpg";
}

function renderSlotColumn(pos, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    SLOT_LAYOUT[pos].forEach(function (slotName) {
        var itemId = GEAR_SELECTION[slotName];
        // Handle ID or Object (Legacy Safety)
        if (itemId && typeof itemId === 'object' && itemId.id) itemId = itemId.id;

        var item = itemId ? ITEM_ID_MAP[itemId] : null;
        var enchantId = ENCHANT_SELECTION[slotName];
        var enchant = enchantId ? ENCHANT_DB.find(e => e.id == enchantId) : null;

        var div = document.createElement("div");
        div.className = "char-slot";

        // Simple Tooltip logic
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
            statText = "Score: " + s.toFixed(1) + " | iLvl: " + item.itemLevel;

            // LINK BUTTON LOGIC
            if (item.url) {
                linkHtml = '<a href="' + item.url + '" target="_blank" class="slot-link-btn" title="Open in Database" onclick="event.stopPropagation()">🔗</a>';
            }
        }

        // --- ENCHANT RENDER LOGIC ---
        var canEnchant = true;
        if (slotName.includes("Trinket") || slotName.includes("Idol") || slotName.includes("Relic") || slotName.includes("Off") || slotName.includes("Finger")) canEnchant = false;

        var enchantHtml = "";
        if (canEnchant) {
            var enchName = enchant ? enchant.name : "+ Enchant";
            var enchStyle = enchant ? "color:#1eff00; font-size:0.75rem;" : "color:#555; font-size:0.7rem; font-style:italic;";
            var eIdPass = enchant ? enchant.id : 0;
            // Add hover events for enchant tooltip
            enchantHtml = '<div class="slot-enchant-click" onmouseenter="showEnchantTooltip(event, ' + eIdPass + ')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()" onclick="event.stopPropagation(); openEnchantSelector(\'' + slotName + '\')" style="' + enchStyle + '; margin-top:2px; cursor:pointer;">' + enchName + '</div>';
        }

        var html = '<div class="slot-icon ' + rarityClass + '" onclick="openItemSelector(\'' + slotName + '\')"><img src="' + iconUrl + '" style="width:100%; height:100%; border-radius:3px;"></div>' +
            '<div class="slot-info">' +
            '<div class="slot-name" onclick="openItemSelector(\'' + slotName + '\')" style="color: ' + getItemColor(item ? item.quality : 0) + '; cursor:pointer;">' + displayName + '</div>' +
            '<span class="slot-stats">' + statText + '</span>' +
            enchantHtml +
            '</div>' +
            linkHtml; // Append Link Button
        div.innerHTML = html;
        container.appendChild(div);
    });
}

function getItemColor(q) {
    var colors = ["#9d9d9d", "#ffffff", "#1eff00", "#0070dd", "#a335ee", "#ff8000"];
    return colors[q] || "#9d9d9d";
}

// Tooltips
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
    
    // Primary Stats
    if (item.strength) html += '<div class="tt-white">+' + item.strength + ' Strength</div>';
    if (item.agility) html += '<div class="tt-white">+' + item.agility + ' Agility</div>';
    if (item.stamina) html += '<div class="tt-white">+' + item.stamina + ' Stamina</div>';
    if (item.intellect) html += '<div class="tt-white">+' + item.intellect + ' Intellect</div>';
    if (item.spirit) html += '<div class="tt-white">+' + item.spirit + ' Spirit</div>';
    
    // Weapon Stats
    if (item.minDmg && item.maxDmg && item.speed) {
         html += '<div class="tt-white">' + item.minDmg + ' - ' + item.maxDmg + ' Damage</div>';
         html += '<div class="tt-white">Speed ' + item.speed.toFixed(2) + '</div>';
         var dps = ((item.minDmg + item.maxDmg) / 2) / item.speed;
         html += '<div class="tt-white">(' + dps.toFixed(1) + ' damage per second)</div>';
    }

    html += '<div class="tt-spacer"></div>';

    if (item.effects) {
        var eff = item.effects;
        if (eff.crit) html += '<div class="tt-green">Equip: Improves your chance to get a critical strike by ' + eff.crit + '%.</div>';
        if (eff.hit) html += '<div class="tt-green">Equip: Improves your chance to hit by ' + eff.hit + '%.</div>';
        if (eff.haste) html += '<div class="tt-green">Equip: Improves your attack speed by ' + eff.haste + '%.</div>';
        if (eff.attackPower) html += '<div class="tt-green">Equip: + ' + eff.attackPower + ' Attack Power.</div>';
        if (eff.feralAttackPower) html += '<div class="tt-green">Equip: + ' + eff.feralAttackPower + ' Attack Power in Cat, Bear, and Dire Bear forms.</div>';
        
        if (eff.custom && Array.isArray(eff.custom)) {
            eff.custom.forEach(function (line) {
                html += '<div class="tt-green">' + line + '</div>';
            });
        }
    }

    // SET INFORMATION LOGIC
    if (item.setName) {
        html += '<div class="tt-spacer"></div>';

        var siblings = ITEM_DB.filter(function (i) { return i.setName === item.setName; });
        var equippedCount = 0;
        for (var slot in GEAR_SELECTION) {
            var gid = GEAR_SELECTION[slot];
            if (gid && (typeof gid === 'number' || typeof gid === 'string') && gid != 0) {
                var gItem = ITEM_ID_MAP[gid];
                if (gItem && gItem.setName === item.setName) equippedCount++;
            }
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

        html += '<div class="tt-spacer"></div>';

        if (item.setBonuses) {
            var keys = Object.keys(item.setBonuses).sort(function (a, b) { return a - b });
            keys.forEach(function (thresholdStr) {
                var threshold = parseInt(thresholdStr);
                var bonusData = item.setBonuses[thresholdStr];
                var isActive = (equippedCount >= threshold);
                var color = isActive ? '#0f0' : '#888';
                
                var descriptions = [];
                if (bonusData.attackPower > 0) descriptions.push("Increases attack power by " + bonusData.attackPower + ".");
                if (bonusData.crit > 0) descriptions.push("Improves critical strike chance by " + bonusData.crit + "%.");
                if (bonusData.hit > 0) descriptions.push("Improves hit chance by " + bonusData.hit + "%.");
                if (bonusData.energyReturn) descriptions.push("Restores energy when shifting."); // Specific for Wolfshead logic if handled via Set
                
                if (bonusData.custom && Array.isArray(bonusData.custom)) {
                    bonusData.custom.forEach(function (c) { descriptions.push(c); });
                }
                
                descriptions.forEach(function (desc) {
                    html += '<div style="color:' + color + '">(' + threshold + ') Set: ' + desc + '</div>';
                });
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
    html += '<div class="tt-spacer"></div>';

    if (ench.text) {
        html += '<div class="tt-green">' + ench.text + '</div>';
    } else if (ench.effects) {
        var ef = ench.effects;
        if (ef.strength) html += '<div class="tt-green">+' + ef.strength + ' Strength</div>';
        if (ef.agility) html += '<div class="tt-green">+' + ef.agility + ' Agility</div>';
        if (ef.attackPower) html += '<div class="tt-green">+' + ef.attackPower + ' Attack Power</div>';
        if (ef.crit) html += '<div class="tt-green">+' + ef.crit + '% Crit</div>';
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
        if (yUp < 0) y = 10; else y = yUp;
    }
    tt.style.left = x + "px";
    tt.style.top = y + "px";
}

function hideTooltip() { var tt = document.getElementById("wowTooltip"); if (tt) tt.style.display = "none"; }

// --- ITEM MODAL ---
var CURRENT_SELECTING_SLOT = null;
function openItemSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("itemSelectorModal");
    var input = document.getElementById("itemSearchInput");
    if (modal && input) {
        modal.classList.remove("hidden");
        input.value = ""; input.focus();
        renderItemList();
    }
}
function closeItemModal() { var modal = document.getElementById("itemSelectorModal"); if (modal) modal.classList.add("hidden"); CURRENT_SELECTING_SLOT = null; }

function renderItemList(filterText) {
    var list = document.getElementById("modalItemList");
    if (!list) return;
    list.innerHTML = "";
    var unequipDiv = document.createElement("div");
    unequipDiv.className = "item-row";
    unequipDiv.onclick = function () { selectItem(0); };
    unequipDiv.innerHTML = '<div class="item-row-icon" style="background:#333;"></div><div class="item-row-details"><div class="item-row-name" style="color:#888;">- Unequip -</div></div>';
    list.appendChild(unequipDiv);
    
    var slotKey = CURRENT_SELECTING_SLOT;
    if (slotKey.includes("Finger")) slotKey = "Finger";
    if (slotKey.includes("Trinket")) slotKey = "Trinket";
    if (slotKey === "Idol") slotKey = "Relic";

    var relevantItems = ITEM_DB.filter(function (i) {
        if (CURRENT_SELECTING_SLOT === "Main Hand") {
            // Include Feral Weapons (Staves, Maces, Polearms, Daggers/Fist if compatible)
            // Typically TwoHand, MainHand, OneHand
            // Druid weapons: Mace, Staff, Dagger, Fist, Polearm (Turtle)
            var s = i.slot.toLowerCase().replace(/[\s-]/g, "");
            if (s !== "mainhand" && s !== "onehand" && s !== "twohand") return false;
            // Filter by Druid weapon types if needed, simplified here by assuming ITEM_DB is filtered
            return true; 
        }

        if (CURRENT_SELECTING_SLOT === "Finger 1" && GEAR_SELECTION["Finger 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Finger 2" && GEAR_SELECTION["Finger 1"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 1" && GEAR_SELECTION["Trinket 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 2" && GEAR_SELECTION["Trinket 1"] == i.id) return false;

        if (CURRENT_SELECTING_SLOT === "Off Hand") return (i.slot === "Offhand" || i.slot === "Shield" || i.slot === "Held In Off-hand"); // Druids can hold items
        return i.slot === slotKey;
    });

    relevantItems.forEach(function (i) { i.simScore = calculateItemScore(i, CURRENT_SELECTING_SLOT); });
    relevantItems.sort(function (a, b) { return b.simScore - a.simScore; });

    if (filterText) {
        var ft = filterText.toLowerCase();
        relevantItems = relevantItems.filter(function (i) { return i.name.toLowerCase().includes(ft); });
    }

    relevantItems.slice(0, 100).forEach(function (item) {
        var iconUrl = getIconUrl(item.icon);
        var row = document.createElement("div");
        row.className = "item-row";
        row.onclick = function () { selectItem(item.id); };
        row.onmouseenter = function (e) { showTooltip(e, item); };
        row.onmousemove = function (e) { moveTooltip(e); };
        row.onmouseleave = function () { hideTooltip(); };

        var html = '<div class="item-row-icon"><img src="' + iconUrl + '" style="width:100%; height:100%; border-radius:3px;"></div>' +
            '<div class="item-row-details"><div class="item-row-name" style="color: ' + getItemColor(item.quality) + '">' + item.name + '</div><div class="item-row-sub">iLvl: ' + item.itemLevel + '</div></div>' +
            '<div class="item-score-badge"><span class="score-label">SCORE</span>' + item.simScore.toFixed(1) + '</div>';

        row.innerHTML = html;
        list.appendChild(row);
    });
}
function filterItemList() { var txt = document.getElementById("itemSearchInput").value; renderItemList(txt); }

function selectItem(itemId) {
    if (CURRENT_SELECTING_SLOT) {
        GEAR_SELECTION[CURRENT_SELECTING_SLOT] = itemId;
        // Two Hand Logic: Unequip Offhand
        if (CURRENT_SELECTING_SLOT === "Main Hand" && itemId != 0) {
            var item = ITEM_ID_MAP[itemId];
            if (item) {
                var s = item.slot.toLowerCase().replace(/[\s-]/g, "");
                if (s === "twohand") {
                    GEAR_SELECTION["Off Hand"] = 0;
                    showToast("Off-Hand unequipped.");
                }
            }
        }
    }
    closeItemModal();
    initGearPlannerUI();
    saveCurrentState();
}


// --- ENCHANT MODAL ---
function openEnchantSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("enchantSelectorModal");
    if (modal) {
        modal.classList.remove("hidden");
        renderEnchantList();
    }
}
function closeEnchantModal() { var modal = document.getElementById("enchantSelectorModal"); if (modal) modal.classList.add("hidden"); CURRENT_SELECTING_SLOT = null; }

function renderEnchantList() {
    var list = document.getElementById("modalEnchantList");
    if (!list) return;
    list.innerHTML = "";

    var unequipDiv = document.createElement("div");
    unequipDiv.className = "item-row";
    unequipDiv.onclick = function () { selectEnchant(0); };
    unequipDiv.innerHTML = '<div class="item-row-details"><div class="item-row-name" style="color:#888;">- No Enchant -</div></div>';
    list.appendChild(unequipDiv);

    var slotKey = CURRENT_SELECTING_SLOT;
    if (slotKey === "Main Hand") slotKey = "Weapon";

    var relevantEnchants = ENCHANT_DB.filter(function (e) {
        // Class Filter
        if (e.allowableClasses && e.allowableClasses !== -1 && (e.allowableClasses & 512) === 0) return false;
        
        // Slot Filter logic
        if (CURRENT_SELECTING_SLOT === "Main Hand") return (e.slot === "Weapon" || e.slot === "Two Hand");
        if (CURRENT_SELECTING_SLOT.includes("Finger")) return false; // Usually no finger enchants in Vanilla, but Turtle? Assuming none for now.
        return e.slot === CURRENT_SELECTING_SLOT || e.slot === slotKey;
    });

    relevantEnchants.forEach(function (e) { e.simScore = calculateEnchantScore(e); });
    relevantEnchants.sort(function (a, b) { return b.simScore - a.simScore; });

    relevantEnchants.forEach(function (ench) {
        var row = document.createElement("div");
        row.className = "item-row";
        row.onclick = function () { selectEnchant(ench.id); };
        row.onmouseenter = function (e) { showEnchantTooltip(e, ench.id); };
        row.onmousemove = function (e) { moveTooltip(e); };
        row.onmouseleave = function () { hideTooltip(); };

        var html = '<div class="item-row-details"><div class="item-row-name" style="color: #1eff00;">' + ench.name + '</div></div>' +
            '<div class="item-score-badge"><span class="score-label">SCORE</span>' + ench.simScore.toFixed(1) + '</div>';

        row.innerHTML = html;
        list.appendChild(row);
    });
}

function selectEnchant(enchId) {
    if (CURRENT_SELECTING_SLOT) ENCHANT_SELECTION[CURRENT_SELECTING_SLOT] = enchId;
    closeEnchantModal();
    initGearPlannerUI();
    saveCurrentState();
}

function resetGear() { GEAR_SELECTION = {}; ENCHANT_SELECTION = {}; initGearPlannerUI(); }
function recalcItemScores() {
    if (!document.getElementById("itemSelectorModal").classList.contains("hidden")) filterItemList();
}

// --- FERAL SCORE CALCULATIONS ---

function calculateItemScore(item, slotNameOverride) {
    if (!item) return 0;
    // Weights from UI
    var wAP = parseFloat(document.getElementById("weight_ap") ? document.getElementById("weight_ap").value : 1.0);
    var wCrit = parseFloat(document.getElementById("weight_crit") ? document.getElementById("weight_crit").value : 15.0);
    var wHit = parseFloat(document.getElementById("weight_hit") ? document.getElementById("weight_hit").value : 12.0);
    var wStr = parseFloat(document.getElementById("weight_str") ? document.getElementById("weight_str").value : 2.0); // 1 Str = 2 AP
    var wAgi = parseFloat(document.getElementById("weight_agi") ? document.getElementById("weight_agi").value : 2.0); // 1 Agi = 1 AP + Crit

    var score = 0;
    var e = item.effects || {};
    
    // Stats
    var str = item.strength || 0;
    var agi = item.agility || 0;
    var ap = (e.attackPower || 0) + (e.feralAttackPower || 0); // Turtle Feral AP
    var hit = e.hit || 0;
    var crit = e.crit || 0;
    var haste = e.haste || 0;

    score += str * wStr;
    score += agi * wAgi;
    score += ap * wAP;
    score += hit * wHit;
    score += crit * wCrit;
    score += haste * 10; // Rough weight for haste

    // Set Bonus Logic (Simplified count check)
    if (item.setName) {
        var currentSlot = slotNameOverride || CURRENT_SELECTING_SLOT;
        var otherSetItemsCount = 0;
        for (var slot in GEAR_SELECTION) {
            if (currentSlot && slot === currentSlot) continue;
            var id = GEAR_SELECTION[slot];
            if (id && id != 0) {
                var equipped = ITEM_ID_MAP[id];
                if (equipped && equipped.setName === item.setName) otherSetItemsCount++;
            }
        }
        var newTotalCount = otherSetItemsCount + 1;
        if (item.setBonuses) {
             var keys = Object.keys(item.setBonuses);
             keys.forEach(function(k) {
                 if (parseInt(k) === newTotalCount) {
                     var b = item.setBonuses[k];
                     score += (b.attackPower || 0) * wAP;
                     score += (b.crit || 0) * wCrit;
                     score += (b.hit || 0) * wHit;
                 }
             });
        }
    }
    return score;
}

function calculateEnchantScore(ench) {
    if (!ench) return 0;
    var wAP = parseFloat(document.getElementById("weight_ap") ? document.getElementById("weight_ap").value : 1.0);
    var wCrit = parseFloat(document.getElementById("weight_crit") ? document.getElementById("weight_crit").value : 15.0);
    var wStr = parseFloat(document.getElementById("weight_str") ? document.getElementById("weight_str").value : 2.0);
    var wAgi = parseFloat(document.getElementById("weight_agi") ? document.getElementById("weight_agi").value : 2.0);

    var score = 0;
    var e = ench.effects || {};
    score += (e.strength || 0) * wStr;
    score += (e.agility || 0) * wAgi;
    score += (e.attackPower || 0) * wAP;
    score += (e.crit || 0) * wCrit;
    
    return score;
}

function calculateGearStats() {
    // Base Stats
    var raceSel = document.getElementById("char_race");
    var raceName = raceSel ? raceSel.value : "Tauren";
    var baseStats = RACE_STATS[raceName] || RACE_STATS["Tauren"];

    var stats = {
        str: baseStats.str,
        agi: baseStats.agi,
        int: baseStats.int,
        stam: baseStats.stam,
        ap: 0,
        crit: baseStats.crit,
        hit: baseStats.hit,
        haste: 0,
        weaponDps: 0,
        mana: 0
    };

    // Gear Summation
    var setCounts = {};

    for (var slot in GEAR_SELECTION) {
        var id = GEAR_SELECTION[slot];
        if (id && id !== 0) {
            var item = ITEM_ID_MAP[id];
            if (item) {
                stats.str += (item.strength || 0);
                stats.agi += (item.agility || 0);
                stats.int += (item.intellect || 0);
                stats.stam += (item.stamina || 0);
                
                var e = item.effects || {};
                stats.ap += (e.attackPower || 0);
                stats.hit += (e.hit || 0);
                stats.crit += (e.crit || 0);
                stats.haste += (e.haste || 0);
                
                // Turtle Feral AP on Weapons
                if (slot === "Main Hand" || slot === "Two Hand" || slot === "One Hand") {
                    stats.ap += (e.feralAttackPower || 0);
                    // Base Weapon DPS Calculation
                    if (item.minDmg && item.maxDmg && item.speed) {
                        stats.weaponDps = ((item.minDmg + item.maxDmg) / 2) / item.speed;
                    }
                }

                if (item.setName) {
                    setCounts[item.setName] = (setCounts[item.setName] || 0) + 1;
                }
            }
        }
    }

    // Set Bonuses
    for (var setName in setCounts) {
        var count = setCounts[setName];
        var refItem = ITEM_DB.find(i => i.setName === setName);
        if (refItem && refItem.setBonuses) {
            Object.keys(refItem.setBonuses).forEach(k => {
                if (count >= parseInt(k)) {
                    var b = refItem.setBonuses[k];
                    stats.ap += (b.attackPower || 0);
                    stats.crit += (b.crit || 0);
                    stats.hit += (b.hit || 0);
                    stats.haste += (b.haste || 0);
                }
            });
        }
    }

    // Enchants
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

    // --- BUFFS ---
    // Flat Adds
    if (getVal("buff_motw")) { stats.str += 16; stats.agi += 16; stats.int += 16; stats.stam += 16; }
    if (getVal("buff_blessing_might")) { stats.ap += 185; }
    if (getVal("buff_trueshot")) { stats.ap += 100; }
    if (getVal("buff_str_scroll")) { stats.str += 20; } // Scroll IV
    if (getVal("buff_agi_scroll")) { stats.agi += 20; }
    if (getVal("buff_food")) { stats.str += 20; } // Smoked Desert Dumplings
    if (getVal("buff_juju_power")) { stats.str += 30; }
    if (getVal("buff_juju_might")) { stats.ap += 40; }
    if (getVal("buff_mongoose")) { stats.agi += 25; stats.crit += 2; }
    if (getVal("buff_giants")) { stats.str += 25; }
    if (getVal("buff_winterfall")) { stats.str += 35; }
    if (getVal("buff_leader")) { stats.crit += 3; }

    // Multipliers (BoK +10%)
    if (getVal("buff_bok") || getVal("buff_kings")) {
        stats.str = Math.floor(stats.str * 1.10);
        stats.agi = Math.floor(stats.agi * 1.10);
        stats.int = Math.floor(stats.int * 1.10);
        stats.stam = Math.floor(stats.stam * 1.10);
    }

    // Derived Stats (Cat Form)
    // 1 Str = 2 AP
    stats.ap += (stats.str * 2);
    // 1 Agi = 1 AP
    stats.ap += stats.agi;
    // 20 Agi = 1% Crit
    stats.crit += (stats.agi / 20);
    
    // Mana
    stats.mana = stats.int * 15;

    // --- UPDATE UI ---
    var isManual = document.getElementById("manual_stats") ? document.getElementById("manual_stats").checked : false;

    var updateInput = function (id, val, isPct) {
        var el = document.getElementById(id);
        if (!el) return;
        if (isManual) {
            el.disabled = false;
        } else {
            el.disabled = true;
            el.value = isPct ? val.toFixed(2) : Math.floor(val);
        }
    };

    updateInput("stat_str", stats.str, false);
    updateInput("stat_agi", stats.agi, false);
    updateInput("stat_ap", stats.ap, false);
    updateInput("stat_crit", stats.crit, true);
    updateInput("stat_hit", stats.hit, true);
    updateInput("stat_haste", stats.haste, true);
    updateInput("stat_wps", stats.weaponDps, false);
    updateInput("stat_int", stats.int, false);
    updateInput("stat_mana", stats.mana, false);

    // Update Gear Planner Preview
    setText("gp_ap", Math.floor(stats.ap));
    setText("gp_crit", stats.crit.toFixed(2) + "%");
    setText("gp_hit", stats.hit.toFixed(2) + "%");
}