/**
 * Turtle WoW Feral Sim - File 2: Utilities
 * Helper functions for DOM manipulation and formatting
 */

// ============================================================================
// INPUT HELPERS
// ============================================================================

function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    
    if (el.type === "checkbox") {
        return el.checked ? 1 : 0;
    }
    
    var val = el.value;
    
    // If it's a select and the value is explicitly text (not a number), return string
    if (el.tagName === "SELECT") {
        // Simple check: if it parses to a number, return number, else string
        var num = parseFloat(val);
        if (isNaN(num)) return val; 
        // Caution: "60" string should be number 60 for levels
        return num;
    }
    
    return parseFloat(val) || 0;
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

// ============================================================================
// NOTIFICATIONS & OVERLAYS
// ============================================================================

var toastTimer = null;

function showToast(msg) {
    var t = document.getElementById("toast");
    if (t) {
        if (toastTimer) clearTimeout(toastTimer);
        t.innerText = msg || "Action Successful!";
        t.classList.add("show");
        t.style.opacity = 1;
        toastTimer = setTimeout(function () { 
            t.style.opacity = 0;
            setTimeout(() => t.classList.remove("show"), 500);
        }, 3000);
    }
}

function showProgress(text) {
    // Falls du ein Overlay HTML Element hast (wurde im alten Code verwendet)
    // Wir erstellen es dynamisch, falls es fehlt, oder nutzen console
    var el = document.getElementById("progressOverlay");
    if (el) {
        el.classList.remove("hidden");
        var t = document.getElementById("progressText");
        if (t) t.innerText = text;
    } else {
        console.log("[Progress] " + text);
    }
}

function updateProgress(pct) {
    var bar = document.getElementById("progressFill");
    if (bar) bar.style.width = pct + "%";
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}