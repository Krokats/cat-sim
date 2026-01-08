/**
 * Feral Simulation - File 2: Utilities
 */

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Holt den Wert eines HTML-Inputs sicher ab.
 * @param {string} id - HTML ID des Elements
 * @returns {number|string|boolean} - Der Wert
 */
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    if (el.type === "checkbox") return el.checked ? 1 : 0;
    if (el.tagName === "SELECT") return el.value;
    return parseFloat(el.value) || 0;
}

/**
 * Setzt den Text eines Elements.
 */
function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

/**
 * Zeigt eine kurze Toast-Nachricht an (oben mitte).
 */
function showToast(msg) {
    var t = document.getElementById("toast");
    if (t) {
        if (toastTimer) clearTimeout(toastTimer);
        t.innerText = msg || "Aktion erfolgreich!";
        t.classList.add("show");
        toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3000);
    }
}

/**
 * Zeigt das Lade-Overlay an.
 */
function showProgress(text) {
    var el = document.getElementById("progressOverlay");
    if (el) {
        el.classList.remove("hidden");
        var t = document.getElementById("progressText");
        if (t) t.innerText = text;
        var f = document.getElementById("progressFill");
        if (f) f.style.width = "0%";
    }
}

/**
 * Aktualisiert den Fortschrittsbalken.
 * @param {number} pct - Prozent (0-100)
 */
function updateProgress(pct) {
    var f = document.getElementById("progressFill");
    if (f) f.style.width = pct + "%";
}

/**
 * Versteckt das Lade-Overlay.
 */
function hideProgress() {
    var el = document.getElementById("progressOverlay");
    if (el) {
        setTimeout(function() {
            el.classList.add("hidden");
        }, 300); // Kurze Verzögerung für Optik
    }
}

// ============================================================================
// 3. STATE MANAGEMENT (Export / Import / Save)
// ============================================================================

/**
 * Exportiert alle Einstellungen und Gear-Auswahl als JSON-Datei.
 */
function exportSettings() {
    var data = {
        config: {},
        gear: GEAR_SELECTION,
        enchants: ENCHANT_SELECTION,
        timestamp: new Date().getTime(),
        version: "1.0-Feral"
    };

    // Speichere alle Werte aus CONFIG_IDS
    CONFIG_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            if (el.type === "checkbox") data.config[id] = el.checked;
            else data.config[id] = el.value;
        }
    });

    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    
    var a = document.createElement('a');
    a.href = url;
    a.download = "feral_sim_settings.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Importiert Einstellungen aus einer JSON-Datei.
 */
function importSettings() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        var reader = new FileReader();
        reader.onload = function(re) {
            try {
                var data = JSON.parse(re.target.result);
                applySettings(data);
                showToast("Einstellungen geladen!");
            } catch (err) {
                console.error(err);
                alert("Fehler beim Laden der Datei: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

/**
 * Wendet ein Datenobjekt auf die UI an.
 */
function applySettings(data) {
    if (!data) return;

    // 1. Config Inputs
    if (data.config) {
        for (var key in data.config) {
            var el = document.getElementById(key);
            if (el) {
                if (el.type === "checkbox") el.checked = data.config[key];
                else el.value = data.config[key];
                
                // Trigger change event für Listener (z.B. Mode Switch)
                el.dispatchEvent(new Event('change'));
            }
        }
    }

    // 2. Gear & Enchants
    if (data.gear) {
        GEAR_SELECTION = data.gear;
    }
    if (data.enchants) {
        ENCHANT_SELECTION = data.enchants;
    }

    // UI aktualisieren (Dropdowns setzen)
    // Wir rufen hier updateGearUI auf, das in 03_gear.js definiert sein wird.
    // Da wir JS dynamisch laden, prüfen wir, ob die Funktion existiert.
    if (typeof updateGearSelections === "function") {
        updateGearSelections();
    }
    
    // Sim aktualisieren
    if (typeof updatePlayerStats === "function") {
        updatePlayerStats();
    }
}

/**
 * Speichert den aktuellen Status im LocalStorage (Auto-Save).
 */
function saveCurrentState() {
    var data = {
        config: {},
        gear: GEAR_SELECTION,
        enchants: ENCHANT_SELECTION
    };

    CONFIG_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            if (el.type === "checkbox") data.config[id] = el.checked;
            else data.config[id] = el.value;
        }
    });

    localStorage.setItem("feral_sim_state", JSON.stringify(data));
}

/**
 * Lädt den Status aus dem LocalStorage beim Start.
 */
function loadSavedState() {
    var raw = localStorage.getItem("feral_sim_state");
    if (raw) {
        try {
            var data = JSON.parse(raw);
            applySettings(data);
            console.log("Auto-Save geladen.");
        } catch (e) {
            console.error("Fehler beim Laden des Auto-Saves", e);
        }
    }
}