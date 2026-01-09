/**
 * Feral Simulation - File 4: UI Manager
 */

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // Config Listeners
    CONFIG_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                // Trigger calculation for Buffs OR Manual Stats Toggle OR Race
                if (id.startsWith("buff_") || id === "manual_stats" || id === "char_race") {
                    calculateGearStats();
                }
                saveCurrentState();
            });
            // For text inputs, also save on input (optional, but good for sliders)
            if(el.type === "number" || el.type === "text") {
                 el.addEventListener('input', function() {
                     // Live update for some visuals if needed
                     if(id === "enemy_armor" || id === "enemy_level") updateEnemyInfo();
                 });
            }
        }
    });

    // Special listeners for Enemy Info
    var armorInput = document.getElementById('enemy_armor');
    var lvlInput = document.getElementById('enemy_level');
    if (armorInput) armorInput.addEventListener('input', updateEnemyInfo);
    if (lvlInput) lvlInput.addEventListener('change', updateEnemyInfo);

    // Initial update
    updateEnemyInfo();

    // Modal Close Listeners
    document.addEventListener('keydown', function (e) {
        if (e.key === "Escape") {
            closeItemModal();
            closeEnchantModal();
        }
    });

    var modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(function (modal) {
        modal.addEventListener('mousedown', function (e) {
            if (e.target === modal) {
                closeItemModal();
                closeEnchantModal();
            }
        });
    });
}

function toggleCard(header) {
    var card = header.parentElement;
    card.classList.toggle("collapsed");
}

// ============================================================================
// MANAGEMENT & STATE
// ============================================================================

function getCurrentConfigFromUI() {
    var cfg = {};
    CONFIG_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { if (el.type === 'checkbox') cfg[id] = el.checked ? 1 : 0; else cfg[id] = el.value; }
    });

    if (typeof GEAR_SELECTION !== 'undefined') {
        cfg.gearSelection = JSON.parse(JSON.stringify(GEAR_SELECTION));
    } else {
        cfg.gearSelection = {};
    }

    if (typeof ENCHANT_SELECTION !== 'undefined') {
        cfg.enchantSelection = JSON.parse(JSON.stringify(ENCHANT_SELECTION));
    } else {
        cfg.enchantSelection = {};
    }

    return cfg;
}

function applyConfigToUI(cfg) {
    if (!cfg) return;

    for (var id in cfg) {
        if (id === 'gearSelection' || id === 'enchantSelection') continue;
        var el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') el.checked = (cfg[id] == 1);
            else el.value = cfg[id];
        }
    }

    if (cfg.gearSelection) {
        GEAR_SELECTION = JSON.parse(JSON.stringify(cfg.gearSelection));
    } else {
        GEAR_SELECTION = {};
    }

    if (cfg.enchantSelection) {
        ENCHANT_SELECTION = JSON.parse(JSON.stringify(cfg.enchantSelection));
    } else {
        ENCHANT_SELECTION = {};
    }

    if (typeof initGearPlannerUI === 'function') {
        initGearPlannerUI();
    }
    
    // Trigger Calculations
    calculateGearStats();
    updateEnemyInfo();
}

function saveCurrentState() {
    if (SIM_LIST[ACTIVE_SIM_INDEX]) {
        var isOverview = !document.getElementById('comparisonView').classList.contains('hidden');
        if (!isOverview) {
            SIM_LIST[ACTIVE_SIM_INDEX].config = getCurrentConfigFromUI();
            var nameInput = document.getElementById('simName');
            if (nameInput) SIM_LIST[ACTIVE_SIM_INDEX].name = nameInput.value;
        }
    }
}

function addSim(isFirst) {
    if (!isFirst) saveCurrentState();
    var newId = Date.now();
    var newName = isFirst ? "Feral Sim 1" : "Feral Sim " + (SIM_LIST.length + 1);
    var newSim = new SimObject(newId, newName);

    if (!isFirst && SIM_LIST.length > 0) {
        newSim.config = JSON.parse(JSON.stringify(SIM_LIST[ACTIVE_SIM_INDEX].config));
    } else {
        newSim.config = getCurrentConfigFromUI();
    }

    SIM_LIST.push(newSim);

    if (!isFirst) {
        switchSim(SIM_LIST.length - 1);
    } else {
        renderSidebar();
    }
}

function deleteSim(index) {
    if (!confirm("Delete?")) return;
    SIM_LIST.splice(index, 1);
    if (SIM_LIST.length === 0) { addSim(true); return; }
    if (index === ACTIVE_SIM_INDEX) { ACTIVE_SIM_INDEX = Math.max(0, index - 1); } else if (index < ACTIVE_SIM_INDEX) { ACTIVE_SIM_INDEX--; }
    renderSidebar(); renderComparisonTable(); showToast("Deleted");
}

function switchSim(index) {
    saveCurrentState();
    ACTIVE_SIM_INDEX = index;

    var nameInput = document.getElementById('simName');
    if (nameInput) {
        nameInput.value = SIM_LIST[index].name;
        nameInput.disabled = false;
        nameInput.style.color = "var(--feral-orange)";
    }

    applyConfigToUI(SIM_LIST[index].config);

    document.getElementById('comparisonView').classList.add('hidden');
    document.getElementById('singleSimView').classList.remove('hidden');

    var res = SIM_LIST[index].results;
    document.getElementById('resultsArea').classList.remove('hidden');

    if (res) {
        SIM_DATA = res;
        switchView('avg');
        setText("viewAvg", "Average (" + res.avg.dps.toFixed(1) + ")");
        setText("viewMin", "Min (" + res.min.dps.toFixed(1) + ")");
        setText("viewMax", "Max (" + res.max.dps.toFixed(1) + ")");
    } else {
        SIM_DATA = null;
        setText("out_dps_main", "-");
        setText("out_total_dmg", "-");
        if (document.getElementById("out_shifts")) setText("out_shifts", "-");
        if (document.getElementById("out_cp_waste")) setText("out_cp_waste", "-");

        setText("viewAvg", "Average (-)");
        setText("viewMin", "Min (-)");
        setText("viewMax", "Max (-)");

        var tbody = document.getElementById("tbl_body");
        if (tbody) tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#666; padding:20px;'>No simulation run yet.</td></tr>";
        
        // Reset Weights
        setText("val_ap", "-");
        setText("val_crit", "-");
        setText("val_hit", "-");
    }
    renderSidebar();
}

function addNewSim() { addSim(false); showToast("Duplicated!"); }
function updateSimName() {
    if (SIM_LIST[ACTIVE_SIM_INDEX]) {
        SIM_LIST[ACTIVE_SIM_INDEX].name = document.getElementById('simName').value;
        saveCurrentState();
        renderSidebar();
    }
}

// ============================================================================
// IMPORT / EXPORT LOGIC
// ============================================================================

function packConfig(cfg) {
    var values = CONFIG_IDS.map(function (id) { return cfg[id]; });
    var gearIds = {};
    var itemCount = 0;
    if (cfg.gearSelection) {
        for (var slot in cfg.gearSelection) {
            var val = cfg.gearSelection[slot];
            var idToSave = (val && typeof val === 'object' && val.id) ? val.id : val;
            if (idToSave && idToSave != 0) {
                gearIds[slot] = idToSave;
                itemCount++;
            }
        }
    }
    var enchantIds = {};
    if (cfg.enchantSelection) {
        for (var slot in cfg.enchantSelection) {
            var val = cfg.enchantSelection[slot];
            if (val && val != 0) enchantIds[slot] = val;
        }
    }
    return { data: [values, gearIds, enchantIds], itemCount: itemCount };
}

function unpackConfig(packed) {
    if (!Array.isArray(packed) || packed.length !== 3 || !Array.isArray(packed[0])) return packed;
    var values = packed[0];
    var gearIds = packed[1];
    var enchantIds = packed[2];
    var cfg = {};

    CONFIG_IDS.forEach(function (id, idx) {
        if (idx < values.length) cfg[id] = values[idx];
    });

    cfg.gearSelection = {};
    if (gearIds && ITEM_DB.length > 0) {
        for (var slot in gearIds) {
            var id = gearIds[slot];
            // Simple validation to ensure item exists (optional)
            cfg.gearSelection[slot] = id;
        }
    }
    cfg.enchantSelection = {};
    if (enchantIds) {
        for (var slot in enchantIds) {
            cfg.enchantSelection[slot] = enchantIds[slot];
        }
    }
    return cfg;
}

function importFromClipboard() {
    var input = prompt("Paste the config string (or full URL) here:");
    if (!input) return;
    if (ITEM_DB.length === 0) { alert("Database not loaded yet. Please wait."); return; }
    var b64 = input;
    if (input.includes("?s=")) { b64 = input.split("?s=")[1]; }

    try {
        var json = null;
        if (typeof LZString !== 'undefined') {
            json = LZString.decompressFromEncodedURIComponent(b64);
        }
        if (!json) { try { json = atob(b64); } catch (e) { } }
        if (!json) throw new Error("Could not decode string");

        var data = JSON.parse(json);
        if (!Array.isArray(data)) data = [data];

        data.forEach(function (s) {
            var newId = Date.now() + Math.floor(Math.random() * 1000);
            var newSim = new SimObject(newId, s.n + " (Imp)");
            if (s.d) newSim.config = unpackConfig(s.d);
            else newSim.config = unpackConfig(s); // Legacy fallback
            SIM_LIST.push(newSim);
        });

        renderSidebar();
        switchSim(SIM_LIST.length - 1);
        showToast("Imported successfully!");
    } catch (e) {
        console.error(e);
        alert("Invalid Config String!");
    }
}

function exportSettings() {
    saveCurrentState();
    if (SIM_LIST[ACTIVE_SIM_INDEX]) SIM_LIST[ACTIVE_SIM_INDEX].config = getCurrentConfigFromUI();
    var isOverview = !document.getElementById('comparisonView').classList.contains('hidden');
    var simsToProcess = isOverview ? SIM_LIST : (SIM_LIST[ACTIVE_SIM_INDEX] ? [SIM_LIST[ACTIVE_SIM_INDEX]] : []);

    var dataToExport = simsToProcess.map(function (s) {
        var packResult = packConfig(s.config);
        return { n: s.name, d: packResult.data };
    });

    var jsonStr = JSON.stringify(dataToExport);
    var compressed = "";
    if (typeof LZString !== 'undefined') {
        compressed = LZString.compressToEncodedURIComponent(jsonStr);
    } else {
        compressed = btoa(jsonStr);
    }

    var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?s=' + compressed;
    window.history.pushState({ path: newUrl }, '', newUrl);
    navigator.clipboard.writeText(newUrl);
    showToast("URL Copied to Clipboard!");
}

var importRetries = 0;
function importSettings() {
    var params = new URLSearchParams(window.location.search);
    var b64 = params.get('s');
    if (b64) {
        if (ITEM_DB.length === 0) {
            if (importRetries < 50) {
                console.log("Waiting for DB...");
                importRetries++;
                setTimeout(importSettings, 200);
                return;
            } else {
                showToast("DB Load Timeout"); return;
            }
        }
        try {
            var json = null;
            if (typeof LZString !== 'undefined') json = LZString.decompressFromEncodedURIComponent(b64);
            if (!json) { try { json = atob(b64); } catch (e) { } }
            if (json) {
                var data = JSON.parse(json);
                if (Array.isArray(data)) {
                    SIM_LIST = [];
                    data.forEach(d => {
                        var s = new SimObject(Date.now(), d.n || d.name);
                        if (d.d) s.config = unpackConfig(d.d);
                        else s.config = d.config || d;
                        SIM_LIST.push(s);
                    });
                    if (SIM_LIST.length > 0) {
                        ACTIVE_SIM_INDEX = 0;
                        applyConfigToUI(SIM_LIST[0].config);
                        renderSidebar();
                        showOverview();
                    } else { addSim(true); }
                }
            }
        } catch (e) { console.error("Import failed", e); }
    }
}

function renderSidebar() { var c = document.getElementById('sidebar'); if (!c) return; var isComp = !document.getElementById('comparisonView').classList.contains('hidden'); var html = '<div class="sidebar-btn btn-overview ' + (isComp ? 'active' : '') + '" onclick="showOverview()">📊</div><div class="sidebar-separator"></div>'; SIM_LIST.forEach(function (sim, idx) { var a = (idx === ACTIVE_SIM_INDEX && !isComp) ? 'active' : ''; html += '<div class="sidebar-btn ' + a + '" onclick="switchSim(' + idx + ')" title="' + sim.name + '">' + (idx + 1) + '</div>'; }); html += '<div class="sidebar-btn btn-add" onclick="addNewSim()">+</div>'; c.innerHTML = html; }

function showOverview() {
    saveCurrentState();
    document.getElementById('singleSimView').classList.add('hidden');
    document.getElementById('comparisonView').classList.remove('hidden');
    var n = document.getElementById('simName');
    n.value = "Overview"; n.disabled = true; n.style.color = "#888";
    renderComparisonTable();
    renderSidebar();
}

function renderComparisonTable() {
    var b = document.getElementById('comparisonBody');
    b.innerHTML = "";
    SIM_LIST.forEach(function (s, i) {
        var c = s.config;
        var r = s.results;
        var avgDps = r ? r.avg.dps.toFixed(1) : "-";
        var minDps = (r && r.min) ? r.min.dps.toFixed(1) : "-";
        var maxDps = (r && r.max) ? r.max.dps.toFixed(1) : "-";
        
        // Feral specific columns
        var ap = c.stat_ap;
        var crit = c.stat_crit;
        var hit = c.stat_hit;
        var method = c.calcMethod === 'S' ? 'RNG' : 'Avg';

        var rota = "";
        if(c.pos_behind == 1) rota += "Behind, "; else rota += "Front, ";
        if(c.use_powershift == 1) rota += "Shift, ";
        if(c.use_rake == 1) rota += "Rake";
        
        var html = '<tr onclick="switchSim(' + i + ')" style="cursor:pointer">' +
            '<td><strong>' + s.name + '</strong></td>' +
            '<td>' + c.maxTime + 's</td>' +
            '<td>' + ap + '</td>' +
            '<td>' + crit + '%</td>' +
            '<td>' + hit + '%</td>' +
            '<td>' + rota + '</td>' +
            '<td style="color:#90caf9; text-align:right;">' + minDps + '</td>' +
            '<td style="color:#ffb74d; font-weight:bold; font-size:1.1em; text-align:right;">' + avgDps + '</td>' +
            '<td style="color:#a5d6a7; text-align:right;">' + maxDps + '</td>' +
            '<td style="text-align:center"><button class="btn-icon-delete" onclick="event.stopPropagation(); deleteSim(' + i + ')">🗑️</button></td>' +
            '</tr>';
        b.innerHTML += html;
    });
}

function generateSummaryImage() {
    if (!SIM_DATA) { alert("Run Sim first."); return; }
    var sim = SIM_LIST[ACTIVE_SIM_INDEX];
    var c = sim.config;
    var r = sim.results;

    setText("sumSimName", sim.name);
    setText("sumDate", new Date().toLocaleDateString());
    setText("sumAvg", r.avg.dps.toFixed(1));
    setText("sumMin", r.min.dps.toFixed(1));
    setText("sumMax", r.max.dps.toFixed(1));
    setText("sumTime", c.maxTime + "s");

    setText("sumAP", c.stat_ap);
    setText("sumCrit", c.stat_crit + "%");
    setText("sumHit", c.stat_hit + "%");
    setText("sumHaste", c.stat_haste + "%");

    setText("sumLvl", c.enemy_level);
    setText("sumArmor", c.enemy_armor);

    var ulRot = document.getElementById("sumRotaList");
    ulRot.innerHTML = "";
    function addLi(ul, text) { ul.innerHTML += "<li>" + text + "</li>"; }
    
    if(c.pos_behind == 1) addLi(ulRot, "Position: Behind (Shred)"); else addLi(ulRot, "Position: Front (Claw)");
    if(c.use_powershift == 1) addLi(ulRot, "Powershifting Enabled");
    if(c.use_rake == 1) addLi(ulRot, "Use Rake (Open Wounds)");
    if(c.use_bite == 1) addLi(ulRot, "Use Ferocious Bite");
    if(c.aggressive_shift == 1) addLi(ulRot, "Aggressive Shifting");

    var ulGear = document.getElementById("sumGearList");
    ulGear.innerHTML = "";
    // Simplified gear summary
    if(c.gearSelection) {
        // List a few key items or just counts
        var count = 0;
        for(var k in c.gearSelection) if(c.gearSelection[k] != 0) count++;
        addLi(ulGear, count + " Items Equipped");
    }

    showToast("Generating...");
    var card = document.getElementById("summaryCard");
    html2canvas(card, { scale: 2, backgroundColor: null, useCORS: true }).then(function (canvas) {
        var link = document.createElement('a');
        link.download = 'feral_sim_summary.png';
        link.href = canvas.toDataURL();
        link.click();
    });
}

// ============================================================================
// VIEW RENDERING
// ============================================================================

function switchView(type) {
    if (!SIM_DATA) return;
    CURRENT_VIEW = type;
    document.getElementById("resultsArea").classList.remove("hidden");

    var btns = document.querySelectorAll('.view-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    if (type === 'avg') document.getElementById('viewAvg').classList.add('active');
    if (type === 'min') document.getElementById('viewMin').classList.add('active');
    if (type === 'max') document.getElementById('viewMax').classList.add('active');

    var data = SIM_DATA[type];

    setText("out_dps_main", data.dps.toFixed(1));
    setText("out_total_dmg", Math.floor(data.totalDmg).toLocaleString());
    
    // Feral Specific Outs
    if(document.getElementById("out_shifts")) setText("out_shifts", data.stats.casts_shift.toFixed(1));
    if(document.getElementById("out_cp_waste")) setText("out_cp_waste", data.stats.cp_wasted.toFixed(1));

    var tbody = document.getElementById("tbl_body");
    if (tbody) {
        tbody.innerHTML = "";
        // Sort stats by damage
        var breakdown = [
            { id: "White", val: data.stats.dmg_white },
            { id: "Shred", val: data.stats.dmg_shred },
            { id: "Claw", val: data.stats.dmg_claw },
            { id: "Bite", val: data.stats.dmg_bite },
            { id: "Rip", val: data.stats.dmg_rip },
            { id: "Rake (DoT)", val: data.stats.dmg_rake },
            { id: "Rake (Init)", val: data.stats.dmg_rake_init }
        ];
        breakdown.sort(function(a,b) { return b.val - a.val; });

        breakdown.forEach(function(item) {
            if(item.val > 0) {
                var rawPct = (item.val / data.totalDmg * 100);
                var barColor = "var(--feral-orange)";
                if(item.id.includes("Rip") || item.id.includes("Rake")) barColor = "#d32f2f"; // Bleed Red
                if(item.id === "White") barColor = "#aaa";

                var row = '<tr><td class="text-left" style="font-weight:500">' + item.id + '</td>' +
                    '<td class="text-right" style="color:#fff">' + Math.floor(item.val).toLocaleString() + '</td>' +
                    '<td class="text-right" style="color:var(--text-muted)">' + rawPct.toFixed(1) + '%</td>' +
                    '<td class="bar-col"><div class="bar-bg"><div class="bar-fill" style="width: ' + rawPct.toFixed(1) + '%; background-color: ' + barColor + '"></div></div></td></tr>';
                tbody.innerHTML += row;
            }
        });
    }

    renderCombatLog(data.log);
}

function renderCombatLog(logData) {
    if (!logData || logData.length === 0) {
        if (document.getElementById("logBody")) document.getElementById("logBody").innerHTML = "<tr><td colspan='8' style='text-align:center; padding:20px; color:#666;'>No Log available.</td></tr>";
        return;
    }
    
    var tbody = document.getElementById("logBody");
    tbody.innerHTML = "";
    var limit = logData.length > 500 ? 500 : logData.length;
    
    for (var i = 0; i < limit; i++) {
        var e = logData[i];
        var rowClass = "";
        if (e.evt === "Damage") rowClass = "log-row-dmg";
        if (e.evt === "Cast") rowClass = "log-row-cast";
        
        var resStr = e.result || "";
        if (e.evt === "Damage" && resStr === "CRIT") resStr = "<span style='color:#ffb74d'>CRIT</span>";
        
        var html = `<tr class="${rowClass}">
            <td class="log-time">${e.t.toFixed(2)}</td>
            <td>${e.source}</td>
            <td>${e.evt}</td>
            <td>${resStr}</td>
            <td style="text-align:right">${Math.floor(e.amount)}</td>
            <td style="color:#ffeb3b">${e.energy}</td>
            <td style="color:#ff5722">${e.cp}</td>
            <td style="color:#4fc3f7">${e.mana}</td>
        </tr>`;
        tbody.innerHTML += html;
    }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function updateEnemyInfo() {
    var armor = getVal("enemy_armor");
    var lvl = getVal("enemy_level"); // Not strictly needed for simplified formula but kept for compatibility
    
    // Turtle/Vanilla DR Formula for Lvl 60 Attacker
    // DR = Armor / (Armor + 400 + 85 * (60 + 4.5 * (60-59))) -> Standard constant is ~5500?
    // Standard Vanilla constant for lvl 60 attacking 60 is ~5500?
    // Actually constant is 400 + 85 * 60 = 5500.
    // So DR = Armor / (Armor + 5500).
    
    var dr = armor / (armor + 5500);
    var drPct = (dr * 100).toFixed(2);
    
    var el = document.getElementById("info_dr");
    if(el) el.innerText = "Damage Reduction: " + drPct + "%";
}

function updateWeightUI() {
    // Feral specific weight UI logic if needed
}

function exportCSV() {
    if (!SIM_DATA || !CURRENT_VIEW || !SIM_DATA[CURRENT_VIEW]) { alert("Run sim first."); return; }
    var log = SIM_DATA[CURRENT_VIEW].log;
    if (!log || log.length === 0) return;

    var header = ["Time", "Source", "Event", "Result", "Amount", "Energy", "CP", "Mana"];
    var csvContent = "data:text/csv;charset=utf-8," + header.join(",") + "\r\n";

    log.forEach(function (row) {
        var rowData = [
            row.t, row.source, row.evt, row.result, Math.floor(row.amount), row.energy, row.cp, row.mana
        ];
        csvContent += rowData.join(",") + "\r\n";
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "feral_sim_log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}