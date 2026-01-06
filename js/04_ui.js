/**
 * Moonkin Simulation - File 4: UI Manager
 */

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
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

    var enemyInputs = ['enemy_level', 'res_arcane', 'res_nature', 'sp_pen'];
    enemyInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                updateEnemyInfo();
                // Auch hier sicherheitshalber updaten
                updateSpellStats();
                saveCurrentState();
            });
            el.addEventListener('input', updateEnemyInfo);
        }
    });

    var iMoon = document.getElementById('idolMoon');
    var iMoonfang = document.getElementById('idolMoonfang');
    if (iMoon && iMoonfang) {
        iMoon.addEventListener('change', function (e) {
            if (e.target.checked) iMoonfang.checked = false;
            saveCurrentState();
        });
        iMoonfang.addEventListener('change', function (e) {
            if (e.target.checked) iMoon.checked = false;
            saveCurrentState();
        });
    }

    var raceSel = document.getElementById('char_race');
    if (raceSel) {
        raceSel.addEventListener('change', function () {
            calculateGearStats();
            saveCurrentState();
        });
    }

    // Robust Buff & Config Listener Attachment
    CONFIG_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                // Trigger calculation for Buffs OR Manual Stats Toggle
                if (id.startsWith("buff_") || id === "manual_stats") calculateGearStats();
                
                // NEU: Automatische Aktualisierung der Spell Stats bei jeder Änderung
                updateSpellStats();

                saveCurrentState();
            });
        }
    });

    // Weight Config Listener
    var wMethod = document.getElementById('weight_calcMethod');
    var wIter = document.getElementById('weight_simCount');
    if (wMethod) {
        wMethod.addEventListener('change', function () {
            updateWeightUI();
            saveCurrentState();
        });
    }
    if (wIter) {
        wIter.addEventListener('change', saveCurrentState);
    }
    // Initial call to set correct state
    updateWeightUI();

    // MODAL CLOSE LISTENERS
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

function updateWeightUI() {
    var method = document.getElementById('weight_calcMethod');
    var iterDiv = document.getElementById('weight_iter_wrapper');
    var iterInput = document.getElementById('weight_simCount');

    if (method && iterDiv && iterInput) {
        if (method.value === 'S') {
            iterInput.disabled = false;
            iterDiv.style.opacity = "1";
        } else {
            iterInput.disabled = true;
            iterDiv.style.opacity = "0.5";
        }
    }
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

    if (GEAR_SELECTION && Object.keys(GEAR_SELECTION).length > 0) {
        for (var slot in GEAR_SELECTION) {
            var item = GEAR_SELECTION[slot];
            if (item && item.icon) {
                var slotIds = ["slot_" + slot, "gear_" + slot, "item_" + slot, slot];
                for (var i = 0; i < slotIds.length; i++) {
                    var el = document.getElementById(slotIds[i]);
                    if (el) {
                        var iconUrl = "https://wow.zamimg.com/images/wow/icons/large/" + item.icon + ".jpg";
                        el.style.backgroundImage = "url('" + iconUrl + "')";
                        el.classList.add("has-item");
                        var img = el.querySelector("img");
                        if (img) img.src = iconUrl;
                        break;
                    }
                }
            }
        }
    }

    calculateGearStats();
    updateEnemyInfo();
    updateSpellStats();
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
    var newName = isFirst ? "Simulation 1" : "Simulation " + (SIM_LIST.length + 1);
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
        nameInput.style.color = "var(--druid-orange)";
    }

    applyConfigToUI(SIM_LIST[index].config);
    // Sicherstellen, dass die Weight UI korrekt gesetzt ist nach Config-Load
    if (typeof updateWeightUI === 'function') updateWeightUI();

    document.getElementById('comparisonView').classList.add('hidden');
    document.getElementById('singleSimView').classList.remove('hidden');

    var res = SIM_LIST[index].results;

    // ÄNDERUNG: Results Area immer anzeigen, Inhalte resetten wenn null
    document.getElementById('resultsArea').classList.remove('hidden');

    if (res) {
        SIM_DATA = res;
        switchView('avg'); // Updated UI values
        // Views Buttons update text
        setText("viewAvg", "Average (" + res.avg.dps.toFixed(1) + ")");
        setText("viewMin", "Min (" + res.min.dps.toFixed(1) + ")");
        setText("viewMax", "Max (" + res.max.dps.toFixed(1) + ")");
    } else {
        SIM_DATA = null;
        // Reset Text to placeholders
        setText("out_dps_main", "-");
        setText("out_total_dmg", "-");
        if (document.getElementById("out_total_mana")) setText("out_total_mana", "-");
        if (document.getElementById("out_mps")) setText("out_mps", "-");
        if (document.getElementById("out_up_ne")) setText("out_up_ne", "-");
        if (document.getElementById("out_up_ae")) setText("out_up_ae", "-");

        setText("viewAvg", "Average (-)");
        setText("viewMin", "Min (-)");
        setText("viewMax", "Max (-)");

        // Leere Tabelle
        var tbody = document.getElementById("tbl_body");
        if (tbody) tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#666; padding:20px;'>No simulation run yet.</td></tr>";

        // Weights resetten
        setText("val_crit", "-");
        setText("val_hit", "-");
        setText("val_haste", "-");
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

            var idToSave = null;
            if (val && typeof val === 'object' && val.id) {
                idToSave = val.id;
            } else if (val && (typeof val === 'number' || typeof val === 'string')) {
                idToSave = val;
            }

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

            var idToSave = null;
            if (val && typeof val === 'object' && val.id) {
                idToSave = val.id;
            } else if (val && (typeof val === 'number' || typeof val === 'string')) {
                idToSave = val;
            }

            if (idToSave && idToSave != 0) {
                enchantIds[slot] = idToSave;
            }
        }
    }

    return {
        data: [values, gearIds, enchantIds],
        itemCount: itemCount
    };
}

function unpackConfig(packed) {
    if (!Array.isArray(packed) || packed.length !== 3 || !Array.isArray(packed[0])) {
        return packed;
    }

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
            var item = ITEM_DB.find(function (i) { return String(i.id) === String(id); });
            if (item) {
                cfg.gearSelection[slot] = item.id;
            }
        }
    }

    cfg.enchantSelection = {};
    if (enchantIds && ENCHANT_DB.length > 0) {
        for (var slot in enchantIds) {
            var id = enchantIds[slot];
            var ench = ENCHANT_DB.find(function (e) { return String(e.id) === String(id); });
            if (ench) {
                cfg.enchantSelection[slot] = ench.id;
            }
        }
    }

    return cfg;
}

function importFromClipboard() {
    var input = prompt("Paste the config string (or full URL) here:");
    if (!input) return;

    if (ITEM_DB.length === 0) {
        alert("Database not loaded yet. Please wait a moment.");
        return;
    }

    var b64 = input;
    if (input.includes("?s=")) { b64 = input.split("?s=")[1]; }

    try {
        var json = null;
        if (typeof LZString !== 'undefined') {
            json = LZString.decompressFromEncodedURIComponent(b64);
        }
        if (!json) {
            try { json = atob(b64); } catch (e) { }
        }

        if (!json) throw new Error("Could not decode string");

        var data = JSON.parse(json);
        if (!Array.isArray(data)) data = [data];

        data.forEach(function (s) {
            var newId = Date.now() + Math.floor(Math.random() * 1000);
            var newSim = new SimObject(newId, s.n + " (Imp)");

            if (s.d) newSim.config = unpackConfig(s.d);
            else if (s.config) newSim.config = s.config;
            else newSim.config = unpackConfig(s);

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

    if (SIM_LIST[ACTIVE_SIM_INDEX]) {
        SIM_LIST[ACTIVE_SIM_INDEX].config = getCurrentConfigFromUI();
    }

    var isOverview = !document.getElementById('comparisonView').classList.contains('hidden');
    var simsToProcess = isOverview ? SIM_LIST : (SIM_LIST[ACTIVE_SIM_INDEX] ? [SIM_LIST[ACTIVE_SIM_INDEX]] : []);

    var hasAnyGear = false;
    var dataToExport = simsToProcess.map(function (s) {
        var packResult = packConfig(s.config);
        if (packResult.itemCount > 0) hasAnyGear = true;
        return { n: s.name, d: packResult.data };
    });

    if (!hasAnyGear) {
        alert("ACHTUNG: Es wurde KEIN Gear gefunden!\nBitte wähle im Simulator erst Items aus, bevor du exportierst.");
        return;
    }

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

    var msg = isOverview ? "All Sims Copied!" : "Current Sim Copied!";
    showToast(msg);
}

var importRetries = 0;
function importSettings() {
    var params = new URLSearchParams(window.location.search);
    var b64 = params.get('s');

    if (b64) {
        if (ITEM_DB.length === 0) {
            if (importRetries < 50) {
                console.log("Waiting for Item DB to load (URL Import)...");
                importRetries++;
                setTimeout(importSettings, 200);
                return;
            } else {
                console.error("Database load timeout.");
                showToast("DB Load Timeout");
                return;
            }
        }

        try {
            var json = null;
            if (typeof LZString !== 'undefined') {
                json = LZString.decompressFromEncodedURIComponent(b64);
            }
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
                    } else {
                        addSim(true);
                    }
                }
            }
        } catch (e) {
            console.error("Import failed", e);
        }
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
    var max = 0;
    SIM_LIST.forEach(s => { if (s.results && s.results.avg.dps > max) max = s.results.avg.dps; });

    SIM_LIST.forEach(function (s, i) {
        var c = s.config;
        var r = s.results;
        var avgDps = r ? r.avg.dps.toFixed(1) : "-";
        var minDps = (r && r.min) ? r.min.dps.toFixed(1) : "-";
        var maxDps = (r && r.max) ? r.max.dps.toFixed(1) : "-";
        var method = c.calcMethod === 'S' ? 'RNG' : (c.calcMethod.includes('CYC') ? 'Cyc' : 'Avg');
        var fish = c.rota_fish === 'F1' ? 'SF' : (c.rota_fish === 'F2' ? 'W' : c.rota_fish);
        var rota = '<span class="detail-text">Fish:' + fish + ' B:' + c.start_boat + '</span>';
        var activeSpells = [];
        if (c.rota_is == 1) activeSpells.push("IS");
        if (c.rota_mf == 1) activeSpells.push("MF");
        if (c.rota_eclDot == 1) activeSpells.push("Snap");
        rota += '<span class="detail-text">' + activeSpells.join('/') + '</span>';
        var gear = "";
        if (c.t3_8p == 1) gear += "T3(8)";
        else if (c.t3_6p == 1) gear += "T3(6)";
        else if (c.t3_4p == 1) gear += "T3(4)";
        if (c.t35_5p == 1) gear += " T3.5";
        var trinkets = [];
        if (c.item_reos == 1) trinkets.push("ReoS");
        if (c.item_toep == 1) trinkets.push("ToEP");
        if (trinkets.length > 0) gear += '<br><span class="detail-text" style="color:#aaa">' + trinkets.join('+') + '</span>';
        if (gear === "") gear = "-";
        var html = '<tr onclick="switchSim(' + i + ')" style="cursor:pointer">' +
            '<td><strong>' + s.name + '</strong></td>' +
            '<td>' + c.maxTime + 's <span class="detail-text">' + method + '</span></td>' +
            '<td>' + c.simCount + '</td>' +
            '<td>' + c.statHit + '</td>' +
            '<td>' + c.statCrit + '%</td>' +
            '<td>' + c.statHaste + '%</td>' +
            '<td>' + c.sp_gen + '</td>' +
            '<td>' + c.enemy_level + '</td>' +
            '<td>' + rota + '</td>' +
            '<td>' + gear + '</td>' +
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

    var methodMap = { "S": "RNG", "D_CYC": "Deterministic (Cyc)", "D_AVG": "Deterministic (Avg)" };
    setText("sumMethod", methodMap[c.calcMethod] || c.calcMethod);

    setText("sumSP", c.sp_gen);
    setText("sumCrit", c.statCrit + "%");
    setText("sumHit", c.statHit);
    setText("sumHaste", c.statHaste + "%");

    setText("sumLvl", c.enemy_level);
    setText("sumRes", "Nat:" + c.res_nature + " / Arc:" + c.res_arcane);

    var ulRot = document.getElementById("sumRotaList");
    ulRot.innerHTML = "";
    function addLi(ul, text) { ul.innerHTML += "<li>" + text + "</li>"; }

    var fishMap = { "F1": "Fish: SF Alt", "F2": "Fish: Wrath Alt", "W": "Fish: Wrath Only", "SF": "Fish: SF Only" };
    addLi(ulRot, fishMap[c.rota_fish] || c.rota_fish);
    if (c.start_boat > 0) addLi(ulRot, "Start BoaT: " + c.start_boat);
    if (c.rota_is == 1) addLi(ulRot, "Use Insect Swarm");
    if (c.rota_mf == 1) addLi(ulRot, "Use Moonfire");
    if (c.rota_eclDot == 1) addLi(ulRot, "Ecl. Snapshots");
    if (c.rota_interrupt == 1) addLi(ulRot, "Cancel bad Casts");

    var ulGear = document.getElementById("sumGearList");
    ulGear.innerHTML = "";
    if (c.t3_8p == 1) addLi(ulGear, "T3 (8-Set)");
    else if (c.t3_6p == 1) addLi(ulGear, "T3 (6-Set)");
    else if (c.t3_4p == 1) addLi(ulGear, "T3 (4-Set)");
    if (c.t35_5p == 1) addLi(ulGear, "T3.5 (5-Set)");

    if (c.idolEoF == 1) addLi(ulGear, "Idol: Ebb & Flow");
    if (c.idolMoon == 1) addLi(ulGear, "Idol: Moon");
    if (c.idolMoonfang == 1) addLi(ulGear, "Idol: Moonfang");
    if (c.idolProp == 1) addLi(ulGear, "Idol: Propagation");

    var ulTrink = document.getElementById("sumTrinketList");
    ulTrink.innerHTML = "";
    if (c.item_reos == 1) addLi(ulTrink, "Essence of Sapphiron");
    if (c.item_toep == 1) addLi(ulTrink, "Talisman (ToEP)");
    if (c.item_binding == 1) addLi(ulTrink, "Binding (Blue Dragon)");
    if (c.item_scythe == 1) addLi(ulTrink, "The Scythe of Elune");
    addLi(ulTrink, "Strat: " + (c.trinket_strat === "START" ? "On Start" : "On Eclipse"));

    showToast("Generating...");
    var card = document.getElementById("summaryCard");
    html2canvas(card, { scale: 2, backgroundColor: null, useCORS: true }).then(function (canvas) {
        var link = document.createElement('a');
        link.download = 'moonkin_sim_summary.png';
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
    setText("out_total_dmg", Math.floor(data.stats.totalDmg).toLocaleString());

    if (document.getElementById("out_total_mana")) {
        setText("out_total_mana", Math.floor(data.stats.totalMana).toLocaleString());
    }
    if (document.getElementById("out_mps")) {
        var mps = data.stats.totalMana / getVal("maxTime");
        setText("out_mps", mps.toFixed(1) + " MPS");
    }

    if (document.getElementById("out_up_ne")) {
        setText("out_up_ne", (data.stats.uptimeNE / getVal("maxTime") * 100).toFixed(1) + "%");
    }
    if (document.getElementById("out_up_ae")) {
        setText("out_up_ae", (data.stats.uptimeAE / getVal("maxTime") * 100).toFixed(1) + "%");
    }

    var tbody = document.getElementById("tbl_body");
    if (tbody) {
        tbody.innerHTML = "";

        function addRow(label, dmg, total) {
            var rawPct = (total > 0) ? (dmg / total * 100) : 0;
            var pctStr = rawPct.toFixed(1) + "%";
            var barWidth = rawPct.toFixed(1) + "%";
            var barColor = "var(--druid-orange)";
            if (label.includes("Starfire") || label.includes("Moonfire")) barColor = "var(--arcane-blue)";
            if (label.includes("Wrath") || label.includes("Insect")) barColor = "var(--nature-green)";

            var row = '<tr><td class="text-left" style="font-weight:500">' + label + '</td>' +
                '<td class="text-right" style="color:#fff">' + Math.floor(dmg).toLocaleString() + '</td>' +
                '<td class="text-right" style="color:var(--text-muted)">' + pctStr + '</td>' +
                '<td class="bar-col"><div class="bar-bg"><div class="bar-fill" style="width: ' + barWidth + '; background-color: ' + barColor + '"></div></div></td></tr>';
            tbody.innerHTML += row;
        }

        addRow("Starfire", data.stats.dmgStarfire, data.stats.totalDmg);
        addRow("Wrath", data.stats.dmgWrath, data.stats.totalDmg);
        addRow("Moonfire (Hit)", data.stats.dmgMFDirect, data.stats.totalDmg);
        addRow("Moonfire (Tick)", data.stats.dmgMFTick, data.stats.totalDmg);
        addRow("Insect Swarm", data.stats.dmgIS, data.stats.totalDmg);
        if (data.stats.dmgT36p > 0) addRow("Proc: T3 6p", data.stats.dmgT36p, data.stats.totalDmg);
        if (data.stats.dmgIdol > 0) addRow("Bonus: Idols", data.stats.dmgIdol, data.stats.totalDmg);
        if (data.stats.dmgT34p > 0) addRow("Bonus: T3 4p", data.stats.dmgT34p, data.stats.totalDmg);
        if (data.stats.dmgScythe > 0) addRow("Proc: Scythe", data.stats.dmgScythe, data.stats.totalDmg);

        addRow("Critical Damage", data.stats.dmgCrit, data.stats.totalDmg);
    }

    var logLabel = document.getElementById("logTypeLabel");
    if (logLabel) {
        if (!data.log || data.log.length === 0) {
            logLabel.innerText = "(No Log)";
            if (document.getElementById("logBody")) document.getElementById("logBody").innerHTML = "<tr><td colspan='22' style='text-align:center; padding:20px; color:#666;'>Log available in Min/Max view or Single runs.</td></tr>";
        } else {
            logLabel.innerText = "(" + type.toUpperCase() + ")";
            renderCombatLog(data.log);
        }
        var logSec = document.getElementById("combatLogSection");
        if (logSec) logSec.classList.remove("hidden");
    }
}

function renderCombatLog(logData) {
    if (!logData || logData.length === 0) return;
    var cfg = getInputs();
    var thead = document.getElementById("logHeader");
    var baseCols = `<th style="width: 50px;">Time</th><th style="width: 50px;">Event</th><th class="col-left" style="width: 90px;">Spell</th><th style="width: 40px;">CastT</th><th style="width: 30px;">Res</th><th style="width: 50px; text-align:right;">Norm</th><th style="width: 50px; text-align:right;">Ecl</th><th style="width: 50px; text-align:right;">Crit</th><th style="width: 40px;">MF(s)</th><th style="width: 40px;">IS(s)</th><th style="width: 30px;">BoaT</th><th style="width: 30px;">NG</th><th style="width: 30px;">OoC</th><th style="width: 30px;">NB</th><th style="width: 40px;">SP</th><th style="width: 40px;">Haste</th><th style="width: 30px;">T3.6</th><th style="width: 30px;">T3.8</th><th style="width: 40px; color:#00b0ff;">Mana</th>`;

    // EXISTING CONDITIONALS
    if (cfg.gear.binding) baseCols += `<th style="width: 40px; color:#e91e63;">Bind</th>`;
    if (cfg.gear.reos) baseCols += `<th style="width: 40px; color:#e91e63;">REoS</th>`;
    if (cfg.gear.toep) baseCols += `<th style="width: 40px; color:#e91e63;">ToEP</th>`;
    if (cfg.gear.roop) baseCols += `<th style="width: 40px; color:#e91e63;">RoOP</th>`;
    if (cfg.gear.zhc) baseCols += `<th style="width: 40px; color:#e91e63;">ZHC</th>`;

    // NEW CONDITIONALS
    if (cfg.gear.sulfuras) baseCols += `<th style="width: 40px; color:#ffb74d;">TBoS</th>`;
    if (cfg.gear.woc) baseCols += `<th style="width: 40px; color:#a5d6a7;">WoC</th>`;
    if (cfg.gear.scythe) baseCols += `<th style="width: 45px; color:#e1bee7;">SoE</th>`;

    baseCols += `<th class="col-left">Info</th>`;
    thead.innerHTML = `<tr>${baseCols}</tr>`;
    var tbody = document.getElementById("logBody"); tbody.innerHTML = "";
    var limit = logData.length > 500 ? 500 : logData.length;
    for (var i = 0; i < limit; i++) {
        var entry = logData[i];
        var rowClass = "";
        if (entry.evt === "IMPACT") rowClass = "log-row-impact";
        if (entry.evt === "TICK") rowClass = "log-row-tick";
        if (entry.res === "CRIT") rowClass = "log-row-crit";
        if (entry.evt === "PROC DMG") rowClass = "log-row-proc";
        if (entry.evt === "PROC") rowClass = "log-row-proc";
        if (entry.isAE) rowClass += " row-arcane";
        if (entry.isNE) rowClass += " row-nature";
        var boatStr = entry.boat > 0 ? `<span class="col-boat">${entry.boat}</span>` : "-";
        var ngStr = (entry.ng === "YES") ? `<span class="col-ng">YES</span>` : "-";
        var oocStr = (entry.ooc === "YES") ? `<span class="col-ooc">YES</span>` : "-";
        var boonStr = (entry.boon !== "-" && entry.boon > 0) ? `<span class="col-boon">${entry.boon}</span>` : "-";
        var valNorm = entry.dmgNorm > 0 ? Math.floor(entry.dmgNorm) : "-";
        var valEcl = entry.dmgEcl > 0 ? `<span class="col-ecl">+${Math.floor(entry.dmgEcl)}</span>` : "-";
        var valCrit = (entry.evt === "TICK") ? "-" : (entry.dmgCrit > 0 ? `<span class="col-crit">+${Math.floor(entry.dmgCrit)}</span>` : "-");
        var html = `<tr class="${rowClass}"><td class="log-time">${entry.t}</td><td>${entry.evt}</td><td class="col-left">${entry.spell}</td><td>${entry.castTime}</td><td class="col-sp">${entry.res}</td><td class="col-right col-norm">${valNorm}</td><td class="col-right col-ecl">${valEcl}</td><td class="col-right col-crit">${valCrit}</td><td>${entry.mfRem}</td><td>${entry.isRem}</td><td>${boatStr}</td><td>${ngStr}</td><td>${oocStr}</td><td>${boonStr}</td><td class="col-sp">${entry.sp}</td><td>${entry.haste}</td><td>${entry.t36}</td><td>${entry.t38}</td><td class="col-mana">${entry.mana}</td>`;

        if (cfg.gear.binding) html += `<td>${entry.bBind}</td>`;
        if (cfg.gear.reos) html += `<td>${entry.bReos}</td>`;
        if (cfg.gear.toep) html += `<td>${entry.bToep}</td>`;
        if (cfg.gear.roop) html += `<td>${entry.bRoop}</td>`;
        if (cfg.gear.zhc) html += `<td>${entry.bZhc}</td>`;

        // NEW VALUES
        if (cfg.gear.sulfuras) html += `<td>${entry.bTbos}</td>`;
        if (cfg.gear.woc) html += `<td>${entry.bWoc}</td>`;
        if (cfg.gear.scythe) html += `<td style="font-size:0.85em;">${entry.bSoe}</td>`;

        html += `<td class="col-left">${entry.info}</td></tr>`;
        tbody.innerHTML += html;
    }
}


// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function updateEnemyInfo() {
    if (!document.getElementById("info_hit_chance")) return;
    var lvl = getVal("enemy_level");
    var resNat = getVal("res_nature");
    var pen = getVal("sp_pen");
    var baseHit = 96; var needHit = 4;
    if (lvl == 61) { baseHit = 95; needHit = 5; }
    if (lvl == 62) { baseHit = 94; needHit = 6; }
    if (lvl == 63) { baseHit = 83; needHit = 16; }
    setText("info_hit_chance", baseHit + "% (Needs " + needHit + "%)");
    var baseRes = (lvl - 60) * 5; if (baseRes < 0) baseRes = 0;
    setText("info_base_res", baseRes);
    var totalRes = Math.max(0, baseRes + resNat - pen);
    var bTxt = document.getElementById("info_buckets_text");
    if (bTxt) bTxt.innerText = "Resistance: " + totalRes;

    var avgMit = Math.min(0.75, (totalRes / (lvl * 5)) * 0.75);
    var range = avgMit / 0.25;
    var bucket = Math.floor(range);
    var remainder = range - bucket;
    var probs = [0, 0, 0, 0];
    if (bucket < 3) { probs[bucket] = (1 - remainder) * 100; probs[bucket + 1] = remainder * 100; } else { probs[3] = 100; }
    var bar = document.getElementById("bucket_bar_nat");
    if (bar) {
        var barHtml = "";
        if (probs[0] > 0) barHtml += '<div class="bucket-seg seg-0" style="width:' + probs[0] + '%"></div>';
        if (probs[1] > 0) barHtml += '<div class="bucket-seg seg-25" style="width:' + probs[1] + '%"></div>';
        if (probs[2] > 0) barHtml += '<div class="bucket-seg seg-50" style="width:' + probs[2] + '%"></div>';
        if (probs[3] > 0) barHtml += '<div class="bucket-seg seg-75" style="width:' + probs[3] + '%"></div>';
        bar.innerHTML = barHtml;
    }
}

function updateSpellStats() {
    if (!document.getElementById("statHit")) return;
    var cfg = getInputs();
    var tbody = document.getElementById("spellCalcBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    function calcRow(name, base, coeff, sp, baseMod, eclMod, castTime, type) {
        var raw = base + (coeff * sp);
        var cosMult = 1.0;
        if (type === "Arcane") cosMult = 1 + 0.1 * cfg.enemy.cos;
        var scaledNoEcl = raw * (1 + baseMod) * cosMult;
        var scaledEcl = raw * (1 + baseMod + eclMod) * cosMult;
        var cTimeBase = castTime;
        if (name === "Starfire" && cfg.gear.idolEoF) cTimeBase -= 0.2;
        var haste = cfg.stats.haste;
        var ct = Math.max(0, cTimeBase / (1 + haste / 100));
        return '<tr><td>' + name + '</td><td>' + base.toFixed(0) + '</td><td class="val-calc">' + Math.floor(scaledNoEcl) + '</td><td>+' + (eclMod * 100).toFixed(0) + '%</td><td class="val-calc">' + Math.floor(scaledEcl) + '</td><td>' + ct.toFixed(2) + 's</td></tr>';
    }
    var eclFactor = (10 + 60 * (cfg.stats.crit / 100)) / 100; // Int correction applied via input logic, here it takes the final stat
    var w_coeff = (2.0 / 3.5) * 1.05;
    tbody.innerHTML += calcRow("Wrath", 310, w_coeff, (cfg.power.sp + cfg.power.nat), 0.10, eclFactor, 1.5, "Nature");
    tbody.innerHTML += calcRow("Starfire", 540, 1.0, (cfg.power.sp + cfg.power.arc), 0.10, eclFactor, 3.0, "Arcane");
    var mf_coeff = 0.14; var mf_hit_mod = 0.20;
    if (cfg.gear.idolMoon) mf_hit_mod += 0.17;
    tbody.innerHTML += calcRow("Moonfire (Hit)", 210, mf_coeff, (cfg.power.sp + cfg.power.arc), mf_hit_mod, eclFactor, 0, "Arcane");
    var mf_t_coeff = 0.13; var mf_tick_mod = 0.35;
    if (cfg.gear.idolMoon) mf_tick_mod += 0.17;
    tbody.innerHTML += calcRow("Moonfire (Tick)", 95.6, mf_t_coeff, (cfg.power.sp + cfg.power.arc), mf_tick_mod, eclFactor, 0, "Arcane");
    var is_coeff = ((18 / 15) * 0.95 * 1.25) / 9; var is_mod = 0.25;
    if (cfg.gear.idolProp) is_mod += 0.17;
    tbody.innerHTML += calcRow("Insect Swarm (Tick)", 53.35, is_coeff, (cfg.power.sp + cfg.power.nat), is_mod, eclFactor, 0, "Nature");
}

// ============================================================================
// NEW: CSV EXPORT
// ============================================================================

function exportCSV() {
    if (!SIM_DATA || !CURRENT_VIEW || !SIM_DATA[CURRENT_VIEW]) {
        alert("Please run a simulation first.");
        return;
    }

    var logData = SIM_DATA[CURRENT_VIEW].log;
    if (!logData || logData.length === 0) {
        alert("No log data available for " + CURRENT_VIEW + " view.");
        return;
    }

    // Define CSV Headers
    var header = ["Time", "Event", "Spell", "Result", "Dmg_Normal", "Dmg_Eclipse", "Dmg_Crit", "Total_Dmg", "CastTime", "Mana", "Eclipse", "MF_Rem", "IS_Rem", "BoaT", "NG", "OoC", "Boon", "SP", "Haste", "TBoS", "WoC", "SoE", "Info"];
    var csvContent = "data:text/csv;charset=utf-8,";
    csvContent += header.join(",") + "\r\n";

    // Format Rows
    logData.forEach(function (row) {
        // Calculate Total damage for clarity
        var totalDmg = (row.dmgNorm || 0) + (row.dmgEcl || 0) + (row.dmgCrit || 0);

        var rowData = [
            row.t,
            row.evt,
            row.spell,
            row.res,
            Math.floor(row.dmgNorm || 0),
            Math.floor(row.dmgEcl || 0),
            Math.floor(row.dmgCrit || 0),
            Math.floor(totalDmg),
            (row.castTime || "0").replace('s', ''), // Clean "1.5s" -> "1.5"
            row.mana !== "-" ? row.mana : 0,
            row.ecl === "" ? "None" : row.ecl, // Explicit None
            row.mfRem !== "-" ? row.mfRem : 0,
            row.isRem !== "-" ? row.isRem : 0,
            row.boat,
            row.ng === "YES" ? 1 : 0, // Boolean to INT for Excel
            row.ooc === "YES" ? 1 : 0,
            row.boon !== "-" ? row.boon : 0,
            row.sp,
            row.haste,
            row.bTbos !== "-" ? row.bTbos : 0, // New
            row.bWoc !== "-" ? row.bWoc : 0, // New
            row.bSoe !== "-" ? row.bSoe : 0, // New
            '"' + (row.info || "") + '"' // Escape commas in info
        ];
        csvContent += rowData.join(",") + "\r\n";
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Unique filename with view type and timestamp
    var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.setAttribute("download", "moonkin_sim_log_" + CURRENT_VIEW + "_" + timestamp + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}