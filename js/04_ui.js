/**
 * Turtle WoW Feral Sim - File 4: UI Manager
 * Handles Event Listeners, Result Display, and Settings Management
 */

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // 1. Simulation Controls
    document.getElementById('btnRun').addEventListener('click', startSim);
    
    // 2. Bind all Inputs to save settings automatically (optional) or just trigger updates
    CONFIG_IDS.forEach(id => {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                // If it's a gear stat and manual mode is off, re-calc might be needed
                // But generally we just save state
                saveCurrentState(); 
            });
        }
    });

    // 3. Manual Stats Toggle
    var manualCheck = document.getElementById("manual_stats");
    if (manualCheck) {
        manualCheck.addEventListener('change', function() {
            var inputs = ["stat_strength", "stat_agility", "stat_ap", "stat_crit", "stat_hit", "stat_haste", "weapon_dps", "weapon_speed"];
            inputs.forEach(id => {
                var el = document.getElementById(id);
                if (el) el.disabled = !this.checked;
            });
            // Re-calc gear if turning OFF manual mode
            if (!this.checked && window.calcGearStats) window.calcGearStats();
        });
    }

    // 4. Finisher Mode UI Feedback (Optional)
    // You could hide/show inputs based on selection, but for now simple is fine.
}

// ============================================================================
// RESULT DISPLAY
// ============================================================================

function updateResults(result) {
    if (!result) return;

    // 1. Top Level Stats
    setText("resultDPS", result.dps.toFixed(1));
    setText("resultTotal", Math.floor(result.totalDmg).toLocaleString());
    setText("resultDur", result.duration + "s");

    // 2. Observed Stats (Hit/Crit from Log)
    var hits = 0;
    var crits = 0;
    var misses = 0;
    var totalAttacks = 0;

    result.log.forEach(entry => {
        if (entry.type !== "Buff" && entry.type !== "Info" && entry.damage >= 0) {
            totalAttacks++;
            if (entry.type === "Crit") crits++;
            if (entry.type === "Miss" || entry.type === "Dodge") misses++;
            // Hit is implicit rest
        }
    });

    var critRate = totalAttacks > 0 ? (crits / totalAttacks * 100) : 0;
    var hitRate = totalAttacks > 0 ? ((totalAttacks - misses) / totalAttacks * 100) : 0;

    setText("resultCrit", critRate.toFixed(1) + "%");
    setText("resultHit", hitRate.toFixed(1) + "%");

    // 3. Damage Breakdown Table
    renderBreakdown(result.log);

    // 4. Resource Visualizer (Show End State)
    // In a real-time sim this would animate, here we show the final snapshot
    if (result.log.length > 0) {
        var last = result.log[result.log.length - 1];
        updateVisualizer(last.energy, last.combo);
    }
}

function renderBreakdown(log) {
    var container = document.getElementById("dpsBreakdown");
    if (!container) return;
    container.innerHTML = "";

    // Aggregate Data
    var map = {};
    var totalDmg = 0;

    log.forEach(e => {
        if (e.damage > 0) {
            if (!map[e.spell]) {
                map[e.spell] = { name: e.spell, count: 0, min: 9999, max: 0, sum: 0, crits: 0 };
            }
            var d = map[e.spell];
            d.count++;
            d.sum += e.damage;
            totalDmg += e.damage;
            if (e.damage < d.min) d.min = e.damage;
            if (e.damage > d.max) d.max = e.damage;
            if (e.type === "Crit") d.crits++;
        }
    });

    // Sort by Damage Descending
    var list = Object.values(map).sort((a, b) => b.sum - a.sum);

    // Build Table
    var table = document.createElement("table");
    table.className = "dps-table";
    var head = `<tr>
        <th>Ability</th>
        <th>Count</th>
        <th>Crit %</th>
        <th>Avg</th>
        <th>Total</th>
        <th>%</th>
    </tr>`;
    table.innerHTML = head;

    list.forEach(item => {
        var pct = (item.sum / totalDmg * 100).toFixed(1);
        var avg = Math.floor(item.sum / item.count);
        var critPct = (item.crits / item.count * 100).toFixed(1);
        
        var row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.count}</td>
            <td>${critPct}%</td>
            <td>${avg}</td>
            <td>${Math.floor(item.sum).toLocaleString()}</td>
            <td>${pct}%</td>
        `;
        table.appendChild(row);
    });

    container.appendChild(table);
}

function updateVisualizer(energy, combo) {
    // Energy Bar
    var bar = document.getElementById("vizEnergy");
    var txt = document.getElementById("vizEnergyText");
    if (bar) bar.style.width = energy + "%";
    if (txt) txt.innerText = Math.floor(energy) + " / 100";

    // Combo Points
    var cps = document.querySelectorAll(".combo-container .cp");
    cps.forEach((cp, idx) => {
        if (idx < combo) cp.classList.add("active");
        else cp.classList.remove("active");
    });
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

function saveCurrentState() {
    var state = {};
    CONFIG_IDS.forEach(id => {
        state[id] = getVal(id); // getVal is in utils.js
    });
    // Save Gear Selection (IDs)
    // Assuming GEAR object is global from gear.js
    var gearIds = {};
    if (typeof GEAR !== 'undefined') {
        for (var slot in GEAR) {
            gearIds[slot] = GEAR[slot] ? GEAR[slot].id : null;
        }
    }
    state.gear = gearIds;

    localStorage.setItem("turtle_feral_sim_v1", JSON.stringify(state));
}

function loadSettings() {
    var raw = localStorage.getItem("turtle_feral_sim_v1");
    if (!raw) return;
    
    try {
        var state = JSON.parse(raw);
        
        // Load Config Inputs
        CONFIG_IDS.forEach(id => {
            if (state[id] !== undefined) {
                var el = document.getElementById(id);
                if (el) {
                    if (el.type === "checkbox") el.checked = (state[id] === 1);
                    else el.value = state[id];
                }
            }
        });

        // Load Gear
        if (state.gear && typeof equipItem === 'function') {
            for (var slot in state.gear) {
                // We need to wait for DB load to equip by ID? 
                // Usually we store IDs, so we can trigger equipItem(slot, id)
                // But equipItem needs DB.
                // We'll store a global "PENDING_GEAR" to load after DB ready.
                window.PENDING_GEAR = state.gear;
            }
        }

    } catch (e) {
        console.error("Error loading settings", e);
    }
}

// Helper Wrappers for Index buttons
function exportSettings() {
    saveCurrentState();
    var raw = localStorage.getItem("turtle_feral_sim_v1");
    // Compress or just Base64
    var data = btoa(raw); 
    prompt("Copy this string to share:", data);
}

function importSettings() {
    var data = prompt("Paste settings string:");
    if (!data) return;
    try {
        var raw = atob(data);
        localStorage.setItem("turtle_feral_sim_v1", raw);
        loadSettings();
        // Trigger Gear Update
        if (window.PENDING_GEAR && window.equipItem) {
            for (var slot in window.PENDING_GEAR) {
                window.equipItem(slot, window.PENDING_GEAR[slot]);
            }
        }
        showToast("Settings Imported!");
    } catch (e) {
        alert("Invalid Data");
    }
}