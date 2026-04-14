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
    const etaModeSelect = $('eta-mode');
    const turnInfo = $('turn-info');
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
            // turnInput value is owned by refreshSettings() — don't overwrite from the queue payload
            // (the queue payload returns the effective minutes, not the manual value).
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
                const notifyLabel = p.state === 'called' ? 'Re-notify' : 'Notify';
                const hasPhone = !!p.phoneMasked && p.phoneMasked !== '—';
                const disabledAttr = hasPhone ? '' : ' disabled';
                const onWayBadge = p.onMyWayAt
                    ? ' <span class="badge-on-way">On the way</span>'
                    : '';
                const unread = Number(p.unreadChat || 0);
                const unreadDot = unread > 0 ? '<span class="unread-dot" aria-label="' + unread + ' unread">' + unread + '</span>' : '';
                const safeName = escapeHtml(p.name);
                const callHref = hasPhone && p.phoneForDial ? 'tel:' + p.phoneForDial : '#';
                const callDisabled = hasPhone ? '' : ' aria-disabled="true"';
                const phoneForDial = p.phoneForDial || '';
                return '<tr data-id="' + p.id + '" data-code="' + escapeHtml(p.code || '') + '" data-name="' + safeName + '" data-size="' + p.partySize + '" data-wait="' + p.waitingMinutes + '" data-phone-mask="' + (p.phoneMasked || '') + '" data-phone-dial="' + escapeHtml(phoneForDial) + '" class="' + (p.state === 'called' ? 'row-called' : '') + '">' +
                    '<td class="num">' + p.position + '</td>' +
                    '<td>' + safeName + calledBadge + onWayBadge + '</td>' +
                    '<td class="size">' + p.partySize + '</td>' +
                    '<td class="phone">' + (p.phoneMasked || '\u2014') + '</td>' +
                    '<td class="eta">' + fmtTime(p.etaAt) + '</td>' +
                    '<td class="wait">' + p.waitingMinutes + 'm</td>' +
                    '<td class="actions">' +
                        '<button class="seat-btn" data-action="seat" aria-label="Seat ' + safeName + '">Seat</button>' +
                        '<button class="notify-btn" data-action="notify" aria-label="' + notifyLabel + ' ' + safeName + '"' + disabledAttr + '>' + notifyLabel + '</button>' +
                        '<button class="chat-btn" data-action="chat" aria-label="Chat with ' + safeName + (unread ? ', ' + unread + ' unread' : '') + '"' + disabledAttr + '>Chat' + unreadDot + '</button>' +
                        '<a class="call-dial-btn rowbtn" data-action="call" href="' + callHref + '" aria-label="Call ' + safeName + '"' + callDisabled + '>Call</a>' +
                        '<button class="custom-sms-btn more-btn" data-action="custom-sms" aria-label="Custom message to ' + safeName + '"' + disabledAttr + ' title="Custom message">\u2709</button>' +
                        '<button class="custom-call-btn more-btn" data-action="custom-call" aria-label="Confirm-and-call ' + safeName + '"' + disabledAttr + ' title="Confirm call">\u260E</button>' +
                        '<button class="remove" data-reason="no_show" aria-label="Mark ' + safeName + ' as no-show">No-show</button>' +
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
                diningRows.innerHTML = '<tr><td colspan="7" class="empty">No dining parties.</td></tr>';
                return;
            }
            let html = '';
            for (const p of data.parties) {
                const next = NEXT_ACTION[p.state];
                const actions = next
                    ? '<button class="advance-btn" data-id="' + p.id + '" data-state="' + next.state + '">' + next.label + '</button>' +
                      (p.state !== 'checkout' ? '<button class="depart-btn" data-id="' + p.id + '" data-state="departed">Departed</button>' : '')
                    : '';
                const tbl = (typeof p.tableNumber === 'number') ? String(p.tableNumber) : '\u2014';
                html += '<tr class="expandable" data-dining-id="' + p.id + '">' +
                    '<td class="table-num"><strong>' + tbl + '</strong></td>' +
                    '<td>' + escapeHtml(p.name) + '</td>' +
                    '<td class="size">' + p.partySize + '</td>' +
                    '<td><span class="state-badge state-' + p.state + '">' + p.state + '</span></td>' +
                    '<td>' + p.timeInStateMinutes + 'm</td>' +
                    '<td>' + p.totalTableMinutes + 'm</td>' +
                    '<td class="actions">' + actions + '</td>' +
                    '</tr>';
                // Timeline expansion row
                if (expandedTimelineId === p.id) {
                    html += '<tr class="timeline-row" data-timeline-for="' + p.id + '"><td colspan="7"><div class="timeline-detail" id="timeline-' + p.id + '">Loading...</div></td></tr>';
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

    // -- Visit page admin (door QR routing) --
    const visitCard = $('visit-card');
    const visitToggle = $('visit-toggle');
    const visitModeBadge = $('visit-mode-badge');
    const visitModeSelect = $('visit-mode-select');
    const visitMenuUrl = $('visit-menu-url');
    const visitClosedMessage = $('visit-closed-message');
    const visitSaveBtn = $('visit-save');
    const visitStatus = $('visit-status');
    const visitUrlEl = $('visit-url');

    if (visitToggle && visitCard) {
        visitToggle.addEventListener('click', () => {
            visitCard.classList.toggle('collapsed');
            visitToggle.setAttribute('aria-expanded', String(!visitCard.classList.contains('collapsed')));
        });
    }

    function setVisitModeBadge(mode) {
        if (!visitModeBadge) return;
        visitModeBadge.textContent = mode || 'auto';
        visitModeBadge.className = 'visit-mode-badge mode-' + (mode || 'auto');
    }

    async function refreshVisitConfig() {
        if (!visitModeSelect) return;
        try {
            const r = await fetch('api/host/visit-config');
            if (r.status === 401) return;
            if (!r.ok) return;
            const s = await r.json();
            visitModeSelect.value = s.visitMode || 'auto';
            visitMenuUrl.value = s.menuUrl || '';
            visitClosedMessage.value = s.closedMessage || '';
            setVisitModeBadge(s.visitMode || 'auto');
            // Build the absolute /r/:loc/visit URL for the help text. Strip
            // any trailing slash, append /r/<loc>/visit.
            const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
            visitUrlEl.textContent = `${window.location.origin}/r/${loc}/visit`;
        } catch {
            // non-blocking
        }
    }

    function setVisitStatus(text, kind) {
        if (!visitStatus) return;
        visitStatus.textContent = text;
        visitStatus.className = 'visit-status' + (kind ? ' ' + kind : '');
        if (kind === 'success') {
            setTimeout(() => {
                if (visitStatus.textContent === text) {
                    visitStatus.textContent = '';
                    visitStatus.className = 'visit-status';
                }
            }, 2500);
        }
    }

    if (visitSaveBtn) {
        visitSaveBtn.addEventListener('click', async () => {
            visitSaveBtn.disabled = true;
            const oldLabel = visitSaveBtn.textContent;
            visitSaveBtn.textContent = 'Saving…';
            setVisitStatus('', '');
            try {
                const r = await fetch('api/host/visit-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        visitMode: visitModeSelect.value,
                        menuUrl: visitMenuUrl.value.trim() || null,
                        closedMessage: visitClosedMessage.value.trim() || null,
                    }),
                });
                if (r.status === 401) { showLogin(); return; }
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    setVisitStatus(err.error || 'Save failed', 'error');
                    return;
                }
                const updated = await r.json();
                setVisitModeBadge(updated.visitMode || 'auto');
                setVisitStatus('Saved \u2713', 'success');
            } catch {
                setVisitStatus('Network error', 'error');
            } finally {
                visitSaveBtn.disabled = false;
                visitSaveBtn.textContent = oldLabel;
            }
        });
    }

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
    async function onRemove(id, reason, extra) {
        const body = Object.assign({ reason }, extra || {});
        const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (r.status === 401) { showLogin(); return { ok: false }; }
        if (r.status === 409) {
            return { ok: false, conflict: await r.json().catch(() => ({})) };
        }
        if (!r.ok) {
            return { ok: false };
        }
        refreshAll();
        return { ok: true };
    }

    // R11: non-blocking call-log ping (frontend triggers the tel: dial itself).
    async function onCallLog(id) {
        try {
            await fetch('api/host/queue/' + encodeURIComponent(id) + '/call-log', { method: 'POST' });
        } catch { /* non-blocking */ }
    }

    async function onNotify(id) {
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

    // ========================================================================
    // R14/R15: Seat Party dialog
    // ========================================================================
    const seatDialog = document.getElementById('seat-dialog');
    const seatForm = document.getElementById('seat-form');
    const seatInput = document.getElementById('seat-table-input');
    const seatConfirmBtn = document.getElementById('seat-dialog-confirm');
    const seatAlert = document.getElementById('seat-dialog-alert');
    const seatChips = document.getElementById('seat-dialog-chips');
    const seatPartyName = document.getElementById('seat-party-name');
    const seatPartySize = document.getElementById('seat-party-size');
    const seatPartyWaiting = document.getElementById('seat-party-waiting');
    const seatCancelBtn = document.getElementById('seat-dialog-cancel');
    const seatCloseBtn = document.getElementById('seat-dialog-close');
    let seatCurrentPartyId = null;
    let seatOverride = false;

    function setSeatConfirmLabel() {
        if (!seatConfirmBtn || !seatInput) return;
        const v = seatInput.value.trim();
        seatConfirmBtn.textContent = v ? ('Seat at table ' + v) : 'Seat at table —';
        seatConfirmBtn.disabled = v.length === 0;
    }

    async function loadRecentTables() {
        if (!seatChips) return;
        try {
            // Recent table picks are derived from the Seated tab payload — no extra API call needed.
            const r = await fetch('api/host/dining');
            if (!r.ok) { seatChips.innerHTML = ''; return; }
            const data = await r.json();
            const occupied = new Set();
            for (const p of (data.parties || [])) {
                if (typeof p.tableNumber === 'number') occupied.add(p.tableNumber);
            }
            // Quick-pick chips: the 5 most recently seated tables, plus 3 small unused ones.
            const chips = Array.from(occupied).slice(0, 5);
            const out = [];
            for (const n of chips) {
                out.push('<button type="button" class="chip chip-occupied" data-val="' + n + '" disabled aria-label="Table ' + n + ' occupied">' + n + '</button>');
            }
            seatChips.innerHTML = out.join('');
        } catch { seatChips.innerHTML = ''; }
    }

    function openSeatDialog(partyId, partyName, partySize, waitingMinutes) {
        if (!seatDialog) return;
        seatCurrentPartyId = partyId;
        seatOverride = false;
        seatPartyName.textContent = partyName;
        seatPartySize.textContent = String(partySize);
        seatPartyWaiting.textContent = waitingMinutes + 'm';
        seatInput.value = '';
        seatAlert.style.display = 'none';
        seatAlert.textContent = '';
        setSeatConfirmLabel();
        loadRecentTables();
        if (typeof seatDialog.showModal === 'function') {
            seatDialog.showModal();
        } else {
            seatDialog.setAttribute('open', '');
        }
        setTimeout(() => seatInput.focus(), 0);
    }

    function closeSeatDialog() {
        if (!seatDialog) return;
        if (typeof seatDialog.close === 'function') seatDialog.close();
        else seatDialog.removeAttribute('open');
        seatCurrentPartyId = null;
    }

    if (seatInput) {
        seatInput.addEventListener('input', () => {
            seatAlert.style.display = 'none';
            setSeatConfirmLabel();
        });
    }
    if (seatChips) {
        seatChips.addEventListener('click', (e) => {
            const btn = e.target.closest('button.chip');
            if (!btn || btn.disabled) return;
            seatInput.value = btn.dataset.val;
            seatAlert.style.display = 'none';
            setSeatConfirmLabel();
            seatInput.focus();
        });
    }
    if (seatCancelBtn) seatCancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeSeatDialog(); });
    if (seatCloseBtn) seatCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeSeatDialog(); });
    let seatSubmitting = false;
    if (seatForm) {
        seatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Debounce double-clicks — the state guard on the backend would
            // harmlessly 404 the second request, but disabling the button
            // locally avoids the brief "in flight" window where nothing looks
            // like it's happening.
            if (seatSubmitting) return;
            if (!seatCurrentPartyId) { closeSeatDialog(); return; }
            const n = Number(seatInput.value.trim());
            if (!Number.isInteger(n) || n < 1 || n > 999) {
                seatAlert.textContent = 'Table # must be an integer 1..999';
                seatAlert.style.display = '';
                return;
            }
            seatSubmitting = true;
            seatConfirmBtn.disabled = true;
            const oldLabel = seatConfirmBtn.textContent;
            seatConfirmBtn.textContent = 'Seating…';
            try {
                const result = await onRemove(seatCurrentPartyId, 'seated', { tableNumber: n, override: seatOverride });
                if (result && result.conflict) {
                    seatAlert.innerHTML = 'Table <strong>' + n + '</strong> is occupied by <strong>'
                        + escapeHtml(result.conflict.occupiedBy || 'another party') + '</strong>. '
                        + '<button type="button" id="seat-override" class="override-btn">Seat anyway</button>';
                    seatAlert.style.display = '';
                    const overrideBtn = document.getElementById('seat-override');
                    if (overrideBtn) {
                        overrideBtn.addEventListener('click', async () => {
                            if (seatSubmitting) return;
                            seatSubmitting = true;
                            overrideBtn.disabled = true;
                            try {
                                seatOverride = true;
                                const retry = await onRemove(seatCurrentPartyId, 'seated', { tableNumber: n, override: true });
                                if (retry && retry.ok) closeSeatDialog();
                            } finally {
                                seatSubmitting = false;
                            }
                        });
                    }
                    return;
                }
                if (result && result.ok) closeSeatDialog();
            } finally {
                seatSubmitting = false;
                seatConfirmBtn.disabled = false;
                seatConfirmBtn.textContent = oldLabel;
            }
        });
    }

    // ========================================================================
    // R10: Chat drawer
    // ========================================================================
    const chatDrawer = document.getElementById('chat-drawer');
    const chatBackdrop = document.getElementById('chat-drawer-backdrop');
    const chatThread = document.getElementById('chat-drawer-thread');
    const chatQuicks = document.getElementById('chat-drawer-quicks');
    const chatInput = document.getElementById('chat-drawer-input');
    const chatForm = document.getElementById('chat-drawer-form');
    const chatTitle = document.getElementById('chat-drawer-title');
    const chatPhone = document.getElementById('chat-drawer-phone');
    const chatCloseBtn = document.getElementById('chat-drawer-close');
    let chatOpenId = null;
    let chatOpenCode = null;

    function renderChatThread(messages) {
        if (!chatThread) return;
        if (!Array.isArray(messages) || messages.length === 0) {
            chatThread.innerHTML = '<div class="chat-empty">No messages yet.</div>';
            return;
        }
        chatThread.innerHTML = messages.map((m) => {
            const klass = m.direction === 'outbound' ? 'chat-msg chat-msg-out' : 'chat-msg chat-msg-in';
            const ts = m.at ? fmtTime(m.at) : '';
            const statusIcon = m.smsStatus === 'failed' ? ' <span class="chat-status-fail">\u2717</span>'
                : m.smsStatus === 'sent' ? ' <span class="chat-status-ok">\u2713</span>' : '';
            return '<div class="' + klass + '">' + escapeHtml(m.body) + '<span class="chat-ts">' + ts + statusIcon + '</span></div>';
        }).join('');
        // scroll to bottom on initial render
        chatThread.scrollTop = chatThread.scrollHeight;
    }

    async function loadChatThread(id) {
        try {
            const r = await fetch('api/host/queue/' + encodeURIComponent(id) + '/chat');
            if (!r.ok) { renderChatThread([]); return; }
            const thread = await r.json();
            renderChatThread(thread.messages || []);
        } catch { renderChatThread([]); }
    }

    async function markChatRead(id) {
        try {
            await fetch('api/host/queue/' + encodeURIComponent(id) + '/chat/read', { method: 'PATCH' });
        } catch { /* non-blocking */ }
    }

    async function loadQuickReplies(code) {
        if (!chatQuicks) return;
        if (!code) { chatQuicks.innerHTML = ''; return; }
        try {
            const r = await fetch('api/host/chat/templates?code=' + encodeURIComponent(code));
            if (!r.ok) { chatQuicks.innerHTML = ''; return; }
            const t = await r.json();
            chatQuicks.innerHTML = [
                '<button type="button" data-q="' + encodeURIComponent(t.almostReady) + '">Table almost ready</button>',
                '<button type="button" data-q="' + encodeURIComponent(t.needMoreTime) + '">Need 5 more minutes?</button>',
                '<button type="button" data-q="' + encodeURIComponent(t.lostYou) + '">We lost you</button>',
            ].join('');
        } catch { chatQuicks.innerHTML = ''; }
    }

    function openChat(id, name, phoneMasked, code) {
        if (!chatDrawer) return;
        chatOpenId = id;
        chatOpenCode = code;
        chatTitle.textContent = name;
        chatPhone.textContent = phoneMasked || '';
        chatThread.innerHTML = '<div class="chat-empty">Loading…</div>';
        chatDrawer.classList.add('open');
        chatDrawer.setAttribute('aria-hidden', 'false');
        if (chatBackdrop) chatBackdrop.classList.add('open');
        loadChatThread(id).then(() => markChatRead(id).then(refreshWaiting));
        loadQuickReplies(code);
        setTimeout(() => chatInput && chatInput.focus(), 0);
    }

    function closeChat() {
        if (!chatDrawer) return;
        chatDrawer.classList.remove('open');
        chatDrawer.setAttribute('aria-hidden', 'true');
        if (chatBackdrop) chatBackdrop.classList.remove('open');
        chatOpenId = null;
    }

    if (chatCloseBtn) chatCloseBtn.addEventListener('click', closeChat);
    if (chatBackdrop) chatBackdrop.addEventListener('click', closeChat);
    if (chatQuicks) {
        chatQuicks.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-q]');
            if (!b || !chatInput) return;
            chatInput.value = decodeURIComponent(b.dataset.q || '');
            chatInput.focus();
        });
    }
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!chatOpenId || !chatInput) return;
            const body = chatInput.value.trim();
            if (!body) return;
            chatInput.value = '';
            try {
                await fetch('api/host/queue/' + encodeURIComponent(chatOpenId) + '/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body }),
                });
            } catch { /* non-blocking */ }
            await loadChatThread(chatOpenId);
        });
    }

    // ========================================================================
    // Custom SMS (one-off free-text compose) + Custom Call (confirm dialer)
    // ========================================================================
    const customSmsDialog = document.getElementById('custom-sms-dialog');
    const customSmsForm = document.getElementById('custom-sms-form');
    const customSmsBody = document.getElementById('custom-sms-body');
    const customSmsSendBtn = document.getElementById('custom-sms-send');
    const customSmsToName = document.getElementById('custom-sms-to-name');
    const customSmsToPhone = document.getElementById('custom-sms-to-phone');
    const customSmsAlert = document.getElementById('custom-sms-alert');
    const customSmsCharCount = document.getElementById('custom-sms-charcount');
    const customSmsCancel = document.getElementById('custom-sms-cancel');
    const customSmsCloseBtn = document.getElementById('custom-sms-close');
    let customSmsTargetId = null;
    let customSmsSubmitting = false;

    function openCustomSms(id, name, phoneMasked) {
        if (!customSmsDialog) return;
        customSmsTargetId = id;
        customSmsToName.textContent = name;
        customSmsToPhone.textContent = phoneMasked || '';
        customSmsBody.value = '';
        customSmsCharCount.textContent = '0';
        customSmsSendBtn.disabled = true;
        customSmsAlert.style.display = 'none';
        customSmsAlert.textContent = '';
        if (typeof customSmsDialog.showModal === 'function') customSmsDialog.showModal();
        else customSmsDialog.setAttribute('open', '');
        setTimeout(() => customSmsBody.focus(), 0);
    }

    function closeCustomSms() {
        if (!customSmsDialog) return;
        if (typeof customSmsDialog.close === 'function') customSmsDialog.close();
        else customSmsDialog.removeAttribute('open');
        customSmsTargetId = null;
    }

    if (customSmsBody) {
        customSmsBody.addEventListener('input', () => {
            const len = customSmsBody.value.length;
            customSmsCharCount.textContent = String(len);
            customSmsSendBtn.disabled = customSmsBody.value.trim().length === 0;
        });
    }
    if (customSmsCancel) customSmsCancel.addEventListener('click', (e) => { e.preventDefault(); closeCustomSms(); });
    if (customSmsCloseBtn) customSmsCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeCustomSms(); });
    if (customSmsForm) {
        customSmsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (customSmsSubmitting || !customSmsTargetId) return;
            const body = customSmsBody.value.trim();
            if (!body) {
                customSmsAlert.textContent = 'Message cannot be empty.';
                customSmsAlert.style.display = '';
                return;
            }
            customSmsSubmitting = true;
            customSmsSendBtn.disabled = true;
            const oldLabel = customSmsSendBtn.textContent;
            customSmsSendBtn.textContent = 'Sending…';
            try {
                const r = await fetch('api/host/queue/' + encodeURIComponent(customSmsTargetId) + '/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body }),
                });
                if (r.status === 401) { showLogin(); return; }
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    customSmsAlert.textContent = err.error || 'Send failed.';
                    customSmsAlert.style.display = '';
                    return;
                }
                closeCustomSms();
                // Refresh host list so unread / delivery-status icons update.
                refreshWaiting();
            } catch {
                customSmsAlert.textContent = 'Network error. Try again.';
                customSmsAlert.style.display = '';
            } finally {
                customSmsSubmitting = false;
                customSmsSendBtn.disabled = false;
                customSmsSendBtn.textContent = oldLabel;
            }
        });
    }

    const customCallDialog = document.getElementById('custom-call-dialog');
    const customCallToName = document.getElementById('custom-call-to-name');
    const customCallToPhone = document.getElementById('custom-call-to-phone');
    const customCallConfirm = document.getElementById('custom-call-confirm');
    const customCallCancel = document.getElementById('custom-call-cancel');
    const customCallCloseBtn = document.getElementById('custom-call-close');
    let customCallTargetId = null;

    function openCustomCall(id, name, phoneMasked, phoneDial) {
        if (!customCallDialog) return;
        customCallTargetId = id;
        customCallToName.textContent = name;
        customCallToPhone.textContent = phoneMasked || '';
        if (phoneDial) {
            customCallConfirm.setAttribute('href', 'tel:' + phoneDial);
            customCallConfirm.removeAttribute('aria-disabled');
        } else {
            customCallConfirm.setAttribute('href', '#');
            customCallConfirm.setAttribute('aria-disabled', 'true');
        }
        if (typeof customCallDialog.showModal === 'function') customCallDialog.showModal();
        else customCallDialog.setAttribute('open', '');
    }

    function closeCustomCall() {
        if (!customCallDialog) return;
        if (typeof customCallDialog.close === 'function') customCallDialog.close();
        else customCallDialog.removeAttribute('open');
        customCallTargetId = null;
    }

    if (customCallCancel) customCallCancel.addEventListener('click', (e) => { e.preventDefault(); closeCustomCall(); });
    if (customCallCloseBtn) customCallCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeCustomCall(); });
    if (customCallConfirm) {
        customCallConfirm.addEventListener('click', (e) => {
            if (customCallConfirm.getAttribute('aria-disabled') === 'true') {
                e.preventDefault();
                return;
            }
            if (customCallTargetId) onCallLog(customCallTargetId);
            // Let the browser handle the tel: navigation, then dismiss
            setTimeout(closeCustomCall, 100);
        });
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
        await refreshSettings();
        refreshAll();
    }

    async function onEtaModeChange() {
        const mode = etaModeSelect.value;
        await fetch('api/host/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ etaMode: mode }),
        });
        await refreshSettings();
        refreshAll();
    }

    async function refreshSettings() {
        try {
            const r = await fetch('api/host/settings');
            if (!r.ok) return;
            const s = await r.json();

            // Dynamic is "available" when the backend computed a real median
            // (i.e., sample >= MIN_DYNAMIC_SAMPLE and the query returned data).
            const dynamicAvailable = typeof s.dynamicMinutes === 'number';
            const dynamicOption = etaModeSelect.querySelector('option[value="dynamic"]');
            dynamicOption.hidden = !dynamicAvailable;

            // If the stored mode is dynamic but data isn't available, fall through
            // to the manual display. The server-side preference is preserved; the UI
            // just reflects what's currently effective.
            const showDynamic = s.etaMode === 'dynamic' && dynamicAvailable;

            if (showDynamic) {
                // Show the computed median in a read-only view.
                etaModeSelect.value = 'dynamic';
                turnInput.value = String(s.effectiveMinutes);
                turnInput.readOnly = true;
                turnInfo.textContent = '(median of ' + s.sampleSize + ' recent parties)';
                turnInfo.style.display = '';
            } else {
                // Manual mode — editable input showing the stored manual value.
                etaModeSelect.value = 'manual';
                turnInput.value = String(s.avgTurnTimeMinutes);
                turnInput.readOnly = false;
                turnInfo.style.display = 'none';
            }
        } catch {
            // non-blocking
        }
    }

    // Waiting tab: delegate clicks
    rows.addEventListener('click', (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;
        const id = tr.dataset.id;
        if (!id) return;

        // R14: Seat opens dialog (not direct submit)
        const seatBtn = target.closest('button.seat-btn');
        if (seatBtn) {
            openSeatDialog(id, tr.dataset.name || '', Number(tr.dataset.size) || 0, Number(tr.dataset.wait) || 0);
            return;
        }
        // Notify (existing backend /call path) — formerly "Call"
        const notifyBtn = target.closest('button.notify-btn');
        if (notifyBtn) {
            if (notifyBtn.hasAttribute('disabled')) return;
            onNotify(id);
            return;
        }
        // R10: Chat opens drawer
        const chatBtn = target.closest('button.chat-btn');
        if (chatBtn) {
            if (chatBtn.hasAttribute('disabled')) return;
            openChat(id, tr.dataset.name || '', tr.dataset.phoneMask || '', tr.dataset.code || '');
            return;
        }
        // R11: Call is an anchor — log the dial but let the browser handle tel:
        const callAnchor = target.closest('a.call-dial-btn');
        if (callAnchor) {
            if (callAnchor.getAttribute('aria-disabled') === 'true') {
                e.preventDefault();
                return;
            }
            onCallLog(id);
            return;
        }
        // Custom SMS — opens a one-off compose modal (distinct from the
        // Chat drawer which carries the persistent thread context).
        const customSmsBtn = target.closest('button.custom-sms-btn');
        if (customSmsBtn) {
            if (customSmsBtn.hasAttribute('disabled')) return;
            openCustomSms(id, tr.dataset.name || '', tr.dataset.phoneMask || '');
            return;
        }
        // Custom Call — opens a confirm-before-dial modal (safer on a
        // shared device where accidental taps would otherwise auto-dial).
        const customCallBtn = target.closest('button.custom-call-btn');
        if (customCallBtn) {
            if (customCallBtn.hasAttribute('disabled')) return;
            openCustomCall(id, tr.dataset.name || '', tr.dataset.phoneMask || '', tr.dataset.phoneDial || '');
            return;
        }
        // No-show — still a direct remove
        const removeBtn = target.closest('button.remove');
        if (removeBtn) {
            const reason = removeBtn.dataset.reason;
            if (reason === 'no_show') onRemove(id, reason);
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
    etaModeSelect.addEventListener('change', onEtaModeChange);
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
        refreshSettings();
        refreshVisitConfig();
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
