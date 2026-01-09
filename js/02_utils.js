/**
 * Feral Simulation - File 2: Utilities
 */

// ============================================================================
// 2. UTILS
// ============================================================================
function getVal(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    if (el.type === "checkbox") return el.checked ? 1 : 0;
    if (el.tagName === "SELECT") return el.value;
    return parseFloat(el.value) || 0;
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

function showToast(msg) {
    var t = document.getElementById("toast");
    if (t) {
        if (toastTimer) clearTimeout(toastTimer);
        t.innerText = msg || "Action Successful!";
        t.classList.add("show");
        toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3000);
    }
}

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
function updateProgress(pct) { var el = document.getElementById("progressFill"); if (el) el.style.width = pct + "%"; }
function hideProgress() { setTimeout(function () { var el = document.getElementById("progressOverlay"); if (el) el.classList.add("hidden"); }, 200); }