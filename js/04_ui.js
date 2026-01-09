/**
 * Feral Simulation - File 4: UI Manager
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Handles Inputs, Logs, Charts, and Stats Display
 */

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // Calc Method Toggle (Single vs DPM Map)
    var methodSelect = document.getElementById('calcMethod');
    var iterInput = document.getElementById('simCount');
    if (methodSelect && iterInput) {
        methodSelect.addEventListener('change', function () {
            if (methodSelect.value === 'S') {
                iterInput.disabled = false;
                iterInput.parentElement.style.opacity = "1";
            } else {
                iterInput.disabled = true;
                iterInput.parentElement.style.opacity = "0.5";
            }
            saveCurrentState();
        });
        if (methodSelect.value !== 'S') {
            iterInput.disabled = true;
            iterInput.parentElement.style.opacity = "0.5";
        }
    }

    // Enemy Inputs
    var enemyInputs = ['enemy_level', 'enemy_armor', 'enemy_can_bleed'];
    enemyInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                updateEnemyInfo();
                updatePlayerStats(); // Armor pen logic might change stats?
                saveCurrentState();
            });
            el.addEventListener('input', updateEnemyInfo);
        }
    });

    // Rotation / Config Inputs
    var configInputs = [
        "simTime", "rota_position", "rota_powershift", "rota_rake", 
        "rota_bite", "rota_aggressive_shift", "mana_pool",
        "buff_motw", "buff_bok", "buff_might", "buff_battle_shout",
        "buff_leader_pack", "buff_trueshot", "buff_mongoose",
        "buff_juju_power", "buff_juju_might", "buff_winterfall",
        "buff_zandalar", "buff_onyxia", "buff_songflower", "buff_warchief",
        "buff_food_str", "buff_food_agi"
    ];

    configInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', saveCurrentState);
    });

    // Run Button
    var btn = document.getElementById('runSimBtn');
    if (btn) btn.addEventListener('click', runSimulation);

    // Reset Button
    var rst = document.getElementById('resetBtn');
    if (rst) rst.addEventListener('click', function () {
        if (confirm("Reset all settings and gear?")) {
            resetGear();
            location.reload(); 
        }
    });
}

function updateEnemyInfo() {
    var lvl = getVal('enemy_level');
    var armor = getVal('enemy_armor');
    var bleed = getVal('enemy_can_bleed');
    
    setText('sumLvl', lvl);
    setText('sumArmor', armor);
    
    var infoText = "";
    if (!bleed) infoText += "Immune to Bleed. ";
    
    // Calculate Damage Reduction from Armor (Standard Vanilla Formula)
    // DR% = Armor / (Armor + 400 + 85 * (AttackerLevel + 4.5 * (AttackerLevel - 59)))
    // Assuming Attacker Lvl 60: 400 + 85 * (60 + 4.5) = 400 + 85 * 64.5 = 400 + 5482.5 = 5882.5
    // DR = Armor / (Armor + 5882.5)
    var dr = armor / (armor + 5882.5);
    var drPct = (dr * 100).toFixed(1);
    
    setText('sumRes', drPct + "% Phys DR");
}

/**
 * Updates the Sidebar "Player Stats" summary based on Gear + Buffs
 */
function updatePlayerStats() {
    // Trigger calculation in gear.js (updates the hidden inputs)
    calculateGearStats(); 

    // Read back the calculated values from inputs
    var str = parseFloat(document.getElementById("stat_str").value) || 0;
    var agi = parseFloat(document.getElementById("stat_agi").value) || 0;
    var ap = parseFloat(document.getElementById("stat_ap").value) || 0;
    var crit = parseFloat(document.getElementById("stat_crit").value) || 0;
    var hit = parseFloat(document.getElementById("stat_hit").value) || 0;
    var haste = parseFloat(document.getElementById("stat_haste").value) || 0;
    
    // Update Sidebar Text
    setText("sumAP", Math.floor(ap));
    setText("sumCrit", crit.toFixed(2) + "%");
    setText("sumHit", hit.toFixed(2) + "%");
    setText("sumHaste", haste.toFixed(2) + "%");
    
    // Update Rotation List Summary
    var list = document.getElementById("sumRotaList");
    if (list) {
        list.innerHTML = "";
        var addLi = function(txt, col) { 
            var li = document.createElement("li"); 
            li.innerText = txt; 
            if(col) li.style.color = col;
            list.appendChild(li); 
        };

        if (getVal("rota_powershift")) addLi("Powershifting: ON", "#4caf50");
        else addLi("Powershifting: OFF", "#f44336");
        
        if (getVal("rota_position") === "back") addLi("Pos: Behind (Shred)", "#ff9800");
        else addLi("Pos: Front (Claw)", "#ff5722");

        if (getVal("rota_bite")) addLi("Finisher: Bite", "#ff9800");
        else addLi("Finisher: Rip Only", "#ff5722");
    }

    // Update Gear List Summary (Trinkets & Idols)
    var tList = document.getElementById("sumTrinketList");
    if (tList) {
        tList.innerHTML = "";
        var t1 = GEAR_SELECTION["Trinket 1"];
        var t2 = GEAR_SELECTION["Trinket 2"];
        var idol = GEAR_SELECTION["Idol"];
        
        var addItemLi = function(id) {
            if(!id) return;
            var it = ITEM_ID_MAP[id];
            if(it) {
                var li = document.createElement("li");
                li.innerText = it.name;
                li.style.color = "#a0a0a0";
                tList.appendChild(li);
            }
        };
        addItemLi(t1);
        addItemLi(t2);
        addItemLi(idol);
    }
}

// ============================================================================
// SIMULATION RESULT RENDERING
// ============================================================================

function updateSimulationResults(sim) {
    if (!sim || !sim.results) return;
    var r = sim.results;
    var resDiv = document.getElementById("simResultsArea");
    if (!resDiv) return;
    resDiv.classList.remove("hidden");

    // 1. DPS & Summary
    setText("resDps", Math.floor(r.dps));
    setText("resDuration", r.duration + "s");
    setText("resTotalDmg", (r.totalDmg / 1000).toFixed(1) + "k");
    
    // Mana/Energy Usage (If tracked)
    // For Feral: Show Powershifts count?
    var shifts = r.casts ? (r.casts["Powershift"] || 0) : 0;
    setText("resMana", shifts + " Shifts"); 

    // 2. Damage Distribution Bar
    var barContainer = document.getElementById("dmgDistBar");
    if (barContainer) {
        barContainer.innerHTML = "";
        var total = r.totalDmg;
        
        // Define Colors for Abilities
        var colors = {
            "Auto Attack": "#ffffff",
            "Shred": "#ffeb3b", // Yellow
            "Claw": "#ff9800", // Orange
            "Rake": "#f44336", // Red
            "Rip": "#d32f2f", // Dark Red
            "Ferocious Bite": "#ff5722", // Deep Orange
            "Swipe": "#9e9e9e"
        };

        // Sort sources by damage
        var sources = [];
        for (var k in r.dmgSources) {
            sources.push({ name: k, dmg: r.dmgSources[k] });
        }
        sources.sort(function (a, b) { return b.dmg - a.dmg; });

        sources.forEach(function (s) {
            var pct = (s.dmg / total) * 100;
            if (pct < 0.5) return;
            var seg = document.createElement("div");
            seg.className = "dist-segment";
            seg.style.width = pct + "%";
            seg.style.backgroundColor = colors[s.name] || "#777";
            seg.title = s.name + ": " + Math.floor(s.dmg) + " (" + pct.toFixed(1) + "%)";
            barContainer.appendChild(seg);
        });
    }

    // 3. Detailed Table
    var tbody = document.getElementById("resTableBody");
    if (tbody) {
        tbody.innerHTML = "";
        sources.forEach(function (s) {
            var row = document.createElement("tr");
            var nameCol = "<td>" + s.name + "</td>";
            
            // Stats from result object
            var count = r.counts[s.name] || 0;
            var critCount = r.critCounts[s.name] || 0;
            var missCount = r.missCounts[s.name] || 0;
            var glanceCount = r.glanceCounts[s.name] || 0;
            var dodgeCount = r.dodgeCounts[s.name] || 0;
            
            var hitPct = count > 0 ? ((count - missCount - dodgeCount) / count * 100).toFixed(1) : "0.0";
            var critPct = (count - missCount - dodgeCount) > 0 ? (critCount / (count - missCount - dodgeCount) * 100).toFixed(1) : "0.0";
            var glancePct = (s.name === "Auto Attack" && count > 0) ? (glanceCount / count * 100).toFixed(1) : "-";

            var dps = (s.dmg / r.duration).toFixed(1);
            var pct = ((s.dmg / total) * 100).toFixed(1);

            row.innerHTML = 
                "<td style='color:" + (colors[s.name] || "#ccc") + "'>" + s.name + "</td>" +
                "<td>" + Math.floor(s.dmg).toLocaleString() + "</td>" +
                "<td>" + dps + "</td>" +
                "<td>" + pct + "%</td>" +
                "<td>" + count + "</td>" +
                "<td>" + critPct + "%</td>" +
                "<td>" + glancePct + "%</td>";
            tbody.appendChild(row);
        });
    }

    // 4. Log Render
    renderLogTable(r.log);
}

// ============================================================================
// LOG RENDERING
// ============================================================================

var CURRENT_PAGE = 1;
var ROWS_PER_PAGE = 50;
var LOG_DATA = [];

function renderLogTable(log) {
    LOG_DATA = log || [];
    CURRENT_PAGE = 1;
    updateLogPagination();
}

function updateLogPagination() {
    var tbody = document.getElementById("logTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    var start = (CURRENT_PAGE - 1) * ROWS_PER_PAGE;
    var end = start + ROWS_PER_PAGE;
    var pageData = LOG_DATA.slice(start, end);

    pageData.forEach(function (entry) {
        var row = document.createElement("tr");
        
        // Colors for Events
        var color = "#ccc";
        if (entry.event === "Damage") color = "#fff";
        if (entry.event === "Cast") color = "#ffd700"; // Gold
        if (entry.event === "Buff") color = "#4caf50"; // Green
        if (entry.event === "Tick") color = "#81d4fa"; // Energy tick blue-ish
        if (entry.event === "Error") color = "#f44336";

        // Ability Color
        var abColor = "#ccc";
        if (entry.ability === "Shred") abColor = "#ffeb3b";
        if (entry.ability === "Auto Attack") abColor = "#fff";
        if (entry.ability === "Ferocious Bite") abColor = "#ff5722";
        if (entry.ability.includes("Rip") || entry.ability.includes("Rake")) abColor = "#d32f2f"; // Bleed
        
        // Result Formatting
        var resTxt = entry.result || "";
        if (resTxt.includes("CRIT")) resTxt = "<span style='color:#ff0; font-weight:bold;'>" + resTxt + "</span>";
        if (resTxt.includes("GLANCE")) resTxt = "<span style='color:#aaa; font-style:italic;'>" + resTxt + "</span>";
        if (resTxt.includes("MISS") || resTxt.includes("DODGE")) resTxt = "<span style='color:#f44336;'>" + resTxt + "</span>";

        row.innerHTML = 
            "<td>" + entry.t.toFixed(3) + "</td>" +
            "<td style='color:" + color + "'>" + entry.event + "</td>" +
            "<td style='color:" + abColor + "'>" + entry.ability + "</td>" +
            "<td>" + resTxt + "</td>" +
            "<td>" + (entry.dmg > 0 ? Math.floor(entry.dmg) : "") + "</td>" +
            "<td style='color:#ffeb3b'>" + Math.floor(entry.energy) + "</td>" + // Energy
            "<td style='color:#ff9800'>" + entry.cp + "</td>" + // CP
            "<td style='color:#81d4fa'>" + Math.floor(entry.mana) + "</td>" + // Mana
            "<td style='font-size:0.85rem; color:#777;'>" + (entry.info || "") + "</td>";

        tbody.appendChild(row);
    });

    setText("logPageLabel", "Page " + CURRENT_PAGE + " / " + Math.ceil(LOG_DATA.length / ROWS_PER_PAGE));
}

function prevLogPage() {
    if (CURRENT_PAGE > 1) { CURRENT_PAGE--; updateLogPagination(); }
}

function nextLogPage() {
    var max = Math.ceil(LOG_DATA.length / ROWS_PER_PAGE);
    if (CURRENT_PAGE < max) { CURRENT_PAGE++; updateLogPagination(); }
}

// ============================================================================
// EXPORT / IMPORT / CSV
// ============================================================================

function generateCSV(simResult) {
    if (!simResult || !simResult.log) return "";
    var csv = "Time,Event,Ability,Result,Damage,Energy,CP,Mana,Info\n";
    simResult.log.forEach(function (r) {
        var line = [
            r.t.toFixed(3),
            r.event,
            r.ability,
            r.result,
            Math.floor(r.dmg),
            Math.floor(r.energy),
            r.cp,
            Math.floor(r.mana),
            '"' + (r.info || "") + '"'
        ];
        csv += line.join(",") + "\n";
    });
    return csv;
}

function downloadCSV() {
    if (!SIM_DATA) return;
    var csvContent = "data:text/csv;charset=utf-8," + generateCSV(SIM_DATA.results);
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "feral_sim_log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Save/Load Logic (Generic)
function saveCurrentState() {
    // Collect Config
    var config = {};
    CONFIG_IDS.forEach(function (id) {
        config[id] = getVal(id);
        // Handle strings for dropdowns
        var el = document.getElementById(id);
        if(el && el.tagName === "SELECT") config[id] = el.value;
    });

    // Collect Gear
    config.gear = GEAR_SELECTION;
    config.enchants = ENCHANT_SELECTION;

    var s = JSON.stringify(config);
    localStorage.setItem("krokatFeralSimSave", s);
    // Debounced Sim Run could happen here
}

function loadSavedState() {
    var s = localStorage.getItem("krokatFeralSimSave");
    if (s) {
        try {
            var c = JSON.parse(s);
            // Apply Config
            CONFIG_IDS.forEach(function (id) {
                if (c[id] !== undefined) {
                    var el = document.getElementById(id);
                    if (el) {
                        if (el.type === "checkbox") el.checked = (c[id] == 1);
                        else el.value = c[id];
                    }
                }
            });
            // Apply Gear
            if (c.gear) GEAR_SELECTION = c.gear;
            if (c.enchants) ENCHANT_SELECTION = c.enchants;
            
            initGearPlannerUI();
            updatePlayerStats();
            updateEnemyInfo();
        } catch (e) {
            console.error("Save Load Error", e);
        }
    }
}

// Export Settings to Text
function exportSettings() {
    saveCurrentState();
    var s = localStorage.getItem("krokatFeralSimSave");
    var compressed = LZString.compressToBase64(s);
    prompt("Copy this string:", compressed);
}

function importSettings() {
    var s = prompt("Paste settings string:");
    if (s) {
        try {
            var decomp = LZString.decompressFromBase64(s);
            if(decomp) {
                localStorage.setItem("krokatFeralSimSave", decomp);
                loadSavedState();
                showToast("Settings Imported!");
            } else {
                showToast("Invalid String");
            }
        } catch(e) { showToast("Import Error"); }
    }
}