/**
 * Feral Simulation - File 6: Main Initialization
 */

// ============================================================================
// INITIALIZATION SEQUENCE
// ============================================================================

function init() {
    console.log("Initializing Turtle WoW Feral Simulator...");

    // 1. Event Listener registrieren (Buttons, Inputs)
    setupUIListeners();

    // 2. Datenbank laden (Items & Enchants)
    // Dies ist asynchron. Wir müssen warten, bis es fertig ist,
    // bevor wir gespeicherte Settings laden können.
    loadDatabase().then(function() {
        
        // 3. Gespeicherten Status aus LocalStorage laden (falls vorhanden)
        // Dies überschreibt die Standardwerte mit den letzten User-Eingaben
        loadSavedState();

        // 4. UI einmal initial updaten
        updateEnemyInfo();
        
        // Falls durch den Load-Prozess noch nicht geschehen:
        if (typeof updatePlayerStats === "function") {
            updatePlayerStats();
        }

        console.log("Ready to shred!");
        
    }).catch(function(err) {
        console.error("Critical Init Error:", err);
        alert("Fehler beim Starten: " + err.message);
    });
}

// Sicherstellen, dass das DOM geladen ist, bevor wir starten
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}