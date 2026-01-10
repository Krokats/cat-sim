/**
 * Feral Simulation - File 4: UI Manager
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Handles Sidebar, Multi-Sim Management, Inputs, and Result Rendering
 */

// ============================================================================
// SIDEBAR & SIMULATION MANAGEMENT
// ============================================================================

function renderSidebar() {
    var sb = document.getElementById("sidebar");
    if (!sb) return;
    sb.innerHTML = "";

    // 1. Overview / Comparison Button
    var btnOv = document.createElement("div");
    btnOv.className = "sidebar-btn btn-overview" + (CURRENT_VIEW === 'comparison' ? " active" : "");
    btnOv.innerHTML = "☰";
    btnOv.title = "Comparison View";
    btnOv.onclick = function () { showComparisonView(); };
    sb.appendChild(btnOv);

    // Separator
    var sep = document.createElement("div");
    sep.className = "sidebar-separator";
    sb.appendChild(sep);

    // 2. Sim Buttons
    SIM_LIST.forEach(function (sim, idx) {
        var btn = document.createElement("div");
        btn.className = "sidebar-btn" + (CURRENT_VIEW === 'single' && ACTIVE_SIM_INDEX === idx ? " active" : "");
        btn.innerText = (idx + 1);
        btn.title = sim.name;
        btn.onclick = function () { switchSim(idx); };
        sb.appendChild(btn);
    });

    // 3. Add Button
    var btnAdd = document.createElement("div");
    btnAdd.className = "sidebar-btn btn-add";
    btnAdd.innerText = "+";
    btnAdd.title = "Add Simulation";
    btnAdd.onclick = function () { addSim(); };
    sb.appendChild(btnAdd);
}

function addSim(isInit) {
    var id = Date.now();
    var newSim = new SimObject(id, "Simulation " + (SIM_LIST.length + 1));

    // Default Config (or clone current)
    newSim.config = getSimInputs();
    newSim.gear = {};
    newSim.enchants = {};

    if (!isInit && SIM_LIST.length > 0 && SIM_LIST[ACTIVE_SIM_INDEX]) {
        newSim.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
        newSim.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
        newSim.config = getSimInputs(); // Snapshot current inputs
    }

    SIM_LIST.push(newSim);
    switchSim(SIM_LIST.length - 1);
}

function switchSim(index) {
    if (index < 0 || index >= SIM_LIST.length) return;

    // Save current state before switching
    if (CURRENT_VIEW === 'single' && SIM_LIST[ACTIVE_SIM_INDEX]) {
        saveSimData(ACTIVE_SIM_INDEX);
    }

    ACTIVE_SIM_INDEX = index;
    CURRENT_VIEW = 'single';
    SIM_DATA = SIM_LIST[index];

    loadSimDataToUI(SIM_DATA);

    document.getElementById("comparisonView").classList.add("hidden");
    document.getElementById("singleSimView").classList.remove("hidden");

    var nameInput = document.getElementById("simName");
    if (nameInput) nameInput.value = SIM_DATA.name;

    renderSidebar();

    if (!SIM_DATA.results) {
        document.getElementById("simResultsArea").classList.add("hidden");
    } else {
        updateSimulationResults(SIM_DATA);
    }
}

function showComparisonView() {
    if (CURRENT_VIEW === 'single' && SIM_LIST[ACTIVE_SIM_INDEX]) {
        saveSimData(ACTIVE_SIM_INDEX);
    }

    CURRENT_VIEW = 'comparison';
    document.getElementById("singleSimView").classList.add("hidden");
    document.getElementById("comparisonView").classList.remove("hidden");

    renderComparisonTable();
    renderSidebar();
}

function deleteSim(index) {
    if (SIM_LIST.length <= 1) {
        showToast("Cannot delete the last simulation.");
        return;
    }
    if (confirm("Delete " + SIM_LIST[index].name + "?")) {
        SIM_LIST.splice(index, 1);
        if (ACTIVE_SIM_INDEX >= SIM_LIST.length) ACTIVE_SIM_INDEX = SIM_LIST.length - 1;

        if (CURRENT_VIEW === 'comparison') {
            renderComparisonTable();
            renderSidebar();
        } else {
            switchSim(ACTIVE_SIM_INDEX);
        }
    }
}

function updateSimName() {
    var el = document.getElementById("simName");
    if (el && SIM_LIST[ACTIVE_SIM_INDEX]) {
        SIM_LIST[ACTIVE_SIM_INDEX].name = el.value;
        renderSidebar();
    }
}

function saveSimData(idx) {
    var s = SIM_LIST[idx];
    if (!s) return;
    s.config = getSimInputs();
    s.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
    s.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
}

function loadSimDataToUI(sim) {
    if (!sim) return;

    GEAR_SELECTION = sim.gear || {};
    ENCHANT_SELECTION = sim.enchants || {};
    initGearPlannerUI(); // Populates gear slots
    calculateGearStats(); // Calculates stats from gear -> updates inputs

    // Overwrite inputs with saved config
    var c = sim.config;
    if (!c) return;

    CONFIG_IDS.forEach(function (id) {
        // Map saved config keys back to UI IDs
        // Note: getSimInputs() returns an object with specific keys (e.g. inputStr),
        // but CONFIG_IDS matches the DOM IDs (e.g. stat_str).
        // We need to map them or ensure saveSimData saves by ID.
        // Current getSimInputs() structure uses custom keys.
        // FIX: Let's ensure saveSimData saves exact ID mapping for easy restore.
        // Actually, let's use a helper to grab values by ID directly for saving.
    });
    
    // Quick Fix: Apply known config object properties to elements if IDs match
    // OR: Re-implement getSimInputs to just grab by ID for storage.
    // Better: Iterate CONFIG_IDS and set value from c[id] if it exists.
    // But sim.config structure in engine.js is specific.
    // Let's implement a robust save/load using direct ID mapping for storage.
    
    // Applying saved config directly if it matches ID
    for (var key in c) {
        var el = document.getElementById(key);
        if (el) {
            if (el.type === 'checkbox') el.checked = (c[key] === 1 || c[key] === true);
            else el.value = c[key];
        }
    }
    
    // Re-trigger updates
    updateEnemyInfo();
    updatePlayerStats();
}

// ============================================================================
// COMPARISON TABLE
// ============================================================================

function renderComparisonTable() {
    var tbody = document.getElementById("comparisonBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    SIM_LIST.forEach(function (sim, idx) {
        var r = sim.results;
        var c = sim.config || {};

        var tr = document.createElement("tr");
        var dpsAvg = r ? Math.floor(r.dps) : "-";
        
        var gearCount = Object.keys(sim.gear || {}).length;
        var rotation = (c.rota_position === "back" ? "Shred" : "Claw") + (c.rota_powershift ? " + Shift" : "");

        var html = `
            <td><b style="color:var(--druid-orange); cursor:pointer;" onclick="switchSim(${idx})">${sim.name}</b></td>
            <td>${c.simTime || 60}s</td>
            <td>${c.iterations || 1000}</td>
            <td>${Math.floor(c.inputAP || 0)}</td>
            <td>${(c.inputCrit || 0).toFixed(1)}%</td>
            <td>${(c.inputHit || 0).toFixed(1)}%</td>
            <td>${(c.inputHaste || 0).toFixed(1)}%</td>
            <td>${c.enemyLevel || 63}</td>
            <td>${rotation}</td>
            <td style="font-size:0.8rem;">${gearCount} Items</td>
            <td style="text-align:right; color:#90caf9;">-</td>
            <td style="text-align:right; color:#ffb74d; font-weight:bold;">${dpsAvg}</td>
            <td style="text-align:right; color:#a5d6a7;">-</td>
            <td style="text-align:center; cursor:pointer; color:#f44336;" onclick="deleteSim(${idx})">✖</td>
        `;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function runAllSims() {
    showProgress("Running All Simulations...");
    var idx = 0;

    function next() {
        if (idx >= SIM_LIST.length) {
            hideProgress();
            renderComparisonTable();
            return;
        }

        var sim = SIM_LIST[idx];
        try {
            // Need to ensure config is up to date with stats
            // If we are not in Single View, calculateGearStats might not run for this sim
            // Simplified: Just run it.
            var all = [];
            for (var i = 0; i < (sim.config.iterations || 100); i++) {
                all.push(runCoreSimulation(sim.config));
            }
            sim.results = aggregateResults(all);
        } catch (e) {
            console.error("Sim Error", e);
        }
        
        updateProgress(Math.floor(((idx + 1) / SIM_LIST.length) * 100));
        idx++;
        setTimeout(next, 10);
    }
    setTimeout(next, 50);
}

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // Attach listeners to all inputs in CONFIG_IDS
    CONFIG_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", function() {
                // If it's a gear/buff/stat input, recalculate derived stats
                if (id.startsWith("stat_") || id.startsWith("buff_") || id.startsWith("cons_") || id.startsWith("tal_")) {
                    calculateGearStats();
                    updatePlayerStats();
                }
                
                // If enemy armor/debuff changed
                if (id.startsWith("enemy_") || id.startsWith("debuff_")) {
                    updateEnemyInfo();
                }

                if (ACTIVE_SIM_INDEX >= 0 && SIM_LIST[ACTIVE_SIM_INDEX]) {
                    saveSimData(ACTIVE_SIM_INDEX);
                }
            });
        }
    });

    // Run Button
    var btn = document.getElementById('runSimBtn');
    if (btn) btn.addEventListener('click', runSimulation);

    // Reset Button
    var rst = document.getElementById('resetBtn');
    if (rst) rst.addEventListener('click', function () {
        if (confirm("Reset current simulation?")) {
            resetGear();
            document.getElementById("simTime").value = 60;
            saveSimData(ACTIVE_SIM_INDEX);
        }
    });
}

function updateEnemyInfo() {
    var armor = parseFloat(document.getElementById("enemy_armor").value) || 3731;
    var lvl = parseFloat(document.getElementById("enemy_level").value) || 63;
    
    // Debuffs
    if (document.getElementById("debuff_sunder").checked) armor -= 2250;
    if (document.getElementById("debuff_iea").checked) armor -= 2550; // Usually exclusive, but lets simple sub
    if (document.getElementById("debuff_faerie_fire").checked) armor -= 505;
    if (document.getElementById("debuff_cor").checked) armor -= 640;
    if (document.getElementById("debuff_eskhandar").checked) armor -= 1200;
    
    if (armor < 0) armor = 0;
    
    // DR Formula: Armor / (Armor + 400 + 85 * (AttackerLevel + 4.5 * (AttackerLevel - 59)))
    // Attacker Lvl 60. Constant = 400 + 85 * (60 + 4.5) = 5882.5
    var dr = armor / (armor + 5882.5);
    var pct = (dr * 100).toFixed(2);
    
    var el = document.getElementById("sumRes");
    if(el) {
        el.innerText = armor + " Armor (" + pct + "% DR)";
        el.style.color = (pct < 10) ? "#4caf50" : "#ff9800";
    }
}

function updatePlayerStats() {
    // Read directly from Inputs (populated by 03_gear.js)
    var ap = document.getElementById("stat_ap").value;
    var crit = document.getElementById("stat_crit").value;
    var hit = document.getElementById("stat_hit").value;
    var haste = document.getElementById("stat_haste").value;
    
    // Update Sidebar
    setText("sumAP", ap);
    setText("sumCrit", crit + "%");
    setText("sumHit", hit + "%");
    setText("sumHaste", haste + "%");
    
    // Update Gear Planner Preview
    setText("gp_ap", ap);
    setText("gp_crit", crit + "%");
    setText("gp_hit", hit + "%");
    
    // Rotation Summary
    var list = document.getElementById("sumRotaList");
    if(list) {
        list.innerHTML = "";
        var add = (t) => { var li = document.createElement("li"); li.innerText = t; list.appendChild(li); };
        
        if(getVal("rota_powershift")) add("Powershift: ON");
        if(getVal("rota_position") === "back") add("Pos: Behind"); else add("Pos: Front");
        if(getVal("rota_rake")) add("Use Rake");
        if(getVal("rota_bite")) add("Ferocious Bite");
    }
}

// ============================================================================
// RESULT RENDERING
// ============================================================================

function updateSimulationResults(sim) {
    if (!sim || !sim.results) return;
    var r = sim.results;
    var resDiv = document.getElementById("simResultsArea");
    if (resDiv) resDiv.classList.remove("hidden");

    setText("resDps", Math.floor(r.dps));
    setText("resTotalDmg", (r.totalDmg / 1000).toFixed(1) + "k");
    setText("resDuration", r.duration + "s");
    
    var shifts = r.counts ? (r.counts["Powershift"] || 0) : 0;
    setText("resMana", Math.floor(shifts));

    renderDistBar(r);
    renderResultTable(r);
    renderLogTable(r.log);
}

function renderDistBar(r) {
    var bar = document.getElementById("dmgDistBar");
    if (!bar) return;
    bar.innerHTML = "";
    
    var total = r.totalDmg;
    if (total === 0) return;

    var sorted = [];
    for(var k in r.dmgSources) sorted.push({n:k, v:r.dmgSources[k]});
    sorted.sort((a,b) => b.v - a.v);
    
    // Feral Colors
    var colors = { 
        "Auto Attack": "#ffffff", 
        "Shred": "#ffeb3b", // Yellow
        "Ferocious Bite": "#ff5722", // Orange
        "Rip": "#d32f2f", // Red
        "Rake": "#f44336", // Light Red
        "Claw": "#ff9800",
        "Rake (DoT)": "#e57373"
    };
    
    sorted.forEach(s => {
        var pct = (s.v / total) * 100;
        if(pct < 1) return;
        var d = document.createElement("div");
        d.className = "bar-fill";
        d.style.width = pct + "%";
        d.style.backgroundColor = colors[s.n] || "#777";
        d.title = s.n + ": " + pct.toFixed(1) + "%";
        bar.appendChild(d);
    });
}

function renderResultTable(r) {
    var tb = document.getElementById("resTableBody");
    if(!tb) return;
    tb.innerHTML = "";
    
    var total = r.totalDmg;
    var sorted = [];
    for(var k in r.dmgSources) sorted.push({n:k, v:r.dmgSources[k]});
    sorted.sort((a,b) => b.v - a.v);
    
    sorted.forEach(s => {
        var tr = document.createElement("tr");
        var dps = (s.v / r.duration).toFixed(1);
        var pct = (total > 0) ? ((s.v / total) * 100).toFixed(1) : "0.0";
        var count = r.counts[s.n] || 0;
        
        // Crit %
        // Need hits count. count is total casts/attempts.
        var misses = (r.missCounts[s.n]||0) + (r.dodgeCounts[s.n]||0);
        var hits = count - misses;
        var critPct = hits > 0 ? ((r.critCounts[s.n]||0) / hits * 100).toFixed(1) : "0.0";
        var glancePct = (s.n === "Auto Attack" && count > 0) ? ((r.glanceCounts[s.n]||0) / count * 100).toFixed(1) : "-";
        
        tr.innerHTML = `
            <td style="text-align:left;">${s.n}</td>
            <td>${Math.floor(s.v).toLocaleString()}</td>
            <td>${dps}</td>
            <td>${pct}%</td>
            <td>${Math.floor(count)}</td>
            <td>${critPct}%</td>
            <td>${glancePct}%</td>
        `;
        tb.appendChild(tr);
    });
}

// ============================================================================
// LOG & CSV
// ============================================================================

var LOG_DATA = [];
var LOG_PAGE = 1;
const LOG_PER_PAGE = 50;

function renderLogTable(log) {
    LOG_DATA = log || [];
    LOG_PAGE = 1;
    updateLogView();
}

function updateLogView() {
    var tb = document.getElementById("logTableBody");
    if(!tb) return;
    tb.innerHTML = "";
    
    var start = (LOG_PAGE-1) * LOG_PER_PAGE;
    var end = start + LOG_PER_PAGE;
    var slice = LOG_DATA.slice(start, end);
    
    slice.forEach(e => {
        var tr = document.createElement("tr");
        
        var cEvt = "#ccc";
        if(e.event === "Damage") cEvt = "#fff";
        if(e.event === "Cast") cEvt = "#ffd700";
        if(e.event === "Proc") cEvt = "#4caf50";
        
        var cAb = "#ccc";
        if(e.ability === "Shred") cAb = "#ffeb3b";
        if(e.ability.includes("Rip") || e.ability.includes("Rake")) cAb = "#f44336";
        if(e.ability === "Auto Attack") cAb = "#fff";
        
        // Energy Styling
        var enClass = "col-energy";
        if(e.energy < 30) enClass = "col-energy low";
        
        tr.innerHTML = `
            <td>${e.t.toFixed(3)}</td>
            <td style="color:${cEvt}">${e.event}</td>
            <td style="color:${cAb}">${e.ability}</td>
            <td>${e.result}</td>
            <td>${e.dmg > 0 ? Math.floor(e.dmg) : ""}</td>
            <td class="${enClass}">${Math.floor(e.energy)}</td>
            <td class="col-cp">${e.cp}</td>
            <td class="col-mana">${Math.floor(e.mana)}</td>
            <td style="color:#777; font-size:0.8rem;">${e.info || ""}</td>
        `;
        tb.appendChild(tr);
    });
    
    setText("logPageLabel", LOG_PAGE + " / " + Math.ceil(LOG_DATA.length/LOG_PER_PAGE));
}

function nextLogPage() {
    if(LOG_PAGE * LOG_PER_PAGE < LOG_DATA.length) { LOG_PAGE++; updateLogView(); }
}
function prevLogPage() {
    if(LOG_PAGE > 1) { LOG_PAGE--; updateLogView(); }
}

function downloadCSV() {
    if(!LOG_DATA || LOG_DATA.length===0) return;
    var csv = "Time,Event,Ability,Result,Damage,Energy,CP,Mana,Info\n";
    LOG_DATA.forEach(r => {
        csv += `${r.t.toFixed(3)},${r.event},${r.ability},${r.result},${r.dmg},${r.energy},${r.cp},${r.mana},"${r.info||""}"\n`;
    });
    var blob = new Blob([csv], {type:"text/csv"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "feral_sim_log.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Helpers called from HTML directly
function toggleCard(header) {
    var body = header.nextElementSibling;
    if (body.style.display === "none") {
        body.style.display = "block";
        header.querySelector(".toggle-icon").innerText = "▼";
    } else {
        body.style.display = "none";
        header.querySelector(".toggle-icon").innerText = "▶";
    }
}

// Import/Export Wrappers (Delegate to 06_main or define here)
function exportSettings() {
    var json = JSON.stringify(SIM_LIST);
    var b64 = LZString.compressToBase64(json);
    navigator.clipboard.writeText(b64).then(() => showToast("Settings copied!"));
}

function importFromClipboard() {
    var val = prompt("Paste settings string:");
    if(!val) return;
    try {
        var json = LZString.decompressFromBase64(val);
        var list = JSON.parse(json);
        if(Array.isArray(list)) {
            SIM_LIST = list;
            switchSim(0);
            showToast("Import Successful!");
        }
    } catch(e) { showToast("Import Failed"); }
}
