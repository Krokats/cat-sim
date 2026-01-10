/**
 * Feral Simulation - File 2: Utilities
 * DOM Helpers and UI Feedback
 * Kept consistent with original structure.
 */

// ============================================================================
// 2. UTILS
// ============================================================================

/**
 * Retreives the value of a UI element safely.
 * Handles Checkboxes (1/0), Selects (String), and Inputs (Float).
 */
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    
    // Checkbox: Return 1 if checked, 0 if not (Logic uses 1/0 as boolean mostly)
    if (el.type === "checkbox") return el.checked ? 1 : 0;
    
    // Select: Return value string
    if (el.tagName === "SELECT") return el.value;
    
    // Input (Number/Text): Return float value
    // Handles decimal inputs if browser standardizes them to dot, 
    // otherwise relies on parseFloat parsing "3.5" correctly.
    return parseFloat(el.value) || 0;
}

/**
 * Sets text content of an element safely.
 */
function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

/**
 * Shows a temporary toast message at the bottom of the screen.
 */
function showToast(msg) {
    var t = document.getElementById("toast");
    if (t) {
        if (toastTimer) clearTimeout(toastTimer);
        t.innerText = msg || "Action Successful!";
        t.classList.add("show");
        toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3000);
    }
}

/**
 * Displays the modal progress overlay with a text message.
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
 * Updates the progress bar width inside the overlay.
 * @param {number} pct - Percentage (0-100)
 */
function updateProgress(pct) { 
    var el = document.getElementById("progressFill"); 
    if (el) el.style.width = pct + "%"; 
}

/**
 * Hides the progress overlay with a slight delay for smooth UI.
 */
function hideProgress() { 
    setTimeout(function () { 
        var el = document.getElementById("progressOverlay"); 
        if (el) el.classList.add("hidden"); 
    }, 200); 
}