(function () {
    const $ = (id) => document.getElementById(id);
    const loginView = $('admin-login-view');
    const adminView = $('admin-view');
    const loginForm = $('admin-login-form');
    const loginError = $('admin-login-error');
    const logoutBtn = $('admin-logout-btn');
    const rangeSelect = $('admin-range');
    const partySizeSelect = $('admin-party-size');
    const startStageSelect = $('admin-start-stage');
    const endStageSelect = $('admin-end-stage');
    const histograms = $('admin-histograms');
    const totalParties = $('admin-total-parties');
    const rangeLabel = $('admin-range-label');
    const selectedRange = $('admin-selected-range');
    const statsEmpty = $('admin-stats-empty');
    const statsGrid = $('admin-stats-grid');
    const visitMode = $('admin-visit-mode');
    const visitMenuUrl = $('admin-visit-menu-url');
    const visitClosedMessage = $('admin-visit-closed-message');
    const visitStatus = $('admin-visit-status');
    const visitSave = $('admin-visit-save');
    const voiceEnabled = $('admin-voice-enabled');
    const frontDeskPhone = $('admin-front-desk-phone');
    const largePartyThreshold = $('admin-large-party-threshold');
    const voiceStatus = $('admin-voice-status');
    const voiceSave = $('admin-voice-save');
    const WORKSPACE_KEY_PREFIX = 'skb:lastWorkspace:';
    let pollTimer = null;

    function workspaceKey() {
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        return WORKSPACE_KEY_PREFIX + loc;
    }

    function rememberWorkspace() {
        localStorage.setItem(workspaceKey(), 'admin');
    }

    async function checkAuth() {
        const r = await fetch('api/host/stats');
        return r.status !== 401;
    }

    function fmtMinutes(value) {
        return value != null ? value + 'm' : '\u2014';
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function renderHistogram(hist) {
        const card = document.createElement('div');
        card.className = 'hist-card';
        if (!hist || hist.total === 0) {
            card.innerHTML = `<h3>${esc(hist?.label || 'Histogram')}</h3><div class="hist-meta">No data</div>`;
            return card;
        }
        let buckets = hist.buckets.slice();
        while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop();
        const maxCount = Math.max(...buckets.map(b => b.count), 1);
        const height = 180;
        const bars = buckets.map((b) => {
            const barH = Math.round(height * Math.max((b.count / maxCount) * 100, b.count > 0 ? 3 : 0) / 100);
            const probPct = (b.probability * 100).toFixed(1);
            return `<div class="vbar-col"><div class="vbar-value">${probPct}%</div><div class="vbar-track" style="height:${height}px"><div class="vbar-fill" style="height:${barH}px" title="${b.count} parties (${probPct}%)"></div></div><div class="vbar-label">${esc(b.label.replace('m', ''))}</div></div>`;
        }).join('');
        card.innerHTML = `<h3>${esc(hist.label)}</h3><div class="hist-meta">${hist.total} parties · avg ${hist.avg ?? '\u2014'}m</div><div class="vbar-chart"><div class="vbar-y-label">probability</div><div class="vbar-bars">${bars}</div></div><div class="vbar-x-label">time (minutes)</div>`;
        return card;
    }

    async function loadStats() {
        try {
            const r = await fetch('api/host/stats');
            if (r.status === 401) { showLogin(); return; }
            if (!r.ok) throw new Error('stats fetch failed');
            const s = await r.json();
            const hasData = s.totalJoined > 0;
            statsGrid.style.display = hasData ? '' : 'none';
            statsEmpty.style.display = hasData ? 'none' : '';
            if (!hasData) return;
            $('admin-stat-seated').textContent = String(s.partiesSeated);
            $('admin-stat-noshows').textContent = String(s.noShows);
            $('admin-stat-avg-wait').textContent = fmtMinutes(s.avgActualWaitMinutes);
            $('admin-stat-peak').textContent = s.peakHourLabel ?? '\u2014';
            $('admin-stat-turn-set').textContent = fmtMinutes(s.configuredTurnTime);
            $('admin-stat-turn-actual').textContent = fmtMinutes(s.actualTurnTime);
            $('admin-stat-order').textContent = fmtMinutes(s.avgOrderTimeMinutes);
            $('admin-stat-serve').textContent = fmtMinutes(s.avgServeTimeMinutes);
            $('admin-stat-checkout').textContent = fmtMinutes(s.avgCheckoutTimeMinutes);
            $('admin-stat-table').textContent = fmtMinutes(s.avgTableOccupancyMinutes);
        } catch {
            statsEmpty.style.display = '';
            statsEmpty.textContent = 'Failed to load stats.';
        }
    }

    async function loadAnalytics() {
        histograms.innerHTML = '<div class="hist-empty">Loading...</div>';
        const params = new URLSearchParams({
            range: rangeSelect.value,
            partySize: partySizeSelect.value,
        });
        if (startStageSelect.value && endStageSelect.value) {
            params.set('startStage', startStageSelect.value);
            params.set('endStage', endStageSelect.value);
        }
        try {
            const r = await fetch(`api/host/analytics?${params.toString()}`);
            if (r.status === 401) { showLogin(); return; }
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                histograms.innerHTML = `<div class="hist-empty">${esc(data.error || 'Failed to load analytics.')}</div>`;
                return;
            }
            totalParties.textContent = String(data.totalParties || 0);
            rangeLabel.textContent = rangeSelect.value === '1' ? '1d' : `${rangeSelect.value}d`;
            selectedRange.textContent = data.selectedRange?.label || 'Default';
            if (!data.totalParties) {
                histograms.innerHTML = '<div class="hist-empty">No data for this filter.</div>';
                return;
            }
            histograms.innerHTML = '';
            for (const hist of data.histograms || []) {
                histograms.appendChild(renderHistogram(hist));
            }
        } catch {
            histograms.innerHTML = '<div class="hist-empty">Failed to load analytics.</div>';
        }
    }

    async function loadVisitConfig() {
        try {
            const r = await fetch('api/host/visit-config');
            if (!r.ok) return;
            const data = await r.json();
            visitMode.value = data.visitMode || 'auto';
            visitMenuUrl.value = data.menuUrl || '';
            visitClosedMessage.value = data.closedMessage || '';
        } catch {
            visitStatus.textContent = 'Failed to load visit settings';
            visitStatus.className = 'visit-status error';
        }
    }

    async function loadVoiceConfig() {
        try {
            const r = await fetch('api/host/voice-config');
            if (!r.ok) return;
            const data = await r.json();
            voiceEnabled.value = String(data.voiceEnabled !== false);
            frontDeskPhone.value = data.frontDeskPhone || '';
            largePartyThreshold.value = String(data.voiceLargePartyThreshold || 10);
        } catch {
            voiceStatus.textContent = 'Failed to load IVR settings';
            voiceStatus.className = 'visit-status error';
        }
    }

    function setStatus(el, text, kind) {
        el.textContent = text;
        el.className = 'visit-status' + (kind ? ' ' + kind : '');
    }

    visitSave.addEventListener('click', async () => {
        setStatus(visitStatus, '', '');
        try {
            const r = await fetch('api/host/visit-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitMode: visitMode.value,
                    menuUrl: visitMenuUrl.value.trim() || null,
                    closedMessage: visitClosedMessage.value.trim() || null,
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setStatus(visitStatus, data.error || 'Save failed', 'error');
                return;
            }
            setStatus(visitStatus, 'Saved \u2713', 'success');
        } catch {
            setStatus(visitStatus, 'Network error', 'error');
        }
    });

    voiceSave.addEventListener('click', async () => {
        setStatus(voiceStatus, '', '');
        try {
            const r = await fetch('api/host/voice-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    voiceEnabled: voiceEnabled.value === 'true',
                    frontDeskPhone: frontDeskPhone.value.trim() || null,
                    voiceLargePartyThreshold: Number(largePartyThreshold.value),
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setStatus(voiceStatus, data.error || 'Save failed', 'error');
                return;
            }
            setStatus(voiceStatus, 'Saved \u2713', 'success');
        } catch {
            setStatus(voiceStatus, 'Network error', 'error');
        }
    });

    [rangeSelect, partySizeSelect, startStageSelect, endStageSelect].forEach((el) => {
        el.addEventListener('change', loadAnalytics);
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch('api/host/logout', { method: 'POST' });
        showLogin();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const pin = $('admin-pin').value;
        const r = await fetch('api/host/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
        });
        if (r.ok) { showAdmin(); return; }
        const body = await r.json().catch(() => ({}));
        loginError.textContent = body.error || 'Login failed';
        loginError.style.display = '';
    });

    async function refreshAll() {
        rememberWorkspace();
        await Promise.all([loadStats(), loadAnalytics(), loadVisitConfig(), loadVoiceConfig()]);
    }

    function showLogin() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        loginView.style.display = '';
        adminView.style.display = 'none';
    }

    function showAdmin() {
        loginView.style.display = 'none';
        adminView.style.display = '';
        refreshAll();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            loadStats();
            loadAnalytics();
        }, 10000);
    }

    (async function boot() {
        if (await checkAuth()) showAdmin(); else showLogin();
    })();
})();