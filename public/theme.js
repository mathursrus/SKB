// ============================================================================
// SKB — theme (light/dark) toggle
//
// Runs in <head> before paint so the right theme is applied with no flash.
// Source of truth:
//   - localStorage.skbTheme ('light' | 'dark' | 'auto' | null)
//   - If null or 'auto', follow prefers-color-scheme
// A single class `theme-dark` is applied to <html> when dark is active.
// `window.skbToggleTheme()` cycles: auto -> light -> dark -> auto.
// Any element with id="theme-toggle" gets a click handler + icon label.
// ============================================================================
(function () {
    var STORAGE_KEY = 'skbTheme';
    var root = document.documentElement;
    var mql = window.matchMedia('(prefers-color-scheme: dark)');

    function currentMode() {
        var saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        return saved === 'light' || saved === 'dark' ? saved : 'auto';
    }

    function isDark() {
        var m = currentMode();
        if (m === 'dark') return true;
        if (m === 'light') return false;
        return mql.matches;
    }

    function apply() {
        root.classList.toggle('theme-dark', isDark());
        root.setAttribute('data-theme-mode', currentMode());
        updateToggleLabel();
    }

    function updateToggleLabel() {
        var btn = document.getElementById('theme-toggle');
        if (!btn) return;
        var m = currentMode();
        // Show glyph for what's active; tooltip explains next-step.
        var dark = isDark();
        btn.textContent = m === 'auto' ? (dark ? '\u263D' : '\u2600') : (dark ? '\u263D' : '\u2600');
        btn.setAttribute('aria-label', 'Theme: ' + m + (m === 'auto' ? ' (' + (dark ? 'dark' : 'light') + ')' : '') + ' — click to change');
        btn.setAttribute('title', 'Theme: ' + m.charAt(0).toUpperCase() + m.slice(1) + (m === 'auto' ? ' · ' + (dark ? 'dark' : 'light') : '') + ' — click to change');
    }

    window.skbToggleTheme = function () {
        var m = currentMode();
        var next = m === 'auto' ? 'light' : (m === 'light' ? 'dark' : 'auto');
        try {
            if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, next);
        } catch (e) { /* ignore */ }
        apply();
    };

    // Apply immediately (we're in <head>, <body> may not exist yet).
    apply();

    // Re-apply when OS preference changes (only if in auto mode).
    try {
        mql.addEventListener('change', function () { if (currentMode() === 'auto') apply(); });
    } catch (e) {
        // Safari <14: fallback
        if (mql.addListener) mql.addListener(function () { if (currentMode() === 'auto') apply(); });
    }

    // Wire up toggle button after DOMContentLoaded.
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('theme-toggle');
        if (btn) btn.addEventListener('click', window.skbToggleTheme);
        updateToggleLabel();
    });
})();
