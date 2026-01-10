/**
 * Feral Simulation - File 3: Gear Planner Logic & Database
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Fixed: Weapon Skills (Mace/Polearm) ignored for Feral. Only 'Feral Combat' counts.
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
            if (i.itemLevel < 35 && i.slot !== "Relic" && i.slot !== "Idol" && i.slot !== "Trinket") return false;

            // ARMOR FILTER: Cloth(1), Leather(2) only.
            if (i.armorType && i.armorType > 2) return false;
            
            // WEAPON FILTER: Exclude Shields
            if (i.slot === "Shield") return false;

            // STAT FILTER
            var interesting = false;
            // Known IDs (Wolfshead, MCP, etc)
            if (i.id === 8345 || i.id === 9449 || i.id === 23207) interesting = true;
            
            // Stats check
            if (i.agility > 0 || i.strength > 0) interesting = true;
            if (i.effects) {
                if (i.effects.attackPower > 0 || i.effects.feralAttackPower > 0 || i.effects.crit > 0 || i.effects.hit > 0) interesting = true;
                // Custom Text Check for "Cat", "Feral", "Attack Power", "Feral Combat"
                if (i.effects.custom && Array.isArray(i.effects.custom)) {
                    var customStr = i.effects.custom.join(" ");
                    if (customStr.includes("Attack Power") || customStr.includes("Cat") || customStr.includes("Feral")) interesting = true;
                }
            }
            
            return interesting;
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
        
        // Haste logic (MCP)
        if (item.id === 9449) html += '<div class="tt-green">Use: Increases attack speed by 50% for 30 sec. (3 Charges)</div>';

        // Custom Text Lines (Turtle WoW)
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

    if (ench.text) {
        html += '<div class="tt-green">' + ench.text + '</div>';
    } else if (ench.effects) {
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
    
    var relevantItems = ITEM_DB.filter(function (i) {
        if (CURRENT_SELECTING_SLOT === "Finger 1" && GEAR_SELECTION["Finger 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Finger 2" && GEAR_SELECTION["Finger 1"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 1" && GEAR_SELECTION["Trinket 2"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Trinket 2" && GEAR_SELECTION["Trinket 1"] == i.id) return false;
        if (CURRENT_SELECTING_SLOT === "Main Hand") {
             return i.slot === "Mainhand" || i.slot === "Onehand" || i.slot === "Twohand";
        }
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

    var relevantEnchants = ENCHANT_DB.filter(function (e) {
        return e.slot === slotKey || e.slot === CURRENT_SELECTING_SLOT;
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

        var desc = ench.text || "";
        var html = '<div class="item-row-details"><div class="item-row-name" style="color: #1eff00;">' + ench.name + '</div><div class="item-row-sub">' + desc + '</div></div>' +
            '<div class="item-score-badge"><span class="score-label">EP</span>' + ench.simScore.toFixed(1) + '</div>';

        row.innerHTML = html;
        list.appendChild(row);
    });
}

function selectEnchant(enchId) {
    if (CURRENT_SELECTING_SLOT) {
        ENCHANT_SELECTION[CURRENT_SELECTING_SLOT] = enchId;
    }
    closeEnchantModal();
    initGearPlannerUI();
    saveCurrentState(); 
}

function resetGear() { GEAR_SELECTION = {}; ENCHANT_SELECTION = {}; initGearPlannerUI(); }
function recalcItemScores() {
    if (!document.getElementById("itemSelectorModal").classList.contains("hidden")) {
        renderItemList(document.getElementById("itemSearchInput").value);
    }
    initGearPlannerUI(); 
}

// ----------------------------------------------------------------------------
// SCORING (Equivalence Points - EP)
// ----------------------------------------------------------------------------
function calculateItemScore(item, slotNameOverride) {
    if (!item) return 0;
    
    // Defaults (Approximate Feral Weights)
    var wAP = parseFloat(getVal("weight_ap") || 1.0);
    var wStr = parseFloat(getVal("weight_str") || 2.4); 
    var wAgi = parseFloat(getVal("weight_agi") || 2.5); 
    var wCrit = parseFloat(getVal("weight_crit") || 22.0); 
    var wHit = parseFloat(getVal("weight_hit") || 18.0);
    
    var score = 0;
    var e = item.effects || {};

    // 1. BASE STATS
    score += (item.strength || 0) * wStr;
    score += (item.agility || 0) * wAgi;
    score += (e.attackPower || 0) * wAP;
    score += (e.feralAttackPower || 0) * wAP;

    score += (e.crit || 0) * wCrit;
    score += (e.hit || 0) * wHit;

    // CUSTOM TEXT PARSING (Turtle WoW)
    if (e.custom && Array.isArray(e.custom)) {
        e.custom.forEach(function(line) {
            // "Equip: +322 Attack Power in Cat..."
            var matchAP = line.match(/Equip: \+(\d+) Attack Power/i);
            if (matchAP) {
                if (line.includes("Cat") || line.includes("forms") || !line.includes("form")) {
                     score += parseInt(matchAP[1]) * wAP;
                }
            }
        });
    }

    // Special Items
    if (item.id === 8345) score += 300; // Wolfshead Helm
    if (item.id === 9449) score += 500; // MCP
    if (item.id === 23207) score += 50; // Badge of the Swarmguard

    return score;
}

function calculateEnchantScore(ench) {
    if (!ench) return 0;
    var wAP = 1.0;
    var wStr = 2.4;
    var wAgi = 2.5;
    
    var score = 0;
    var stats = ench.effects || {};
    
    score += (stats.strength || 0) * wStr;
    score += (stats.agility || 0) * wAgi;
    score += (stats.attackPower || 0) * wAP;

    return score;
}

// ----------------------------------------------------------------------------
// STAT CALCULATION ENGINE
// ----------------------------------------------------------------------------
function calculateGearStats() {
    var raceSel = document.getElementById("char_race");
    var raceName = raceSel ? raceSel.value : "Tauren";
    var baseStats = RACE_STATS[raceName] || RACE_STATS["Tauren"];

    var cs = {
        str: baseStats.str,
        agi: baseStats.agi,
        ap: 0,
        crit: 0,
        hit: 0,
        haste: 0,
        wepSkill: 300, // Fixed Feral Skill
        wepDmgMin: 0,
        wepDmgMax: 0
    };

    var setCounts = {};
    var hasWolfshead = false;
    var hasMCP = false;
    var hasT05_4p = false;

    // 2. ITEMS
    for (var slot in GEAR_SELECTION) {
        var id = GEAR_SELECTION[slot];
        if (id && typeof id === 'object' && id.id) id = id.id;

        if (id && id !== 0) {
            var item = ITEM_ID_MAP[id];
            if (item) {
                var e = item.effects || {};
                
                cs.str += (item.strength || 0);
                cs.agi += (item.agility || 0);
                cs.ap += (e.attackPower || 0);
                cs.ap += (e.feralAttackPower || 0);

                cs.crit += (e.crit || 0);
                cs.hit += (e.hit || 0);
                
                // Track Weapon Damage if it's Main Hand (for potential Engine usage)
                if (slot === "Main Hand") {
                    // Engine will decide whether to use this or base paw damage
                    // But we store it here
                }

                // CUSTOM TEXT PARSING (Turtle WoW Custom Feral Items)
                if (e.custom && Array.isArray(e.custom)) {
                    e.custom.forEach(function(line) {
                        // Regex for "+X Attack Power in Cat"
                        var matchAP = line.match(/Equip: \+(\d+) Attack Power/i);
                        if (matchAP) {
                            if (line.includes("Cat") || line.includes("forms")) {
                                cs.ap += parseInt(matchAP[1]);
                            }
                        }
                        // Regex for "Increased Feral Combat +5" (Turtle Specific)
                        // IGNORE Polearms/Maces as per user instruction
                        var matchSkill = line.match(/Equip: Increased Feral Combat \+(\d+)/i);
                        if (matchSkill) {
                            cs.wepSkill += parseInt(matchSkill[1]);
                        }
                    });
                }

                // Track Sets
                if (item.setName) {
                    if (!setCounts[item.setName]) setCounts[item.setName] = 0;
                    setCounts[item.setName]++;
                }

                // Special Flags
                if (item.id === 8345) hasWolfshead = true;
                if (item.id === 9449) hasMCP = true;
            }
        }
    }

    // 3. ENCHANTS
    for (var slot in ENCHANT_SELECTION) {
        var eid = ENCHANT_SELECTION[slot];
        if (eid && eid !== 0) {
            var ench = ENCHANT_DB.find(e => e.id == eid);
            if (ench && ench.effects) {
                cs.str += (ench.effects.strength || 0);
                cs.agi += (ench.effects.agility || 0);
                cs.ap += (ench.effects.attackPower || 0);
                cs.crit += (ench.effects.crit || 0);
                cs.hit += (ench.effects.hit || 0);
                cs.haste += (ench.effects.haste || 0);
            }
        }
    }

    // 4. BUFFS & CONSUMABLES
    if (getVal("buff_motw")) { cs.str += 12; cs.agi += 12; }
    if (getVal("buff_mongoose")) { cs.agi += 25; cs.crit += 2; }
    if (getVal("buff_juju_power")) { cs.str += 30; }
    if (getVal("buff_juju_might")) { cs.ap += 40; }
    if (getVal("buff_winterfall")) { cs.str += 35; } 
    if (getVal("buff_food_str")) { cs.str += 20; }
    if (getVal("buff_food_agi")) { cs.agi += 20; }
    if (getVal("buff_onyxia")) { cs.crit += 5; cs.ap += 140; }
    if (getVal("buff_songflower")) { cs.str += 15; cs.agi += 15; cs.crit += 5; }
    if (getVal("buff_warchief")) { cs.haste += 15; } 
    
    if (getVal("buff_might")) { cs.ap += 222; }
    if (getVal("buff_battle_shout")) { cs.ap += 290; }
    if (getVal("buff_trueshot")) { cs.ap += 100; }
    
    // 5. MULTIPLIERS (Kings, Zandalar)
    var statMod = 1.0;
    if (getVal("buff_bok")) statMod *= 1.1;
    if (getVal("buff_zandalar")) statMod *= 1.15;
    
    cs.str = Math.floor(cs.str * statMod);
    cs.agi = Math.floor(cs.agi * statMod);
    
    // 6. DERIVED STATS
    // 1 Str = 2 AP, 1 Agi = 1 AP
    cs.ap += (cs.str * 2) + (cs.agi * 1);
    
    // 20 Agi = 1% Crit
    var critFromAgi = cs.agi / 20.0;
    cs.crit += critFromAgi;
    
    if (getVal("buff_leader_pack")) cs.crit += 3;

    // 7. SET BONUSES & UI FLAGS
    if (setCounts["The Feralheart"] >= 4) hasT05_4p = true; 

    var elWolf = document.getElementById("meta_wolfshead"); if (elWolf) elWolf.checked = hasWolfshead;
    var elMCP = document.getElementById("item_mcp"); if (elMCP) elMCP.checked = hasMCP;
    var elT05 = document.getElementById("set_t05_4p"); if (elT05) elT05.checked = hasT05_4p;

    // 8. UPDATE OUTPUT FIELDS
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

    updateInput("stat_str", cs.str, false);
    updateInput("stat_agi", cs.agi, false);
    updateInput("stat_ap", cs.ap, false);
    updateInput("stat_crit", cs.crit, true);
    updateInput("stat_hit", cs.hit, false);
    updateInput("stat_haste", cs.haste, false);
    
    // Update Weapon Skill in Input
    updateInput("stat_wep_skill", cs.wepSkill, false); 
    
    // Preview Box
    var elP_AP = document.getElementById("gp_ap"); if (elP_AP) elP_AP.innerText = Math.floor(cs.ap);
    var elP_Crit = document.getElementById("gp_crit"); if (elP_Crit) elP_Crit.innerText = cs.crit.toFixed(2) + "%";
    var elP_Hit = document.getElementById("gp_hit"); if (elP_Hit) elP_Hit.innerText = cs.hit.toFixed(2) + "%";
    
    // Default Feral Weapon Damage (Level 60 Paw) ~54-55 DPS?
    // We set placeholder here, Engine will calculate.
    updateInput("stat_wep_dmg_min", 55, false);
    updateInput("stat_wep_dmg_max", 85, false);
}
