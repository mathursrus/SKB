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
    const callerCoverageNote = $('admin-caller-coverage-note');
    const callerStatsError = $('admin-caller-stats-error');
    const callerStatsEmpty = $('admin-caller-stats-empty');
    const callerStatsContent = $('admin-caller-stats-content');
    const callerOutcomes = $('admin-caller-outcomes');
    const callerChoices = $('admin-caller-choices');
    const callerRecent = $('admin-caller-recent');
    const callerDetailType = $('admin-caller-detail-type');
    const callerDetailTitle = $('admin-caller-detail-title');
    const callerDetailCount = $('admin-caller-detail-count');
    const callerDetailShare = $('admin-caller-detail-share');
    const callerDetailCopy = $('admin-caller-detail-copy');
    const callerFunnelInbound = $('admin-caller-funnel-inbound');
    const callerFunnelJoinIntent = $('admin-caller-funnel-join-intent');
    const callerFunnelPhone = $('admin-caller-funnel-phone');
    const callerFunnelJoined = $('admin-caller-funnel-joined');
    const callerRangeButtons = Array.from(document.querySelectorAll('[data-caller-range]'));
    const visitMode = $('admin-visit-mode');
    const visitMenuUrl = $('admin-visit-menu-url');
    const visitClosedMessage = $('admin-visit-closed-message');
    const visitStatus = $('admin-visit-status');
    const visitSave = $('admin-visit-save');
    const voiceEnabled = $('admin-voice-enabled');
    const frontDeskPhone = $('admin-front-desk-phone');
    const cateringPhone = $('admin-catering-phone');
    const largePartyThreshold = $('admin-large-party-threshold');
    const voiceStatus = $('admin-voice-status');
    const voiceSave = $('admin-voice-save');
    const guestFeatureMenu = $('admin-guest-feature-menu');
    const guestFeatureOrder = $('admin-guest-feature-order');
    const guestFeatureChat = $('admin-guest-feature-chat');
    const guestFeatureSms = $('admin-guest-feature-sms');
    const guestFeaturesStatus = $('admin-guest-features-status');
    const guestFeaturesSave = $('admin-guest-features-save');

    // Messaging tab (issue #69): shared-number SMS settings.
    const smsSenderName = $('admin-sms-sender-name');
    const smsSenderCount = $('admin-sms-sender-count');
    const smsSenderStatus = $('admin-sms-sender-status');
    const smsSenderSave = $('admin-sms-sender-save');
    const smsPreviewName1 = $('admin-sms-preview-name-1');
    const smsPreviewName2 = $('admin-sms-preview-name-2');
    const smsPreviewFromNumber = $('admin-sms-preview-from-number');
    const smsSharedNumber = $('admin-sms-shared-number');
    const voiceNumberDisplay = $('admin-voice-number-display');

    // Site config (issue #45)
    const siteStreet = $('admin-site-street');
    const siteCity = $('admin-site-city');
    const siteState = $('admin-site-state');
    const siteZip = $('admin-site-zip');
    const sitePublicHost = $('admin-site-public-host');
    const siteStatus = $('admin-site-status');
    const siteSave = $('admin-site-save');
    let siteConfiguredPublicUrl = '';
    const SITE_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const SITE_SERVICE_KEYS = ['breakfast', 'lunch', 'special', 'dinner'];
    const SITE_DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    function siteDayEl(day) {
        const els = { closed: $(`admin-site-${day}-closed`) };
        SITE_SERVICE_KEYS.forEach(service => {
            els[`${service}Open`] = $(`admin-site-${day}-${service}-open`);
            els[`${service}Close`] = $(`admin-site-${day}-${service}-close`);
        });
        return els;
    }
    function siteWindowKeys() {
        return SITE_SERVICE_KEYS.flatMap(service => [`${service}Open`, `${service}Close`]);
    }
    function siteApplyClosedToggle(day) {
        const els = siteDayEl(day);
        if (!els.closed) return;
        const closed = els.closed.checked;
        siteWindowKeys().forEach((key) => { if (els[key]) els[key].disabled = closed; });
    }
    SITE_DAY_KEYS.forEach(day => {
        const els = siteDayEl(day);
        if (els.closed) els.closed.addEventListener('change', () => siteApplyClosedToggle(day));
    });
    // Accessibility: the weekly-hours time inputs live inside a visual
    // service row which is not a proper <label>. Inject
    // descriptive aria-labels so screen readers can distinguish each input.
    (function siteAddAriaLabels() {
        SITE_DAY_KEYS.forEach(day => {
            const dayLabel = SITE_DAY_LABELS[day];
            const els = siteDayEl(day);
            SITE_SERVICE_KEYS.forEach((service) => {
                const label = service.charAt(0).toUpperCase() + service.slice(1);
                const openKey = `${service}Open`;
                const closeKey = `${service}Close`;
                if (els[openKey]) els[openKey].setAttribute('aria-label', `${dayLabel} ${label.toLowerCase()} opens`);
                if (els[closeKey]) els[closeKey].setAttribute('aria-label', `${dayLabel} ${label.toLowerCase()} closes`);
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
                siteWindowKeys().forEach((key) => { if (els[key]) els[key].value = ''; });
            } else {
                els.closed.checked = false;
                SITE_SERVICE_KEYS.forEach((service) => {
                    const window = entry[service];
                    if (els[`${service}Open`]) els[`${service}Open`].value = window?.open || '';
                    if (els[`${service}Close`]) els[`${service}Close`].value = window?.close || '';
                });
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
            SITE_SERVICE_KEYS.forEach((service) => {
                const open = els[`${service}Open`]?.value;
                const close = els[`${service}Close`]?.value;
                if (open && close) entry[service] = { open, close };
            });
            hours[day] = Object.keys(entry).length === 0 ? 'closed' : entry;
        });
        return hours;
    }
    function siteCopyDayToAll(sourceDay) {
        const source = siteReadHoursFromForm()[sourceDay];
        SITE_DAY_KEYS.forEach((day) => {
            const els = siteDayEl(day);
            if (!els.closed) return;
            const entry = day === sourceDay ? source : source;
            if (entry === 'closed' || !entry) {
                els.closed.checked = true;
                siteWindowKeys().forEach((key) => { if (els[key]) els[key].value = ''; });
            } else {
                els.closed.checked = false;
                SITE_SERVICE_KEYS.forEach((service) => {
                    if (els[`${service}Open`]) els[`${service}Open`].value = entry[service]?.open || '';
                    if (els[`${service}Close`]) els[`${service}Close`].value = entry[service]?.close || '';
                });
            }
            siteApplyClosedToggle(day);
        });
    }
    document.querySelectorAll('.visit-hours-copy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const day = btn.getAttribute('data-day');
            if (!day) return;
            siteCopyDayToAll(day);
        });
    });
    const WORKSPACE_KEY_PREFIX = 'skb:lastWorkspace:';
    let pollTimer = null;
    let callerStatsRange = '1';
    let callerStatsSelectedOutcome = 'dropped_before_choice';

    const CALLER_OUTCOME_META = {
        dropped_before_choice: {
            label: 'Dropped before choice',
            type: 'Abandonment',
            copy: 'These callers reached the greeting but never committed to a path. Check opening prompt length, queue-time clarity, and whether the greeting is too dense during peak periods.',
        },
        dropped_during_name: {
            label: 'Dropped during name',
            type: 'Abandonment',
            copy: 'Callers wanted to join but fell off before name capture completed. This usually points to speech-recognition friction or an overly fragile fallback moment.',
        },
        dropped_during_size: {
            label: 'Dropped during size',
            type: 'Abandonment',
            copy: 'Callers made it through name capture but did not finish party size. Revisit keypad instructions and make sure the prompt stays short and unambiguous.',
        },
        dropped_during_phone_confirmation: {
            label: 'Dropped during phone confirmation',
            type: 'Abandonment',
            copy: 'This is the last self-service hurdle before conversion. Higher drop-off here can indicate caller-ID mistrust or friction around manual phone entry.',
        },
        front_desk_transfer: {
            label: 'Front desk transfer',
            type: 'Transfer',
            copy: 'These callers routed to a human host. Use this to judge whether the IVR is deflecting routine traffic or still escalating too much to the floor.',
        },
        catering_transfer: {
            label: 'Catering transfer',
            type: 'Transfer',
            copy: 'Catering requests are intentionally carved out from normal waitlist demand. This helps separate event/business inquiries from dine-in queue pressure.',
        },
        menu_only: {
            label: 'Menu only',
            type: 'Self-service',
            copy: 'These callers resolved their need through menu information alone. Higher counts here usually mean the IVR is successfully deflecting basic menu questions.',
        },
        hours_only: {
            label: 'Hours / location only',
            type: 'Self-service',
            copy: 'These callers used the IVR for logistical information only. This is useful deflection, especially during peak host-stand load.',
        },
        join_error: {
            label: 'Join error',
            type: 'Failure',
            copy: 'A technical or validation failure interrupted the join flow. These should stay rare; if they climb, inspect logs immediately.',
        },
        joined_waitlist: {
            label: 'Joined waitlist',
            type: 'Conversion',
            copy: 'These callers completed the phone flow and became real queue entries. This is the phone-channel conversion number that matters most operationally.',
        },
    };
    const CALLER_CHOICE_LABELS = {
        join_waitlist: 'Press 1 · Join waitlist',
        repeat_wait: 'Press 2 · Repeat wait',
        menu: 'Press 3 · Menu',
        hours: 'Press 4 · Hours / location',
        front_desk: 'Press 0 · Front desk',
        catering: 'Press 5 · Catering',
    };

    function workspaceKey() {
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        return WORKSPACE_KEY_PREFIX + loc;
    }

    function rememberWorkspace() {
        localStorage.setItem(workspaceKey(), 'admin');
    }

    function currentLocationId() {
        return (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
    }

    function loginPageUrl() {
        return '/login?locationId=' + encodeURIComponent(currentLocationId());
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

    function formatCallerOutcome(key) {
        return CALLER_OUTCOME_META[key]?.label || key;
    }

    function formatCallerShare(share) {
        return `${Math.round(Number(share || 0) * 100)}%`;
    }

    function formatCallerTime(iso) {
        if (!iso) return '\u2014';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '\u2014';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(d);
    }

    function renderCallerDetail(outcome) {
        const meta = CALLER_OUTCOME_META[outcome?.key] || {
            label: 'Unknown outcome',
            type: 'Outcome',
            copy: 'No interpretation is available for this outcome yet.',
        };
        callerDetailType.textContent = meta.type;
        callerDetailTitle.textContent = meta.label;
        callerDetailCount.textContent = String(outcome?.count || 0);
        callerDetailShare.textContent = formatCallerShare(outcome?.share || 0);
        callerDetailCopy.textContent = meta.copy;
    }

    function renderCallerOutcomes(outcomes) {
        callerOutcomes.innerHTML = '';
        const preferred = outcomes.find(row => row.key === callerStatsSelectedOutcome)
            || outcomes.find(row => row.count > 0)
            || outcomes[0];
        callerStatsSelectedOutcome = preferred?.key || callerStatsSelectedOutcome;

        outcomes.forEach((row) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'caller-outcome-chip' + (row.key === callerStatsSelectedOutcome ? ' is-active' : '');
            button.innerHTML = `<span>${esc(formatCallerOutcome(row.key))}</span><strong>${row.count}</strong>`;
            button.addEventListener('click', () => {
                callerStatsSelectedOutcome = row.key;
                renderCallerOutcomes(outcomes);
            });
            callerOutcomes.appendChild(button);
        });

        renderCallerDetail(outcomes.find(row => row.key === callerStatsSelectedOutcome) || outcomes[0]);
    }

    function renderCallerChoices(choices) {
        callerChoices.innerHTML = '';
        choices.forEach((row) => {
            const item = document.createElement('div');
            item.className = 'caller-choice-row';
            item.innerHTML = `<span>${esc(CALLER_CHOICE_LABELS[row.key] || row.key)}</span><strong>${row.count}</strong><em>${formatCallerShare(row.share)}</em>`;
            callerChoices.appendChild(item);
        });
    }

    function renderCallerRecent(recentSessions) {
        callerRecent.innerHTML = '';
        if (!recentSessions.length) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="caller-table-empty">No completed caller outcomes yet for this range.</td>';
            callerRecent.appendChild(row);
            return;
        }

        recentSessions.forEach((session) => {
            const row = document.createElement('tr');
            const caller = session.callerLast4 ? `•••• ${esc(session.callerLast4)}` : '\u2014';
            const path = session.firstMenuChoice ? esc(CALLER_CHOICE_LABELS[session.firstMenuChoice] || session.firstMenuChoice) : '\u2014';
            row.innerHTML = `
                <td>${esc(formatCallerTime(session.startedAt))}</td>
                <td>${esc(formatCallerOutcome(session.finalOutcome))}</td>
                <td>${path}</td>
                <td>${session.queueCode ? esc(session.queueCode) : '\u2014'}</td>
                <td>${caller}</td>
            `;
            callerRecent.appendChild(row);
        });
    }

    function showCallerState(kind, message) {
        callerStatsError.style.display = kind === 'error' ? '' : 'none';
        callerStatsEmpty.style.display = kind === 'empty' ? '' : 'none';
        callerStatsContent.style.display = kind === 'content' ? '' : 'none';
        if (kind === 'error') callerStatsError.textContent = message;
        if (kind === 'empty') callerStatsEmpty.textContent = message;
    }

    async function loadCallerStats() {
        showCallerState('empty', 'Loading caller statistics...');
        callerCoverageNote.textContent = '';
        try {
            const r = await fetch(`api/host/caller-stats?range=${encodeURIComponent(callerStatsRange)}`);
            if (r.status === 401) { showLogin(); return; }
            const data = await r.json().catch(() => ({}));
            if (r.status === 403) {
                showCallerState('error', 'Caller statistics are available only to signed-in admins or owners.');
                return;
            }
            if (!r.ok) {
                showCallerState('error', data.error || 'Failed to load caller statistics.');
                return;
            }

            if (!data.funnel || data.funnel.inboundCalls === 0) {
                const rolloutNote = data.historicalCoverage?.hasLegacyGap
                    ? 'Caller funnel tracking begins from the rollout date for this feature. Older days may not have IVR funnel coverage.'
                    : 'No caller data yet for this range.';
                callerCoverageNote.textContent = rolloutNote;
                showCallerState('empty', rolloutNote);
                return;
            }

            callerFunnelInbound.textContent = String(data.funnel.inboundCalls || 0);
            callerFunnelJoinIntent.textContent = String(data.funnel.joinIntent || 0);
            callerFunnelPhone.textContent = String(data.funnel.reachedPhoneConfirmation || 0);
            callerFunnelJoined.textContent = String(data.funnel.joinedWaitlist || 0);
            callerCoverageNote.textContent = data.historicalCoverage?.hasLegacyGap
                ? 'Historical IVR funnel coverage starts at rollout. Pre-rollout days are intentionally excluded from caller analytics.'
                : `Showing caller data from ${data.dateRange?.from || '\u2014'} to ${data.dateRange?.to || '\u2014'}.`;
            renderCallerOutcomes(Array.isArray(data.outcomes) ? data.outcomes : []);
            renderCallerChoices(Array.isArray(data.firstMenuChoices) ? data.firstMenuChoices : []);
            renderCallerRecent(Array.isArray(data.recentSessions) ? data.recentSessions : []);
            showCallerState('content', '');
        } catch (err) {
            showCallerState('error', 'Failed to load caller statistics: ' + (err?.message || String(err)));
        }
    }

    async function loadVisitConfig() {
        try {
            const r = await fetch('api/host/visit-config');
            if (r.ok) {
                const data = await r.json();
                visitMode.value = data.visitMode || 'auto';
                visitMenuUrl.value = data.menuUrl || '';
                visitClosedMessage.value = data.closedMessage || '';
            }
            // 401/403 here just means the caller lacks edit rights. The QR
            // card below still renders from URL-shape inputs; if they later
            // click Save, the save handler surfaces the exact error.
        } catch {
            // Network-only failure; silently render the QR. Save will re-try.
        }
        // Show the URL that the door-QR actually resolves to, so the owner
        // can verify what scanners will land on without having to scan it.
        // Uses the same logic as the server-side QR endpoint. Rendered even
        // when the config fetch failed — the scanner URL is pure DOM state.
        const qrTarget = document.getElementById('admin-qr-target-url');
        const qrTestLink = document.getElementById('admin-qr-test-link');
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        const publicUrl = (siteConfiguredPublicUrl || '').trim().replace(/\/+$/, '');
        const publicHost = (sitePublicHost?.value || '').trim();
        const scannerBase = publicUrl || (publicHost ? `https://${publicHost}` : window.location.origin);
        const scannerUrl = `${scannerBase}/r/${encodeURIComponent(loc)}/visit`;
        // Always use the app-service URL for the "test link" so preview/admin
        // can verify routing even if the configured public host is not yet
        // reachable from this browser.
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
            cateringPhone.value = data.cateringPhone || '';
            largePartyThreshold.value = String(data.voiceLargePartyThreshold || 10);
        } catch {
            voiceStatus.textContent = 'Failed to load IVR settings';
            voiceStatus.className = 'visit-status error';
        }
    }

    async function loadGuestFeatures() {
        try {
            const r = await fetch('api/host/guest-features');
            if (!r.ok) return;
            const data = await r.json();
            if (guestFeatureMenu) guestFeatureMenu.value = String(data.menu !== false);
            if (guestFeatureOrder) guestFeatureOrder.value = String(data.order !== false);
            if (guestFeatureChat) guestFeatureChat.value = String(data.chat !== false);
            if (guestFeatureSms) guestFeatureSms.value = String(data.sms !== false);
        } catch {
            if (guestFeaturesStatus) {
                guestFeaturesStatus.textContent = 'Failed to load guest experience settings';
                guestFeaturesStatus.className = 'visit-status error';
            }
        }
    }

    // ─── Messaging config (issue #69) ────────────────────────────────────
    // Drives the sender-name field, char counter, live SMS preview, and the
    // read-only sender/voice number display on the Messaging tab.
    const SMS_SENDER_NAME_MAX = 30;

    function syncSmsPreview() {
        if (!smsSenderName) return;
        const raw = smsSenderName.value;
        const trimmed = raw.trim();
        const effective = trimmed || 'OSH';
        if (smsSenderCount) {
            smsSenderCount.textContent = raw.length + ' / ' + SMS_SENDER_NAME_MAX;
            smsSenderCount.classList.toggle('over-limit', raw.length > SMS_SENDER_NAME_MAX);
        }
        if (smsPreviewName1) smsPreviewName1.textContent = effective;
        if (smsPreviewName2) smsPreviewName2.textContent = effective;
    }

    function formatUSPhone(e164OrDigits) {
        if (!e164OrDigits) return '';
        const digits = String(e164OrDigits).replace(/\D/g, '').replace(/^1/, '');
        if (digits.length !== 10) return String(e164OrDigits);
        return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
    }

    function applyMessagingNumbers(data) {
        const prettyShared = formatUSPhone(data && data.sharedNumber);
        if (smsSharedNumber) smsSharedNumber.value = prettyShared;
        const fromText = prettyShared || 'your sending number';
        if (smsPreviewFromNumber) smsPreviewFromNumber.textContent = fromText;
        document.querySelectorAll('.sms-preview-from-number-twin').forEach((el) => { el.textContent = fromText; });
        if (voiceNumberDisplay) voiceNumberDisplay.value = formatUSPhone(data && data.twilioVoiceNumber);
    }

    async function loadMessagingConfig() {
        try {
            const r = await fetch('api/host/messaging-config');
            if (!r.ok) return;
            const data = await r.json();
            if (smsSenderName) smsSenderName.value = String(data.smsSenderName || '');
            applyMessagingNumbers(data);
            syncSmsPreview();
        } catch {
            if (smsSenderStatus) {
                smsSenderStatus.textContent = 'Failed to load messaging settings';
                smsSenderStatus.className = 'visit-status error';
            }
        }
    }

    if (smsSenderName) {
        smsSenderName.addEventListener('input', syncSmsPreview);
        // Initialize the preview to the empty-state fallback so the placeholder
        // state looks intentional before the first load.
        syncSmsPreview();
    }

    if (smsSenderSave) {
        smsSenderSave.addEventListener('click', async () => {
            const raw = smsSenderName ? smsSenderName.value.trim() : '';
            if (raw.length === 0) {
                setStatus(smsSenderStatus, 'Display name cannot be blank', 'error');
                return;
            }
            if (raw.length > SMS_SENDER_NAME_MAX) {
                setStatus(smsSenderStatus, 'Display name must be ' + SMS_SENDER_NAME_MAX + ' characters or fewer', 'error');
                return;
            }
            setStatus(smsSenderStatus, 'Saving…', '');
            smsSenderSave.disabled = true;
            try {
                const r = await fetch('api/host/messaging-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ smsSenderName: raw }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) {
                    setStatus(smsSenderStatus, data.error || 'Save failed', 'error');
                    return;
                }
                if (smsSenderName) smsSenderName.value = String(data.smsSenderName || '');
                applyMessagingNumbers(data);
                syncSmsPreview();
                flashSaved(smsSenderStatus);
            } catch {
                setStatus(smsSenderStatus, 'Network error', 'error');
            } finally {
                smsSenderSave.disabled = false;
            }
        });
    }

    function setStatus(el, text, kind) {
        el.textContent = text;
        el.className = 'visit-status' + (kind ? ' ' + kind : '');
    }

    visitSave.addEventListener('click', async () => {
        setStatus(visitStatus, 'Saving\u2026', '');
        visitSave.disabled = true;
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
            flashSaved(visitStatus);
        } catch {
            setStatus(visitStatus, 'Network error', 'error');
        } finally {
            visitSave.disabled = false;
        }
    });

    voiceSave.addEventListener('click', async () => {
        setStatus(voiceStatus, 'Saving\u2026', '');
        voiceSave.disabled = true;
        try {
            const r = await fetch('api/host/voice-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    voiceEnabled: voiceEnabled.value === 'true',
                    frontDeskPhone: frontDeskPhone.value.trim() || null,
                    cateringPhone: cateringPhone.value.trim() || null,
                    voiceLargePartyThreshold: Number(largePartyThreshold.value),
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setStatus(voiceStatus, data.error || 'Save failed', 'error');
                return;
            }
            flashSaved(voiceStatus);
        } catch {
            setStatus(voiceStatus, 'Network error', 'error');
        } finally {
            voiceSave.disabled = false;
        }
    });

    guestFeaturesSave.addEventListener('click', async () => {
        setStatus(guestFeaturesStatus, 'Saving\u2026', '');
        guestFeaturesSave.disabled = true;
        try {
            const r = await fetch('api/host/guest-features', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    menu: guestFeatureMenu?.value === 'true',
                    order: guestFeatureOrder?.value === 'true',
                    chat: guestFeatureChat?.value === 'true',
                    sms: guestFeatureSms?.value === 'true',
                }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setStatus(guestFeaturesStatus, data.error || 'Save failed', 'error');
                return;
            }
            flashSaved(guestFeaturesStatus);
        } catch {
            setStatus(guestFeaturesStatus, 'Network error', 'error');
        } finally {
            guestFeaturesSave.disabled = false;
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
            siteConfiguredPublicUrl = data.publicUrl || '';
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
        setStatus(siteStatus, 'Saving\u2026', '');
        siteSave.disabled = true;
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
            flashSaved(siteStatus);
        } catch {
            setStatus(siteStatus, 'Network error', 'error');
        } finally {
            siteSave.disabled = false;
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

    // Transient save feedback: show "Saved ✓" briefly, then clear. We
    // intentionally do NOT render a persistent "Saved Nm ago" relative
    // time — it reads as telemetry noise and implies pending state.
    function flashSaved(statusEl, text) {
        if (!statusEl) return;
        statusEl.textContent = text || 'Saved \u2713';
        statusEl.className = 'visit-status success';
        setTimeout(() => {
            if (statusEl.textContent === (text || 'Saved \u2713')) {
                statusEl.textContent = '';
                statusEl.className = 'visit-status';
            }
        }, 3000);
    }

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
    // ------------------------------------------------------------------
    // Menu builder (structured sections + items) + external-link fallback.
    // Builder state lives on the DOM: each section is a .menu-section
    // block with data-sid, items inside are .menu-item blocks with
    // data-iid. Save button serializes the DOM tree and POSTs to
    // /api/host/menu. External link is a separate card that still rides
    // on visit-config.menuUrl.
    // ------------------------------------------------------------------
    function menuUid() {
        return Math.random().toString(36).slice(2, 10);
    }

    const menuPendingUploads = new Map();

    function splitIngredientInput(raw) {
        return String(raw || '')
            .split(/\r?\n|,/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    function ingredientText(items) {
        return Array.isArray(items) ? items.join('\n') : '';
    }

    function readImageUpload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const match = /^data:([^;]+);base64,(.+)$/.exec(result);
                if (!match) { reject(new Error('Could not read image')); return; }
                const [, mime, data] = match;
                resolve({ preview: result, upload: { mime: mime, data: data } });
            };
            reader.onerror = () => reject(new Error('Could not read image'));
            reader.readAsDataURL(file);
        });
    }

    function renderMenuImageFrame(item) {
        const image = typeof item.image === 'string' ? item.image : '';
        if (image) {
            return '<img class="menu-item-image-preview has-image" alt="" src="' + esc(image) + '" />';
        }
        return '<div class="menu-item-image-preview menu-item-image-empty">No photo</div>';
    }

    function renderMenuItemRow(item) {
        const iid = item.id || menuUid();
        const name = esc(item.name || '');
        const desc = esc(item.description || '');
        const price = esc(item.price || '');
        const requiredIngredients = esc(ingredientText(item.requiredIngredients));
        const optionalIngredients = esc(ingredientText(item.optionalIngredients));
        const availability = item.availability === 'sold_out' ? 'sold_out' : 'available';
        const image = typeof item.image === 'string' ? item.image : '';
        return '<div class="menu-item" data-iid="' + esc(iid) + '" data-image="' + esc(image) + '">'
            + '<div class="menu-item-image-stack">'
            + '<div class="menu-item-image-frame">' + renderMenuImageFrame(item) + '</div>'
            + '<input type="file" class="menu-item-image-file" accept="image/*" hidden />'
            + '<div class="menu-item-image-actions">'
            + '<button type="button" class="secondary menu-item-image-pick">Pick photo</button>'
            + '<button type="button" class="menu-item-image-clear admin-danger-inline">Clear photo</button>'
            + '</div>'
            + '<div class="menu-item-image-note">Shown to guests on the ordering screen.</div>'
            + '</div>'
            + '<div class="menu-item-grid">'
            + '<label class="visit-field"><span class="visit-label">Item name</span>'
            + '<input type="text" class="menu-item-name" maxlength="120" value="' + name + '" placeholder="e.g. Masala Dosa" /></label>'
            + '<label class="visit-field visit-field-small menu-item-price-field"><span class="visit-label">Price</span>'
            + '<input type="text" class="menu-item-price" maxlength="40" value="' + price + '" placeholder="$12" /></label>'
            + '<label class="visit-field visit-field-small menu-item-availability-field"><span class="visit-label">Availability</span>'
            + '<select class="menu-item-availability"><option value="available"' + (availability === 'available' ? ' selected' : '') + '>Available</option><option value="sold_out"' + (availability === 'sold_out' ? ' selected' : '') + '>Sold out</option></select></label>'
            + '<label class="visit-field visit-field-full"><span class="visit-label">Description <span class="visit-sub-help">optional</span></span>'
            + '<textarea class="menu-item-desc" maxlength="500" rows="2" placeholder="Crispy rice-and-lentil crepe with spiced potato filling.">' + desc + '</textarea></label>'
            + '<label class="visit-field"><span class="visit-label">Included ingredients</span>'
            + '<textarea class="menu-item-required" maxlength="800" rows="3" placeholder="One per line">' + requiredIngredients + '</textarea></label>'
            + '<label class="visit-field"><span class="visit-label">Optional add-ons</span>'
            + '<textarea class="menu-item-optional" maxlength="800" rows="3" placeholder="One per line">' + optionalIngredients + '</textarea></label>'
            + '<div class="menu-item-row-actions visit-field-full"><button type="button" class="menu-item-delete admin-danger-inline" aria-label="Delete item">Remove item</button></div>'
            + '</div>'
            + '</div>';
    }

    function renderMenuSectionBlock(section) {
        const sid = section.id || menuUid();
        const title = esc(section.title || '');
        const items = (section.items || []).map(renderMenuItemRow).join('');
        return '<details class="menu-section" data-sid="' + esc(sid) + '" open>'
            + '<summary class="menu-section-head">'
            + '<input type="text" class="menu-section-title" maxlength="80" value="' + title + '" placeholder="e.g. Appetizers" />'
            + '<button type="button" class="menu-section-delete admin-danger-inline" aria-label="Delete section">Delete section</button>'
            + '</summary>'
            + '<div class="menu-items-list">' + items + '</div>'
            + '<div class="menu-section-actions"><button type="button" class="menu-item-add secondary">+ Add item</button></div>'
            + '</details>';
    }

    function renderMenuSections(menu) {
        const container = document.getElementById('admin-menu-sections');
        const empty = document.getElementById('admin-menu-empty');
        if (!container) return;
        const sections = Array.isArray(menu?.sections) ? menu.sections : [];
        const html = sections.map(renderMenuSectionBlock).join('');
        container.innerHTML = html + (empty ? empty.outerHTML : '');
        const emptyEl = document.getElementById('admin-menu-empty');
        if (emptyEl) emptyEl.style.display = sections.length === 0 ? 'block' : 'none';
    }

    function serializeMenuFromDom() {
        const container = document.getElementById('admin-menu-sections');
        if (!container) return { sections: [] };
        const sections = Array.from(container.querySelectorAll('.menu-section')).map(sec => {
            const sid = sec.getAttribute('data-sid') || menuUid();
            const title = (sec.querySelector('.menu-section-title')?.value || '').trim();
            const items = Array.from(sec.querySelectorAll('.menu-item')).map(it => {
                const iid = it.getAttribute('data-iid') || menuUid();
                const name = (it.querySelector('.menu-item-name')?.value || '').trim();
                const description = (it.querySelector('.menu-item-desc')?.value || '').trim();
                const price = (it.querySelector('.menu-item-price')?.value || '').trim();
                const availability = (it.querySelector('.menu-item-availability')?.value || 'available').trim();
                const requiredIngredients = splitIngredientInput(it.querySelector('.menu-item-required')?.value || '');
                const optionalIngredients = splitIngredientInput(it.querySelector('.menu-item-optional')?.value || '');
                const out = { id: iid, name };
                if (description) out.description = description;
                if (price) out.price = price;
                if (availability === 'sold_out') out.availability = 'sold_out';
                if (requiredIngredients.length > 0) out.requiredIngredients = requiredIngredients;
                if (optionalIngredients.length > 0) out.optionalIngredients = optionalIngredients;
                const pendingUpload = menuPendingUploads.get(iid);
                const image = it.getAttribute('data-image') || '';
                if (pendingUpload) out.image = pendingUpload;
                else if (image) out.image = image;
                return out;
            }).filter(it => it.name.length > 0);
            return { id: sid, title, items };
        }).filter(s => s.title.length > 0);
        return { sections };
    }

    async function loadMenuBuilder() {
        // Structured menu
        try {
            const r = await fetch('api/menu');
            const data = r.ok ? await r.json() : { menu: { sections: [] }, menuUrl: '' };
            renderMenuSections(data.menu);
            const urlInput = $('admin-menu-url');
            if (urlInput) urlInput.value = data.menuUrl || '';
        } catch {
            renderMenuSections({ sections: [] });
        }
    }

    function wireMenuBuilder() {
        const container = document.getElementById('admin-menu-sections');
        const addSectionBtn = $('admin-menu-add-section');
        const saveBtn = $('admin-menu-save');
        const statusEl = $('admin-menu-status');
        if (!container || !addSectionBtn || !saveBtn) return;

        // Event delegation: add item, delete item, delete section all
        // bubble to the container.
        container.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            if (t.classList.contains('menu-item-add')) {
                const sec = t.closest('.menu-section');
                if (!sec) return;
                const items = sec.querySelector('.menu-items-list');
                if (items) items.insertAdjacentHTML('beforeend', renderMenuItemRow({ id: menuUid() }));
            } else if (t.classList.contains('menu-item-delete')) {
                const item = t.closest('.menu-item');
                const iid = item?.getAttribute('data-iid');
                if (iid) menuPendingUploads.delete(iid);
                t.closest('.menu-item')?.remove();
            } else if (t.classList.contains('menu-item-image-pick')) {
                const item = t.closest('.menu-item');
                item?.querySelector('.menu-item-image-file')?.click();
            } else if (t.classList.contains('menu-item-image-clear')) {
                const item = t.closest('.menu-item');
                if (!item) return;
                const iid = item.getAttribute('data-iid');
                if (iid) menuPendingUploads.delete(iid);
                item.setAttribute('data-image', '');
                const preview = item.querySelector('.menu-item-image-frame');
                if (preview) preview.innerHTML = renderMenuImageFrame({});
                const file = item.querySelector('.menu-item-image-file');
                if (file) file.value = '';
            } else if (t.classList.contains('menu-section-delete')) {
                // Prevent the summary from also toggling open/closed.
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Delete this section and all its items?')) {
                    t.closest('.menu-section')?.remove();
                    const empty = document.getElementById('admin-menu-empty');
                    if (empty && !document.querySelector('.menu-section')) empty.style.display = 'block';
                }
            }
        });

        container.addEventListener('change', async (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement) || !t.classList.contains('menu-item-image-file')) return;
            const item = t.closest('.menu-item');
            const iid = item?.getAttribute('data-iid');
            const file = t.files?.[0];
            if (!item || !iid || !file) return;
            try {
                const result = await readImageUpload(file);
                menuPendingUploads.set(iid, result.upload);
                item.setAttribute('data-image', '');
                const preview = item.querySelector('.menu-item-image-frame');
                if (preview) preview.innerHTML = '<img class="menu-item-image-preview has-image" alt="" src="' + esc(result.preview) + '" />';
            } catch (err) {
                setStatus(statusEl, err && err.message ? err.message : 'Could not read photo', 'error');
            }
        });

        addSectionBtn.addEventListener('click', () => {
            const empty = document.getElementById('admin-menu-empty');
            if (empty) empty.style.display = 'none';
            container.insertAdjacentHTML(
                'beforeend',
                renderMenuSectionBlock({ id: menuUid(), title: '', items: [{ id: menuUid(), name: '' }] }),
            );
            container.querySelector('.menu-section:last-of-type .menu-section-title')?.focus();
        });

        saveBtn.addEventListener('click', async () => {
            setStatus(statusEl, '', '');
            const menu = serializeMenuFromDom();
            saveBtn.disabled = true;
            try {
                const r = await fetch('api/host/menu', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ menu }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) { setStatus(statusEl, data.error || 'Save failed', 'error'); return; }
                menuPendingUploads.clear();
                await loadMenuBuilder();
                flashSaved(statusEl);
            } catch {
                setStatus(statusEl, 'Network error', 'error');
            } finally {
                saveBtn.disabled = false;
            }
        });

        // External menu link (URL-only fallback, lives on visit-config).
        const urlSave = $('admin-menu-url-save');
        if (urlSave) {
            urlSave.addEventListener('click', async () => {
                const urlStatus = $('admin-menu-url-status');
                setStatus(urlStatus, '', '');
                const url = ($('admin-menu-url')?.value || '').trim() || null;
                try {
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
                    if (!r.ok) { setStatus(urlStatus, data.error || 'Save failed', 'error'); return; }
                    flashSaved(urlStatus);
                    if (visitMenuUrl) visitMenuUrl.value = url || '';
                } catch {
                    setStatus(urlStatus, 'Network error', 'error');
                }
            });
        }
    }

    // Wire the menu builder once the DOM is ready (it's in admin.html from
    // the start, so no need to wait for a tab-activation).
    wireMenuBuilder();

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
    // ─── Device PIN: admin-set (GET current, POST new) ───────────────────
    async function loadDevicePin() {
        const displayEl = $('admin-device-pin-display');
        if (!displayEl) return;
        try {
            const r = await fetch('api/host/pin');
            if (!r.ok) { displayEl.value = ''; displayEl.placeholder = '(not set)'; return; }
            const data = await r.json();
            displayEl.value = data.pin || '';
        } catch {
            displayEl.value = '';
        }
    }
    const devicePinSave = $('admin-device-pin-save');
    const devicePinRegenerate = $('admin-device-pin-regen');
    if (devicePinSave) {
        devicePinSave.addEventListener('click', async () => {
            const statusEl = $('admin-device-pin-status');
            const newInput = $('admin-device-pin-new');
            const pin = (newInput?.value || '').trim();
            setStatus(statusEl, '', '');
            if (!/^\d{4,6}$/.test(pin)) {
                setStatus(statusEl, 'PIN must be 4–6 digits', 'error');
                return;
            }
            devicePinSave.disabled = true;
            try {
                const r = await fetch('api/host/pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) { setStatus(statusEl, data.error || 'Save failed', 'error'); return; }
                flashSaved(statusEl, 'PIN updated \u2713');
                // Refresh the current-PIN display; clear the input.
                if (newInput) newInput.value = '';
                await loadDevicePin();
            } catch {
                setStatus(statusEl, 'Network error', 'error');
            } finally {
                devicePinSave.disabled = false;
            }
        });
    }
    if (devicePinRegenerate) {
        devicePinRegenerate.addEventListener('click', () => {
            showToast('PIN regeneration is not wired yet. Set a new PIN above for now.', 'info');
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
            const pickBtn = sigRowEl(i)?.querySelector('[data-sig-pick]');
            if (pickBtn && file) {
                // Robust pattern: a visible <button> explicitly invokes the
                // hidden <input type="file">. Works across browsers, popup
                // blockers, and extension click interceptors — the click()
                // call happens inside the user-gesture event handler, so
                // the native OS file chooser always opens.
                pickBtn.addEventListener('click', () => {
                    try { file.click(); } catch (err) { console.error('file picker open failed', err); }
                });
            }
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
            setStatus(websiteStatus, 'Saving\u2026', '');
            websiteSave.disabled = true;
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
                flashSaved(websiteStatus);
            } catch {
                setStatus(websiteStatus, 'Network error', 'error');
            } finally {
                websiteSave.disabled = false;
            }
        });
    }

    [rangeSelect, partySizeSelect, startStageSelect, endStageSelect].forEach((el) => {
        el.addEventListener('change', loadAnalytics);
    });
    callerRangeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextRange = btn.getAttribute('data-caller-range');
            if (!nextRange || nextRange === callerStatsRange) return;
            callerStatsRange = nextRange;
            callerRangeButtons.forEach(other => other.classList.toggle('is-active', other === btn));
            loadCallerStats();
        });
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.href = loginPageUrl();
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
        if (r.status === 401 && body.error === 'login_required') {
            window.location.href = loginPageUrl();
            return;
        }
        loginError.textContent = body.error || 'Login failed';
        loginError.style.display = '';
    });

    // ------------------------------------------------------------------
    // Email + password sign-in (for owners/admins). PIN unlock only grants
    // `host` role, so admin-level saves (menu, QR, profile, Google) 403.
    // Named sign-in hits /api/login and sets skb_session, which carries
    // the owner/admin role. Tabs that live under requireAdmin start
    // actually persisting changes once this cookie is present.
    // ------------------------------------------------------------------
    const showEmailLoginLink = $('admin-login-show-email');
    const showPinLoginLink = $('admin-login-show-pin');
    const pinBlock = $('admin-login-pin-block');
    const emailBlock = $('admin-login-email-block');
    const emailForm = $('admin-login-email-form');
    const emailErrorEl = $('admin-login-email-error');
    function swapToEmailLogin(e) { if (e) e.preventDefault(); if (pinBlock) pinBlock.style.display = 'none'; if (emailBlock) emailBlock.style.display = ''; $('admin-login-email')?.focus(); }
    function swapToPinLogin(e) { if (e) e.preventDefault(); if (emailBlock) emailBlock.style.display = 'none'; if (pinBlock) pinBlock.style.display = ''; $('admin-pin')?.focus(); }
    if (showEmailLoginLink) showEmailLoginLink.addEventListener('click', swapToEmailLogin);
    if (showPinLoginLink) showPinLoginLink.addEventListener('click', swapToPinLogin);

    if (emailForm) {
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (emailErrorEl) emailErrorEl.style.display = 'none';
            const email = ($('admin-login-email')?.value || '').trim();
            const password = $('admin-login-password')?.value || '';
            const locMatch = window.location.pathname.match(/^\/r\/([^/]+)\//);
            const locationId = locMatch ? locMatch[1] : undefined;
            try {
                const r = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(locationId ? { email, password, locationId } : { email, password }),
                });
                const body = await r.json().catch(() => ({}));
                if (!r.ok) {
                    if (emailErrorEl) {
                        emailErrorEl.textContent = body.error === 'no membership at location'
                            ? 'You are not a member of this restaurant. Ask the owner to invite you.'
                            : (body.error || 'Sign-in failed');
                        emailErrorEl.style.display = '';
                    }
                    return;
                }
                // Hard reload so admin.js runs showAdmin() cleanly against
                // the new cookie and the wizard / role-gates re-evaluate.
                window.location.reload();
            } catch {
                if (emailErrorEl) {
                    emailErrorEl.textContent = 'Network error';
                    emailErrorEl.style.display = '';
                }
            }
        });
    }

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
    // 7-tab workspace. Tabs (in order):
    //   dashboard · profile · website · menu · frontdesk · staff · integrations
    //
    // Renamed from the earlier site/settings/ai split so each tab has a
    // single clear purpose:
    //   profile      — the restaurant (address, hours, brand identity)
    //   frontdesk    — IVR, Door QR routing, Device PIN (how guests
    //                  physically reach the host stand)
    //   integrations — MCP / AI + Google Business (outward connections)
    //
    // Each panel is lazy-loaded via `tabLoaders` on first activation. The
    // last-active tab is persisted per-location in localStorage under
    // `skb:adminTab:<loc>` so reloads land the operator back where they
    // left off. Hidden-by-role tabs (currently just `staff`) fall back to
    // `dashboard` when the stored key isn't visible.
    //
    // Legacy keys ('site', 'ai', 'settings') from older URLs or saved state
    // are aliased in `rememberWorkspace` / URL parsing so pre-rename
    // bookmarks + Google OAuth redirects still land somewhere sensible.
    // ------------------------------------------------------------------
    const TAB_KEYS = ['dashboard', 'profile', 'website', 'menu', 'frontdesk', 'messaging', 'staff', 'integrations'];
    const LEGACY_TAB_ALIAS = { site: 'profile', ai: 'integrations', settings: 'frontdesk' };
    const loadedPanels = new Set();

    function normalizeTabKey(key) {
        return LEGACY_TAB_ALIAS[key] || key;
    }

    function adminTabStorageKey() {
        const loc = (window.location.pathname.match(/^\/r\/([^/]+)\//) || [])[1] || 'skb';
        return 'skb:adminTab:' + loc;
    }

    const tabLoaders = {
        dashboard: async () => { await Promise.all([loadStats(), loadAnalytics(), loadCallerStats()]); },
        profile: async () => { await loadSiteConfig(); },
        website: async () => { await loadWebsiteConfig(); },
        menu: async () => { await loadMenuBuilder(); },
        frontdesk: async () => { await Promise.all([loadVisitConfig(), loadVoiceConfig(), loadGuestFeatures(), loadDevicePin()]); },
        messaging: async () => { await loadMessagingConfig(); },
        staff: async () => { await loadStaff(); },
        integrations: async () => { await loadMcpConfig(); await loadGoogleCard(); },
    };

    // ─── Google Business Profile card (issue #51 Phase D) ────────────────
    // The card has a small state machine driven by /api/google/status +
    // /api/google/locations. See admin.html for the DOM it renders into.
    async function loadGoogleCard() {
        const card = document.getElementById('admin-gbp-card');
        if (!card) return;
        const body = document.getElementById('admin-gbp-body');
        const connectBtn = document.getElementById('admin-gbp-connect');
        const syncBtn = document.getElementById('admin-gbp-sync');
        const linkBtn = document.getElementById('admin-gbp-link');
        const discBtn = document.getElementById('admin-gbp-disconnect');
        const status = document.getElementById('admin-gbp-status');
        const lastSync = document.getElementById('admin-gbp-last-sync');
        const blurb = document.getElementById('admin-gbp-blurb');

        function hide(el) { if (el) el.style.display = 'none'; }
        function show(el, display) { if (el) el.style.display = display || ''; }
        function setStatusLine(text, kind) {
            if (!status) return;
            status.textContent = text || '';
            status.className = 'visit-status' + (kind ? ' ' + kind : '');
        }

        // Reset state
        hide(connectBtn); hide(syncBtn); hide(linkBtn); hide(discBtn); hide(lastSync);
        body.innerHTML = '<div style="color:#78716c;font-size:13px">Loading Google Business Profile status…</div>';

        let data;
        try {
            const r = await fetch('api/google/status');
            if (r.status === 401 || r.status === 403) {
                // PIN-only hosts don't have permission to manage Google.
                // Show a clear sign-in call-to-action instead of raw status.
                card.setAttribute('data-state', 'needs_session');
                body.innerHTML = '<div style="color:#78716c;font-size:13px">'
                    + 'Sign in with your OSH owner or admin account to connect Google Business Profile.'
                    + '</div>';
                setStatusLine('', '');
                return;
            }
            if (!r.ok) throw new Error('status ' + r.status);
            data = await r.json();
        } catch (err) {
            body.innerHTML = '<div style="color:#b45309;font-size:13px">Couldn\'t check Google status.</div>';
            setStatusLine('Check failed: ' + (err && err.message ? err.message : 'network error'), 'error');
            card.setAttribute('data-state', 'error');
            return;
        }

        if (!data.credsConfigured) {
            card.setAttribute('data-state', 'creds_missing');
            body.innerHTML = '<div style="color:#78716c;font-size:13px">'
                + 'Google credentials are not configured on this server yet. '
                + 'Ask your OSH admin to set <code>OSH_GOOGLE_CLIENT_ID</code> and <code>OSH_GOOGLE_CLIENT_SECRET</code>. '
                + 'The rest of OSH keeps working in the meantime.</div>';
            if (connectBtn) { connectBtn.disabled = true; show(connectBtn); }
            return;
        }

        if (!data.connected) {
            card.setAttribute('data-state', 'not_connected');
            blurb.textContent = 'Connect your Google Business listing so hours, phone, and description sync automatically.';
            body.innerHTML = '';
            if (connectBtn) { connectBtn.disabled = false; show(connectBtn); }
            return;
        }

        // Connected. Decide single vs. multi.
        if (data.locationResourceName) {
            card.setAttribute('data-state', 'connected_single');
            body.innerHTML = '<div style="font-size:13px">'
                + '<div><strong>Linked to:</strong> <code>' + esc(data.locationResourceName) + '</code></div>'
                + (data.accountId ? '<div style="color:#78716c;margin-top:4px">Account: <code>' + esc(data.accountId) + '</code></div>' : '')
                + '</div>';
            show(syncBtn); show(discBtn);
        } else {
            card.setAttribute('data-state', 'connected_multi');
            body.innerHTML = '<div style="font-size:13px;margin-bottom:8px">Your Google account has multiple locations. Pick the one that matches this restaurant:</div>'
                + '<select id="admin-gbp-loc-select" style="width:100%;padding:8px"><option value="">Loading…</option></select>'
                + '<div id="admin-gbp-loc-hint" style="display:none;margin-top:10px;padding:10px 12px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;color:#78350f;font-size:13px;line-height:1.5"></div>';
            show(linkBtn); show(discBtn);
            const sel = document.getElementById('admin-gbp-loc-select');
            const hint = document.getElementById('admin-gbp-loc-hint');
            function showHint(text) {
                if (!hint) return;
                hint.textContent = text;
                hint.style.display = '';
                if (linkBtn) linkBtn.disabled = true;
            }
            try {
                const r = await fetch('api/google/locations');
                if (r.status === 429) {
                    const data = await r.json().catch(() => ({}));
                    sel.innerHTML = '<option value="">(Google rate limit hit — try again shortly)</option>';
                    showHint(data.hint || 'Google Business Profile API quota hit. Wait ~60 seconds and reload.');
                } else if (!r.ok) {
                    const data = await r.json().catch(() => ({}));
                    sel.innerHTML = '<option value="">(couldn\u2019t load locations)</option>';
                    showHint('Couldn\u2019t fetch your GBP locations (' + (data.error || 'status ' + r.status) + '). Reload, or disconnect and reconnect if the error persists.');
                } else {
                    const locs = (await r.json()).locations || [];
                    if (locs.length === 0) {
                        sel.innerHTML = '<option value="">(no locations on this account)</option>';
                        showHint('Your Google account is connected, but it doesn\u2019t own any Business Profile locations yet. Finish verifying your listing at business.google.com, then reload.');
                    } else if (locs.length === 1) {
                        sel.innerHTML = '<option value="' + esc(locs[0].name) + '">'
                            + esc(locs[0].title || locs[0].name) + (locs[0].address ? ' — ' + esc(locs[0].address) : '')
                            + '</option>';
                        if (linkBtn) linkBtn.disabled = false;
                    } else {
                        sel.innerHTML = '<option value="">— pick one —</option>' + locs.map(function (l) {
                            return '<option value="' + esc(l.name) + '">'
                                + esc(l.title || l.name) + (l.address ? ' — ' + esc(l.address) : '')
                                + '</option>';
                        }).join('');
                        if (linkBtn) linkBtn.disabled = false;
                    }
                }
            } catch (err) {
                sel.innerHTML = '<option value="">(network error)</option>';
                showHint('Couldn\u2019t reach the server. Check your connection and reload.');
            }
        }

        if (data.lastSyncAt) {
            show(lastSync);
            lastSync.textContent = 'Last synced: ' + new Date(data.lastSyncAt).toLocaleString();
        }
        if (data.lastSyncError) {
            show(lastSync);
            lastSync.textContent = 'Last sync error: ' + data.lastSyncError;
            lastSync.style.color = '#b91c1c';
        }
    }

    function wireGoogleCard() {
        const connectBtn = document.getElementById('admin-gbp-connect');
        const syncBtn = document.getElementById('admin-gbp-sync');
        const linkBtn = document.getElementById('admin-gbp-link');
        const discBtn = document.getElementById('admin-gbp-disconnect');
        const status = document.getElementById('admin-gbp-status');
        function setStatusLine(text, kind) {
            if (!status) return;
            status.textContent = text || '';
            status.className = 'visit-status' + (kind ? ' ' + kind : '');
        }

        if (connectBtn) connectBtn.addEventListener('click', async () => {
            setStatusLine('Connecting…');
            connectBtn.disabled = true;
            try {
                const r = await fetch('api/google/oauth/start', { method: 'POST' });
                if (!r.ok) {
                    const body = await r.json().catch(() => ({}));
                    throw new Error(body.error || ('status ' + r.status));
                }
                const data = await r.json();
                window.location.href = data.authUrl;
            } catch (err) {
                setStatusLine('Connect failed: ' + (err && err.message ? err.message : 'network error'), 'error');
                connectBtn.disabled = false;
            }
        });

        if (syncBtn) syncBtn.addEventListener('click', async () => {
            setStatusLine('Syncing…');
            syncBtn.disabled = true;
            try {
                const r = await fetch('api/google/sync', { method: 'POST' });
                const data = await r.json().catch(() => ({}));
                if (!r.ok || !data.ok) {
                    throw new Error(data.error || ('status ' + r.status));
                }
                setStatusLine('Synced. Hours, phone, and description pushed to Google.', 'ok');
            } catch (err) {
                setStatusLine('Sync failed: ' + (err && err.message ? err.message : 'network error'), 'error');
            } finally {
                syncBtn.disabled = false;
                loadGoogleCard();
            }
        });

        if (linkBtn) linkBtn.addEventListener('click', async () => {
            const sel = document.getElementById('admin-gbp-loc-select');
            const value = sel ? sel.value : '';
            if (!value) { setStatusLine('Pick a location first.', 'error'); return; }
            linkBtn.disabled = true;
            setStatusLine('Linking…');
            try {
                const r = await fetch('api/google/link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationResourceName: value }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || ('status ' + r.status));
                setStatusLine('Linked.', 'ok');
                loadGoogleCard();
            } catch (err) {
                setStatusLine('Link failed: ' + (err && err.message ? err.message : 'network error'), 'error');
            } finally {
                linkBtn.disabled = false;
            }
        });

        if (discBtn) discBtn.addEventListener('click', async () => {
            if (!window.confirm('Disconnect Google Business Profile? Hours, phone, and description will stop syncing to Google.')) return;
            discBtn.disabled = true;
            setStatusLine('Disconnecting…');
            try {
                const r = await fetch('api/google/disconnect', { method: 'POST' });
                if (!r.ok) {
                    const body = await r.json().catch(() => ({}));
                    throw new Error(body.error || ('status ' + r.status));
                }
                setStatusLine('Disconnected.', 'ok');
                loadGoogleCard();
            } catch (err) {
                setStatusLine('Disconnect failed: ' + (err && err.message ? err.message : 'network error'), 'error');
            } finally {
                discBtn.disabled = false;
            }
        });

        // If we were just redirected back from Google with `?google=connected`
        // or `?google=error=...`, surface that as a status line and force
        // a card refresh.
        (function handleRedirectParams() {
            const params = new URLSearchParams(window.location.search);
            const g = params.get('google');
            if (!g) return;
            if (g === 'connected') {
                setStatusLine('Connected to Google Business.', 'ok');
            } else if (g.indexOf('error') === 0) {
                const reason = g.split('=')[1] || 'unknown';
                setStatusLine('Connect failed: ' + reason, 'error');
            }
            // Strip the query param without a reload.
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('google');
                url.searchParams.delete('tab');
                window.history.replaceState({}, document.title, url.toString());
            } catch {}
        })();
    }

    function activateTab(key, opts = {}) {
        key = normalizeTabKey(key);
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
            if (saved) {
                const normalized = normalizeTabKey(saved);
                if (TAB_KEYS.includes(normalized)) key = normalized;
            }
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
    wireGoogleCard();

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
