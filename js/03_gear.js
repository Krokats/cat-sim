/**
 * Moonkin Simulation - File 3: Gear Planner Logic & Database
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
            if((i.quality || 0) < 2) return false; 
            if(i.itemLevel < 30 && i.slot !== "Relic" && i.slot !== "Idol") return false;
            
            // CLASS FILTER: 512 = Druid
            if (i.allowableClasses && i.allowableClasses !== -1 && (i.allowableClasses & 512) === 0) return false;

            // ARMOR FILTER: Only Cloth(1), Leather(2) or None(0)
            if (i.armorType && i.armorType > 2) return false;
            return true;
        });
        
        // Build Map for O(1) lookup
        ITEM_ID_MAP = {};
        ITEM_DB.forEach(i => { ITEM_ID_MAP[i.id] = i; });
        
        ENCHANT_DB = enchants;

        initGearPlannerUI();
        var statusEl = document.getElementById("dbStatus");
        if(statusEl) { 
            statusEl.innerText = "Loaded (" + ITEM_DB.length + " items, " + ENCHANT_DB.length + " enchants)"; 
            statusEl.style.color = "#4caf50"; 
        }
        updateProgress(100);
    } catch(e) {
        console.error("DB Load Failed:", e);
        var statusEl = document.getElementById("dbStatus");
        if(statusEl) statusEl.innerText = "Error loading database files.";
    } finally { hideProgress(); }
}


function initGearPlannerUI() {
    if(!document.getElementById('charLeftCol')) return;
    renderSlotColumn("left", "charLeftCol");
    renderSlotColumn("right", "charRightCol");
    renderSlotColumn("bottom", "charBottomRow");
    calculateGearStats(); 
}


function getIconUrl(iconName) {
    if(!iconName) return "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg";
    var cleanName = iconName.replace(/\\/g, "/").split("/").pop().replace(/\.jpg|\.png/g, "").toLowerCase();
    // Use local folder
    return "data/wow-icons/" + cleanName + ".jpg";
}

function renderSlotColumn(pos, containerId) {
    var container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = "";

    SLOT_LAYOUT[pos].forEach(function(slotName) {
        var itemId = GEAR_SELECTION[slotName];
        // Handle ID or Object (Legacy Safety)
        if (itemId && typeof itemId === 'object' && itemId.id) itemId = itemId.id;

        var item = itemId ? ITEM_ID_MAP[itemId] : null;
        var enchantId = ENCHANT_SELECTION[slotName];
        var enchant = enchantId ? ENCHANT_DB.find(e => e.id == enchantId) : null;

        var div = document.createElement("div");
        div.className = "char-slot";
        
        // Simple Tooltip logic
        div.onmouseenter = function(e) { showTooltip(e, item); };
        div.onmousemove = function(e) { moveTooltip(e); };
        div.onmouseleave = function() { hideTooltip(); };

        var iconUrl = "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg";
        var rarityClass = "q0";
        var displayName = slotName;
        var statText = "Empty Slot";
        var linkHtml = "";
        
        if(item) {
            iconUrl = getIconUrl(item.icon);
            rarityClass = "q" + (item.quality || 1);
            displayName = item.name;
            // NEW: Pass slotName to calculate score correctly (including active sets)
            var s = calculateItemScore(item, slotName);
            statText = "Score: " + s.toFixed(1) + " | iLvl: " + item.itemLevel;

            // LINK BUTTON LOGIC
            if(item.url) {
                linkHtml = '<a href="' + item.url + '" target="_blank" class="slot-link-btn" title="Open in Database" onclick="event.stopPropagation()">🔗</a>';
            }
        }

        // --- ENCHANT RENDER LOGIC ---
        var canEnchant = true;
        if(slotName.includes("Trinket") || slotName.includes("Idol") || slotName.includes("Relic") || slotName.includes("Off")) canEnchant = false;

        var enchantHtml = "";
        if (canEnchant) {
             var enchName = enchant ? enchant.name : "+ Enchant";
             var enchStyle = enchant ? "color:#0f0; font-size:0.75rem;" : "color:#555; font-size:0.7rem; font-style:italic;";
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
    if(!item) return;
    var tt = document.getElementById("wowTooltip");
    if(!tt) return;
    tt.style.display = "block";
    
    var qualityColor = getItemColor(item.quality);
    var iconUrl = getIconUrl(item.icon);

    var html = '<div class="tt-header"><div class="tt-icon-small" style="background-image:url(\'' + iconUrl + '\')"></div><div style="flex:1"><div class="tt-name" style="color:' + qualityColor + '">' + item.name + '</div></div></div>';
    if(item.itemLevel) html += '<div class="tt-white">Item Level ' + item.itemLevel + '</div>';
    if(item.slot) html += '<div class="tt-white">' + item.slot + '</div>';
    if(item.armor) html += '<div class="tt-white">' + item.armor + ' Armor</div>';
    html += '<div class="tt-spacer"></div>';
    if(item.stamina) html += '<div class="tt-white">+' + item.stamina + ' Stamina</div>';
    if(item.intellect) html += '<div class="tt-white">+' + item.intellect + ' Intellect</div>';
    if(item.spirit) html += '<div class="tt-white">+' + item.spirit + ' Spirit</div>';
    if(item.agility) html += '<div class="tt-white">+' + item.agility + ' Agility</div>';
    if(item.strength) html += '<div class="tt-white">+' + item.strength + ' Strength</div>';
    html += '<div class="tt-spacer"></div>';

    if(item.effects) {
        var eff = item.effects;
        if(eff.spellHaste) html += '<div class="tt-green">Equip: Increase your attack and casting speed by ' + eff.spellHaste + '%.</div>';
        if(eff.spellPower) html += '<div class="tt-green">Equip: Increases damage and healing done by magical spells and effects by up to ' + eff.spellPower + '.</div>';
        if(eff.arcaneSpellPower) html += '<div class="tt-green">Equip: Increases damage done by Arcane spells and effects by up to ' + eff.arcaneSpellPower + '.</div>';
        if(eff.natureSpellPower) html += '<div class="tt-green">Equip: Increases damage done by Nature spells and effects by up to ' + eff.natureSpellPower + '.</div>';
        if(eff.spellCrit) html += '<div class="tt-green">Equip: Improves your chance to get a critical strike with spells by ' + eff.spellCrit + '%.</div>';
        if(eff.spellHit) html += '<div class="tt-green">Equip: Improves your chance to hit with spells by ' + eff.spellHit + '%.</div>';
        if(eff.mp5) html += '<div class="tt-green">Equip: Restores ' + eff.mp5 + ' mana per 5 sec.</div>';

        if(eff.custom && Array.isArray(eff.custom)) {
            eff.custom.forEach(function(line) {
                html += '<div class="tt-green">' + line + '</div>';
            });
        }
    }

    // SET INFORMATION LOGIC
    if(item.setName) {
        html += '<div class="tt-spacer"></div>';
        
        var siblings = ITEM_DB.filter(function(i) { return i.setName === item.setName; });
        var equippedCount = 0;
        for(var slot in GEAR_SELECTION) {
            var gid = GEAR_SELECTION[slot];
            // Safety check for ID
            if(gid && (typeof gid === 'number' || typeof gid === 'string') && gid != 0) {
                var gItem = ITEM_ID_MAP[gid];
                if(gItem && gItem.setName === item.setName) equippedCount++;
            }
        }

        html += '<div class="tt-gold">' + item.setName + ' (' + equippedCount + '/' + siblings.length + ')</div>';
        
        siblings.forEach(function(sItem) {
            var isEquipped = false;
            for(var slot in GEAR_SELECTION) {
                // Loose equality for String/Number ID match
                if(GEAR_SELECTION[slot] == sItem.id) isEquipped = true;
            }
            var color = isEquipped ? '#ffff99' : '#888';
            html += '<div style="color:' + color + '; margin-left:10px;">' + sItem.name + '</div>';
        });

        html += '<div class="tt-spacer"></div>';
        
        if(item.setBonuses) {
            if(Array.isArray(item.setBonuses)) {
                item.setBonuses.forEach(function(bonusText) {
                    var threshold = 0;
                    var match = bonusText.match(/^(\d+)|\((\d+)\)/);
                    if(match) threshold = parseInt(match[1] || match[2]);
                    var isActive = (threshold > 0) ? (equippedCount >= threshold) : false;
                    var color = isActive ? '#0f0' : '#888';
                    html += '<div style="color:' + color + '">' + bonusText + '</div>';
                });
            } else {
                var keys = Object.keys(item.setBonuses).sort(function(a,b){return a-b});
                keys.forEach(function(thresholdStr) {
                    var threshold = parseInt(thresholdStr);
                    var bonusData = item.setBonuses[thresholdStr];
                    var isActive = (equippedCount >= threshold);
                    var color = isActive ? '#0f0' : '#888';
                    var descriptions = [];
                    if(bonusData.spellPower > 0) descriptions.push("Increases damage and healing by up to " + bonusData.spellPower + ".");
                    if(bonusData.spellCrit > 0) descriptions.push("Improves spell critical strike chance by " + bonusData.spellCrit + "%.");
                    if(bonusData.spellHit > 0) descriptions.push("Improves spell hit chance by " + bonusData.spellHit + "%.");
                    if(bonusData.mp5 > 0) descriptions.push("Restores " + bonusData.mp5 + " mana per 5 sec.");
                    if(bonusData.custom && Array.isArray(bonusData.custom)) {
                        bonusData.custom.forEach(function(c) { descriptions.push(c); });
                    }
                    descriptions.forEach(function(desc) {
                        html += '<div style="color:' + color + '">(' + threshold + ') Set: ' + desc + '</div>';
                    });
                });
            }
        }
    }

    tt.innerHTML = html;
    moveTooltip(e);
}

// NEW: Enchant Tooltip with Text
function showEnchantTooltip(e, enchantId) {
    if(!enchantId || enchantId === 0) return;
    var ench = ENCHANT_DB.find(x => x.id == enchantId);
    if(!ench) return;

    var tt = document.getElementById("wowTooltip");
    if(!tt) return;
    tt.style.display = "block";
    
    var html = '<div class="tt-header"><div style="flex:1"><div class="tt-name" style="color:#1eff00">' + ench.name + '</div></div></div>';
    html += '<div class="tt-white">Enchant</div>';
    html += '<div class="tt-spacer"></div>';
    
    // Description from 'text' property (Green)
    if(ench.text) {
        html += '<div class="tt-green">' + ench.text + '</div>';
    } 
    // Fallback if 'text' is missing but 'effects' exist
    else if (ench.effects) {
        var ef = ench.effects;
        if(ef.spellPower) html += '<div class="tt-green">+' + ef.spellPower + ' Spell Power</div>';
        if(ef.intellect) html += '<div class="tt-green">+' + ef.intellect + ' Intellect</div>';
        // Add others if needed
    }

    tt.innerHTML = html;
    moveTooltip(e);
}

function moveTooltip(e) {
    var tt = document.getElementById("wowTooltip");
    if(!tt) return;
    
    var width = tt.offsetWidth;
    var height = tt.offsetHeight;
    
    var x = e.clientX + 15; 
    var y = e.clientY + 15;

    // X Logic
    if(x + width > window.innerWidth) {
        x = e.clientX - width - 15;
    }

    // Y Logic: Prefer down, if not enough space check up, if neither pin to top
    if (y + height > window.innerHeight) {
        // Check if fits above
        var yUp = e.clientY - height - 10;
        if (yUp < 0) {
            y = 10; // Pin to top
        } else {
            y = yUp;
        }
    }
    
    tt.style.left = x + "px"; 
    tt.style.top = y + "px";
}


function hideTooltip() { var tt = document.getElementById("wowTooltip"); if(tt) tt.style.display = "none"; }

// --- ITEM MODAL ---
var CURRENT_SELECTING_SLOT = null;
function openItemSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("itemSelectorModal");
    var title = document.getElementById("modalTitle");
    var input = document.getElementById("itemSearchInput");
    if(modal && title && input) {
        title.innerText = "Select " + slotName;
        modal.classList.remove("hidden");
        input.value = ""; input.focus();
        renderItemList();
    }
}
function closeItemModal() { var modal = document.getElementById("itemSelectorModal"); if(modal) modal.classList.add("hidden"); CURRENT_SELECTING_SLOT = null; }

function renderItemList(filterText) {
    var list = document.getElementById("modalItemList");
    if(!list) return;
    list.innerHTML = "";
    var unequipDiv = document.createElement("div");
    unequipDiv.className = "item-row";
    unequipDiv.onclick = function() { selectItem(0); };
    unequipDiv.innerHTML = '<div class="item-row-icon" style="background:#333;"></div><div class="item-row-details"><div class="item-row-name" style="color:#888;">- Unequip -</div></div>';
    list.appendChild(unequipDiv);
    var slotKey = CURRENT_SELECTING_SLOT;
    if(slotKey.includes("Finger")) slotKey = "Finger";
    if(slotKey.includes("Trinket")) slotKey = "Trinket";
    if(slotKey === "Idol") slotKey = "Relic";

    var relevantItems = ITEM_DB.filter(function(i) {
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

    // Calculate Score with Context (Slot Name) for Set Bonuses
    relevantItems.forEach(function(i) { i.simScore = calculateItemScore(i, CURRENT_SELECTING_SLOT); });
    relevantItems.sort(function(a,b) { return b.simScore - a.simScore; });

    if(filterText) {
        var ft = filterText.toLowerCase();
        relevantItems = relevantItems.filter(function(i) { return i.name.toLowerCase().includes(ft); });
    }

    relevantItems.slice(0, 100).forEach(function(item) {
        var iconUrl = getIconUrl(item.icon);
        var row = document.createElement("div");
        row.className = "item-row";
        row.onclick = function() { selectItem(item.id); };
        row.onmouseenter = function(e) { showTooltip(e, item); };
        row.onmousemove = function(e) { moveTooltip(e); };
        row.onmouseleave = function() { hideTooltip(); };

        var html = '<div class="item-row-icon"><img src="' + iconUrl + '" style="width:100%; height:100%; border-radius:3px;"></div>' +
                   '<div class="item-row-details"><div class="item-row-name" style="color: ' + getItemColor(item.quality) + '">' + item.name + '</div><div class="item-row-sub">iLvl: ' + item.itemLevel + '</div></div>' +
                   '<div class="item-score-badge"><span class="score-label">SCORE</span>' + item.simScore.toFixed(1) + '</div>';

        row.innerHTML = html;
        list.appendChild(row);
    });
}
function filterItemList() { var txt = document.getElementById("itemSearchInput").value; renderItemList(txt); }

function selectItem(itemId) {
    if(CURRENT_SELECTING_SLOT) {
        GEAR_SELECTION[CURRENT_SELECTING_SLOT] = itemId;
        
        // 2H Logic: Unequip Offhand if Mainhand 2H is selected
        if(CURRENT_SELECTING_SLOT === "Main Hand" && itemId != 0) {
            var item = ITEM_ID_MAP[itemId]; // Use Map
            if(item) {
                var s = item.slot.toLowerCase().replace(/[\s-]/g, "");
                // Weapon Types: 5=2H Mace, 6=Polearm, 10=Staff
                if(s === "twohand" || item.weaponType === 5 || item.weaponType === 6 || item.weaponType === 10) { 
                    GEAR_SELECTION["Off Hand"] = 0; 
                    showToast("Off-Hand unequipped (2H Weapon).");
                }
            }
        }

        // NEW: Off-Hand Logic: Unequip Main Hand if it is 2H
        if(CURRENT_SELECTING_SLOT === "Off Hand" && itemId != 0) {
            var mhId = GEAR_SELECTION["Main Hand"];
            if(mhId && mhId != 0) {
                var mhItem = ITEM_ID_MAP[mhId];
                if(mhItem) {
                    var s = mhItem.slot.toLowerCase().replace(/[\s-]/g, "");
                    // Use same check as above
                    if(s === "twohand" || mhItem.weaponType === 5 || mhItem.weaponType === 6 || mhItem.weaponType === 10) {
                        GEAR_SELECTION["Main Hand"] = 0;
                        showToast("2H Weapon unequipped (Off-Hand selected).");
                    }
                }
            }
        }
    }
    closeItemModal();
    initGearPlannerUI();
    saveCurrentState(); // Fix: Instant Save
}


// --- ENCHANT MODAL (NEW) ---
function openEnchantSelector(slotName) {
    CURRENT_SELECTING_SLOT = slotName;
    var modal = document.getElementById("enchantSelectorModal");
    var title = document.getElementById("enchantModalTitle");
    if(modal && title) {
        title.innerText = "Enchant " + slotName;
        modal.classList.remove("hidden");
        renderEnchantList();
    }
}
function closeEnchantModal() { var modal = document.getElementById("enchantSelectorModal"); if(modal) modal.classList.add("hidden"); CURRENT_SELECTING_SLOT = null; }

function renderEnchantList() {
    var list = document.getElementById("modalEnchantList");
    if(!list) return;
    list.innerHTML = "";
    
    // Remove Enchant Option
    var unequipDiv = document.createElement("div");
    unequipDiv.className = "item-row";
    unequipDiv.onclick = function() { selectEnchant(0); };
    unequipDiv.innerHTML = '<div class="item-row-details"><div class="item-row-name" style="color:#888;">- No Enchant -</div></div>';
    list.appendChild(unequipDiv);

    var slotKey = CURRENT_SELECTING_SLOT;
    // Map Slots for DB query (Assume DB uses generic keys or check multiple)
    // E.g. "Finger 1" -> "Finger"
    if(slotKey.includes("Finger")) slotKey = "Finger";
    if(slotKey.includes("Trinket")) slotKey = "Trinket";
    if(slotKey === "Main Hand") slotKey = "Two Hand"; // Or One Hand, depends on logic. Enchants are usually "Weapon"

    var relevantEnchants = ENCHANT_DB.filter(function(e) {
        // 1. Class Filter (New)
        // 512 = Druid
        if (e.allowableClasses && e.allowableClasses !== -1) {
            // If the bitmask does not contain the Druid bit, skip it
            if ((e.allowableClasses & 512) === 0) return false;
        }

        // 2. Slot Filter (Existing)
        if (CURRENT_SELECTING_SLOT === "Main Hand") return (e.slot === "Weapon" || e.slot === "Two Hand" || e.slot === "Mainhand"); // NEW: Mainhand
        if (CURRENT_SELECTING_SLOT === "Off Hand") return (e.slot === "Shield"); // Only Shield Enchants
        if (CURRENT_SELECTING_SLOT === "Feet") return (e.slot === "Boots" || e.slot === "Feet");
        if (CURRENT_SELECTING_SLOT === "Hands") return (e.slot === "Gloves" || e.slot === "Hands");
        if (CURRENT_SELECTING_SLOT === "Wrist") return (e.slot === "Bracer" || e.slot === "Wrist");
        if (CURRENT_SELECTING_SLOT === "Back") return (e.slot === "Cloak" || e.slot === "Back");
        if (CURRENT_SELECTING_SLOT.includes("Finger")) return (e.slot === "Finger"); // NEW: Finger (Neck cat in DB)
        
        return e.slot === CURRENT_SELECTING_SLOT || e.slot === slotKey;
    });

    relevantEnchants.forEach(function(e) { e.simScore = calculateEnchantScore(e); });
    relevantEnchants.sort(function(a,b) { return b.simScore - a.simScore; });

    relevantEnchants.forEach(function(ench) {
        var row = document.createElement("div");
        row.className = "item-row";
        row.onclick = function() { selectEnchant(ench.id); };
        row.onmouseenter = function(e) { showEnchantTooltip(e, ench.id); };
        row.onmousemove = function(e) { moveTooltip(e); };
        row.onmouseleave = function() { hideTooltip(); };
        
        var desc = ench.text || ""; // Show text description in list
        
        var html = '<div class="item-row-details"><div class="item-row-name" style="color: #1eff00;">' + ench.name + '</div><div class="item-row-sub">' + desc + '</div></div>' +
                   '<div class="item-score-badge"><span class="score-label">SCORE</span>' + ench.simScore.toFixed(1) + '</div>';

        row.innerHTML = html;
        list.appendChild(row);
    });
}

function selectEnchant(enchId) {
    if(CURRENT_SELECTING_SLOT) {
        ENCHANT_SELECTION[CURRENT_SELECTING_SLOT] = enchId;
    }
    closeEnchantModal();
    initGearPlannerUI();
    saveCurrentState(); // Fix: Instant Save
}

function resetGear() { GEAR_SELECTION = {}; ENCHANT_SELECTION = {}; initGearPlannerUI(); }
function recalcItemScores() {
    if(!document.getElementById("itemSelectorModal").classList.contains("hidden")) {
        renderItemList(document.getElementById("itemSearchInput").value);
    }
    if(!document.getElementById("enchantSelectorModal").classList.contains("hidden")) {
        renderEnchantList();
    }
    initGearPlannerUI(); 
}

function calculateItemScore(item, slotNameOverride) {
    if(!item) return 0;
    // FORMULA: GS = SP + AP + NP + (Crit * CW) + (Hit * HW) + (Haste * HW) + Int/60 * CW
    
    var wHit = parseFloat(document.getElementById("weight_hit") ? document.getElementById("weight_hit").value : 16);
    var wCrit = parseFloat(document.getElementById("weight_crit") ? document.getElementById("weight_crit").value : 15);
    var wHaste = parseFloat(document.getElementById("weight_haste") ? document.getElementById("weight_haste").value : 11);
    var wSP = parseFloat(document.getElementById("weight_sp") ? document.getElementById("weight_sp").value : 1.0);
    
    var score = 0;
    var e = item.effects || {};
    
    // 1. BASE STATS
    // SP + AP + NP
    var sp = (e.spellPower || 0);
    var ap = (e.arcaneSpellPower || 0);
    var np = (e.natureSpellPower || 0);
    score += (sp + ap/2 + np/2) * wSP;

    // Hit * HW
    score += (e.spellHit || 0) * wHit;

    // Crit * CW
    score += (e.spellCrit || 0) * wCrit;

    // Haste * HW
    score += (e.spellHaste || 0) * wHaste;

    // Int / 60 * CW
    var intVal = item.intellect || 0;
    score += (intVal / 60) * wCrit;

    // 2. SET BONUS LOGIC
    if (item.setName) {
        // Determine which slot we are simulating for
        var currentSlot = slotNameOverride || CURRENT_SELECTING_SLOT;
        var otherSetItemsCount = 0;
        
        // Count OTHER equipped items of this set
        for(var slot in GEAR_SELECTION) {
            // Skip the slot we are currently evaluating/filling
            if(currentSlot && slot === currentSlot) continue; 
            
            var id = GEAR_SELECTION[slot];
            // Handle ID or Object
            if (id && typeof id === 'object' && id.id) id = id.id;

            if(!id || id == 0) continue;
            
            // Use Map for O(1)
            var equipped = ITEM_ID_MAP[id];
            if(equipped && equipped.setName === item.setName) {
                otherSetItemsCount++;
            }
        }
        
        var newTotalCount = otherSetItemsCount + 1; // +1 includes the item we are scoring
        
        // Check if a NEW bonus is reached exactly at this count
        if(item.setBonuses && !Array.isArray(item.setBonuses)) {
             for(var k in item.setBonuses) {
                 if(parseInt(k) === newTotalCount) {
                     // Bingo! This item completes this tier of bonus. Add its value.
                     var b = item.setBonuses[k];
                     
                     var bScore = 0;
                     bScore += (b.spellPower || 0) * wSP;
                     bScore += (b.arcaneSpellPower || 0) * wSP;
                     bScore += (b.natureSpellPower || 0) * wSP;
                     bScore += (b.spellCrit || 0) * wCrit;
                     bScore += (b.spellHit || 0) * wHit;
                     bScore += (b.spellHaste || 0) * wHaste;
                     bScore += ((b.intellect || 0) / 60) * wCrit;

                     score += bScore;
                 }
             }
        }
    }

    return score;
}

function calculateEnchantScore(ench) {
    if(!ench) return 0;
    // FORMULA: GS = SP + AP + NP + (Crit * CW) + (Hit * HW) + (Haste * HW) + Int/60 * CW
    // Use 'effects' object
    
    var wHit = parseFloat(document.getElementById("weight_hit") ? document.getElementById("weight_hit").value : 16);
    var wCrit = parseFloat(document.getElementById("weight_crit") ? document.getElementById("weight_crit").value : 15);
    var wHaste = parseFloat(document.getElementById("weight_haste") ? document.getElementById("weight_haste").value : 11);
    var wSP = parseFloat(document.getElementById("weight_sp") ? document.getElementById("weight_sp").value : 1.0);
    
    var score = 0;
    var stats = ench.effects || {}; // Changed to effects
    
    // SP + AP + NP
    var sp = (stats.spellPower || 0);
    var ap = (stats.arcaneSpellPower || 0);
    var np = (stats.natureSpellPower || 0);
    score += (sp + ap/2 + np/2) * wSP;

    // Hit * HW
    score += (stats.spellHit || 0) * wHit;

    // Crit * CW
    score += (stats.spellCrit || 0) * wCrit;

    // Haste * HW
    score += (stats.spellHaste || 0) * wHaste;

    // Int / 60 * CW
    var intVal = stats.intellect || 0;
    score += (intVal / 60) * wCrit;
    
    return score;
}

function calculateGearStats() {
    // 1. Get Race Stats (Base)
    var raceSel = document.getElementById("char_race");
    var raceName = raceSel ? raceSel.value : "NightElf";
    var baseStats = RACE_STATS[raceName] || RACE_STATS["NightElf"];

    // Character Stats (Starts with Base, accumulates EVERYTHING)
    var charStats = { 
        sp: 0, spArc: 0, spNat: 0, // NEW: Split SP
        crit: baseStats.crit, 
        hit: baseStats.hit, 
        int: baseStats.int,
        haste: baseStats.haste
    };

    // Gear Only Stats (Accumulates ONLY items + sets, NO base, NO enchants)
    // Used for GS calculation only.
    var gearOnlyStats = {
        sp: 0,
        crit: 0,
        hit: 0,
        int: 0,
        haste: 0
    };

    var setCounts = {}; 
    
    // Counters for Auto-Checkbox Logic
    var countT3 = 0; // Dreamwalker Regalia
    var countT35 = 0; // Regalia of the Talon
    var hasBinding = false; // Bindings of Contained Magic
    var hasScythe = false; // The Scythe of Elune (Passive)
    var hasScytheUse = false; // The Scythe of Elune (Active)
    var hasReos = false; // The Restrained Essence of Sapphiron
    var hasToep = false; // Talisman of Ephemeral Power
    var hasRoop = false; // Remains of Overwhelming Power
    var hasZhc = false; // Zandalarian Hero Charm
    var hasSulfuras = false; // True Band of Sulfuras
    var hasWoc = false; // Wrath of Cenarius

    // ITEMS
    for(var slot in GEAR_SELECTION) {
        var id = GEAR_SELECTION[slot];
        if (id && typeof id === 'object' && id.id) id = id.id; // Legacy safety

        if(id && id !== 0) {
            var item = ITEM_ID_MAP[id] || ITEM_DB.find(i => i.id == id); // Use Map
            if(item) {
                var intVal = (item.intellect || 0);
                var e = item.effects || {};
                var spVal = (e.spellPower || 0);
                var spArc = (e.arcaneSpellPower || 0);
                var spNat = (e.natureSpellPower || 0);
                var critVal = (e.spellCrit || 0);
                var hitVal = (e.spellHit || 0);
                var hasteVal = (e.spellHaste || 0);

                // Add to Character (Total)
                charStats.int += intVal;
                charStats.sp += spVal;
                charStats.spArc += spArc;
                charStats.spNat += spNat;
                charStats.crit += critVal;
                charStats.hit += hitVal;
                charStats.haste += hasteVal;

                // Add to Gear Only (GS)
                // For GS, sum all SP types
                gearOnlyStats.int += intVal;
                gearOnlyStats.sp += (spVal + spArc + spNat); 
                gearOnlyStats.crit += critVal;
                gearOnlyStats.hit += hitVal;
                gearOnlyStats.haste += hasteVal;

                if(item.setName) {
                    if(!setCounts[item.setName]) setCounts[item.setName] = 0;
                    setCounts[item.setName]++;
                }
                
                // --- AUTO CHECKBOX LOGIC ---
                // Corrected Set Name
                if (item.setName === "Dreamwalker Regalia") countT3++;
                if (item.setName === "Regalia of the Talon") countT35++; 
                
                // Specific Items (Names Corrected)
                if (item.name === "Bindings of Contained Magic" || item.id === 23201) hasBinding = true;
                if (item.name.includes("Scythe of Elune")) {
                    hasScythe = true;
                    hasScytheUse = true; // Assuming detection implies active ability is available
                }
                if (item.name === "The Restrained Essence of Sapphiron") hasReos = true;
                if (item.name === "Talisman of Ephemeral Power") hasToep = true;
                if (item.name === "Remains of Overwhelming Power") hasRoop = true;
                if (item.name === "Zandalarian Hero Charm") hasZhc = true;
                
                // New Items
                if (item.name === "True Band of Sulfuras") hasSulfuras = true;
                if (item.name === "Wrath of Cenarius") hasWoc = true;
            }
        }
    }
    
    // Update Checkboxes based on gear
    var elT34 = document.getElementById('t3_4p'); if(elT34) elT34.checked = countT3 >= 4;
    var elT36 = document.getElementById('t3_6p'); if(elT36) elT36.checked = countT3 >= 6;
    var elT38 = document.getElementById('t3_8p'); if(elT38) elT38.checked = countT3 >= 8;
    var elT35 = document.getElementById('t35_5p'); if(elT35) elT35.checked = countT35 >= 5;
    
    var elBind = document.getElementById('item_binding'); if(elBind) elBind.checked = hasBinding;
    var elScythe = document.getElementById('item_scythe'); if(elScythe) elScythe.checked = hasScythe;
    var elScytheUse = document.getElementById('item_scythe_use'); if(elScytheUse) elScytheUse.checked = hasScytheUse;
    var elReos = document.getElementById('item_reos'); if(elReos) elReos.checked = hasReos;
    var elToep = document.getElementById('item_toep'); if(elToep) elToep.checked = hasToep;
    var elRoop = document.getElementById('item_roop'); if(elRoop) elRoop.checked = hasRoop;
    var elZhc = document.getElementById('item_zhc'); if(elZhc) elZhc.checked = hasZhc;
    var elSulf = document.getElementById('item_sulfuras'); if(elSulf) elSulf.checked = hasSulfuras;
    var elWoc = document.getElementById('item_woc'); if(elWoc) elWoc.checked = hasWoc;


    // ENCHANTS
    // "Boni der Enchants auch in den Gear-Stats (nicht im Gear Score)"
    for(var slot in ENCHANT_SELECTION) {
        var eid = ENCHANT_SELECTION[slot];
        if(eid && eid !== 0) {
            var ench = ENCHANT_DB.find(e => e.id == eid);
            if(ench && ench.effects) { // Use effects
                var intVal = (ench.effects.intellect || 0);
                var spVal = (ench.effects.spellPower || 0);
                var spArc = (ench.effects.arcaneSpellPower || 0);
                var spNat = (ench.effects.natureSpellPower || 0);
                var critVal = (ench.effects.spellCrit || 0);
                var hitVal = (ench.effects.spellHit || 0);
                var hasteVal = (ench.effects.spellHaste || 0);

                // Add to Character (Total) - YES
                charStats.int += intVal;
                charStats.sp += spVal;
                charStats.spArc += spArc;
                charStats.spNat += spNat;
                charStats.crit += critVal;
                charStats.hit += hitVal;
                charStats.haste += hasteVal;

                // Add to Gear Only (GS) - NO (per instruction)
            }
        }
    }

    // CALCULATE SET BONUSES
    for(var setName in setCounts) {
        var count = setCounts[setName];
        var refItem = ITEM_DB.find(i => i.setName === setName);
        
        if(refItem && refItem.setBonuses && !Array.isArray(refItem.setBonuses)) {
             var keys = Object.keys(refItem.setBonuses);
             keys.forEach(function(k) {
                 var threshold = parseInt(k);
                 if(count >= threshold) {
                     var bonus = refItem.setBonuses[k];
                     var spVal = (bonus.spellPower || 0);
                     var spArc = (bonus.arcaneSpellPower || 0);
                     var spNat = (bonus.natureSpellPower || 0);
                     var critVal = (bonus.spellCrit || 0);
                     var hitVal = (bonus.spellHit || 0);
                     var hasteVal = (bonus.spellHaste || 0);
                     
                     // Add to Character (Total)
                     charStats.sp += spVal;
                     charStats.spArc += spArc;
                     charStats.spNat += spNat;
                     charStats.crit += critVal;
                     charStats.hit += hitVal;
                     charStats.haste += hasteVal;
                     
                     // Add to Gear Only (GS) - Sets usually count as Gear Power
                     gearOnlyStats.sp += (spVal + spArc + spNat);
                     gearOnlyStats.crit += critVal;
                     gearOnlyStats.hit += hitVal;
                     gearOnlyStats.haste += hasteVal;
                 }
             });
        }
    }

    // BUFFS & CONSUMABLES LOGIC
    // 1. GATHER FLAT BUFFS
    var buffInt = 0;
    var buffSP = 0;
    var buffSPArc = 0; // Split buffs
    var buffSPNat = 0;
    var buffCrit = 0;
    var buffHit = 0;
    var buffHaste = 0;

    // Auras
    if(getVal("buff_atiesh_warlock")) buffSP += 33; // FIXED: Warlock

    // Buffs
    if(getVal("buff_arcane_brilliance")) buffInt += 31;
    if(getVal("buff_gotw")) buffInt += 16;
    
    // Food
    if(getVal("buff_food_sp")) buffSP += 22;
    if(getVal("buff_food_int")) buffInt += 15;

    // Potions
    if(getVal("buff_elixir_dreamshard")) buffSP += 15;
    if(getVal("buff_elixir_nature")) buffSPNat += 55; // FIXED: Nature
    if(getVal("buff_elixir_arcane_power")) buffSPArc += 40; // FIXED: Arcane
    if(getVal("buff_elixir_greater_arcane")) buffSP += 35; // FIXED: Total SP
    if(getVal("buff_dreamtonic")) buffSP += 35;
    if(getVal("buff_cerebral")) buffInt += 25;
    if(getVal("buff_wizard_oil")) buffSP += 36;
    if(getVal("buff_flask")) buffSP += 150;

    // ADD FLAT BUFFS TO TOTAL
    charStats.int += buffInt;
    charStats.sp += buffSP;
    charStats.spArc += buffSPArc;
    charStats.spNat += buffSPNat;

    // 2. APPLY MULTIPLIERS (BoK)
    if(getVal("buff_bok")) {
        charStats.int = Math.floor(charStats.int * 1.10);
    }

    // 3. DERIVE CRIT FROM INT
    var charCritFromInt = charStats.int / 60;
    charStats.crit += charCritFromInt;

    // 4. ADD PERCENTAGE BUFFS
    if(getVal("buff_moonkin")) buffCrit += 3;
    if(getVal("buff_atiesh_druid")) buffHaste += 2;
    if(getVal("buff_atiesh_mage")) buffCrit += 2;
    if(getVal("buff_emerald")) buffHit += 1;
    if(getVal("buff_elixir_dreamshard")) buffCrit += 2;
    if(getVal("buff_wizard_oil")) buffCrit += 1;

    charStats.crit += buffCrit;
    charStats.hit += buffHit;
    charStats.haste += buffHaste;


    // For Gear Score Display: Only Gear Int / 60
    var gearCritFromInt = gearOnlyStats.int / 60;
    
    // CALCULATE TOTAL GEAR SCORE FOR DISPLAY (Purely from Items+Sets)
    var wHit = parseFloat(document.getElementById("weight_hit") ? document.getElementById("weight_hit").value : 16);
    var wCrit = parseFloat(document.getElementById("weight_crit") ? document.getElementById("weight_crit").value : 15);
    var wHaste = parseFloat(document.getElementById("weight_haste") ? document.getElementById("weight_haste").value : 11);
    var wSP = parseFloat(document.getElementById("weight_sp") ? document.getElementById("weight_sp").value : 1.0);

    // Score Formula: SP + Crit(raw)*CW + Hit*HW + Haste*HW + (Int/60)*CW
    var finalGS = (gearOnlyStats.sp * wSP) + 
                  (gearOnlyStats.crit * wCrit) + 
                  (gearOnlyStats.hit * wHit) + 
                  (gearOnlyStats.haste * wHaste) +
                  (gearCritFromInt * wCrit);

    // Update Gear Planner Preview (Score) - Excludes Enchants, Excludes Base
    var elGS = document.getElementById("gp_gs"); if(elGS) elGS.innerText = finalGS.toFixed(0);
    
    // Update Gear Planner Preview (Stats) - SHOW TOTAL STATS (Base + Gear + Enchants)
    // For Preview Box "Total SP", we sum Generic + Arcane + Nature to give an idea of power
    var displayTotalSP = charStats.sp + charStats.spArc + charStats.spNat;
    var elSP = document.getElementById("gp_sp"); if(elSP) elSP.innerText = displayTotalSP;
    var elCrit = document.getElementById("gp_crit"); if(elCrit) elCrit.innerText = charStats.crit.toFixed(2) + "%";
    var elHit = document.getElementById("gp_hit"); if(elHit) elHit.innerText = charStats.hit;
    var elHaste = document.getElementById("gp_haste"); if(elHaste) elHaste.innerText = charStats.haste.toFixed(2) + "%";
    var elInt = document.getElementById("gp_int"); if(elInt) elInt.innerText = charStats.int;


    // --- UPDATE MAIN INPUTS (WITH MANUAL OVERRIDE CHECK) ---
    var isManual = document.getElementById("manual_stats") ? document.getElementById("manual_stats").checked : false;

    // List of fields to control
    var autoFields = ["sp_gen", "sp_nature", "sp_arcane", "statCrit", "statHit", "statHaste"];
    
    // Helper to set value only if not manual
    var updateInput = function(id, val, isPct) {
        var el = document.getElementById(id);
        if(!el) return;
        
        if (isManual) {
            // Manual Mode: Enable input, DO NOT OVERWRITE
            el.disabled = false;
        } else {
            // Auto Mode: Disable input, Overwrite with calculation
            el.disabled = true;
            el.value = isPct ? val.toFixed(2) : val;
            el.dispatchEvent(new Event('change')); // Trigger sim update if needed
        }
    };

    updateInput("sp_gen", charStats.sp, false);
    updateInput("sp_nature", charStats.spNat, false);
    updateInput("sp_arcane", charStats.spArc, false);
    updateInput("statCrit", charStats.crit, true);
    updateInput("statHit", charStats.hit, false);
    updateInput("statHaste", charStats.haste, true);

    // Note: sp_pen (Spell Pen) is usually not calculated from gear in this logic yet (unless items added it specifically, which current item logic doesn't sum into a charStat for pen). 
    // It remains manually editable or controlled by global event listeners, but let's ensure it follows the "Edit" style if needed. 
    // Currently, it's not in the disabled list in HTML, so it works as is.
}