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
            // Live update for armor to see DR change immediately
            if(id === "enemy_armor") {
                el.addEventListener('input', updateEnemyInfo);
            }
        }
    });

    // Initial Enemy Info Update
    updateEnemyInfo();

    // Modal Close Listeners (Esc key and Click outside)
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
    if(!header) return;
    var card = header.closest('.card');
    if(card) card.classList.toggle("collapsed");
}

// ============================================================================
// MANAGEMENT & STATE
// ============================================================================

function getCurrentConfigFromUI() {
    var cfg = {};
    CONFIG_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { 
            if (el.type === 'checkbox') cfg[id] = el.checked ? 1 : 0; 
            else cfg[id] = el.value; 
        }
    });

    // Deep copy objects to avoid reference issues
    cfg.gearSelection = JSON.parse(JSON.stringify(GEAR_SELECTION || {}));
    cfg.enchantSelection = JSON.parse(JSON.stringify(ENCHANT_SELECTION || {}));
    
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

    GEAR_SELECTION = cfg.gearSelection || {};
    ENCHANT_SELECTION = cfg.enchantSelection || {};

    if (typeof initGearPlannerUI === 'function') {
        initGearPlannerUI();
    }
    
    // Trigger Calculations to update UI numbers
    calculateGearStats();
    updateEnemyInfo();
}

function saveCurrentState() {
    if (SIM_LIST[ACTIVE_SIM_INDEX]) {
        SIM_LIST[ACTIVE_SIM_INDEX].config = getCurrentConfigFromUI();
        var nameInput = document.getElementById('simName');
        if (nameInput) SIM_LIST[ACTIVE_SIM_INDEX].name = nameInput.value;
    }
}

function addSim(isFirst) {
    if (!isFirst) saveCurrentState();
    var newId = Date.now();
    var newName = isFirst ? "Feral Sim 1" : "Feral Sim " + (SIM_LIST.length + 1);
    var newSim = new SimObject(newId, newName);

    // Copy current config or load fresh
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
    if (!confirm("Delete Simulation?")) return;
    SIM_LIST.splice(index, 1);
    if (SIM_LIST.length === 0) { 
        addSim(true); 
        return; 
    }
    
    if (index === ACTIVE_SIM_INDEX) { 
        ACTIVE_SIM_INDEX = Math.max(0, index - 1); 
    } else if (index < ACTIVE_SIM_INDEX) { 
        ACTIVE_SIM_INDEX--; 
    }
    
    renderSidebar(); 
    switchSim(ACTIVE_SIM_INDEX); 
    showToast("Deleted");
}

function switchSim(index) {
    saveCurrentState();
    ACTIVE_SIM_INDEX = index;

    var s = SIM_LIST[index];
    var nameInput = document.getElementById('simName');
    if (nameInput) {
        nameInput.value = s.name;
    }

    applyConfigToUI(s.config);

    // Results are always visible now, we just update or clear them
    if (s.results) {
        SIM_DATA = s.results;
        switchView('avg'); // Default to average view
    } else {
        SIM_DATA = null;
        clearResultsUI();
    }
    
    renderSidebar();
}

function updateSimName() {
    if (SIM_LIST[ACTIVE_SIM_INDEX]) {
        SIM_LIST[ACTIVE_SIM_INDEX].name = document.getElementById('simName').value;
        renderSidebar();
    }
}

function renderSidebar() { 
    var c = document.getElementById('sidebar'); 
    if (!c) return; 
    
    var html = ''; 
    // Removed Overview Button for simpler layout, focus on Sim List
    
    SIM_LIST.forEach(function (sim, idx) { 
        var a = (idx === ACTIVE_SIM_INDEX) ? 'active' : ''; 
        html += '<div class="sidebar-btn ' + a + '" onclick="switchSim(' + idx + ')" title="' + sim.name + '">' + (idx + 1) + '</div>'; 
    }); 
    html += '<div class="sidebar-btn btn-add" onclick="addSim(false)">+</div>'; 
    c.innerHTML = html; 
}

// ============================================================================
// VIEW RENDERING (RESULTS)
// ============================================================================

function clearResultsUI() {
    setText("out_dps_main", "-");
    setText("out_total_dmg", "-");
    setText("out_shifts", "-");
    setText("out_cp_waste", "-");
    
    var tbody = document.getElementById("tbl_body");
    if (tbody) tbody.innerHTML = "<tr><td colspan='4' class='text-center muted'>No simulation run yet.</td></tr>";

    var logBody = document.getElementById("logBody");
    if (logBody) logBody.innerHTML = "<tr><td colspan='9' class='text-center muted'>No log available.</td></tr>";

    // Clear Weights
    setText("res_weight_ap", "-");
    setText("res_weight_str", "-");
    setText("res_weight_agi", "-");
    setText("res_weight_crit", "-");
    setText("res_weight_hit", "-");
    setText("res_weight_haste", "-");
}

function switchView(type) {
    if (!SIM_DATA) return;
    CURRENT_VIEW = type;

    // Update Buttons
    var btns = document.querySelectorAll('.view-btn');
    btns.forEach(b => b.classList.remove('active'));
    var activeBtn = document.getElementById('view' + type.charAt(0).toUpperCase() + type.slice(1));
    if(activeBtn) activeBtn.classList.add('active');

    var data = SIM_DATA[type]; // avg, min, or max

    // Update Big Numbers
    setText("out_dps_main", data.dps.toFixed(1));
    setText("out_total_dmg", Math.floor(data.totalDmg).toLocaleString());
    setText("out_shifts", data.stats.casts_shift.toFixed(1));
    setText("out_cp_waste", data.stats.cp_wasted.toFixed(1));

    // Update Damage Breakdown Table
    var tbody = document.getElementById("tbl_body");
    if (tbody) {
        tbody.innerHTML = "";
        var list = [
            { name: "Melee (White)", val: data.stats.dmg_white },
            { name: "Shred", val: data.stats.dmg_shred },
            { name: "Claw", val: data.stats.dmg_claw },
            { name: "Ferocious Bite", val: data.stats.dmg_bite },
            { name: "Rip (DoT)", val: data.stats.dmg_rip },
            { name: "Rake", val: data.stats.dmg_rake + data.stats.dmg_rake_init }
        ];

        // Sort by damage descending
        list.sort((a, b) => b.val - a.val);

        list.forEach(item => {
            if (item.val > 0) {
                var pct = (item.val / data.totalDmg) * 100;
                var barColor = "var(--feral-orange)";
                // Special colors
                if (item.name.includes("Rip") || item.name.includes("Rake")) barColor = "#d32f2f"; // Bleed
                if (item.name.includes("White")) barColor = "#aaa"; 

                tbody.innerHTML += `
                    <tr>
                        <td class="text-left">${item.name}</td>
                        <td class="text-right">${Math.floor(item.val).toLocaleString()}</td>
                        <td class="text-right">${pct.toFixed(1)}%</td>
                        <td class="bar-col">
                            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%; background-color:${barColor}"></div></div>
                        </td>
                    </tr>
                `;
            }
        });
    }

    // Update Stat Weights (if available)
    if (SIM_DATA.weights) {
        setText("res_weight_ap", "1.00");
        setText("res_weight_str", SIM_DATA.weights.str.toFixed(2));
        setText("res_weight_agi", SIM_DATA.weights.agi.toFixed(2));
        setText("res_weight_crit", SIM_DATA.weights.crit.toFixed(2));
        setText("res_weight_hit", SIM_DATA.weights.hit.toFixed(2));
        setText("res_weight_haste", SIM_DATA.weights.haste.toFixed(2));
    } else {
        setText("res_weight_ap", "-");
        setText("res_weight_str", "-");
        setText("res_weight_agi", "-");
        setText("res_weight_crit", "-");
        setText("res_weight_hit", "-");
        setText("res_weight_haste", "-");
    }

    // Render Log
    renderCombatLog(data.log);
}

function renderCombatLog(log) {
    var b = document.getElementById("logBody");
    if (!b) return;
    b.innerHTML = "";
    
    if (!log || log.length === 0) {
        b.innerHTML = "<tr><td colspan='9' class='text-center muted'>No log available.</td></tr>";
        return;
    }

    // Limit log size for performance
    var limit = Math.min(log.length, 300);
    
    for (var i = 0; i < limit; i++) {
        var e = log[i];
        var rowClass = "";
        if (e.evt === "Damage") rowClass = "log-dmg";
        if (e.evt === "Cast") rowClass = "log-cast";

        // Result formatting
        var resHtml = e.result || "";
        if (e.result === "CRIT") resHtml = "<span class='crit'>CRIT</span>";
        else if (e.result === "GLANCE") resHtml = "<span class='glance'>GLANCE</span>";
        else if (e.result === "MISS") resHtml = "<span class='miss'>MISS</span>";
        else if (e.result === "DODGE") resHtml = "<span class='miss'>DODGE</span>";

        b.innerHTML += `
            <tr class="${rowClass}">
                <td class="mono">${e.t.toFixed(3)}</td>
                <td>${e.source}</td>
                <td>${e.evt}</td>
                <td class="mono">${resHtml}</td>
                <td class="text-right mono">${Math.floor(e.amount)}</td>
                <td class="text-center" style="color:#fbc02d">${e.energy}</td>
                <td class="text-center" style="color:#ff5722; font-weight:bold;">${e.cp}</td>
                <td class="text-center" style="color:#4fc3f7">${e.mana}</td>
                <td class="info-col">${e.info || ""}</td>
            </tr>
        `;
    }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function updateEnemyInfo() {
    var armor = getVal("enemy_armor");
    // DR Formula: Armor / (Armor + 5500) for Lvl 60 attacker (standard simplification)
    // 5500 = 400 + 85 * 60
    var dr = armor / (armor + 5500);
    
    var el = document.getElementById("info_dr");
    if(el) el.innerText = "DR: " + (dr * 100).toFixed(2) + "%";
}

// ============================================================================
// IMPORT / EXPORT (CLIPBOARD)
// ============================================================================

function packConfig(cfg) {
    // Similar to previous implementation, optimized
    var values = CONFIG_IDS.map(function (id) { return cfg[id]; });
    return { d: values, g: cfg.gearSelection, e: cfg.enchantSelection };
}

function unpackConfig(packed) {
    if(!packed || !packed.d) return packed; // Legacy fallback
    var cfg = {};
    CONFIG_IDS.forEach(function (id, idx) {
        if (idx < packed.d.length) cfg[id] = packed.d[idx];
    });
    cfg.gearSelection = packed.g || {};
    cfg.enchantSelection = packed.e || {};
    return cfg;
}

function exportSettings() {
    saveCurrentState();
    var sim = SIM_LIST[ACTIVE_SIM_INDEX];
    if (!sim) return;
    
    var data = { n: sim.name, c: packConfig(sim.config) };
    var jsonStr = JSON.stringify(data);
    
    var compressed = "";
    if (typeof LZString !== 'undefined') {
        compressed = LZString.compressToEncodedURIComponent(jsonStr);
    } else {
        compressed = btoa(jsonStr);
    }
    
    // Add dummy query param
    var url = window.location.href.split('?')[0] + "?s=" + compressed;
    navigator.clipboard.writeText(url).then(function() {
        showToast("Link copied to clipboard!");
    }, function() {
        showToast("Failed to copy link.");
    });
}

function importFromClipboard() {
    var input = prompt("Paste the config link or string:");
    if(!input) return;
    
    var str = input;
    if(input.includes("?s=")) str = input.split("?s=")[1];
    
    try {
        var json = null;
        if (typeof LZString !== 'undefined') {
            json = LZString.decompressFromEncodedURIComponent(str);
        }
        if(!json) json = atob(str); // Try legacy base64
        
        var data = JSON.parse(json);
        
        var s = new SimObject(Date.now(), (data.n || "Imported") + " (Imp)");
        s.config = unpackConfig(data.c || data); // Handle both packed and legacy
        
        SIM_LIST.push(s);
        switchSim(SIM_LIST.length - 1);
        showToast("Import Successful!");
        
    } catch(e) {
        console.error(e);
        alert("Invalid Config String!");
    }
}

function importSettings() {
    // Check URL on load
    var params = new URLSearchParams(window.location.search);
    if(params.has('s')) {
        // Delay slightly to ensure DB load if needed, or handle in Init
        var str = params.get('s');
        try {
            var json = LZString.decompressFromEncodedURIComponent(str);
            var data = JSON.parse(json);
            
            // Overwrite first sim
            if(SIM_LIST.length > 0) {
                SIM_LIST[0].name = data.n || "Imported";
                SIM_LIST[0].config = unpackConfig(data.c || data);
                // Apply happens in Init
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch(e) { console.error("URL Import Error", e); }
    }
}