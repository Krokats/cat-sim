/**
 * Feral Simulation - File 2: Utilities
 * Shared helper functions for UI interaction and data retrieval.
 */

// ============================================================================
// DOM HELPERS
// ============================================================================

/**
 * Retrieves the numeric value from an input element.
 * Handles checkboxes (returns 1 for checked, 0 for unchecked) and standard inputs.
 */
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;

    if (el.type === 'checkbox') {
        return el.checked ? 1 : 0;
    }

    var val = parseFloat(el.value);
    // Return 0 if NaN to prevent calculation errors
    return isNaN(val) ? 0 : val;
}

/**
 * Sets the inner text of an HTML element safely.
 */
function setText(id, text) {
    var el = document.getElementById(id);
    if (el) {
        el.innerText = text;
    }
}

// ============================================================================
// NOTIFICATIONS & OVERLAYS
// ============================================================================

/**
 * Shows a temporary toast notification at the top of the screen.
 * Uses the global 'toastTimer' variable to handle overlaps.
 */
function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;

    t.innerText = msg;
    t.classList.add("show");

    // Clear existing timer if toast is triggered rapidly
    if (typeof toastTimer !== 'undefined' && toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(function () {
        t.classList.remove("show");
    }, 3000);
}

/**
 * Displays the full-screen progress overlay with a status message.
 */
function showProgress(txt) {
    var overlay = document.getElementById("progressOverlay");
    var textEl = document.getElementById("progressText");

    if (overlay && textEl) {
        overlay.classList.remove("hidden");
        textEl.innerText = txt || "Loading...";
        updateProgress(0);
    }
}

/**
 * Hides the progress overlay.
 */
function hideProgress() {
    var overlay = document.getElementById("progressOverlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
}

/**
 * Updates the width of the progress bar inside the overlay.
 * @param {number} pct - Percentage (0-100)
 */
function updateProgress(pct) {
    var fill = document.getElementById("progressFill");
    if (fill) {
        fill.style.width = pct + "%";
    }
}