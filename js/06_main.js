/**
 * Turtle WoW Feral Sim - File 6: Main Controller
 * Initialization and Simulation Loop Orchestration
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    console.log("Initializing Feral Cat Simulator...");
    
    // 1. Setup UI Events (Buttons, Inputs)
    setupUIListeners();
    
    // 2. Load Database (Async)
    loadDatabase().then(() => {
        // 3. Load Saved Settings (after DB is ready to match Item IDs)
        loadSettings();
        
        // 4. Initial Calc of Stats
        if (window.calcGearStats) window.calcGearStats();
        
        console.log("Initialization Complete.");
    });
}

// ============================================================================
// SIMULATION CONTROLLER
// ============================================================================

function startSim() {
    var btn = document.getElementById('btnRun');
    if(btn) btn.disabled = true;
    showToast("Running Simulation...");

    // Allow UI update before freezing
    setTimeout(() => {
        runBatchSimulation();
        if(btn) btn.disabled = false;
    }, 50);
}

function runBatchSimulation() {
    var iterations = getVal("simIter") || 1000;
    var duration = getVal("simTime") || 60;
    
    // Update global Duration state
    State.duration = duration;

    var totalDps = 0;
    var totalDmg = 0;
    
    // We keep the log of the LAST iteration for the breakdown
    // (Averaging logs is complex, showing one example is standard practice)
    var lastResult = null;
    
    // Aggregate data for accuracy
    var combinedLog = []; 

    // --- BATCH LOOP ---
    for (var i = 0; i < iterations; i++) {
        var res = runSimulation(i);
        totalDps += res.dps;
        totalDmg += res.totalDmg;
        
        // Accumulate Logs for detailed breakdown? 
        // For performance, we usually just sum stats, but let's keep it simple:
        // Pass the Log of the FIRST run to visualizer, but calculate Stats on ALL runs.
        if (i === 0) {
            lastResult = res; // Save one full run for the timeline/visuals
        }
        
        // Merge logs into a massive list for the "Damage Breakdown" table
        // (This gives better averages for Crits/Misses than just 1 run)
        if (i < 500) { // Limit merging to prevent memory overflow on huge iterations
             combinedLog = combinedLog.concat(res.log);
        }
    }

    // --- AVERAGES ---
    var avgDps = totalDps / iterations;
    var avgTotal = totalDmg / iterations;

    // Create the final result object
    var finalResult = {
        dps: avgDps,
        totalDmg: avgTotal,
        duration: duration,
        log: combinedLog // We pass the big log for the Table, but Visualizer uses last state
    };

    // Update UI
    updateResults(finalResult);
    
    // Force Visualizer to show the state of the single sample run
    if (lastResult && lastResult.log.length > 0) {
        var lastState = lastResult.log[lastResult.log.length - 1];
        updateVisualizer(lastState.energy, lastState.combo);
    }
}

// Start the App
// Ensure DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}