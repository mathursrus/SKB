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
        // Several pages (host login + topbar, admin, diner) ship a toggle;
        // update every button that identifies itself as a theme toggle.
        var buttons = document.querySelectorAll('#theme-toggle, [data-theme-toggle], .theme-toggle-btn');
        if (!buttons.length) return;
        var m = currentMode();
        var dark = isDark();
        var glyph = dark ? '\u263D' : '\u2600';
        var aria = 'Theme: ' + m + (m === 'auto' ? ' (' + (dark ? 'dark' : 'light') + ')' : '') + ' — click to change';
        var title = 'Theme: ' + m.charAt(0).toUpperCase() + m.slice(1) + (m === 'auto' ? ' · ' + (dark ? 'dark' : 'light') : '') + ' — click to change';
        buttons.forEach(function (btn) {
            btn.textContent = glyph;
            btn.setAttribute('aria-label', aria);
            btn.setAttribute('title', title);
        });
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

    // Wire up every toggle button on the page (login card + post-login topbar
    // on host.html both ship one; diner + admin have their own).
    document.addEventListener('DOMContentLoaded', function () {
        var buttons = document.querySelectorAll('#theme-toggle, [data-theme-toggle], .theme-toggle-btn');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', window.skbToggleTheme);
        });
        updateToggleLabel();
    });
})();
