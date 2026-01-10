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
    btnOv.onclick = function() { showComparisonView(); };
    sb.appendChild(btnOv);

    // Separator
    var sep = document.createElement("div");
    sep.className = "sidebar-separator";
    sb.appendChild(sep);

    // 2. Sim Buttons
    SIM_LIST.forEach(function(sim, idx) {
        var btn = document.createElement("div");
        btn.className = "sidebar-btn" + (CURRENT_VIEW === 'single' && ACTIVE_SIM_INDEX === idx ? " active" : "");
        btn.innerText = (idx + 1);
        btn.title = sim.name;
        btn.onclick = function() { switchSim(idx); };
        sb.appendChild(btn);
    });

    // 3. Add Button
    var btnAdd = document.createElement("div");
    btnAdd.className = "sidebar-btn btn-add";
    btnAdd.innerText = "+";
    btnAdd.title = "Add Simulation";
    btnAdd.onclick = function() { addSim(); };
    sb.appendChild(btnAdd);
}

function addSim(isInit) {
    // Create new Sim Object
    var id = Date.now();
    var newSim = new SimObject(id, "Simulation " + (SIM_LIST.length + 1));
    
    // Default Config will be grabbed from current UI state via getSimInputs()
    // This ensures defaults match the UI
    newSim.config = typeof getSimInputs === "function" ? getSimInputs() : {}; 
    newSim.gear = {}; 
    newSim.enchants = {};

    // Copy current gear if not init (Cloning for convenience)
    if (!isInit && SIM_LIST.length > 0) {
        newSim.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
        newSim.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
        // Also copy current config settings
        newSim.config = getSimInputs();
    }

    SIM_LIST.push(newSim);
    switchSim(SIM_LIST.length - 1);
}

function switchSim(index) {
    if (index < 0 || index >= SIM_LIST.length) return;

    // 1. Save current Sim state before switching (if we were in single view)
    if (CURRENT_VIEW === 'single' && SIM_LIST[ACTIVE_SIM_INDEX]) {
        saveSimData(ACTIVE_SIM_INDEX);
    }

    // 2. Switch Index
    ACTIVE_SIM_INDEX = index;
    CURRENT_VIEW = 'single';
    SIM_DATA = SIM_LIST[index];

    // 3. Load Data to UI
    loadSimDataToUI(SIM_DATA);

    // 4. Update View
    document.getElementById("comparisonView").classList.add("hidden");
    document.getElementById("singleSimView").classList.remove("hidden");
    
    // Update Header Name
    var nameInput = document.getElementById("simName");
    if(nameInput) nameInput.value = SIM_DATA.name;

    renderSidebar();
    
    // Clear Results until run
    if(!SIM_DATA.results) {
        document.getElementById("simResultsArea").classList.add("hidden");
    } else {
        updateSimulationResults(SIM_DATA);
    }
}

function showComparisonView() {
    // Save current before leaving
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
        
        // If we were in comparison, stay there, else switch
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
        renderSidebar(); // Update tooltip
    }
}

// Helper: Save UI inputs to SIM_LIST object
function saveSimData(idx) {
    var s = SIM_LIST[idx];
    if(!s) return;
    // We need to define getSimInputs in engine or here. 
    // Usually it is in engine.js, but since UI needs to save, we assume it's globally available.
    if(typeof getSimInputs === 'function') {
        s.config = getSimInputs();
    }
    s.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
    s.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
}

// Helper: Load SIM_LIST object to UI inputs
function loadSimDataToUI(sim) {
    if(!sim) return;
    
    // Load Gear
    GEAR_SELECTION = sim.gear || {};
    ENCHANT_SELECTION = sim.enchants || {};
    initGearPlannerUI(); // Updates gear UI slots
    calculateGearStats(); // Updates stats inputs

    // Load Config Inputs
    var c = sim.config;
    if(!c) return;

    // Apply config to all known IDs (defined in 01_globals.js)
    CONFIG_IDS.forEach(function(id) {
        if (c[id] !== undefined) {
             var el = document.getElementById(id);
             if(el) {
                 if(el.type === 'checkbox') el.checked = (c[id] == 1 || c[id] === true);
                 else el.value = c[id];
             }
        }
    });
    
    // Trigger updates for derived UI elements (summaries)
    updatePlayerStats();
    updateEnemyInfo();
}

// ============================================================================
// COMPARISON TABLE
// ============================================================================

function renderComparisonTable() {
    var tbody = document.getElementById("comparisonBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    SIM_LIST.forEach(function(sim, idx) {
        var r = sim.results;
        var c = sim.config || {};
        
        var tr = document.createElement("tr");
        
        var dpsMin = "-", dpsAvg = "-", dpsMax = "-";
        if (r) {
            dpsAvg = Math.floor(r.dps);
            // Min/Max placeholder
        }

        // Build Row
        var html = `
            <td><b style="color:var(--druid-orange); cursor:pointer;" onclick="switchSim(${idx})">${sim.name}</b></td>
            <td>${c.simTime || 60}s / ${c.calcMethod || 'avg'}</td>
            <td>${c.iterations || 1000}</td>
            <td>${getSavedStat(sim, 'stat_ap')}</td>
            <td>${getSavedStat(sim, 'stat_crit')}%</td>
            <td>${getSavedStat(sim, 'stat_hit')}%</td>
            <td>${getSavedStat(sim, 'stat_haste')}%</td>
            <td>${c.enemy_level || 63}</td>
            <td style="font-size:0.8rem;">${getRotationShort(c)}</td>
            <td style="font-size:0.8rem;">${getGearShort(sim)}</td>
            <td style="text-align:right; color:#90caf9;">${dpsMin}</td>
            <td style="text-align:right; color:#ffb74d; font-weight:bold;">${dpsAvg}</td>
            <td style="text-align:right; color:#a5d6a7;">${dpsMax}</td>
            <td style="text-align:center; cursor:pointer; color:#f44336;" onclick="deleteSim(${idx})">✖</td>
        `;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function getSavedStat(sim, id) {
    if (sim.config && sim.config[id]) return sim.config[id];
    return "-";
}

function getRotationShort(c) {
    var parts = [];
    if (c.rota_position === 'back') parts.push("Shred"); else parts.push("Claw");
    
    if (c.use_reshift) parts.push("Shift<" + c.reshift_energy);
    if (c.use_rip) parts.push("Rip>" + c.rip_cp);
    if (c.use_fb) parts.push("FB>" + c.fb_energy);
    
    return parts.join(", ");
}

function getGearShort(sim) {
    var count = Object.keys(sim.gear || {}).length;
    var sets = "";
    if (sim.config && sim.config.set_t05_4p) sets += "T0.5 ";
    if (sim.config && sim.config.meta_wolfshead) sets += "Wolf ";
    if (sim.config && sim.config.item_mcp) sets += "MCP ";
    return count + " Items " + (sets ? "| " + sets : "");
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
            // Engine must be available as runCoreSimulation
            if (typeof runCoreSimulation !== 'function') {
                throw new Error("Engine not loaded");
            }

            var all = [];
            var iterations = sim.config.iterations || 100;
            // Quick run for mass comparison, maybe limit if count is huge? 
            // We stick to config.
            
            for(var i=0; i < iterations; i++) {
                all.push(runCoreSimulation(sim.config));
            }
            sim.results = aggregateResults(all);
            
            updateProgress(Math.floor(((idx + 1) / SIM_LIST.length) * 100));
            idx++;
            setTimeout(next, 10);
        } catch(e) {
            console.error(e);
            idx++;
            setTimeout(next, 10);
        }
    }
    
    setTimeout(next, 50);
}

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // Inputs Change -> Save State
    var inputs = document.querySelectorAll("input, select");
    inputs.forEach(function(el) {
        el.addEventListener("change", function() {
            if (ACTIVE_SIM_INDEX >= 0 && SIM_LIST[ACTIVE_SIM_INDEX]) {
                saveSimData(ACTIVE_SIM_INDEX);
                // Update text fields immediately
                updatePlayerStats();
                updateEnemyInfo();
            }
        });
    });

    // Run Button
    var btn = document.getElementById('btnRun');
    if (btn) btn.addEventListener('click', runSimulation);
}


function updateEnemyInfo() {
    var armor = getVal('enemy_armor');
    
    // Turtle WoW 1.18 DR Formula approximation for Lvl 60 attacker
    // DR = Armor / (Armor + 400 + 85 * (60 + 4.5 * (60 - 59))) = Armor / (Armor + 5882.5)
    var dr = armor / (armor + 5882.5);
    var pct = (dr * 100).toFixed(2);
    
    setText('sumRes', pct + "%");
}

function updatePlayerStats() {
    // Just updates the UI text from Inputs (which are populated by 03_gear.js)
    var ap = getVal("stat_ap");
    var crit = getVal("stat_crit");
    var hit = getVal("stat_hit");
    var haste = getVal("stat_haste");
    
    setText("sumAP", Math.floor(ap));
    setText("sumCrit", crit.toFixed(2) + "%");
    setText("sumHit", hit.toFixed(2) + "%");
    setText("sumHaste", haste.toFixed(2) + "%");
    setText("gp_ap", Math.floor(ap));
    setText("gp_crit", crit.toFixed(2) + "%");
    setText("gp_hit", hit.toFixed(2) + "%");
    
    updateRotaSummary();
    updateTrinketSummary();
}

function updateRotaSummary() {
    var list = document.getElementById("sumRotaList");
    if(!list) return;
    list.innerHTML = "";
    var add = (t, c) => { var li = document.createElement("li"); li.innerText = t; if(c) li.style.color = c; list.appendChild(li); };
    
    // Priority Display
    if(getVal("use_rip")) add("Rip (>" + getVal("rip_cp") + " CP)", "#f44336");
    if(getVal("use_fb")) add("Bite (> 5 CP, >" + getVal("fb_energy") + " En)", "#ff5722");
    
    if(getVal("use_reshift")) add("Reshift (<" + getVal("reshift_energy") + " En)", "#4caf50");
    if(getVal("use_tf")) add("Tiger's Fury", "#ff9800");
    if(getVal("use_ff")) add("Faerie Fire", "#a335ee");
    if(getVal("use_rake")) add("Rake", "#e57373");
    
    if(getVal("rota_position") === "back") {
        if(getVal("use_shred")) add("Shred (Behind)", "#ffeb3b");
    } else {
        if(getVal("use_claw")) add("Claw (Front)", "#ff9800");
    }
}

function updateTrinketSummary() {
    var list = document.getElementById("sumTrinketList");
    if(!list) return;
    list.innerHTML = "";
    
    var t1 = GEAR_SELECTION["Trinket 1"];
    var t2 = GEAR_SELECTION["Trinket 2"];
    var i = GEAR_SELECTION["Idol"];
    
    [t1, t2, i].forEach(id => {
        if(id && ITEM_ID_MAP[id]) {
            var li = document.createElement("li");
            li.innerText = ITEM_ID_MAP[id].name;
            li.style.color = "#ccc";
            list.appendChild(li);
        }
    });
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
    
    // Counts
    var shifts = r.counts ? (r.counts["Powershift"] || 0) : 0;
    setText("resMana", Math.floor(shifts));

    // Dist Bar
    renderDistBar(r);
    // Table
    renderResultTable(r);
    // Log
    renderLogTable(r.log);
}

function renderDistBar(r) {
    var bar = document.getElementById("dmgDistBar");
    if (!bar) return;
    bar.innerHTML = "";
    
    var total = r.totalDmg;
    var sorted = [];
    for(var k in r.dmgSources) sorted.push({n:k, v:r.dmgSources[k]});
    sorted.sort((a,b) => b.v - a.v);
    
    var colors = { 
        "Auto Attack": "#fff", 
        "Shred": "#ffeb3b", 
        "Ferocious Bite": "#ff5722", 
        "Rip": "#d32f2f", 
        "Rake": "#f44336", 
        "Claw": "#ff9800",
        "Rake (DoT)": "#e57373",
        "Rip (DoT)": "#b71c1c"
    };
    
    sorted.forEach(s => {
        var pct = (s.v / total) * 100;
        if(pct < 1) return;
        var d = document.createElement("div");
        d.style.width = pct + "%";
        d.style.backgroundColor = colors[s.n] || "#777";
        d.title = s.n + " " + pct.toFixed(1) + "%";
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
        var pct = ((s.v / total) * 100).toFixed(1);
        var count = r.counts[s.n] || 0;
        
        // Crit %
        var hits = count - (r.missCounts[s.n]||0) - (r.dodgeCounts[s.n]||0);
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
        // Styling based on event
        var cEvt = "#ccc";
        if(e.event === "Damage") cEvt = "#fff";
        if(e.event === "Cast") cEvt = "#ffd700";
        
        var cAb = "#ccc";
        if(e.ability === "Shred") cAb = "#ffeb3b";
        if(e.ability.includes("Rip") || e.ability.includes("Rake")) cAb = "#f44336";
        
        tr.innerHTML = `
            <td>${e.t.toFixed(3)}</td>
            <td style="color:${cEvt}">${e.event}</td>
            <td style="color:${cAb}">${e.ability}</td>
            <td>${e.result}</td>
            <td>${e.dmg > 0 ? Math.floor(e.dmg) : ""}</td>
            <td class="col-energy">${Math.floor(e.energy)}</td>
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

// ============================================================================
// IMPORT / EXPORT
// ============================================================================
function exportSettings() {
    // Save all Sims
    var json = JSON.stringify(SIM_LIST);
    var b64 = LZString.compressToBase64(json);
    navigator.clipboard.writeText(b64).then(() => showToast("Settings copied to clipboard!"));
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
    } catch(e) { showToast("Import Failed"); console.error(e); }
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