/**
 * Feral Simulation - File 4: UI Manager
 */

// ============================================================================
// UI SETUP & EVENT LISTENERS
// ============================================================================

function setupUIListeners() {
    // 1. Simulation Button
    var btn = document.getElementById('btnSimulate');
    if (btn) {
        btn.addEventListener('click', runSimulationWrapper);
    }

    // 2. Mode Switch (Sim vs Debug)
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
        });
    }

    // 3. Enemy Info Updates (Armor Calc)
    var enemyInputs = ['enemy_level', 'conf_armor'];
    enemyInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateEnemyInfo);
            el.addEventListener('input', updateEnemyInfo);
        }
    });

    // Initial Update
    updateEnemyInfo();
}

/**
 * Aktualisiert die Anzeige der Boss-Stats (Rüstung reduktion).
 */
function updateEnemyInfo() {
    var lvl = getVal("enemy_level");
    var armor = getVal("conf_armor");
    
    // Armor Reduction Formula: Armor / (Armor + 400 + 85 * (AttackerLvl + 4.5 * (AttackerLvl - 59)))
    // Simplified Classic Formula for Lvl 60 Attacker vs Lvl 63 Target:
    // DR = Armor / (Armor + 400 + 85 * 60) -> Armor / (Armor + 5500) approx?
    // Accurate Vanilla Formula: DR = Armor / (Armor + 400 + 85 * AttackerLevel)
    // Wenn Attacker 60 ist: 400 + 85*60 = 5500.
    
    var dr = armor / (armor + 5500);
    if (dr > 0.75) dr = 0.75; // Cap

    var drPct = (dr * 100).toFixed(2);
    setText("sumArmor", armor + " (" + drPct + "% DR)");
}


// ============================================================================
// SIMULATION WRAPPER
// ============================================================================

/**
 * Sammelt Inputs, startet die Engine und zeigt Ergebnisse.
 */
function runSimulationWrapper() {
    showProgress("Simuliere Kampf...");
    
    // UI blockieren
    document.getElementById('btnSimulate').disabled = true;

    // Async damit UI rendern kann (Progress bar)
    setTimeout(function() {
        try {
            // 1. Inputs sammeln
            var inputs = {
                mode: document.getElementById('calcMethod').value, // 'S' or 'D'
                iterations: getVal('simCount'),
                maxTime: getVal('maxTime'),
                
                // Configs from Globals
                conf_armor: getVal("conf_armor"),
                conf_canBleed: getVal("conf_canBleed"),
                conf_behind: getVal("conf_behind"),
                conf_reshift: getVal("conf_reshift"),
                conf_useRake: getVal("conf_useRake"),
                conf_useBite: getVal("conf_useBite"),
                conf_aggroShift: getVal("conf_aggroShift"),
                
                // Manual Buffs (if passed to engine, though engine calculates AP mostly)
                buffs_ap: 0 // AP is already in stats, but could add temp buffs here
            };

            // Force Single Iteration for Debug Mode
            if (inputs.mode === 'D') inputs.iterations = 1;

            // 2. Stats holen (Global variable from 03_gear.js)
            // Falls window.CURRENT_STATS leer ist, einmal rechen
            if (!window.CURRENT_STATS) updatePlayerStats();
            var stats = window.CURRENT_STATS;

            // 3. Engine aufrufen (Funktion in 05_engine.js)
            updateProgress(50);
            
            var results;
            
            // Multiple Iterations Handling
            if (inputs.mode === 'S') {
                var totalDps = 0;
                var totalBreakdown = { white:0, shred:0, claw:0, rake:0, rip:0, bite:0 };
                
                for(var i=0; i<inputs.iterations; i++) {
                    var res = runSim(inputs, stats);
                    totalDps += res.dps;
                    
                    // Sum Breakdown
                    for(var k in res.breakdown) {
                        if(totalBreakdown[k] !== undefined) totalBreakdown[k] += res.breakdown[k];
                    }
                }
                
                // Averages
                results = {
                    dps: totalDps / inputs.iterations,
                    breakdown: {},
                    log: [] // No log in avg mode
                };
                for(var k in totalBreakdown) {
                    results.breakdown[k] = totalBreakdown[k] / inputs.iterations;
                }

            } else {
                // Debug Mode (1 Run + Log)
                results = runSim(inputs, stats);
            }

            updateProgress(90);

            // 4. Ergebnisse anzeigen
            displayResults(results, inputs.mode);

            showToast("Simulation abgeschlossen!");

        } catch (e) {
            console.error(e);
            alert("Fehler in Simulation: " + e.message);
        } finally {
            hideProgress();
            document.getElementById('btnSimulate').disabled = false;
        }
    }, 50);
}

// ============================================================================
// RESULT DISPLAY
// ============================================================================

function displayResults(results, mode) {
    // 1. DPS
    setText("resDps", results.dps.toFixed(1));

    // 2. Breakdown
    var container = document.getElementById("resultStats");
    container.innerHTML = "";
    
    var totalDmg = 0;
    for(var k in results.breakdown) totalDmg += results.breakdown[k];

    // Sortable Array
    var sorted = [];
    for(var k in results.breakdown) {
        sorted.push({ name: k, val: results.breakdown[k] });
    }
    sorted.sort((a,b) => b.val - a.val);

    sorted.forEach(item => {
        if (item.val <= 0) return;
        var pct = (item.val / totalDmg) * 100;
        
        // Pretty Name
        var name = item.name.charAt(0).toUpperCase() + item.name.slice(1);
        if (name === "White") name = "Auto Attack";

        var row = document.createElement("div");
        row.style.marginBottom = "8px";
        row.innerHTML = `
            <div class="breakdown-row">
                <span>${name}</span>
                <span>${Math.floor(item.val)} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="breakdown-bar" style="width:${pct}%;"></div>
        `;
        container.appendChild(row);
    });

    // 3. Log (Debug Mode Only)
    var logCont = document.getElementById("logContainer");
    var logDiv = document.getElementById("simLog");
    
    if (mode === 'D' && results.log) {
        logCont.classList.remove("hidden");
        renderLog(results.log, logDiv);
    } else {
        logCont.classList.add("hidden");
    }
    
    // 4. Update Summary Panel Stats
    updateSummaryStats();
}

function renderLog(logData, container) {
    container.innerHTML = "";
    
    // Limit Log size to prevent browser freeze
    var maxLines = 500;
    
    logData.slice(0, maxLines).forEach(entry => {
        var div = document.createElement("div");
        div.className = "log-entry";
        
        // Styling based on type
        var colorClass = "";
        if (entry.msg.includes("CRIT")) colorClass = "Crit";
        else if (entry.msg.includes("MISS") || entry.msg.includes("DODGE")) colorClass = "Miss";
        else if (entry.msg.includes("GLANCE")) colorClass = "Glance";

        div.classList.add(colorClass);

        div.innerHTML = `
            <div class="log-time">[${entry.t}]</div>
            <div class="log-msg">${entry.msg}</div>
            <div class="log-dmg">${entry.dmg > 0 ? entry.dmg : '-'}</div>
            <div style="font-size:0.8em; color:#888; margin-left:10px;">(E:${entry.energy} CP:${entry.cp})</div>
        `;
        container.appendChild(div);
    });
}

function updateSummaryStats() {
    if (!window.CURRENT_STATS) return;
    var s = window.CURRENT_STATS;
    
    setText("sumAp", Math.floor(s.totalAp));
    setText("sumCrit", s.totalCrit.toFixed(2) + "%");
    setText("sumHit", s.totalHit.toFixed(2) + "%");
    setText("sumHaste", s.haste + "%");
    setText("sumSkill", (300 + s.skill));
}

// ============================================================================
// STAT WEIGHTS (EP)
// ============================================================================

function calculateWeights() {
    var container = document.getElementById("statWeights");
    container.innerHTML = "<div class='weight-row'>Berechne...</div>";
    
    setTimeout(() => {
        // Base Run
        var inputs = {
            mode: 'S', iterations: 500, maxTime: 60, // Schnellerer Loop
            conf_armor: getVal("conf_armor"),
            conf_canBleed: getVal("conf_canBleed"),
            conf_behind: getVal("conf_behind"),
            conf_reshift: getVal("conf_reshift"),
            conf_useRake: getVal("conf_useRake"),
            conf_useBite: getVal("conf_useBite"),
            conf_aggroShift: getVal("conf_aggroShift"),
            buffs_ap: 0
        };
        
        // Base Stats
        var baseStats = JSON.parse(JSON.stringify(window.CURRENT_STATS));
        var baseRes = runSim(inputs, baseStats);
        var baseDps = baseRes.dps;

        // Deltas to test
        var deltas = [
            { name: "1 Str", prop: "str", amount: 20, scale: 20 }, // Teste +20 um Varianz zu glätten
            { name: "1 Agi", prop: "agi", amount: 20, scale: 20 },
            { name: "1 AP", prop: "ap", amount: 40, scale: 40 },
            { name: "1 Crit", prop: "crit", amount: 1.0, scale: 1.0 },
            { name: "1 Hit", prop: "hit", amount: 1.0, scale: 1.0 }
        ];

        var results = [];

        deltas.forEach(d => {
            var modStats = JSON.parse(JSON.stringify(baseStats));
            modStats[d.prop] += d.amount;
            
            // Recalculate derived (Str -> AP, Agi -> Crit/AP) locally for the engine
            // Engine macht das in runSim (step 1 setup), also reicht es, die Rohwerte zu ändern?
            // Engine rechnet: AP = str*2 + agi + ap...
            // Also ja, wir ändern die Inputs und die Engine macht den Rest.
            
            var res = runSim(inputs, modStats);
            var dpsDiff = res.dps - baseDps;
            var ep = dpsDiff / d.scale; // Value per 1 unit
            
            results.push({ name: d.name, ep: ep });
        });

        // Normalize to Str (1 Str = 2 AP usually reference) or AP?
        // Let's normalize to AP. Str EP / AP EP.
        var apEp = results.find(r => r.name === "1 AP").ep;
        if(apEp === 0) apEp = 0.001; // prevent div 0

        container.innerHTML = "";
        
        results.forEach(r => {
            var val = (r.ep / apEp).toFixed(2);
            var row = document.createElement("div");
            row.className = "weight-row";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.borderBottom = "1px solid #333";
            row.style.padding = "4px 0";
            
            row.innerHTML = `<span>${r.name}</span> <span style="color:var(--energy-yellow);">${val} AP</span>`;
            container.appendChild(row);
        });

    }, 50);
}