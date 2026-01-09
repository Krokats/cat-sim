/**
 * Feral Simulation - File 6: Main Init
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    setupUIListeners();
    addSim(true);
    updateEnemyInfo();
    calculateGearStats();
    importSettings();
    loadDatabase();
}

// Start
init();