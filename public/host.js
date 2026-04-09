// SKB host-stand UI — 3-tab layout (Waiting / Seated / Complete)
(function () {
    const $ = (id) => document.getElementById(id);
    const loginView = $('login-view');
    const queueView = $('queue-view');
    const loginForm = $('login-form');
    const loginError = $('login-error');
    const rows = $('rows');
    const diningRows = $('dining-rows');
    const completedRows = $('completed-rows');
    const countWaiting = $('count-waiting');
    const countDining = $('count-dining');
    const countOldest = $('count-oldest');
    const turnInput = $('turn');
    const logoutBtn = $('logout-btn');
    const statsCard = $('stats-card');
    const statsToggle = $('stats-toggle');
    const statsGrid = $('stats-grid');
    const statsEmpty = $('stats-empty');
    const statSeated = $('stat-seated');
    const statNoshows = $('stat-noshows');
    const statAvgWait = $('stat-avg-wait');
    const statPeak = $('stat-peak');
    const statTurnSet = $('stat-turn-set');
    const statTurnActual = $('stat-turn-actual');
    const statAvgOrder = $('stat-avg-order');
    const statAvgServe = $('stat-avg-serve');
    const statAvgCheckout = $('stat-avg-checkout');
    const statAvgTable = $('stat-avg-table');
    const tabBadgeWaiting = $('tab-badge-waiting');
    const tabBadgeSeated = $('tab-badge-seated');
    const tabBadgeComplete = $('tab-badge-complete');
    const completeSummary = $('complete-summary');

    let pollTimer = null;
    let expandedTimelineId = null;

    function fmtTime(iso) {
        try {
            return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch { return '\u2014'; }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    // -- Tab switching --
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            const content = $('tab-' + target);
            if (content) content.classList.add('active');
        });
    });

    async function checkAuth() {
        const r = await fetch('api/host/queue');
        return r.status !== 401;
    }

    // -- Waiting tab --
    async function refreshWaiting() {
        try {
            const r = await fetch('api/host/queue');
            if (r.status === 401) { showLogin(); return; }
            if (!r.ok) throw new Error('queue fetch failed');
            const data = await r.json();
            countWaiting.textContent = String(data.parties.length);
            countOldest.textContent = data.oldestWaitMinutes + 'm';
            turnInput.value = String(data.avgTurnTimeMinutes);
            tabBadgeWaiting.textContent = String(data.parties.length);
            if (data.parties.length === 0) {
                rows.innerHTML = '<tr><td colspan="7" class="empty">Nobody waiting.</td></tr>';
                return;
            }
            rows.innerHTML = data.parties.map(p => {
                const callsList = Array.isArray(p.calls) ? p.calls : [];
                const calledBadge = p.state === 'called'
                    ? (callsList.length > 0
                        ? ' ' + callsList.map((c, i) => {
                            const icon = c.smsStatus === 'sent' ? '\u2713' : (c.smsStatus === 'failed' ? '\u2717' : '');
                            return '<span class="badge-called">Call ' + (i + 1) + ': ' + c.minutesAgo + 'm ago' + (icon ? ' ' + icon : '') + '</span>';
                        }).join(' ')
                        : ' <span class="badge-called">CALLED</span>')
                    : '';
                const callLabel = p.state === 'called' ? 'Recall' : 'Call';
                return '<tr data-id="' + p.id + '" class="' + (p.state === 'called' ? 'row-called' : '') + '">' +
                    '<td class="num">' + p.position + '</td>' +
                    '<td>' + escapeHtml(p.name) + calledBadge + '</td>' +
                    '<td class="size">' + p.partySize + '</td>' +
                    '<td class="phone">' + (p.phoneMasked || '\u2014') + '</td>' +
                    '<td class="eta">' + fmtTime(p.etaAt) + '</td>' +
                    '<td class="wait">' + p.waitingMinutes + 'm</td>' +
                    '<td class="actions">' +
                        '<button class="call-btn" data-action="call">' + callLabel + '</button>' +
                        '<button class="remove" data-reason="seated">Seated</button>' +
                        '<button class="remove" data-reason="no_show">No-show</button>' +
                    '</td></tr>';
            }).join('');
        } catch (e) {
            console.error('refresh error', e);
        }
    }

    // -- Seated (Dining) tab --
    const NEXT_ACTION = {
        seated: { label: 'Ordered', state: 'ordered' },
        ordered: { label: 'Served', state: 'served' },
        served: { label: 'Checkout', state: 'checkout' },
        checkout: { label: 'Departed', state: 'departed' },
    };

    async function refreshDining() {
        try {
            const r = await fetch('api/host/dining');
            if (r.status === 401) return;
            if (!r.ok) return;
            const data = await r.json();
            countDining.textContent = String(data.diningCount);
            tabBadgeSeated.textContent = String(data.diningCount);
            if (data.parties.length === 0) {
                diningRows.innerHTML = '<tr><td colspan="6" class="empty">No dining parties.</td></tr>';
                return;
            }
            let html = '';
            for (const p of data.parties) {
                const next = NEXT_ACTION[p.state];
                const actions = next
                    ? '<button class="advance-btn" data-id="' + p.id + '" data-state="' + next.state + '">' + next.label + '</button>' +
                      (p.state !== 'checkout' ? '<button class="depart-btn" data-id="' + p.id + '" data-state="departed">Departed</button>' : '')
                    : '';
                html += '<tr class="expandable" data-dining-id="' + p.id + '">' +
                    '<td>' + escapeHtml(p.name) + '</td>' +
                    '<td class="size">' + p.partySize + '</td>' +
                    '<td><span class="state-badge state-' + p.state + '">' + p.state + '</span></td>' +
                    '<td>' + p.timeInStateMinutes + 'm</td>' +
                    '<td>' + p.totalTableMinutes + 'm</td>' +
                    '<td class="actions">' + actions + '</td>' +
                    '</tr>';
                // Timeline expansion row
                if (expandedTimelineId === p.id) {
                    html += '<tr class="timeline-row" data-timeline-for="' + p.id + '"><td colspan="6"><div class="timeline-detail" id="timeline-' + p.id + '">Loading...</div></td></tr>';
                }
            }
            diningRows.innerHTML = html;
            // Load timeline if expanded
            if (expandedTimelineId) {
                loadTimeline(expandedTimelineId);
            }
        } catch (e) {
            console.error('dining refresh error', e);
        }
    }

    // -- Complete tab --
    async function refreshCompleted() {
        try {
            const r = await fetch('api/host/completed');
            if (r.status === 401) return;
            if (!r.ok) return;
            const data = await r.json();
            tabBadgeComplete.textContent = String(data.parties.length);
            // Summary
            completeSummary.innerHTML =
                '<span>Served: <strong>' + data.totalServed + '</strong></span>' +
                '<span>No-shows: <strong>' + data.totalNoShows + '</strong></span>' +
                '<span>Avg Wait: <strong>' + (data.avgWaitMinutes != null ? data.avgWaitMinutes + 'm' : '\u2014') + '</strong></span>' +
                '<span>Avg Table: <strong>' + (data.avgTableOccupancyMinutes != null ? data.avgTableOccupancyMinutes + 'm' : '\u2014') + '</strong></span>';
            if (data.parties.length === 0) {
                completedRows.innerHTML = '<tr><td colspan="6" class="empty">No completed parties.</td></tr>';
                return;
            }
            let html = '';
            for (const p of data.parties) {
                html += '<tr class="expandable" data-completed-id="' + p.id + '">' +
                    '<td>' + escapeHtml(p.name) + '</td>' +
                    '<td class="size">' + p.partySize + '</td>' +
                    '<td><span class="state-badge state-' + p.state + '">' + p.state.replace('_', '-') + '</span></td>' +
                    '<td>' + p.waitTimeMinutes + 'm</td>' +
                    '<td>' + (p.tableTimeMinutes != null ? p.tableTimeMinutes + 'm' : '\u2014') + '</td>' +
                    '<td>' + p.totalTimeMinutes + 'm</td>' +
                    '</tr>';
                if (expandedTimelineId === p.id) {
                    html += '<tr class="timeline-row" data-timeline-for="' + p.id + '"><td colspan="6"><div class="timeline-detail" id="timeline-' + p.id + '">Loading...</div></td></tr>';
                }
            }
            completedRows.innerHTML = html;
            if (expandedTimelineId) {
                loadTimeline(expandedTimelineId);
            }
        } catch (e) {
            console.error('completed refresh error', e);
        }
    }

    // -- Timeline --
    async function loadTimeline(id) {
        const el = $('timeline-' + id);
        if (!el) return;
        try {
            const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/timeline');
            if (!r.ok) { el.textContent = 'Could not load timeline.'; return; }
            const tl = r.json ? await r.json() : {};
            const ts = tl.timestamps || {};
            const steps = [
                { label: 'Joined', time: ts.joinedAt },
                { label: 'Called', time: ts.calledAt },
                { label: 'Seated', time: ts.seatedAt },
                { label: 'Ordered', time: ts.orderedAt },
                { label: 'Served', time: ts.servedAt },
                { label: 'Checkout', time: ts.checkoutAt },
                { label: 'Departed', time: ts.departedAt },
            ].filter(s => s.time != null);
            if (steps.length === 0) {
                el.textContent = 'No timeline data.';
                return;
            }
            el.innerHTML = steps.map(s =>
                '<div class="timeline-step">' +
                    '<span class="timeline-dot"></span>' +
                    '<span class="timeline-label">' + s.label + '</span>' +
                    '<span class="timeline-time">' + fmtTime(s.time) + '</span>' +
                '</div>'
            ).join('');
        } catch (e) {
            if (el) el.textContent = 'Error loading timeline.';
        }
    }

    function toggleTimeline(id) {
        if (expandedTimelineId === id) {
            expandedTimelineId = null;
        } else {
            expandedTimelineId = id;
        }
        refreshDining();
        refreshCompleted();
    }

    // -- Stats --
    statsToggle.addEventListener('click', () => {
        statsCard.classList.toggle('collapsed');
        statsToggle.setAttribute('aria-expanded', String(!statsCard.classList.contains('collapsed')));
    });

    async function refreshStats() {
        try {
            const r = await fetch('api/host/stats');
            if (r.status === 401) return;
            if (!r.ok) return;
            const s = await r.json();
            const hasData = s.totalJoined > 0;
            statsGrid.style.display = hasData ? '' : 'none';
            statsEmpty.style.display = hasData ? 'none' : '';
            if (!hasData) return;
            statSeated.textContent = String(s.partiesSeated);
            statNoshows.textContent = String(s.noShows);
            statAvgWait.textContent = s.avgActualWaitMinutes != null ? s.avgActualWaitMinutes + 'm' : '\u2014';
            statPeak.textContent = s.peakHourLabel ?? '\u2014';
            statTurnSet.textContent = s.configuredTurnTime + 'm';
            statTurnActual.textContent = s.actualTurnTime != null ? s.actualTurnTime + 'm' : '\u2014';
            statAvgOrder.textContent = s.avgOrderTimeMinutes != null ? s.avgOrderTimeMinutes + 'm' : '\u2014';
            statAvgServe.textContent = s.avgServeTimeMinutes != null ? s.avgServeTimeMinutes + 'm' : '\u2014';
            statAvgCheckout.textContent = s.avgCheckoutTimeMinutes != null ? s.avgCheckoutTimeMinutes + 'm' : '\u2014';
            statAvgTable.textContent = s.avgTableOccupancyMinutes != null ? s.avgTableOccupancyMinutes + 'm' : '\u2014';
        } catch (e) {
            console.error('stats refresh error', e);
        }
    }

    // -- Event handlers --
    async function onRemove(id, reason) {
        const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
        });
        if (r.status === 401) { showLogin(); return; }
        refreshAll();
    }

    async function onCall(id) {
        const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/call', {
            method: 'POST',
        });
        if (r.status === 401) { showLogin(); return; }
        // Brief flash of SMS status on the row
        if (r.ok) {
            const body = await r.json().catch(() => ({}));
            const row = document.querySelector('tr[data-id="' + id + '"]');
            if (row && body.smsStatus) {
                const icon = body.smsStatus === 'sent' ? '\u2713 SMS sent' : (body.smsStatus === 'failed' ? '\u2717 SMS failed' : '');
                if (icon) {
                    const badge = document.createElement('span');
                    badge.className = 'badge-called';
                    badge.textContent = icon;
                    row.querySelector('td:nth-child(2)')?.appendChild(badge);
                }
            }
        }
        setTimeout(refreshAll, 800);
    }

    async function onAdvance(id, state) {
        const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
        });
        if (r.status === 401) { showLogin(); return; }
        refreshAll();
    }

    async function onTurnChange() {
        const n = Number(turnInput.value);
        await fetch('api/host/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avgTurnTimeMinutes: n }),
        });
        refreshAll();
    }

    // Waiting tab: delegate clicks
    rows.addEventListener('click', (e) => {
        const target = e.target;
        const callBtn = target.closest('button.call-btn');
        if (callBtn) {
            const id = callBtn.closest('tr')?.dataset.id;
            if (id) onCall(id);
            return;
        }
        const removeBtn = target.closest('button.remove');
        if (removeBtn) {
            const id = removeBtn.closest('tr')?.dataset.id;
            const reason = removeBtn.dataset.reason;
            if (id && reason) onRemove(id, reason);
        }
    });

    // Dining tab: delegate clicks
    diningRows.addEventListener('click', (e) => {
        const target = e.target;
        const advBtn = target.closest('button.advance-btn') || target.closest('button.depart-btn');
        if (advBtn) {
            e.stopPropagation();
            const id = advBtn.dataset.id;
            const state = advBtn.dataset.state;
            if (id && state) onAdvance(id, state);
            return;
        }
        // Click on row to toggle timeline
        const row = target.closest('tr[data-dining-id]');
        if (row) {
            toggleTimeline(row.dataset.diningId);
        }
    });

    // Completed tab: delegate clicks
    completedRows.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-completed-id]');
        if (row) {
            toggleTimeline(row.dataset.completedId);
        }
    });

    turnInput.addEventListener('change', onTurnChange);
    logoutBtn.addEventListener('click', async () => {
        await fetch('api/host/logout', { method: 'POST' });
        showLogin();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const pin = $('pin').value;
        const r = await fetch('api/host/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
        });
        if (r.ok) { showQueue(); return; }
        const body = await r.json().catch(() => ({}));
        loginError.textContent = body.error || 'Login failed';
        loginError.style.display = '';
    });

    function refreshAll() {
        refreshWaiting();
        refreshDining();
        refreshCompleted();
        refreshStats();
    }

    function showLogin() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        loginView.style.display = '';
        queueView.style.display = 'none';
    }

    function showQueue() {
        loginView.style.display = 'none';
        queueView.style.display = '';
        refreshAll();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refreshAll, 5000);
    }

    (async function boot() {
        if (await checkAuth()) showQueue(); else showLogin();
    })();
})();
