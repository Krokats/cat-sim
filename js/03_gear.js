/**
 * Feral Simulation - File 3: Gear Planner Logic & Database
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Implements new Buffs/Consumables logic with OR conditions.
 */

var ITEM_ID_MAP = {};

// ============================================================================
// GEAR PLANNER LOGIC
// ============================================================================

async function loadDatabase() {
    showProgress("Loading Database...");
    try {
        updateProgress(20);
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
            if (i.itemLevel < 30 && i.slot !== "Relic" && i.slot !== "Idol") return false;

            // CLASS FILTER: 512 = Druid
            if (i.allowableClasses && i.allowableClasses !== -1 && (i.allowableClasses & 512) === 0) return false;

            // ARMOR FILTER: Only Cloth(1), Leather(2) or None(0)
            if (i.armorType && i.armorType > 2) return false;
            return true;
        });

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
            if (item.url) linkHtml = '<a href="' + item.url + '" target="_blank" class="slot-link-btn" title="Open in Database" onclick="event.stopPropagation()">🔗</a>';
        }

        var canEnchant = true;
        if (slotName.includes("Trinket") || slotName.includes("Idol") || slotName.includes("Relic") || slotName.includes("Off")) canEnchant = false;
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

// Tooltips & Modals (Standard)
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

    if (item.stamina) html += '<div class="tt-white">+' + item.stamina + ' Stamina</div>';
    if (item.strength) html += '<div class="tt-white">+' + item.strength + ' Strength</div>';
    if (item.agility) html += '<div class="tt-white">+' + item.agility + ' Agility</div>';
    if (item.intellect) html += '<div class="tt-white">+' + item.intellect + ' Intellect</div>';
    html += '<div class="tt-spacer"></div>';

    if (item.effects) {
        var eff = item.effects;
        if (eff.hit) html += '<div class="tt-green">Equip: Improves your chance to hit by ' + eff.hit + '%.</div>';
        if (eff.crit) html += '<div class="tt-green">Equip: Improves your chance to get a critical strike by ' + eff.crit + '%.</div>';
        if (eff.attackPower) html += '<div class="tt-green">Equip: + ' + eff.attackPower + ' Attack Power.</div>';
        if (eff.feralAttackPower) html += '<div class="tt-green">Equip: + ' + eff.feralAttackPower + ' Attack Power in Cat, Bear, and Dire Bear forms only.</div>';
        if (eff.custom && Array.isArray(eff.custom)) {
            eff.custom.forEach(function (line) { html += '<div class="tt-green">' + line + '</div>'; });
        }
    }
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
            for (var slot in GEAR_SELECTION) { if (GEAR_SELECTION[slot] == sItem.id) isEquipped = true; }
            var color = isEquipped ? '#ffff99' : '#888';
            html += '<div style="color:' + color + '; margin-left:10px;">' + sItem.name + '</div>';
        });
        html += '<div class="tt-spacer"></div>';
        if (item.setBonuses) {
            var keys = Object.keys(item.setBonuses).sort(function (a, b) { return a - b });
            keys.forEach(function (thresholdStr) {
                var threshold = parseInt(thresholdStr);
                var isActive = (equippedCount >= threshold);
                var color = isActive ? '#0f0' : '#888';
                html += '<div style="color:' + color + '">(' + threshold + ') Set Bonus</div>';
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
    if (ench.text) { html += '<div class="tt-green">' + ench.text + '</div>'; }
    else if (ench.effects) {
        var ef = ench.effects;
        if (ef.agility) html += '<div class="tt-green">+' + ef.agility + ' Agility</div>';
        if (ef.strength) html += '<div class="tt-green">+' + ef.strength + ' Strength</div>';
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
    var title = document.getElementById("modalTitle");
    var input = document.getElementById("itemSearchInput");
    if (modal && title && input) {
        title.innerText = "Select " + slotName;
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
            var s = i.slot.toLowerCase().replace(/[\s-]/g, "");
            if (s !== "mainhand" && s !== "onehand" && s !== "twohand") return false;
            var validTypes = [4, 5, 6, 10, 13];
            return validTypes.indexOf(i.weaponType) !== -1;
        }

        if (CURRENT_SELECTING_SLOT === "Finger 1" && GEAR_SELECTION["Finger 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Finger 2" && GEAR_SELECTION["Finger 1"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 1" && GEAR_SELECTION["Trinket 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 2" && GEAR_SELECTION["Trinket 1"] == i.id) return false;

        if (CURRENT_SELECTING_SLOT === "Off Hand") return (i.slot === "Offhand" || i.slot === "Shield");
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
            '<div class="item-score-badge"><span class="score-label">EP</span>' + item.simScore.toFixed(1) + '</div>';
        row.innerHTML = html;
        list.appendChild(row);
    });
}
function filterItemList() { var txt = document.getElementById("itemSearchInput").value; renderItemList(txt); }
function selectItem(itemId) {
    if (CURRENT_SELECTING_SLOT) {
        GEAR_SELECTION[CURRENT_SELECTING_SLOT] = itemId;
        if (CURRENT_SELECTING_SLOT === "Main Hand" && itemId != 0) {
            var item = ITEM_ID_MAP[itemId];
            if (item && (item.slot === "Twohand" || item.slot === "Staff" || item.slot === "Polearm")) {
                GEAR_SELECTION["Off Hand"] = 0;
            }
        }
    }
    closeItemModal();
    initGearPlannerUI();
    saveCurrentState();
    // FORCE UI UPDATE AFTER GEAR CHANGE
    if (typeof updatePlayerStats === 'function') updatePlayerStats();
    if (typeof updateEnemyInfo === 'function') updateEnemyInfo();
}

// --- ENCHANT MODAL ---
function openEnchantSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("enchantSelectorModal");
    var title = document.getElementById("enchantModalTitle");
    if (modal && title) {
        title.innerText = "Enchant " + slotName;
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
    if (slotKey.includes("Finger")) slotKey = "Finger";
    if (slotKey === "Main Hand") slotKey = "Two Hand";
    var relevantEnchants = ENCHANT_DB.filter(function (e) { return e.slot === slotKey || e.slot === CURRENT_SELECTING_SLOT; });
    relevantEnchants.forEach(function (e) { e.simScore = calculateEnchantScore(e); });
    relevantEnchants.sort(function (a, b) { return b.simScore - a.simScore; });
    relevantEnchants.forEach(function (ench) {
        var row = document.createElement("div");
        row.className = "item-row";
        row.onclick = function () { selectEnchant(ench.id); };
        row.onmouseenter = function (e) { showEnchantTooltip(e, ench.id); };
        row.onmousemove = function (e) { moveTooltip(e); };
        row.onmouseleave = function () { hideTooltip(); };
        var desc = ench.text || "";
        var html = '<div class="item-row-details"><div class="item-row-name" style="color: #1eff00;">' + ench.name + '</div><div class="item-row-sub">' + desc + '</div></div>' +
            '<div class="item-score-badge"><span class="score-label">EP</span>' + ench.simScore.toFixed(1) + '</div>';
        row.innerHTML = html;
        list.appendChild(row);
    });
}
function selectEnchant(enchId) {
    if (CURRENT_SELECTING_SLOT) ENCHANT_SELECTION[CURRENT_SELECTING_SLOT] = enchId;
    closeEnchantModal();
    initGearPlannerUI();
    saveCurrentState();
    // FORCE UI UPDATE AFTER ENCHANT CHANGE
    if (typeof updatePlayerStats === 'function') updatePlayerStats();
    if (typeof updateEnemyInfo === 'function') updateEnemyInfo();
}
function resetGear() {
    GEAR_SELECTION = {};
    ENCHANT_SELECTION = {};
    initGearPlannerUI();
    if (typeof updatePlayerStats === 'function') updatePlayerStats();
}
function recalcItemScores() {
    if (!document.getElementById("itemSelectorModal").classList.contains("hidden")) {
        renderItemList(document.getElementById("itemSearchInput").value);
    }
    initGearPlannerUI();

}

// SCORING
function calculateItemScore(item, slotNameOverride) {
    if (!item) return 0;
    var wAP = parseFloat(getVal("weight_ap") || 1.0);
    var wStr = parseFloat(getVal("weight_str") || 2.4);
    var wAgi = parseFloat(getVal("weight_agi") || 2.5);
    var wCrit = parseFloat(getVal("weight_crit") || 22.0);
    var wHit = parseFloat(getVal("weight_hit") || 18.0);
    var score = 0;
    var e = item.effects || {};
    score += (item.strength || 0) * wStr;
    score += (item.agility || 0) * wAgi;
    score += (e.attackPower || 0) * wAP;
    score += (e.feralAttackPower || 0) * wAP;
    score += (e.crit || 0) * wCrit;
    score += (e.hit || 0) * wHit;
    if (e.custom && Array.isArray(e.custom)) {
        e.custom.forEach(function (line) {
            var matchAP = line.match(/Equip: \+(\d+) Attack Power/i);
            if (matchAP) {
                if (line.includes("Cat") || line.includes("forms") || !line.includes("form")) score += parseInt(matchAP[1]) * wAP;
            }
        });
    }
    return score;
}

function calculateEnchantScore(ench) {
    if (!ench) return 0;
    var wAP = 1.0; var wStr = 2.4; var wAgi = 2.5;
    var score = 0;
    var stats = ench.effects || {};
    score += (stats.strength || 0) * wStr;
    score += (stats.agility || 0) * wAgi;
    score += (stats.attackPower || 0) * wAP;
    return score;
}

// ----------------------------------------------------------------------------
// STAT CALCULATION ENGINE (Updated for 1.18 Buffs)
// ----------------------------------------------------------------------------
function calculateGearStats() {
    var raceSel = document.getElementById("char_race");
    var raceName = raceSel ? raceSel.value : "Tauren";
    var race = RACE_STATS[raceName] || RACE_STATS["Tauren"];

    // 1. Calculate Hidden Base Values
    // Nackter AP Wert im Character Screen = RACE_STATS.ap
    // Davon kommt ein Teil aus den Basis-Attributen: Str*2 + Agi*1
    // Der Rest ist eine "versteckte" Base AP.
    var baseApFromStats = (race.str * 2) + (race.agi * 1);
    var hiddenBaseAp = race.ap - baseApFromStats;

    // Nackter Crit Wert = RACE_STATS.crit
    // Davon kommt ein Teil aus Agi: Agi / 20 (0.05)
    var baseCritFromStats = race.agi * 0.05;
    var hiddenBaseCrit = race.crit - baseCritFromStats;

    // 2. Initialize Bonus Accumulators
    var bonus = { str: 0, agi: 0, int: 0, ap: 0, crit: 0, hit: 0, haste: 0 };
    var setCounts = {};
    var hasWolfshead = false; var hasMCP = false; var hasT05_4p = false;

    // 3. Sum Items
    for (var slot in GEAR_SELECTION) {
        var id = GEAR_SELECTION[slot];
        if (id && typeof id === 'object' && id.id) id = id.id;
        if (id && id !== 0) {
            var item = ITEM_ID_MAP[id];
            if (item) {
                var e = item.effects || {};
                bonus.str += (item.strength || 0);
                bonus.agi += (item.agility || 0);
                bonus.int += (item.intellect || 0);
                bonus.ap += (e.attackPower || 0);
                bonus.ap += (e.feralAttackPower || 0);
                bonus.crit += (e.crit || 0);
                bonus.hit += (e.hit || 0);
                if (e.custom && Array.isArray(e.custom)) {
                    e.custom.forEach(function(line) {
                        var matchAP = line.match(/Equip: \+(\d+) Attack Power/i);
                        if (matchAP) {
                            if (line.includes("Cat") || line.includes("forms")) bonus.ap += parseInt(matchAP[1]);
                        }
                    });
                }
                if (item.setName) {
                    if (!setCounts[item.setName]) setCounts[item.setName] = 0;
                    setCounts[item.setName]++;
                }
                if (item.id === 8345) hasWolfshead = true;
                if (item.id === 9449) hasMCP = true;
            }
        }
    }

    // 4. Sum Enchants
    for (var slot in ENCHANT_SELECTION) {
        var eid = ENCHANT_SELECTION[slot];
        if (eid && eid !== 0) {
            var ench = ENCHANT_DB.find(e => e.id == eid);
            if (ench && ench.effects) {
                bonus.str += (ench.effects.strength || 0);
                bonus.agi += (ench.effects.agility || 0);
                bonus.ap += (ench.effects.attackPower || 0);
                bonus.crit += (ench.effects.crit || 0);
                bonus.hit += (ench.effects.hit || 0);
                bonus.haste += (ench.effects.haste || 0);
            }
        }
    }

    // 5. BUFFS & CONSUMABLES
    // MotW
    var valMotW = getVal("buff_motw");
    if (valMotW === "reg") { bonus.str += 12; bonus.agi += 12; bonus.int += 12; }
    else if (valMotW === "imp") { bonus.str += 16; bonus.agi += 16; bonus.int += 16; }

    // Might & Battle Shout
    var valMight = getVal("buff_might");
    if (valMight === "reg") bonus.ap += 185; else if (valMight === "imp") bonus.ap += 240;
    var valBS = getVal("buff_bs");
    if (valBS === "reg") bonus.ap += 232; else if (valBS === "imp") bonus.ap += 290;

    // Totems
    if (getVal("buff_goa_totem")) bonus.agi += 77;
    if (getVal("buff_soe_totem")) bonus.str += 77;

    // Trueshot Aura (Flat or Mod)
    var apMod = 1.0;
    var valTSA = getVal("buff_tsa");
    if (valTSA === "reg") bonus.ap += 55; else if (valTSA === "mod") apMod *= 1.05;

    // Consumables
    if (getVal("consum_mongoose")) { bonus.agi += 25; bonus.crit += 1; }
    
    var valWep = getVal("consum_wep");
    if (valWep === "elemental") bonus.crit += 2;
    else if (valWep === "consecrated") {
        if (getVal("enemy_type") === "undead") bonus.ap += 100;
    }

    var valBlast = getVal("consum_blasted");
    if (valBlast === "scorpok") bonus.agi += 25; else if (valBlast === "roids") bonus.str += 25;

    if (getVal("consum_juju_power")) bonus.str += 30; 
    var valJuju = getVal("consum_juju");
    if (valJuju === "firewater") bonus.ap += 35; else if (valJuju === "might") bonus.ap += 40;

    var valFood = getVal("consum_food");
    if (valFood === "str") bonus.str += 20;
    else if (valFood === "agi") bonus.agi += 10;
    else if (valFood === "haste") bonus.haste += 2;

    // Warchief's Blessing (UI ID check directly for safety)
    var elWB = document.getElementById("buff_warchief");
    if(elWB && elWB.checked) bonus.haste += 15;

    // 6. APPLY STAT MULTIPLIERS
    var statMod = 1.0;
    if (getVal("buff_kings")) statMod *= 1.10;
    var hotwMod = 1.20; // 5/5

    // Total Attributes
    var finalStr = Math.floor((race.str + bonus.str) * statMod * hotwMod);
    var finalInt = Math.floor((race.int + bonus.int) * statMod * hotwMod);
    var finalAgi = Math.floor((race.agi + bonus.agi) * statMod); // No HotW for Agi

    // 7. FINAL CALCULATIONS
    // AP = HiddenBase + (Str*2) + (Agi*1) + BonusAP
    var finalAP = hiddenBaseAp + (finalStr * 2) + (finalAgi * 1) + bonus.ap;
    
    // Predatory Strikes (3/3): +10% AP
    apMod *= 1.10;
    finalAP = Math.floor(finalAP * apMod);

    // Crit = HiddenBase + (Agi / 20) + BonusCrit
    var critFromAgi = finalAgi / 20.0;
    var finalCrit = hiddenBaseCrit + critFromAgi + bonus.crit;
    
    // Talent/Buff Crits
    if (getVal("buff_lotp")) finalCrit += 3.0;
    finalCrit += 6.0; // Sharpened Claws

    // Hit
    var finalHit = bonus.hit + 3.0; // Natural Weapons

    // 8. UPDATE UI
    // Update Set checkboxes
    if (setCounts["The Feralheart"] >= 4) hasT05_4p = true; 
    var elWolf = document.getElementById("meta_wolfshead"); if (elWolf) elWolf.checked = hasWolfshead;
    var elMCP = document.getElementById("item_mcp"); if (elMCP) elMCP.checked = hasMCP;
    var elT05 = document.getElementById("set_t05_4p"); if (elT05) elT05.checked = hasT05_4p;

    // Write to Inputs
    var isManual = document.getElementById("manual_stats") ? document.getElementById("manual_stats").checked : false;
    var updateInput = function (id, val, isPct) {
        var el = document.getElementById(id);
        if (!el) return;
        if (isManual) { el.disabled = false; } 
        else { el.disabled = true; el.value = isPct ? val.toFixed(2) : Math.floor(val); }
    };

    updateInput("stat_str", finalStr, false);
    updateInput("stat_agi", finalAgi, false);
    updateInput("stat_ap", finalAP, false);
    updateInput("stat_crit", finalCrit, true);
    updateInput("stat_hit", finalHit, false);
    updateInput("stat_haste", bonus.haste, false);
    updateInput("stat_wep_skill", race.wepSkill || 300, false); 
    updateInput("stat_wep_dmg_min", race.minDmg, false);
    updateInput("stat_wep_dmg_max", race.maxDmg, false);
    
    // Update Planner Preview Box
    var elP_AP = document.getElementById("gp_ap"); if (elP_AP) elP_AP.innerText = Math.floor(finalAP);
    var elP_Crit = document.getElementById("gp_crit"); if (elP_Crit) elP_Crit.innerText = finalCrit.toFixed(2) + "%";
    var elP_Hit = document.getElementById("gp_hit"); if (elP_Hit) elP_Hit.innerText = finalHit.toFixed(2) + "%";
}