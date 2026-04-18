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

    // Site config (issue #45)
    const siteStreet = $('admin-site-street');
    const siteCity = $('admin-site-city');
    const siteState = $('admin-site-state');
    const siteZip = $('admin-site-zip');
    const sitePublicHost = $('admin-site-public-host');
    const siteStatus = $('admin-site-status');
    const siteSave = $('admin-site-save');
    const SITE_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    function siteDayEl(day) {
        return {
            closed: $(`admin-site-${day}-closed`),
            lunchOpen: $(`admin-site-${day}-lunch-open`),
            lunchClose: $(`admin-site-${day}-lunch-close`),
            dinnerOpen: $(`admin-site-${day}-dinner-open`),
            dinnerClose: $(`admin-site-${day}-dinner-close`),
        };
    }
    function siteApplyClosedToggle(day) {
        const els = siteDayEl(day);
        if (!els.closed) return;
        const closed = els.closed.checked;
        [els.lunchOpen, els.lunchClose, els.dinnerOpen, els.dinnerClose].forEach(el => { if (el) el.disabled = closed; });
    }
    SITE_DAY_KEYS.forEach(day => {
        const els = siteDayEl(day);
        if (els.closed) els.closed.addEventListener('change', () => siteApplyClosedToggle(day));
    });
    // Accessibility: the weekly-hours time inputs live inside a visual
    // `<span>Lunch</span>` row which is not a proper <label>. Inject
    // descriptive aria-labels so screen readers can distinguish each input.
    (function siteAddAriaLabels() {
        const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
        SITE_DAY_KEYS.forEach(day => {
            const dayLabel = DAY_LABELS[day];
            const pairs = [
                ['lunchOpen', `${dayLabel} lunch opens`],
                ['lunchClose', `${dayLabel} lunch closes`],
                ['dinnerOpen', `${dayLabel} dinner opens`],
                ['dinnerClose', `${dayLabel} dinner closes`],
            ];
            const els = siteDayEl(day);
            pairs.forEach(([key, label]) => {
                if (els[key]) els[key].setAttribute('aria-label', label);
            });
            if (els.closed) els.closed.setAttribute('aria-label', `${dayLabel} closed all day`);
        });
    })();
    function siteLoadHoursIntoForm(hours) {
        SITE_DAY_KEYS.forEach(day => {
            const els = siteDayEl(day);
            if (!els.closed) return;
            const entry = (hours || {})[day];
            if (entry === 'closed' || entry === undefined) {
                els.closed.checked = true;
                if (els.lunchOpen) els.lunchOpen.value = '';
                if (els.lunchClose) els.lunchClose.value = '';
                if (els.dinnerOpen) els.dinnerOpen.value = '';
                if (els.dinnerClose) els.dinnerClose.value = '';
            } else {
                els.closed.checked = false;
                if (els.lunchOpen) els.lunchOpen.value = entry.lunch?.open || '';
                if (els.lunchClose) els.lunchClose.value = entry.lunch?.close || '';
                if (els.dinnerOpen) els.dinnerOpen.value = entry.dinner?.open || '';
                if (els.dinnerClose) els.dinnerClose.value = entry.dinner?.close || '';
            }
            siteApplyClosedToggle(day);
        });
    }
    function siteReadHoursFromForm() {
        const hours = {};
        SITE_DAY_KEYS.forEach(day => {
            const els = siteDayEl(day);
            if (!els.closed) return;
            if (els.closed.checked) { hours[day] = 'closed'; return; }
            const entry = {};
            if (els.lunchOpen?.value && els.lunchClose?.value) entry.lunch = { open: els.lunchOpen.value, close: els.lunchClose.value };
            if (els.dinnerOpen?.value && els.dinnerClose?.value) entry.dinner = { open: els.dinnerOpen.value, close: els.dinnerClose.value };
            hours[day] = Object.keys(entry).length === 0 ? 'closed' : entry;
        });
        return hours;
    }
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
        // Always send both stage params — the defaults (joined → checkout)
        // are set in admin.html as `selected` on the <option> elements.
        const params = new URLSearchParams({
            range: rangeSelect.value,
            partySize: partySizeSelect.value,
            startStage: startStageSelect.value,
            endStage: endStageSelect.value,
        });
        // Guard against invalid pairs (end must be strictly later than start).
        // Server rejects with 400, but surface it locally too for snappier feedback.
        const ORDER = ['joined', 'seated', 'ordered', 'served', 'checkout', 'departed'];
        const si = ORDER.indexOf(startStageSelect.value);
        const ei = ORDER.indexOf(endStageSelect.value);
        if (si < 0 || ei < 0 || ei <= si) {
            histograms.innerHTML = '<div class="hist-empty">Pick an end stage that comes after the start stage.</div>';
            return;
        }
        try {
            const r = await fetch(`api/host/analytics?${params.toString()}`);
            if (r.status === 401) { showLogin(); return; }
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                histograms.innerHTML = `<div class="hist-empty">${esc(data.error || 'Failed to load analytics.')}</div>`;
                return;
            }
            // totalParties + selectedRange moved out of topbar in favour of
            // the histogram card's own hist-meta subtitle (shows N parties + avg).
            if (!data.totalParties) {
                histograms.innerHTML = '<div class="hist-empty">No data for this filter. Walk a party through the lifecycle (join → seat → order → serve → checkout → depart) to populate the histogram.</div>';
                return;
            }
            // The server returns a single histogram for the selected stage pair.
            histograms.innerHTML = '';
            const hist = data.histograms?.[0];
            if (hist) histograms.appendChild(renderHistogram(hist));
        } catch (err) {
            // Log the real cause so bugs like missing DOM ids don't hide behind "Failed to load"
            console.error('analytics load failed:', err);
            histograms.innerHTML = '<div class="hist-empty">Failed to load analytics: ' + esc(err?.message || String(err)) + '</div>';
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
        // Show the URL that the door-QR actually resolves to, so the owner
        // can verify what scanners will land on without having to scan it.
        // Uses the same logic as the server-side QR endpoint.
        const qrTarget = document.getElementById('admin-qr-target-url');
        const qrTestLink = document.getElementById('admin-qr-test-link');
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        const publicHost = (sitePublicHost?.value || '').trim();
        // Always use the app-service URL for the "test link" — the publicHost
        // URL is what ends up on the printed sticker, but that domain may not
        // resolve in this browser yet (DNS not configured). The /r/:loc/visit
        // path always works and hits the same redirect logic.
        const scannerUrl = publicHost
            ? `https://${publicHost}/visit`
            : `${window.location.origin}/r/${loc}/visit`;
        const testableUrl = `${window.location.origin}/r/${loc}/visit`;
        if (qrTarget) qrTarget.textContent = scannerUrl;
        if (qrTestLink) qrTestLink.href = testableUrl;
        // Force-refresh the QR image. The <img> fires at page-load time
        // (before host-auth cookie exists) and caches a 401, so we nudge
        // the src with a cache-busting param every time we (re)load the
        // admin card. Also covers the case where the owner changes
        // publicHost and the QR should regenerate.
        const qrImg = document.getElementById('admin-qr-image');
        if (qrImg) qrImg.src = 'api/host/visit-qr.svg?t=' + Date.now();
        const qrDownload = document.getElementById('admin-qr-download');
        if (qrDownload) qrDownload.href = 'api/host/visit-qr.svg?t=' + Date.now();
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

    async function loadSiteConfig() {
        try {
            const r = await fetch('api/host/site-config');
            if (r.status === 401) return;
            if (!r.ok) return;
            const data = await r.json();
            if (siteStreet) siteStreet.value = data.address?.street || '';
            if (siteCity) siteCity.value = data.address?.city || '';
            if (siteState) siteState.value = data.address?.state || '';
            if (siteZip) siteZip.value = data.address?.zip || '';
            if (sitePublicHost) sitePublicHost.value = data.publicHost || '';
            siteLoadHoursIntoForm(data.hours);
            // Issue #57: surface the restaurant name in the admin topbar
            // brand block so owners see "SKB Platform · Admin — {name}".
            // Platform label is hardcoded in the HTML; only the name slot
            // is data-driven.
            const nameEl = document.getElementById('admin-restaurant-name');
            const sepEl = document.getElementById('admin-restaurant-name-sep');
            if (nameEl && data.name) {
                nameEl.textContent = data.name;
                if (sepEl) sepEl.style.display = '';
            }
        } catch {
            // non-blocking
        }
    }

    siteSave.addEventListener('click', async () => {
        setStatus(siteStatus, '', '');
        const street = siteStreet?.value.trim() || '';
        const city = siteCity?.value.trim() || '';
        const state = siteState?.value.trim().toUpperCase() || '';
        const zip = siteZip?.value.trim() || '';
        const anyAddressField = street || city || state || zip;
        const addressPayload = anyAddressField ? { street, city, state, zip } : null;
        try {
            const r = await fetch('api/host/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: addressPayload,
                    hours: siteReadHoursFromForm(),
                    publicHost: (sitePublicHost?.value || '').trim().toLowerCase() || null,
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setStatus(siteStatus, data.error || 'Save failed', 'error');
                return;
            }
            setStatus(siteStatus, 'Saved \u2713', 'success');
        } catch {
            setStatus(siteStatus, 'Network error', 'error');
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
        await Promise.all([loadStats(), loadAnalytics(), loadVisitConfig(), loadVoiceConfig(), loadSiteConfig()]);
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
        // Stats refresh on a timer (lightweight — just counters). Analytics
        // does NOT auto-refresh because (a) it re-renders the histogram
        // causing a visible flash, (b) the data only changes when parties
        // complete lifecycle stages, not every 10 seconds, and (c) the user
        // can trigger a refresh by changing the filter dropdowns.
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(loadStats, 30000);
    }

    (async function boot() {
        if (await checkAuth()) showAdmin(); else showLogin();
    })();
})();