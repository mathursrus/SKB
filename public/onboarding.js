// ============================================================================
// Owner onboarding wizard — client (issue #54, spec §6.2)
// ============================================================================
//
// Runs on /r/:loc/admin.html.
//
//   - On admin-view visible, GET /r/:loc/api/onboarding/steps to see what's
//     done. If all 4 are done, don't surface anything. If any is missing,
//     show the overlay (unless the user dismissed it for this session).
//   - Mark-complete buttons POST /r/:loc/api/onboarding/steps {step}.
//   - Dismiss hides the overlay + flips the "Setup" pill visible.
//   - Clicking the pill re-opens the overlay.
//
// The script is isolated from admin.js so admin.js stays focused on its
// existing concerns. It keys off the admin-view visibility (mutation
// observer) rather than coupling to admin.js boot order.
// ============================================================================

(function () {
    'use strict';

    var SESSION_KEY = 'skb-onboarding-dismissed';
    var STEP_IDS = ['basics', 'template', 'menu', 'staff'];

    function $(id) { return document.getElementById(id); }

    // Base path for the API. /r/:loc/admin.html serves this from the same
    // per-location scope, so relative "api/..." resolves correctly.
    function apiUrl(path) {
        return 'api/onboarding/' + path;
    }

    var overlay = $('onboarding-overlay');
    var modalBody = overlay && overlay.querySelector('.onboarding-modal');
    var pill = $('onboarding-reopen');
    var progressLabel = $('onboarding-progress');
    var stepsList = $('onboarding-steps-list');
    var dismiss1 = $('onboarding-dismiss');
    var dismiss2 = $('onboarding-dismiss-2');

    if (!overlay || !pill || !stepsList) return;

    function isDismissedThisSession() {
        try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
    }
    function rememberDismissed() {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* storage blocked; fine */ }
    }

    function renderState(state) {
        var steps = (state && state.steps) || [];
        var doneSet = {};
        steps.forEach(function (s) { doneSet[s] = true; });
        var doneCount = 0;
        STEP_IDS.forEach(function (id) { if (doneSet[id]) doneCount += 1; });
        if (progressLabel) progressLabel.textContent = doneCount + ' of ' + STEP_IDS.length + ' complete';
        Array.prototype.forEach.call(stepsList.querySelectorAll('.onboarding-step'), function (li) {
            var step = li.getAttribute('data-step');
            var done = !!doneSet[step];
            li.classList.toggle('done', done);
            var btn = li.querySelector('.onboarding-done');
            if (btn) {
                btn.disabled = done;
                btn.textContent = done ? 'Done' : (step === 'menu' || step === 'staff' ? 'Skip for now' : 'Mark complete');
            }
        });
        // Auto-hide if all steps are done and this isn't the initial "welcome"
        // show — leaves the user with a clear success state on the last click.
        return doneCount >= STEP_IDS.length;
    }

    function showOverlay() { overlay.style.display = 'flex'; pill.style.display = 'none'; }
    function hideOverlay(allDone) {
        overlay.style.display = 'none';
        // Only show the pill if work remains. Fully done → hide both.
        pill.style.display = allDone ? 'none' : '';
    }

    async function fetchState() {
        try {
            var res = await fetch(apiUrl('steps'), { credentials: 'same-origin' });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    }
    async function markStep(step) {
        try {
            var res = await fetch(apiUrl('steps'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ step: step }),
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    }

    async function refresh() {
        var state = await fetchState();
        if (!state) return;
        var allDone = renderState(state);
        if (allDone) {
            // Everything done → hide pill + overlay. Respect the user's
            // previous dismissal so we don't auto-reopen.
            hideOverlay(true);
            return;
        }
        if (isDismissedThisSession()) {
            // Show pill so they can re-open.
            hideOverlay(false);
        } else {
            showOverlay();
        }
    }

    // Wire up the mark-complete buttons.
    stepsList.addEventListener('click', async function (ev) {
        var target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('onboarding-done')) {
            ev.preventDefault();
            var step = target.getAttribute('data-step');
            if (!step) return;
            target.disabled = true;
            target.textContent = 'Saving\u2026';
            var state = await markStep(step);
            if (state) {
                var allDone = renderState(state);
                if (allDone) {
                    // Leave the overlay visible briefly so they see the
                    // final check, then hide.
                    setTimeout(function () { hideOverlay(true); }, 900);
                }
            } else {
                target.disabled = false;
                target.textContent = 'Mark complete';
            }
        }
    });

    function handleDismiss() { rememberDismissed(); hideOverlay(false); }
    if (dismiss1) dismiss1.addEventListener('click', handleDismiss);
    if (dismiss2) dismiss2.addEventListener('click', handleDismiss);
    pill.addEventListener('click', function () {
        // Clicking the pill re-opens; clear the session flag so a reload
        // from this device keeps showing work-in-progress.
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
        showOverlay();
    });

    // Watch for admin-view becoming visible, then refresh state. admin.js
    // swaps `display: none` ↔ `display: ''` on boot / login.
    var adminView = $('admin-view');
    if (!adminView) return;

    function onVisible() {
        if (adminView.style.display !== 'none') {
            refresh();
        }
    }
    if (adminView.style.display !== 'none') {
        // Already visible (e.g. cookie auth already gated in).
        refresh();
    }
    var mo = new MutationObserver(onVisible);
    mo.observe(adminView, { attributes: true, attributeFilter: ['style'] });
})();
