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

    // 1. Setup Event Listeners
    // Handles Inputs, Buttons, Modals, and Calculation Method toggles.
    // Defined in 04_ui.js
    setupUIListeners();

    // 2. Load Saved Settings
    // Retrieves config and gear selection from LocalStorage.
    // Defined in 04_ui.js
    loadSavedState();

    // 3. Update Enemy UI Information
    // Sets initial text for Armor, Level, Resistance (Armor Reduction).
    // Defined in 04_ui.js
    updateEnemyInfo();

    // 4. Load Item Database (Async)
    // Fetches items.json and enchants.json.
    // Once loaded, it automatically calls initGearPlannerUI() and calculateGearStats().
    // Defined in 03_gear.js
    loadDatabase();

    // 5. Initial Stat Update
    // Calculates base player stats (Race defaults) so the UI isn't empty 
    // while waiting for the DB or if no gear is selected.
    // Defined in 04_ui.js
    updatePlayerStats();
}

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}