// ============================================================================
// SKB — Queue Display Board (TV-optimized polling client)
// ============================================================================
// Polls GET /api/queue/board every 5 seconds.
// On network failure, retains last-known data silently.
// ============================================================================

(function () {
    'use strict';

    const POLL_INTERVAL_MS = 5000;
    const CLOCK_INTERVAL_MS = 10000;

    const queueView = document.getElementById('queue-view');
    const emptyView = document.getElementById('empty-view');
    const queueGrid = document.getElementById('queue-grid');
    const totalCount = document.getElementById('total-count');
    const clockEl = document.getElementById('clock');

    /** Track previously known states so we can detect newly-called entries. */
    let previousStates = new Map();

    function updateClock() {
        if (!clockEl) return;
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    /**
     * Render board entries into the grid.
     * Avoids flicker by diffing against current DOM content.
     */
    function render(entries) {
        if (!queueGrid || !queueView || !emptyView || !totalCount) return;

        if (entries.length === 0) {
            queueView.style.display = 'none';
            emptyView.style.display = '';
            totalCount.textContent = '0';
            previousStates = new Map();
            return;
        }

        queueView.style.display = '';
        emptyView.style.display = 'none';
        totalCount.textContent = String(entries.length);

        // Build new state map for diffing
        const newStates = new Map();
        for (const e of entries) {
            newStates.set(e.code, e.state);
        }

        // Build HTML
        const html = entries
            .map(function (e) {
                const isCalled = e.state === 'called';
                const wasCalledBefore = previousStates.get(e.code) === 'called';
                // Only pulse if newly transitioned to called
                const pulseClass = isCalled && !wasCalledBefore ? ' newly-called' : '';
                const rowClass = 'entry' + (isCalled ? ' called' : '') + pulseClass;
                const statusClass = 'entry-status ' + e.state;
                const statusText = isCalled ? 'Called' : 'Waiting';
                return (
                    '<div class="' + rowClass + '">' +
                    '<div class="entry-pos">' + e.position + '</div>' +
                    '<div class="entry-code">' + escapeHtml(e.code) + '</div>' +
                    '<div class="' + statusClass + '">' + statusText + '</div>' +
                    '</div>'
                );
            })
            .join('');

        queueGrid.innerHTML = html;
        previousStates = newStates;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    async function poll() {
        try {
            var controller = new AbortController();
            var timeout = setTimeout(function () { controller.abort(); }, 4000);
            var res = await fetch('api/queue/board', { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                var entries = await res.json();
                render(entries);
            }
            // Non-ok responses: silently retain last data (R12)
        } catch (_err) {
            // Network error: silently retain last data (R12)
        }
    }

    // Initial render + clock
    updateClock();
    poll();

    // Start polling loops
    setInterval(poll, POLL_INTERVAL_MS);
    setInterval(updateClock, CLOCK_INTERVAL_MS);
})();
