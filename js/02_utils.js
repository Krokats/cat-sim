/**
 * Feral Simulation - File 2: Utilities
 * Helper functions for DOM manipulation and UI feedback.
 * Updated for Turtle WoW Patch 1.18 (Feral Cat)
 */

// ============================================================================
// 2. UTILS
// ============================================================================

/**
 * Retrieves the value of a UI element safely.
 * Handles Checkboxes (returns 1 or 0), Selects (returns string), and Inputs (returns float).
 * @param {string} id - The HTML element ID.
 * @returns {number|string} - The parsed value.
 */
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    
    if (el.type === "checkbox") {
        return el.checked ? 1 : 0;
    }
    
    if (el.tagName === "SELECT") {
        return el.value;
    }
    
    // For standard number/text inputs
    var val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
}

/**
 * Sets the inner text of an element safely.
 * @param {string} id - The HTML element ID.
 * @param {string} text - The text content to set.
 */
function setText(id, text) {
    var el = document.getElementById(id);
    if (el) {
        el.innerText = text;
    }
}

/**
 * Shows a temporary 'Toast' notification at the bottom of the screen.
 * @param {string} msg - The message to display.
 */
function showToast(msg) {
    var t = document.getElementById("toast");
    if (t) {
        if (toastTimer) clearTimeout(toastTimer);
        t.innerText = msg || "Action Successful!";
        t.classList.add("show");
        
        // Hide after 3 seconds
        toastTimer = setTimeout(function () { 
            t.classList.remove("show"); 
        }, 3000);
    }
}

// ============================================================================
// LOADING & PROGRESS OVERLAY
// ============================================================================

/**
 * Displays the full-screen progress overlay.
 * @param {string} text - The status text to show (e.g., "Simulating...").
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
 * Updates the progress bar percentage.
 * @param {number} pct - Percentage (0 to 100).
 */
function updateProgress(pct) { 
    var el = document.getElementById("progressFill"); 
    if (el) el.style.width = pct + "%"; 
}

/**
 * Hides the progress overlay with a small delay for smoother UX.
 */
function hideProgress() { 
    setTimeout(function () { 
        var el = document.getElementById("progressOverlay"); 
        if (el) el.classList.add("hidden"); 
    }, 200); 
}
