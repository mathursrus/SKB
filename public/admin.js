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

    // Identity + role state loaded from /api/me. Host-role users should
    // be bounced to host.html per issue #55 acceptance R2; owners get
    // the Staff tab. Admins get operations but no staff management.
    let currentIdentity = null; // { userId, role } | null
    async function loadIdentity() {
        try {
            const r = await fetch('/api/me', { credentials: 'same-origin' });
            if (!r.ok) return null;
            const data = await r.json();
            currentIdentity = {
                userId: data.user?.id || null,
                email: data.user?.email || '',
                name: data.user?.name || '',
                role: data.role || null,
                locationId: data.locationId || null,
            };
            return currentIdentity;
        } catch {
            return null;
        }
    }

    function redirectHostRoleAway() {
        // Leave a toast in sessionStorage so host.html can surface "you
        // don't have access" if it wants to. This page doesn't render
        // anything for hosts.
        try {
            sessionStorage.setItem('skb:admin-denied', JSON.stringify({
                at: Date.now(),
                reason: 'Admin workspace is owner/admin only. Sending you to the host stand.',
            }));
        } catch {}
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        window.location.replace(`/r/${loc}/host.html`);
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
            // brand block so owners see "OSH · Admin — {name}".
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

    // ─── Website tab (issue #56): template + structured content ──────────
    const websiteCards = document.querySelectorAll('.website-template-card');
    const websiteHeroHeadline = $('admin-website-hero-headline');
    const websiteHeroSubhead = $('admin-website-hero-subhead');
    const websiteAbout = $('admin-website-about');
    const websiteContactEmail = $('admin-website-contact-email');
    const websiteInstagram = $('admin-website-instagram');
    const websiteReservations = $('admin-website-reservations');
    const websiteStatus = $('admin-website-status');
    const websiteSave = $('admin-website-save');
    const websitePreview = $('admin-website-preview');
    let selectedTemplate = 'saffron';
    let websiteSavedAt = null;

    function setSelectedTemplate(key) {
        selectedTemplate = key === 'slate' ? 'slate' : 'saffron';
        websiteCards.forEach(card => {
            const active = card.getAttribute('data-template') === selectedTemplate;
            card.classList.toggle('is-selected', active);
            card.setAttribute('aria-pressed', String(active));
        });
    }
    websiteCards.forEach(card => {
        card.addEventListener('click', () => setSelectedTemplate(card.getAttribute('data-template')));
    });

    function updateSavedAgo() {
        if (!websiteStatus || !websiteSavedAt) return;
        const now = Date.now();
        const ms = now - websiteSavedAt;
        if (ms < 60000) websiteStatus.textContent = 'Saved just now';
        else if (ms < 3600000) websiteStatus.textContent = `Saved ${Math.floor(ms / 60000)}m ago`;
        else websiteStatus.textContent = `Saved ${Math.floor(ms / 3600000)}h ago`;
        websiteStatus.className = 'visit-status success';
    }
    setInterval(updateSavedAgo, 30000);

    async function loadWebsiteConfig() {
        try {
            const r = await fetch('api/host/website-config');
            if (r.status === 401) return;
            if (!r.ok) return;
            const data = await r.json();
            setSelectedTemplate(data.websiteTemplate);
            const c = data.content || {};
            if (websiteHeroHeadline) websiteHeroHeadline.value = c.heroHeadline || '';
            if (websiteHeroSubhead) websiteHeroSubhead.value = c.heroSubhead || '';
            if (websiteAbout) websiteAbout.value = c.about || '';
            if (websiteContactEmail) websiteContactEmail.value = c.contactEmail || '';
            if (websiteInstagram) websiteInstagram.value = c.instagramHandle || '';
            if (websiteReservations) websiteReservations.value = c.reservationsNote || '';
            sigLoadFromContent(c.knownFor);
        } catch {
            // non-blocking
        }
    }

    // ─── Menu tab (Phase B: placeholder with menuUrl quick-edit) ─────────
    // The full menu JSON editor is out of scope for Phase B. This field
    // shares the same persistence as the Settings → QR card's menuUrl so
    // owners only have to maintain one value.
    async function loadMenuUrl() {
        const input = $('admin-menu-url');
        if (!input) return;
        try {
            const r = await fetch('api/host/visit-config');
            if (!r.ok) return;
            const data = await r.json();
            input.value = data.menuUrl || '';
        } catch {
            // non-blocking
        }
    }

    const menuSave = $('admin-menu-save');
    if (menuSave) {
        menuSave.addEventListener('click', async () => {
            const status = $('admin-menu-status');
            setStatus(status, '', '');
            const url = ($('admin-menu-url')?.value || '').trim() || null;
            try {
                // Fetch current visit-config first so we don't clobber visitMode/closedMessage.
                const cur = await fetch('api/host/visit-config').then(r => r.ok ? r.json() : {}).catch(() => ({}));
                const r = await fetch('api/host/visit-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        visitMode: cur.visitMode || 'auto',
                        menuUrl: url,
                        closedMessage: cur.closedMessage || null,
                    }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    setStatus(status, data.error || 'Save failed', 'error');
                    return;
                }
                setStatus(status, 'Saved \u2713', 'success');
                // Keep the Settings QR-card input in sync so switching tabs
                // doesn't show stale data.
                if (visitMenuUrl) visitMenuUrl.value = url || '';
            } catch {
                setStatus(status, 'Network error', 'error');
            }
        });
    }

    // ─── Device PIN regen stub (Phase B: button wired, endpoint deferred) ─
    // Spec says the rotate-PIN endpoint is a TODO; the UI shows the button
    // and emits a visible "coming soon" toast so owners know the feature
    // exists but isn't wired yet. Post returns 501 or 404 today — we treat
    // any non-200 as "coming soon" for now.
    function showToast(text, kind) {
        const el = $('admin-toast');
        if (!el) { alert(text); return; }
        el.textContent = text;
        el.className = 'admin-toast' + (kind ? ' admin-toast-' + kind : '');
        el.style.display = '';
        setTimeout(() => { el.style.display = 'none'; }, 3200);
    }
    const devicePinRegen = $('admin-device-pin-regen');
    if (devicePinRegen) {
        devicePinRegen.addEventListener('click', async () => {
            try {
                const r = await fetch('api/host/regenerate-pin', { method: 'POST' });
                if (r.ok) {
                    const data = await r.json().catch(() => ({}));
                    showToast('New PIN: ' + (data.pin || '(saved)'), 'success');
                    return;
                }
                // 404 / 501 / anything else — treat as deferred.
                showToast('Regenerate PIN — coming soon', 'info');
            } catch {
                showToast('Regenerate PIN — coming soon', 'info');
            }
        });
    }

    // ─── Signature-dish editor (Phase B of issue #51) ────────────────────
    // Each of the 3 rows tracks its own in-memory state:
    //   - `existingUrl`: URL string loaded from the server (unchanged on save)
    //   - `pendingUpload`: { mime, data } object when the user picks a new file
    //   - `cleared`: true when the user clicks Clear and we want to drop the image
    // Save builds knownFor[*].image as either existingUrl (string), an upload
    // object, or "" (empty). Phase-A backend handles both shapes.
    const SIG_ROWS = 3;
    const sigState = Array.from({ length: SIG_ROWS }, () => ({
        existingUrl: '',
        pendingUpload: null,
        cleared: false,
    }));

    function sigRowEl(idx) { return document.querySelector(`.signature-dish-row[data-sig-index="${idx}"]`); }
    function sigPreviewEl(idx) { return sigRowEl(idx)?.querySelector('[data-sig-preview]'); }
    function sigPlaceholderEl(idx) { return sigRowEl(idx)?.querySelector('[data-sig-placeholder]'); }
    function sigClearBtn(idx) { return sigRowEl(idx)?.querySelector('[data-sig-clear]'); }
    function sigTitleEl(idx) { return sigRowEl(idx)?.querySelector('.signature-dish-title'); }
    function sigDescEl(idx) { return sigRowEl(idx)?.querySelector('.signature-dish-desc'); }
    function sigFileEl(idx) { return sigRowEl(idx)?.querySelector('.signature-dish-file'); }

    function sigRenderPreview(idx, src) {
        const img = sigPreviewEl(idx);
        const ph = sigPlaceholderEl(idx);
        const clearBtn = sigClearBtn(idx);
        if (src) {
            if (img) { img.src = src; img.style.display = ''; }
            if (ph) ph.style.display = 'none';
            if (clearBtn) clearBtn.style.display = '';
        } else {
            if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
            if (ph) ph.style.display = '';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    }

    function sigLoadFromContent(items) {
        const list = Array.isArray(items) ? items : [];
        for (let i = 0; i < SIG_ROWS; i++) {
            const it = list[i] || { title: '', desc: '', image: '' };
            const title = sigTitleEl(i); if (title) title.value = it.title || '';
            const desc = sigDescEl(i); if (desc) desc.value = it.desc || '';
            sigState[i] = { existingUrl: typeof it.image === 'string' ? it.image : '', pendingUpload: null, cleared: false };
            sigRenderPreview(i, sigState[i].existingUrl);
        }
    }

    function wireSignatureDishRows() {
        for (let i = 0; i < SIG_ROWS; i++) {
            const file = sigFileEl(i);
            const clearBtn = sigClearBtn(i);
            if (file) {
                file.addEventListener('change', () => {
                    const f = file.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = String(reader.result || '');
                        // result is a data URL like "data:image/png;base64,AAAA"
                        const match = /^data:([^;]+);base64,(.+)$/.exec(result);
                        if (!match) return;
                        const [, mime, data] = match;
                        sigState[i].pendingUpload = { mime, data };
                        sigState[i].cleared = false;
                        sigRenderPreview(i, result);
                    };
                    reader.readAsDataURL(f);
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    sigState[i].pendingUpload = null;
                    sigState[i].cleared = true;
                    const fileInput = sigFileEl(i);
                    if (fileInput) fileInput.value = '';
                    sigRenderPreview(i, '');
                });
            }
        }
    }

    function buildKnownForPayload() {
        const items = [];
        for (let i = 0; i < SIG_ROWS; i++) {
            const title = (sigTitleEl(i)?.value || '').trim();
            const desc = (sigDescEl(i)?.value || '').trim();
            const state = sigState[i];
            let image;
            if (state.pendingUpload) image = state.pendingUpload;
            else if (state.cleared) image = '';
            else image = state.existingUrl || '';
            // Only include rows that have something meaningful. A completely
            // blank row is dropped so the server doesn't validate empty cards.
            if (!title && !desc && !image) continue;
            items.push({ title, desc, image });
        }
        return items;
    }

    if (websiteSave) {
        websiteSave.addEventListener('click', async () => {
            setStatus(websiteStatus, '', '');
            const content = {
                heroHeadline: websiteHeroHeadline?.value.trim() || '',
                heroSubhead: websiteHeroSubhead?.value.trim() || '',
                about: websiteAbout?.value.trim() || '',
                contactEmail: websiteContactEmail?.value.trim() || '',
                instagramHandle: websiteInstagram?.value.trim() || '',
                reservationsNote: websiteReservations?.value.trim() || '',
                knownFor: buildKnownForPayload(),
            };
            try {
                const r = await fetch('api/host/website-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ websiteTemplate: selectedTemplate, content }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    setStatus(websiteStatus, data.error || 'Save failed', 'error');
                    return;
                }
                // Server returns the persisted content — reload so the row
                // state reflects any URL substitutions the uploader did.
                if (data?.content?.knownFor) sigLoadFromContent(data.content.knownFor);
                websiteSavedAt = Date.now();
                updateSavedAgo();
            } catch {
                setStatus(websiteStatus, 'Network error', 'error');
            }
        });
    }

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
        // With the 7-tab workspace, each tab lazy-loads its own data when
        // activated. We still eagerly load site-config here because the
        // admin topbar restaurant-name ("OSH · Admin — <name>") depends
        // on it and the topbar is visible across every tab.
        await loadSiteConfig();
        // Mark the site tab as already loaded so activating it doesn't refetch.
        loadedPanels.add('site');
    }

    // ------------------------------------------------------------------
    // MCP (AI) setup card — populate per-tenant endpoint, headers, and
    // the Claude Code / Claude Desktop snippets. Works entirely client-
    // side from data the page already has; no new API call needed.
    // ------------------------------------------------------------------
    async function loadMcpConfig() {
        const endpoint = document.getElementById('mcp-endpoint');
        const locHeader = document.getElementById('mcp-location-header');
        const bearer = document.getElementById('mcp-bearer');
        const claudeCode = document.getElementById('mcp-snippet-claude-code');
        const claudeDesktop = document.getElementById('mcp-snippet-claude-desktop');
        if (!endpoint || !locHeader || !bearer || !claudeCode || !claudeDesktop) return;

        const mcpUrl = `${window.location.origin}/mcp`;
        const locationId = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        // The PIN is never returned by any owner-facing API (correctly).
        // Render a placeholder the owner replaces from the signup success
        // card / door-poster PDF. If we ever add a "reveal / rotate PIN"
        // flow, this is where we'd read it from the new endpoint.
        const pin = '<your host PIN>';

        endpoint.value = mcpUrl;
        locHeader.value = locationId;
        bearer.value = pin;
        bearer.type = 'password';

        const name = `osh-${locationId}`;
        claudeCode.textContent =
            `claude mcp add ${name} \\\n` +
            `  --transport http \\\n` +
            `  --url "${mcpUrl}" \\\n` +
            `  --header "Authorization: Bearer ${pin}" \\\n` +
            `  --header "X-SKB-Location: ${locationId}"`;
        claudeDesktop.textContent = JSON.stringify({
            mcpServers: {
                [name]: {
                    transport: 'http',
                    url: mcpUrl,
                    headers: {
                        Authorization: `Bearer ${pin}`,
                        'X-SKB-Location': locationId,
                    },
                },
            },
        }, null, 2);
    }

    // Reveal/hide the bearer token.
    document.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        if (target.id === 'mcp-bearer-reveal') {
            const input = $('mcp-bearer');
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
            target.textContent = input.type === 'password' ? '👁' : '🙈';
            return;
        }
        if (target.classList.contains('mcp-copy-btn')) {
            const id = target.getAttribute('data-copy-target');
            if (!id) return;
            const el = document.getElementById(id);
            if (!el) return;
            const text = el.value !== undefined ? el.value : el.textContent || '';
            navigator.clipboard?.writeText(text).then(() => {
                const original = target.textContent;
                target.textContent = '✓ Copied';
                setTimeout(() => { target.textContent = original; }, 1400);
            });
            return;
        }
        if (target.classList.contains('mcp-tab-btn')) {
            const tab = target.getAttribute('data-mcp-tab');
            if (!tab) return;
            document.querySelectorAll('.mcp-tab-btn').forEach(b => b.classList.toggle('is-selected', b === target));
            document.querySelectorAll('.mcp-tab-panel').forEach(p => {
                p.classList.toggle('is-selected', p.getAttribute('data-mcp-tab-panel') === tab);
            });
        }
    });

    // ------------------------------------------------------------------
    // Issue #55: Staff tab
    // ------------------------------------------------------------------
    function roleLabel(role) {
        if (role === 'owner') return 'Owner';
        if (role === 'admin') return 'Admin';
        if (role === 'host') return 'Host';
        return role || '';
    }
    function initials(name, email) {
        const src = (name || email || '??').trim();
        const parts = src.split(/\s+|@/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return src.slice(0, 2).toUpperCase();
    }
    function relativeTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const diff = Date.now() - d.getTime();
        const mins = Math.round(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.round(hrs / 24);
        return days + 'd ago';
    }

    async function loadStaff() {
        const tbody = $('staff-tbody');
        const pendingTbody = $('pending-tbody');
        const pendingTable = $('pending-table');
        const pendingEmpty = $('pending-empty');
        const staffEmpty = $('staff-empty');
        const staffTable = $('staff-table');
        if (!tbody || !pendingTbody) return;
        try {
            const r = await fetch('api/staff');
            if (r.status === 403) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;color:#78716c">You do not have permission to view staff.</td></tr>';
                return;
            }
            if (!r.ok) throw new Error('fetch failed: ' + r.status);
            const data = await r.json();
            const staff = Array.isArray(data.staff) ? data.staff : [];
            const pending = Array.isArray(data.pending) ? data.pending : [];

            // Active staff — put current user first with "(you)" tag.
            const myUid = currentIdentity?.userId;
            staff.sort((a, b) => {
                if (a.userId === myUid) return -1;
                if (b.userId === myUid) return 1;
                return new Date(a.createdAt) - new Date(b.createdAt);
            });
            if (staff.length === 0) {
                staffTable.style.display = 'none';
                staffEmpty.style.display = '';
            } else {
                staffTable.style.display = '';
                staffEmpty.style.display = 'none';
                tbody.innerHTML = staff.map(row => {
                    const isSelf = row.userId === myUid;
                    const revokeAttr = isSelf ? 'disabled title="Owners cannot revoke themselves."' : '';
                    const roleKey = esc(row.role || '');
                    return `<tr>
                        <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">
                            <div style="display:flex;align-items:center;gap:10px">
                                <div class="staff-avatar avatar-${roleKey}">${esc(initials(row.name, row.email))}</div>
                                <div>
                                    <div>${esc(row.name || row.email)}</div>
                                    ${isSelf ? '<div style="font-size:11px;color:#78716c">(you)</div>' : ''}
                                </div>
                            </div>
                        </td>
                        <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">${esc(row.email)}</td>
                        <td style="padding:14px 12px;border-bottom:1px solid #f0eae0"><span class="role-pill ${roleKey}">${esc(roleLabel(row.role))}</span></td>
                        <td style="padding:14px 12px;border-bottom:1px solid #f0eae0;color:#78716c">${esc(relativeTime(row.createdAt))}</td>
                        <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">
                            <button class="staff-action" data-revoke-membership="${esc(row.membershipId)}" ${revokeAttr} style="background:none;border:none;color:#b42318;font-size:13px;font-weight:500;cursor:${isSelf ? 'not-allowed' : 'pointer'};opacity:${isSelf ? '.4' : '1'}">Revoke</button>
                        </td>
                    </tr>`;
                }).join('');
            }

            // Pending invites
            if (pending.length === 0) {
                pendingTable.style.display = 'none';
                pendingEmpty.style.display = '';
            } else {
                pendingTable.style.display = '';
                pendingEmpty.style.display = 'none';
                pendingTbody.innerHTML = pending.map(row => `<tr>
                    <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">
                        <div style="display:flex;align-items:center;gap:10px">
                            <div class="staff-avatar avatar-pending">${esc(initials(row.name, row.email))}</div>
                            <div>${esc(row.name)}</div>
                        </div>
                    </td>
                    <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">${esc(row.email)}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #f0eae0"><span class="role-pill pending">Invite pending</span></td>
                    <td style="padding:14px 12px;border-bottom:1px solid #f0eae0;color:#78716c">${esc(relativeTime(row.createdAt))}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #f0eae0">
                        <button class="staff-action" data-revoke-invite="${esc(row.id)}" style="background:none;border:none;color:#b42318;font-size:13px;font-weight:500;cursor:pointer">Cancel invite</button>
                    </td>
                </tr>`).join('');
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:14px;color:#b42318">Failed to load staff: ${esc(err?.message || String(err))}</td></tr>`;
        }
    }

    function wireStaffActions() {
        const staffBody = $('staff-tbody');
        const pendingBody = $('pending-tbody');
        const handler = async (e) => {
            const btn = e.target.closest('button[data-revoke-membership], button[data-revoke-invite]');
            if (!btn) return;
            if (btn.disabled) return;
            const memId = btn.getAttribute('data-revoke-membership');
            const inviteId = btn.getAttribute('data-revoke-invite');
            const body = memId ? { membershipId: memId } : { inviteId };
            const confirmMsg = memId ? 'Revoke this teammate\u2019s access?' : 'Cancel this invite?';
            if (!window.confirm(confirmMsg)) return;
            btn.disabled = true;
            try {
                const r = await fetch('api/staff/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    window.alert(data.error || 'Revoke failed');
                    btn.disabled = false;
                    return;
                }
                await loadStaff();
            } catch {
                btn.disabled = false;
                window.alert('Network error');
            }
        };
        if (staffBody) staffBody.addEventListener('click', handler);
        if (pendingBody) pendingBody.addEventListener('click', handler);
    }

    function wireInviteForm() {
        const form = $('invite-form');
        if (!form) return;
        const submitBtn = $('invite-submit');
        const status = $('invite-status');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setStatus(status, '', '');
            const name = $('invite-name').value.trim();
            const email = $('invite-email').value.trim();
            const roleInput = document.querySelector('input[name="invite-role"]:checked');
            const role = roleInput ? roleInput.value : 'host';
            if (!name || !email) {
                setStatus(status, 'Name and email required', 'error');
                return;
            }
            submitBtn.disabled = true;
            try {
                const r = await fetch('api/staff/invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, role }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    setStatus(status, data.error || 'Invite failed', 'error');
                    return;
                }
                setStatus(status, 'Invite sent \u2713', 'success');
                form.reset();
                const hostRadio = document.querySelector('input[name="invite-role"][value="host"]');
                if (hostRadio) hostRadio.checked = true;
                await loadStaff();
            } catch {
                setStatus(status, 'Network error', 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // ------------------------------------------------------------------
    // 7-tab workspace (issue #51 Phase B). Tabs are:
    //   dashboard · site · website · menu · staff · ai · settings
    //
    // Each panel is lazy-loaded via `tabLoaders` on first activation. The
    // last-active tab is persisted per-location in localStorage under
    // `skb:adminTab:<loc>` so reloads land the operator back where they
    // left off. Hidden-by-role tabs (currently just `staff`) fall back to
    // `dashboard` when the stored key isn't visible.
    // ------------------------------------------------------------------
    const TAB_KEYS = ['dashboard', 'site', 'website', 'menu', 'staff', 'ai', 'settings'];
    const loadedPanels = new Set();

    function adminTabStorageKey() {
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        return 'skb:adminTab:' + loc;
    }

    const tabLoaders = {
        dashboard: async () => { await Promise.all([loadStats(), loadAnalytics()]); },
        site: async () => { await Promise.all([loadSiteConfig(), loadVoiceConfig()]); },
        website: async () => { await loadWebsiteConfig(); },
        menu: async () => { await loadMenuUrl(); },
        staff: async () => { await loadStaff(); },
        ai: async () => { await loadMcpConfig(); },
        settings: async () => { await loadVisitConfig(); },
    };

    function activateTab(key, opts = {}) {
        if (!TAB_KEYS.includes(key)) key = 'dashboard';
        const tabs = document.querySelectorAll('.admin-tab');
        // If the requested tab is hidden by role, fall back to dashboard.
        const targetBtn = document.querySelector('.admin-tab[data-tab="' + key + '"]');
        if (targetBtn && targetBtn.style.display === 'none') key = 'dashboard';

        tabs.forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === key;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });
        TAB_KEYS.forEach(k => {
            const panel = document.getElementById('admin-panel-' + k);
            if (panel) panel.style.display = (k === key ? '' : 'none');
        });

        if (!opts.skipLoad && !loadedPanels.has(key)) {
            loadedPanels.add(key);
            const loader = tabLoaders[key];
            if (loader) {
                Promise.resolve(loader()).catch(err => {
                    console.error('tab loader failed:', key, err);
                });
            }
        }

        try { localStorage.setItem(adminTabStorageKey(), key); } catch {}
    }

    function wireTabs() {
        const tabs = document.querySelectorAll('.admin-tab');
        tabs.forEach(btn => btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-tab') || 'dashboard';
            activateTab(key);
        }));
    }

    function restoreActiveTab() {
        let key = 'dashboard';
        try {
            const saved = localStorage.getItem(adminTabStorageKey());
            if (saved && TAB_KEYS.includes(saved)) key = saved;
        } catch {}
        activateTab(key);
    }

    function applyRoleGates() {
        // Show Staff tab only for owners. Admins + hosts don't see it.
        const staffTab = $('admin-tab-staff');
        if (staffTab) staffTab.style.display = currentIdentity?.role === 'owner' ? '' : 'none';
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
        // Restore whichever tab the operator was last on (per-location key);
        // this triggers lazy-loading of that tab's data. Runs AFTER refreshAll
        // so site-config has already populated the topbar brand.
        restoreActiveTab();
        // Stats refresh on a timer (lightweight — just counters). Analytics
        // does NOT auto-refresh because (a) it re-renders the histogram
        // causing a visible flash, (b) the data only changes when parties
        // complete lifecycle stages, not every 10 seconds, and (c) the user
        // can trigger a refresh by changing the filter dropdowns.
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(loadStats, 30000);
    }

    wireTabs();
    wireInviteForm();
    wireStaffActions();
    wireSignatureDishRows();

    (async function boot() {
        // Load named-user identity first so we can enforce role-gate R2
        // (host-role users land on host.html) and show/hide the Staff
        // tab. If /api/me 401s, we fall back to the PIN-login view.
        const identity = await loadIdentity();
        if (identity && identity.role === 'host') {
            redirectHostRoleAway();
            return;
        }
        applyRoleGates();
        if (await checkAuth()) showAdmin(); else showLogin();
    })();
})();