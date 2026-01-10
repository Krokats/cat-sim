/**
 * Feral Simulation - File 4: UI Manager
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Handles Sidebar, Multi-Sim Management, Boss Presets, and Result Rendering
 */

// ============================================================================
// DATA: BOSS PRESETS & DEBUFFS
// ============================================================================

const BOSS_DB = [
    { name: "Apprentice Training Dummy", armor: 100 },
    { name: "Expert Training Dummy", armor: 3000 },
    { name: "Heroic Training Dummy", armor: 4211 },
    { name: "Kara40: Krull", armor: 4752 },
    { name: "Kara40: Rook, Rupturan, Mephistroth", armor: 4611 },
    { name: "Kara40: Most Bosses", armor: 4211 },
    { name: "Kara40: Echo, Sanv Tasdal", armor: 3850 },
    { name: "Kara40: Bishop", armor: 3402 },
    { name: "Naxx: Loatheb, Patch, Thaddius", armor: 4611 },
    { name: "Naxx: Most Bosses", armor: 4211 },
    { name: "Naxx: Faerlina, Noth", armor: 3850 },
    { name: "Naxx: Gothik, Kel'Thuzad", armor: 3402 },
    { name: "AQ40: Most Bosses", armor: 4211 },
    { name: "AQ40: Emperor Vek'lor", armor: 3833 },
    { name: "AQ40: The Prophet Skeram", armor: 3402 },
    { name: "ES: Solnius", armor: 4712 },
    { name: "ES: Erennius", armor: 4912 },
    { name: "BWL: All Bosses", armor: 4211 },
    { name: "MC: Sulfuron Harbinger", armor: 4786 },
    { name: "MC: Most Bosses", armor: 4211 },
    { name: "MC: Gehennas, Lucifron, Shazzrah", armor: 3402 },
    { name: "AQ20: Most Bosses", armor: 4211 },
    { name: "AQ20: Moam", armor: 4113 },
    { name: "AQ20: Buru the Gorger", armor: 3402 },
    { name: "Kara10: Lord Blackwald", armor: 4325 },
    { name: "Kara10: Howlfang, Moroes", armor: 3892 },
    { name: "Kara10: Grizikil, Araxxna", armor: 3044 },
    { name: "ZG: Bloodlord Mandokir", armor: 4211 },
    { name: "ZG: High Priest Thekal", armor: 3850 },
    { name: "ZG: Most Bosses", armor: 3402 },
    { name: "Onyxia's Lair: Onyxia", armor: 4211 },
    { name: "World Boss: Ostarius", armor: 5980 },
    { name: "World Boss: Dark Reaver", armor: 4285 },
    { name: "World Boss: Azuregos/Dragons/Kazzak", armor: 4211 },
    { name: "World Boss: Omen", armor: 4186 },
    { name: "World Boss: Nerubian Overseer", armor: 3761 },
    { name: "Silithus: Lord Skwol", armor: 4061 },
    { name: "Silithus: Prince Thunderaan", armor: 4213 },
    { name: "Strat UD: Atiesh", armor: 3850 },
    { name: "UBRS: Gyth", armor: 4061 },
    { name: "UBRS: Lord Valthalak", armor: 3400 }
];

const DEBUFF_VALUES = {
    sunder: 2550, // Improved Exposed Armor (Max Value per prompt)
    eskhandar: 1200,
    faerie: 505,
    cor: 640
};

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
    
    // Default Config
    newSim.config = getSimInputs(); 
    newSim.gear = {}; 
    newSim.enchants = {};

    // Copy current gear if not init
    if (!isInit && SIM_LIST.length > 0) {
        newSim.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
        newSim.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
        newSim.config = getSimInputs();
    }

    SIM_LIST.push(newSim);
    switchSim(SIM_LIST.length - 1);
}

function switchSim(index) {
    if (index < 0 || index >= SIM_LIST.length) return;

    // Save current Sim state
    if (CURRENT_VIEW === 'single' && SIM_LIST[ACTIVE_SIM_INDEX]) {
        saveSimData(ACTIVE_SIM_INDEX);
    }

    // Switch Index
    ACTIVE_SIM_INDEX = index;
    CURRENT_VIEW = 'single';
    SIM_DATA = SIM_LIST[index];

    // Load Data to UI
    loadSimDataToUI(SIM_DATA);

    // Update View
    document.getElementById("comparisonView").classList.add("hidden");
    document.getElementById("singleSimView").classList.remove("hidden");
    
    var nameInput = document.getElementById("simName");
    if(nameInput) nameInput.value = SIM_DATA.name;

    renderSidebar();
    
    // Results
    if(!SIM_DATA.results) {
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

// Helper: Save UI inputs to SIM_LIST object
function saveSimData(idx) {
    var s = SIM_LIST[idx];
    if(!s) return;
    s.config = getSimInputs();
    s.gear = JSON.parse(JSON.stringify(GEAR_SELECTION));
    s.enchants = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
}

// Helper: Load SIM_LIST object to UI inputs
function loadSimDataToUI(sim) {
    if(!sim) return;
    
    GEAR_SELECTION = sim.gear || {};
    ENCHANT_SELECTION = sim.enchants || {};
    initGearPlannerUI();
    
    // Ensure stats are re-calculated for the UI fields
    calculateGearStats();

    var c = sim.config;
    if(!c) return;

    CONFIG_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if(el && c[id] !== undefined) {
             if(el.type === 'checkbox') el.checked = (c[id] == 1 || c[id] === true);
             else el.value = c[id];
        }
    });

    // Update Enemy Info based on loaded armor value
    updateEnemyInfo();
}

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // 1. Populate Boss List
    var bossSel = document.getElementById("boss_preset");
    if (bossSel) {
        bossSel.innerHTML = "";
        BOSS_DB.forEach(function(b) {
            var opt = document.createElement("option");
            opt.value = b.name;
            opt.innerText = b.name + " (" + b.armor + ")";
            if (b.name === "Heroic Training Dummy") opt.selected = true;
            bossSel.appendChild(opt);
        });
    }

    // 2. Inputs Change -> Save State
    var inputs = document.querySelectorAll("input, select");
    inputs.forEach(function(el) {
        el.addEventListener("change", function() {
            if (ACTIVE_SIM_INDEX >= 0 && SIM_LIST[ACTIVE_SIM_INDEX]) {
                saveSimData(ACTIVE_SIM_INDEX);
            }
        });
    });
}

function applyBossPreset() {
    var name = document.getElementById("boss_preset").value;
    var boss = BOSS_DB.find(b => b.name === name);
    if(boss) {
        document.getElementById("enemy_armor").value = boss.armor;
        updateEnemyInfo();
    }
}

function updateEnemyInfo() {
    var baseArmor = parseFloat(document.getElementById("enemy_armor").value) || 0;
    
    // Calculate Debuff Reduction
    var armorReduct = 0;
    if(getVal("debuff_sunder")) armorReduct += DEBUFF_VALUES.sunder;
    if(getVal("debuff_faerie")) armorReduct += DEBUFF_VALUES.faerie;
    if(getVal("debuff_cor")) armorReduct += DEBUFF_VALUES.cor;
    if(getVal("debuff_eskhandar")) armorReduct += DEBUFF_VALUES.eskhandar;

    var finalArmor = Math.max(0, baseArmor - armorReduct);
    setText("finalArmor", finalArmor);

    // DR Formula for Lvl 60 Attacker vs Boss
    // Formula: Armor / (Armor + 400 + 85 * (AttackerLvl + 4.5 * (AttackerLvl - 59)))
    // 60 -> 5882.5
    var dr = finalArmor / (finalArmor + 5882.5);
    var pct = (dr * 100).toFixed(2);
    
    setText("sumRes", pct + "%");
}

function updatePlayerStats() {
    // UI Updates
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
    
    if(getVal("rota_powershift")) add("Powershifting", "#4caf50");
    if(getVal("rota_position") === "back") add("Behind (Shred)", "#ff9800"); else add("Front (Claw)", "#f44336");
    if(getVal("use_rake")) add("Use Rake", "#e57373");
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
// COMPARISON VIEW
// ============================================================================

function renderComparisonTable() {
    var tbody = document.getElementById("comparisonBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    SIM_LIST.forEach(function(sim, idx) {
        var r = sim.results;
        var c = sim.config || {};
        
        var tr = document.createElement("tr");
        var dpsAvg = r ? Math.floor(r.dps) : "-";
        
        var html = `
            <td><b style="color:var(--druid-orange); cursor:pointer;" onclick="switchSim(${idx})">${sim.name}</b></td>
            <td>${c.simTime || 60}s</td>
            <td>${c.iterations || 1000}</td>
            <td>${c.inputAP || "-"}</td>
            <td>${c.inputCrit || "-"}%</td>
            <td>${c.inputHit || "-"}%</td>
            <td>${c.inputHaste || "-"}%</td>
            <td>${c.boss_preset || "Custom"}</td>
            <td style="font-size:0.8rem;">${getGearShort(sim)}</td>
            <td style="text-align:right; color:#90caf9;">-</td>
            <td style="text-align:right; color:#ffb74d; font-weight:bold;">${dpsAvg}</td>
            <td style="text-align:right; color:#a5d6a7;">-</td>
            <td style="text-align:center; cursor:pointer; color:#f44336;" onclick="deleteSim(${idx})">✖</td>
        `;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function getGearShort(sim) {
    var count = Object.keys(sim.gear || {}).length;
    var sets = "";
    if (sim.config && sim.config.hasT05) sets += "T0.5 ";
    if (sim.config && sim.config.hasWolfshead) sets += "Wolf ";
    if (sim.config && sim.config.hasMCP) sets += "MCP ";
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
            // Need to ensure config has latest stats? 
            // We assume config is saved.
            var all = [];
            for(var i=0; i< (sim.config.iterations || 100); i++) {
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
    
    // Shifts Count
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
    
    var colors = { "Auto": "#fff", "Shred": "#ffeb3b", "Ferocious Bite": "#ff5722", "Rip": "#d32f2f", "Rake": "#f44336", "Claw": "#ff9800" };
    
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
        
        tr.innerHTML = `
            <td style="text-align:left;">${s.n}</td>
            <td>${Math.floor(s.v).toLocaleString()}</td>
            <td>${dps}</td>
            <td>${pct}%</td>
            <td>${Math.floor(count)}</td>
            <td>-</td>
            <td>-</td>
        `;
        tb.appendChild(tr);
    });
}

// ============================================================================
// LOG & EXPORT
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
        tr.innerHTML = `
            <td>${e.t.toFixed(2)}</td>
            <td style="color:${e.event==='Damage'?'#fff':'#ffd700'}">${e.event}</td>
            <td>${e.ability}</td>
            <td>${e.result}</td>
            <td>${e.dmg > 0 ? Math.floor(e.dmg) : ""}</td>
            <td>${Math.floor(e.energy)}</td>
            <td>${e.cp}</td>
            <td>${Math.floor(e.mana)}</td>
            <td style="color:#777; font-size:0.8rem;">${e.info || ""}</td>
        `;
        tb.appendChild(tr);
    });
    
    setText("logPageLabel", LOG_PAGE + " / " + Math.ceil(LOG_DATA.length/LOG_PER_PAGE));
}

function nextLogPage() { if(LOG_PAGE * LOG_PER_PAGE < LOG_DATA.length) { LOG_PAGE++; updateLogView(); } }
function prevLogPage() { if(LOG_PAGE > 1) { LOG_PAGE--; updateLogView(); } }

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
    } catch(e) { showToast("Import Failed"); console.error(e); }
}

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