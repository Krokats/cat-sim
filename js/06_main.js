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
    setupUIListeners();

    // 2. Load Item Database (Async)
    // This will trigger 'calculateGearStats' once done.
    loadDatabase();

    // 3. Initialize First Simulation
    // We add a default sim so the UI isn't empty.
    // Pass 'true' to indicate initialization phase.
    addSim(true);

    // 4. Initial UI Updates
    updateEnemyInfo();
    updatePlayerStats();
    
    // Render the sidebar (now that we added a sim)
    renderSidebar();
}

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}