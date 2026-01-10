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

    // 1. Setup UI Event Listeners (Buttons, Inputs)
    setupUIListeners();

    // 2. Load Item Database (Async)
    // This fetches items.json/enchants.json and triggers 'calculateGearStats' once done.
    loadDatabase();

    // 3. Initialize First Simulation
    // We add a default sim so the UI isn't empty on load.
    // Pass 'true' to indicate initialization phase (prevents trying to read undefined UI inputs).
    addSim(true);

    // 4. Initial UI Updates
    // Set default text for summary boxes based on default inputs
    updateEnemyInfo();
    updatePlayerStats();
    
    // 5. Render the sidebar (now that we added a sim)
    renderSidebar();
}

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}