/**
 * Feral Simulation - File 6: Main Init
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Entry point for the application.
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    console.log("Initializing Krokat's Feral Sim (Turtle WoW 1.18)...");

    // 1. Setup Listeners
    // Initializes input change listeners and populates the Boss Preset dropdown
    setupUIListeners();

    // 2. Load Item Database (Async)
    // Fetches items.json and enchants.json.
    // Once loaded, it triggers 'initGearPlannerUI' and 'calculateGearStats'.
    loadDatabase();

    // 3. Initialize First Simulation
    // We add a default sim so the UI isn't empty on load.
    // Pass 'true' to indicate initialization phase (prevents trying to copy gear from non-existent sim).
    addSim(true);

    // 4. Initial UI Updates
    // Calculate initial armor reduction and stats based on default HTML values
    updateEnemyInfo();
    
    // Render the sidebar (now that we added a sim to the list)
    renderSidebar();
}

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}