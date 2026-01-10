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
    // Registriert alle Change-Events für Inputs, Buttons (Run, Reset) und Modals.
    // Definiert in 04_ui.js
    setupUIListeners();

    // 2. Initialize First Simulation
    // Erstellt "Simulation 1" standardmäßig, damit die UI nicht leer ist.
    // 'true' signalisiert, dass es sich um den Init-Prozess handelt (kein Klonen vorheriger Sims).
    // Definiert in 04_ui.js
    addSim(true);

    // 3. Update Enemy UI Information
    // Berechnet und zeigt initiale Rüstungswerte und Damage Reduction an.
    // Definiert in 04_ui.js
    updateEnemyInfo();

    // 4. Render Sidebar
    // Baut die linke Navigationsleiste auf (Sim 1, +, Übersicht).
    // Definiert in 04_ui.js
    renderSidebar();

    // 5. Load Item Database (Async)
    // Lädt items.json und enchants.json.
    // Sobald fertig, ruft es automatisch initGearPlannerUI() und calculateGearStats() auf.
    // Definiert in 03_gear.js
    loadDatabase();
}

// Sicherstellen, dass das DOM vollständig geladen ist, bevor wir starten
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
