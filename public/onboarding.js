// ============================================================================
// Owner onboarding wizard — client (issue #51 Phase C)
// ============================================================================
//
// Self-contained inline 6-step flow that replaces the old shell-of-links
// stub. Runs on /r/:loc/admin.html.
//
//   GET  api/onboarding/steps                      — progress
//   POST api/onboarding/steps  { step }            — mark step complete
//   GET  api/host/site-config, api/host/voice-config, api/config/website,
//        api/host/visit-config                     — load current values
//   POST api/host/site-config, api/host/voice-config, api/config/website,
//        api/host/visit-config                     — save step payloads
//   POST api/staff/invite { email, name, role }    — queue of invites
//   GET  api/host/pin                              — host PIN for "you're live"
//
// The flow keeps baselines per step so each step's Cancel reverts to the
// last-saved state and Save enables only when dirty. Each successful Save
// POSTs the step id back to /api/onboarding/steps so progress persists
// across devices + sessions.
// ============================================================================

(function () {
    'use strict';

    var SESSION_KEY = 'skb-onboarding-dismissed';
    var WIZ_STATE_KEY = 'skb-onboarding-wiz-state';
    // Ordered. Matches src/routes/onboarding.ts STEP_IDS.
    var STEP_IDS = ['basics', 'template', 'content', 'dishes', 'menu', 'staff'];
    var SKIPPABLE = { basics: true, content: true, dishes: true, menu: true, staff: true };
    var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    var DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    var SERVICE_KEYS = ['breakfast', 'lunch', 'special', 'dinner'];
    var SERVICE_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', special: 'Special', dinner: 'Dinner' };

    function $(id) { return document.getElementById(id); }

    var overlay = $('onboarding-overlay');
    var pill = $('onboarding-reopen');
    var dismiss1 = $('onboarding-dismiss');
    if (!overlay || !pill) return;

    // ─── URL helpers ─────────────────────────────────────────────────────
    function getSlug() {
        var m = window.location.pathname.match(/^\/r\/([^/]+)\//);
        return m ? m[1] : '';
    }
    var slug = getSlug();
    function apiPath(path) { return 'api/' + path.replace(/^\/+/, ''); }
    function publicSiteUrl() {
        // Resolve /r/<slug>/ relative to the current admin URL so custom
        // public-host deployments keep working.
        return '/r/' + slug + '/';
    }

    // ─── Backend ─────────────────────────────────────────────────────────
    async function fetchJson(path, init) {
        try {
            var res = await fetch(apiPath(path), Object.assign({ credentials: 'same-origin' }, init || {}));
            var text = await res.text();
            var json = text ? JSON.parse(text) : {};
            return { ok: res.ok, status: res.status, body: json };
        } catch (e) {
            return { ok: false, status: 0, body: { error: String(e && e.message || e) } };
        }
    }

    async function loadAll() {
        var out = {};
        var [sc, vc, wc, vec, st] = await Promise.all([
            fetchJson('host/site-config'),
            fetchJson('host/voice-config'),
            fetchJson('config/website'),
            fetchJson('host/visit-config'),
            fetchJson('onboarding/steps'),
        ]);
        out.site = sc.ok ? sc.body : {};
        out.voice = vc.ok ? vc.body : {};
        out.website = wc.ok ? wc.body : {};
        out.visit = vec.ok ? vec.body : {};
        out.onboarding = st.ok ? st.body : { steps: [] };
        return out;
    }

    async function markStepComplete(step) {
        return fetchJson('onboarding/steps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: step }),
        });
    }

    // ─── State ───────────────────────────────────────────────────────────
    // Per-step form snapshots so Cancel can restore. `loaded` = last-saved
    // values (baseline). `values()` reads the live form. `dirty` = not
    // equal to baseline.
    var state = {
        currentIndex: 0,                 // 0..5 for the 6 steps, 6 = "done" screen
        completed: {},                   // { [stepId]: true }
        baselines: {},                   // { [stepId]: serialized }
        staffQueue: [],                  // { name, email, role }[]
        dishData: [emptyDish(), emptyDish(), emptyDish()], // pending/existing
        loc: {},                         // raw loadAll() response
        pin: '',
    };

    function emptyDish() {
        return { existingUrl: '', pendingUpload: null, cleared: false };
    }

    // ─── DOM refs per step ───────────────────────────────────────────────
    function stepPanel(id) {
        return overlay.querySelector('.onboarding-wiz-panel[data-panel="' + id + '"]');
    }
    function saveBtn(id) { return overlay.querySelector('.wiz-save[data-step="' + id + '"]'); }
    function cancelBtn(id) { return overlay.querySelector('.wiz-cancel[data-step="' + id + '"]'); }
    function validationEl(id) { return $('wiz-' + id + '-validation'); }

    // ─── Step 1: basics ──────────────────────────────────────────────────
    function renderHoursGrid() {
        var body = $('wiz-basics-hours-body');
        if (!body) return;
        body.innerHTML = '';
        DAYS.forEach(function (day) {
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<th scope="row">' + DAY_LABELS[day] + '</th>' +
                '<td><input type="checkbox" class="wiz-day-closed" data-day="' + day + '" aria-label="' + DAY_LABELS[day] + ' closed" /></td>' +
                '<td><div class="wiz-hours-services">' +
                    SERVICE_KEYS.map(function (service) {
                        return '<div class="wiz-hours-window">' +
                            '<span>' + SERVICE_LABELS[service] + '</span>' +
                            '<input type="time" class="wiz-day-open" data-day="' + day + '" data-service="' + service + '" aria-label="' + DAY_LABELS[day] + ' ' + SERVICE_LABELS[service] + ' opens" />' +
                            ' – ' +
                            '<input type="time" class="wiz-day-close" data-day="' + day + '" data-service="' + service + '" aria-label="' + DAY_LABELS[day] + ' ' + SERVICE_LABELS[service] + ' closes" />' +
                        '</div>';
                    }).join('') +
                '</div></td>' +
                '<td><button type="button" class="secondary wiz-hours-copy" data-day="' + day + '">Copy to all</button></td>';
            body.appendChild(tr);
        });
    }

    function hourInput(day, kind, service) {
        return document.querySelector('.wiz-day-' + kind + '[data-day="' + day + '"][data-service="' + service + '"]');
    }

    function applyBasicsClosedToggle(day) {
        var closedEl = document.querySelector('.wiz-day-closed[data-day="' + day + '"]');
        var closed = !!(closedEl && closedEl.checked);
        SERVICE_KEYS.forEach(function (service) {
            var openEl = hourInput(day, 'open', service);
            var closeEl = hourInput(day, 'close', service);
            if (openEl) openEl.disabled = closed;
            if (closeEl) closeEl.disabled = closed;
            if (closed) {
                if (openEl) openEl.value = '';
                if (closeEl) closeEl.value = '';
            }
        });
    }

    function basicsLoad(siteCfg, voiceCfg) {
        var addr = (siteCfg && siteCfg.address) || {};
        var hours = (siteCfg && siteCfg.hours) || {};
        setVal('wiz-basics-street', addr.street || '');
        setVal('wiz-basics-city', addr.city || '');
        setVal('wiz-basics-state', addr.state || '');
        setVal('wiz-basics-zip', addr.zip || '');
        setVal('wiz-basics-phone', (voiceCfg && voiceCfg.frontDeskPhone) || '');
        DAYS.forEach(function (day) {
            var entry = hours[day];
            var closedEl = document.querySelector('.wiz-day-closed[data-day="' + day + '"]');
            if (!closedEl) return;
            if (entry === 'closed') {
                closedEl.checked = true;
                SERVICE_KEYS.forEach(function (service) {
                    var openEl = hourInput(day, 'open', service);
                    var closeEl = hourInput(day, 'close', service);
                    if (openEl) openEl.value = '';
                    if (closeEl) closeEl.value = '';
                });
            } else if (entry && typeof entry === 'object') {
                closedEl.checked = false;
                SERVICE_KEYS.forEach(function (service) {
                    var openEl = hourInput(day, 'open', service);
                    var closeEl = hourInput(day, 'close', service);
                    var win = entry[service] || {};
                    if (openEl) openEl.value = win.open || '';
                    if (closeEl) closeEl.value = win.close || '';
                });
            } else {
                closedEl.checked = false;
                SERVICE_KEYS.forEach(function (service) {
                    var openEl = hourInput(day, 'open', service);
                    var closeEl = hourInput(day, 'close', service);
                    if (openEl) openEl.value = '';
                    if (closeEl) closeEl.value = '';
                });
            }
            applyBasicsClosedToggle(day);
        });
        state.baselines.basics = basicsReadForm();
        markCleanEnabled('basics', false);
    }

    function basicsReadForm() {
        var hours = {};
        DAYS.forEach(function (day) {
            var closed = !!document.querySelector('.wiz-day-closed[data-day="' + day + '"]')?.checked;
            if (closed) hours[day] = 'closed';
            else {
                var entry = {};
                SERVICE_KEYS.forEach(function (service) {
                    var open = hourInput(day, 'open', service)?.value || '';
                    var close = hourInput(day, 'close', service)?.value || '';
                    if (open && close) entry[service] = { open: open, close: close };
                });
                if (Object.keys(entry).length) hours[day] = entry;
            }
        });
        return {
            street: (val('wiz-basics-street') || '').trim(),
            city: (val('wiz-basics-city') || '').trim(),
            state: (val('wiz-basics-state') || '').trim().toUpperCase(),
            zip: (val('wiz-basics-zip') || '').trim(),
            phone: (val('wiz-basics-phone') || '').trim(),
            hours: hours,
        };
    }

    function basicsCopyDayToAll(day) {
        var source = basicsReadForm().hours[day];
        DAYS.forEach(function (targetDay) {
            var closedEl = document.querySelector('.wiz-day-closed[data-day="' + targetDay + '"]');
            if (!closedEl) return;
            if (source === 'closed' || !source) {
                closedEl.checked = true;
                SERVICE_KEYS.forEach(function (service) {
                    var openEl = hourInput(targetDay, 'open', service);
                    var closeEl = hourInput(targetDay, 'close', service);
                    if (openEl) openEl.value = '';
                    if (closeEl) closeEl.value = '';
                });
            } else {
                closedEl.checked = false;
                SERVICE_KEYS.forEach(function (service) {
                    var openEl = hourInput(targetDay, 'open', service);
                    var closeEl = hourInput(targetDay, 'close', service);
                    var window = source[service] || {};
                    if (openEl) openEl.value = window.open || '';
                    if (closeEl) closeEl.value = window.close || '';
                });
            }
            applyBasicsClosedToggle(targetDay);
        });
    }

    function basicsValidate(form) {
        var missing = [];
        if (!form.street) missing.push('street');
        if (!form.city) missing.push('city');
        if (!form.state) missing.push('state');
        if (!form.zip) missing.push('zip');
        if (missing.length) return 'Please fill in: ' + missing.join(', ');
        return '';
    }

    async function basicsSave() {
        var form = basicsReadForm();
        var err = basicsValidate(form);
        if (err) { setValidation('basics', err); return false; }
        setValidation('basics', '');
        var sc = await fetchJson('host/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: { street: form.street, city: form.city, state: form.state, zip: form.zip },
                hours: form.hours,
            }),
        });
        if (!sc.ok) { setValidation('basics', sc.body.error || 'Save failed'); return false; }
        if (form.phone) {
            var vc = await fetchJson('host/voice-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frontDeskPhone: form.phone }),
            });
            if (!vc.ok) { setValidation('basics', vc.body.error || 'Phone save failed'); return false; }
        }
        state.baselines.basics = form;
        markCleanEnabled('basics', false);
        await completeStep('basics');
        refreshPreview();
        return true;
    }

    // ─── Step 2: template ────────────────────────────────────────────────
    function templateLoad(websiteCfg) {
        var tpl = (websiteCfg && websiteCfg.websiteTemplate) || 'saffron';
        overlay.querySelectorAll('.wiz-template-card input[name="template"]').forEach(function (r) {
            r.checked = r.value === tpl;
        });
        overlay.querySelectorAll('.wiz-template-card').forEach(function (card) {
            card.classList.toggle('selected', card.getAttribute('data-template') === tpl);
        });
        state.baselines.template = { template: tpl };
        markCleanEnabled('template', false);
    }

    function templateReadForm() {
        var checked = overlay.querySelector('.wiz-template-card input[name="template"]:checked');
        return { template: checked ? checked.value : 'saffron' };
    }

    async function templateSave() {
        var form = templateReadForm();
        setValidation('template', '');
        var r = await fetchJson('config/website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ websiteTemplate: form.template }),
        });
        if (!r.ok) { setValidation('template', r.body.error || 'Save failed'); return false; }
        state.baselines.template = form;
        markCleanEnabled('template', false);
        await completeStep('template');
        refreshPreview();
        return true;
    }

    // ─── Step 3: content ─────────────────────────────────────────────────
    var CONTENT_FIELDS = [
        ['heroHeadline', 'wiz-content-headline'],
        ['heroSubhead', 'wiz-content-subhead'],
        ['about', 'wiz-content-about'],
        ['instagramHandle', 'wiz-content-instagram'],
        ['reservationsNote', 'wiz-content-reservations'],
    ];

    function contentLoad(websiteCfg) {
        var c = (websiteCfg && websiteCfg.content) || {};
        CONTENT_FIELDS.forEach(function (p) { setVal(p[1], c[p[0]] || ''); });
        state.baselines.content = contentReadForm();
        markCleanEnabled('content', false);
    }

    function contentReadForm() {
        var out = {};
        CONTENT_FIELDS.forEach(function (p) { out[p[0]] = (val(p[1]) || '').trim(); });
        return out;
    }

    async function contentSave() {
        var form = contentReadForm();
        setValidation('content', '');
        // Merge with the dishes baseline so knownFor isn't clobbered if the
        // user edits content after dishes. The POST replaces `content`
        // wholesale server-side; we carry the baseline forward.
        var merged = Object.assign({}, form);
        if (Array.isArray(state.baselines.dishes)) {
            var kf = state.baselines.dishes.filter(function (r) { return r.title || r.desc || (r.image && (typeof r.image === 'string' ? r.image : r.image.data)); });
            if (kf.length) merged.knownFor = kf;
        }
        var r = await fetchJson('config/website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: merged }),
        });
        if (!r.ok) { setValidation('content', r.body.error || 'Save failed'); return false; }
        state.baselines.content = form;
        markCleanEnabled('content', false);
        await completeStep('content');
        refreshPreview();
        return true;
    }

    // ─── Step 4: dishes ──────────────────────────────────────────────────
    function dishesLoad(websiteCfg) {
        var kf = ((websiteCfg && websiteCfg.content && websiteCfg.content.knownFor) || []).slice(0, 3);
        for (var i = 0; i < 3; i++) {
            var item = kf[i] || {};
            setVal('', ''); // noop guard
            var titleEl = overlay.querySelector('.wiz-dish-title[data-dish-index="' + i + '"]');
            var descEl = overlay.querySelector('.wiz-dish-desc[data-dish-index="' + i + '"]');
            var previewEl = overlay.querySelector('.wiz-dish-preview[data-dish-index="' + i + '"]');
            if (titleEl) titleEl.value = item.title || '';
            if (descEl) descEl.value = item.desc || '';
            state.dishData[i] = emptyDish();
            state.dishData[i].existingUrl = typeof item.image === 'string' ? item.image : '';
            if (previewEl) {
                if (state.dishData[i].existingUrl) {
                    previewEl.src = state.dishData[i].existingUrl;
                    previewEl.style.display = '';
                } else {
                    previewEl.src = '';
                    previewEl.style.display = 'none';
                }
            }
            var fileEl = overlay.querySelector('.wiz-dish-file[data-dish-index="' + i + '"]');
            if (fileEl) fileEl.value = '';
        }
        state.baselines.dishes = dishesReadForm();
        markCleanEnabled('dishes', false);
    }

    function dishesReadForm() {
        var rows = [];
        for (var i = 0; i < 3; i++) {
            var titleEl = overlay.querySelector('.wiz-dish-title[data-dish-index="' + i + '"]');
            var descEl = overlay.querySelector('.wiz-dish-desc[data-dish-index="' + i + '"]');
            var title = (titleEl && titleEl.value || '').trim();
            var desc = (descEl && descEl.value || '').trim();
            var st = state.dishData[i];
            var image;
            if (st.pendingUpload) image = st.pendingUpload; // { mime, data }
            else if (st.cleared) image = '';
            else image = st.existingUrl || '';
            rows.push({ title: title, desc: desc, image: image });
        }
        return rows;
    }

    function dishesPayload() {
        // Same shape as buildKnownForPayload in admin.js: drop fully-blank rows.
        return dishesReadForm().filter(function (r) { return r.title || r.desc || (r.image && (typeof r.image === 'string' ? r.image : r.image.data)); });
    }

    async function dishesSave() {
        setValidation('dishes', '');
        var payload = dishesPayload();
        // Merge with the Step 3 content so hero/about/etc aren't clobbered.
        // The POST replaces `content` wholesale server-side; we carry the
        // baseline forward so only knownFor actually changes.
        var base = Object.assign({}, state.baselines.content || {});
        base.knownFor = payload;
        var r = await fetchJson('config/website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: base }),
        });
        if (!r.ok) { setValidation('dishes', r.body.error || 'Save failed'); return false; }
        // Re-load so persisted /assets/ URLs replace the pending base64.
        var kf = (r.body && r.body.content && r.body.content.knownFor) || [];
        for (var i = 0; i < 3; i++) {
            var item = kf[i] || {};
            state.dishData[i] = emptyDish();
            state.dishData[i].existingUrl = typeof item.image === 'string' ? item.image : '';
            var previewEl = overlay.querySelector('.wiz-dish-preview[data-dish-index="' + i + '"]');
            if (previewEl && state.dishData[i].existingUrl) {
                previewEl.src = state.dishData[i].existingUrl;
                previewEl.style.display = '';
            }
            var fileEl = overlay.querySelector('.wiz-dish-file[data-dish-index="' + i + '"]');
            if (fileEl) fileEl.value = '';
        }
        state.baselines.dishes = dishesReadForm();
        markCleanEnabled('dishes', false);
        await completeStep('dishes');
        refreshPreview();
        return true;
    }

    // ─── Step 5: menu ────────────────────────────────────────────────────
    function menuLoad(visitCfg) {
        setVal('wiz-menu-url', (visitCfg && visitCfg.menuUrl) || '');
        state.baselines.menu = menuReadForm();
        markCleanEnabled('menu', false);
    }

    function menuReadForm() { return { menuUrl: (val('wiz-menu-url') || '').trim() }; }

    async function menuSave() {
        var form = menuReadForm();
        setValidation('menu', '');
        var r = await fetchJson('host/visit-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ menuUrl: form.menuUrl || null }),
        });
        if (!r.ok) { setValidation('menu', r.body.error || 'Save failed'); return false; }
        state.baselines.menu = form;
        markCleanEnabled('menu', false);
        await completeStep('menu');
        return true;
    }

    // ─── Step 6: staff ───────────────────────────────────────────────────
    function renderStaffQueue() {
        var list = $('wiz-staff-queue-list');
        if (!list) return;
        if (!state.staffQueue.length) { list.innerHTML = '<p class="wiz-staff-queue-empty">No invites queued yet.</p>'; }
        else {
            list.innerHTML = '<ul class="wiz-staff-queue-ul">' + state.staffQueue.map(function (inv, i) {
                return '<li><span class="wiz-staff-queue-role role-pill ' + inv.role + '">' + inv.role + '</span>' +
                    '<span class="wiz-staff-queue-name">' + escapeHtml(inv.name || inv.email) + '</span>' +
                    '<span class="wiz-staff-queue-email">' + escapeHtml(inv.email) + '</span>' +
                    '<button type="button" class="wiz-staff-queue-remove" data-idx="' + i + '" aria-label="Remove">&times;</button></li>';
            }).join('') + '</ul>';
        }
        var btn = $('wiz-staff-send');
        if (btn) btn.disabled = state.staffQueue.length === 0;
    }

    function staffQueueAdd() {
        var name = (val('wiz-staff-name') || '').trim();
        var email = (val('wiz-staff-email') || '').trim();
        var role = overlay.querySelector('input[name="role"]:checked')?.value || 'admin';
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            setValidation('staff', 'Enter a valid email address.');
            return;
        }
        if (role !== 'admin' && role !== 'host') role = 'admin';
        state.staffQueue.push({ name: name, email: email, role: role });
        setVal('wiz-staff-name', ''); setVal('wiz-staff-email', '');
        setValidation('staff', '');
        renderStaffQueue();
    }

    async function staffSend() {
        if (!state.staffQueue.length) return false;
        var errors = [];
        for (var i = 0; i < state.staffQueue.length; i++) {
            var inv = state.staffQueue[i];
            var r = await fetchJson('staff/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inv),
            });
            if (!r.ok) errors.push(inv.email + ': ' + (r.body.error || 'failed'));
        }
        if (errors.length) { setValidation('staff', errors.join('; ')); return false; }
        state.staffQueue = [];
        renderStaffQueue();
        await completeStep('staff');
        return true;
    }

    // ─── Completion + progress indicator ─────────────────────────────────
    async function completeStep(step) {
        state.completed[step] = true;
        await markStepComplete(step);
        renderProgress();
    }

    function renderProgress() {
        var doneCount = 0;
        STEP_IDS.forEach(function (id, i) {
            var li = overlay.querySelector('.onboarding-wiz-step[data-step="' + id + '"]');
            if (!li) return;
            var done = !!state.completed[id];
            var current = i === state.currentIndex;
            li.classList.toggle('done', done);
            li.classList.toggle('current', current);
            li.classList.toggle('todo', !done && !current);
            if (done) doneCount += 1;
        });
        var p = $('onboarding-progress');
        if (p) p.textContent = doneCount + ' of 6 complete';
        var pillEl = $('onboarding-reopen');
        if (pillEl) pillEl.textContent = 'Setup · ' + doneCount + '/6';
    }

    // ─── Step navigation ─────────────────────────────────────────────────
    function showStep(index) {
        if (index < 0) index = 0;
        if (index > STEP_IDS.length) index = STEP_IDS.length;
        state.currentIndex = index;
        // Hide all panels.
        overlay.querySelectorAll('.onboarding-wiz-panel').forEach(function (p) { p.hidden = true; });
        var panelKey = (index >= STEP_IDS.length) ? 'done' : STEP_IDS[index];
        var panel = overlay.querySelector('.onboarding-wiz-panel[data-panel="' + panelKey + '"]');
        if (panel) panel.hidden = false;
        // Back button disabled on first step.
        if (panel) {
            var back = panel.querySelector('.wiz-back');
            if (back) back.disabled = index === 0;
        }
        renderProgress();
        // When the done screen shows, populate live info.
        if (panelKey === 'done') populateLivePanel();
        refreshPreview();
    }

    function nextStep() { showStep(state.currentIndex + 1); }
    function backStep() { showStep(state.currentIndex - 1); }

    async function onNext() {
        var step = STEP_IDS[state.currentIndex];
        // If the step's Save is enabled (dirty), auto-save first. Step 6
        // is special: Send Invites is the Save action; Next without queue
        // just advances (skip).
        if (!step) { nextStep(); return; }
        if (step === 'staff') {
            if (state.staffQueue.length) {
                var ok = await staffSend();
                if (!ok) return;
            } else {
                await completeStep('staff');
            }
            nextStep();
            return;
        }
        var btn = saveBtn(step);
        if (btn && !btn.disabled) {
            var saved = await saveStep(step);
            if (!saved) return;
        } else if (!state.completed[step]) {
            // Not dirty + not completed yet → auto-mark complete so the
            // step counter reflects that they walked past it.
            await completeStep(step);
        }
        nextStep();
    }

    async function onSkip() {
        var step = STEP_IDS[state.currentIndex];
        if (!step) { nextStep(); return; }
        if (!SKIPPABLE[step]) { nextStep(); return; }
        // Warn on basics if anything missing + user tries to skip.
        if (step === 'basics') {
            var form = basicsReadForm();
            if (!form.street || !form.city || !form.state || !form.zip) {
                if (!confirm('Skip basics without saving? Your public site will show placeholder address.')) return;
            }
        }
        nextStep();
    }

    async function saveStep(step) {
        switch (step) {
            case 'basics': return basicsSave();
            case 'template': return templateSave();
            case 'content': return contentSave();
            case 'dishes': return dishesSave();
            case 'menu': return menuSave();
            case 'staff': return staffSend();
        }
        return false;
    }

    function cancelStep(step) {
        switch (step) {
            case 'basics': basicsLoad(state.loc.site, state.loc.voice); break;
            case 'template': templateLoad(state.loc.website); break;
            case 'content': contentLoad(state.loc.website); break;
            case 'dishes': dishesLoad(state.loc.website); break;
            case 'menu': menuLoad(state.loc.visit); break;
            case 'staff': state.staffQueue = []; renderStaffQueue(); break;
        }
        setValidation(step, '');
    }

    // ─── Dirty tracking ──────────────────────────────────────────────────
    function markCleanEnabled(step, dirty) {
        var sBtn = saveBtn(step);
        var cBtn = cancelBtn(step);
        if (sBtn) sBtn.disabled = !dirty;
        if (cBtn) cBtn.disabled = !dirty;
    }

    function recomputeDirty(step) {
        var live, base;
        switch (step) {
            case 'basics': live = basicsReadForm(); base = state.baselines.basics; break;
            case 'template': live = templateReadForm(); base = state.baselines.template; break;
            case 'content': live = contentReadForm(); base = state.baselines.content; break;
            case 'dishes': live = dishesReadForm(); base = state.baselines.dishes; break;
            case 'menu': live = menuReadForm(); base = state.baselines.menu; break;
            default: return;
        }
        var dirty = JSON.stringify(live) !== JSON.stringify(base);
        markCleanEnabled(step, dirty);
    }

    // ─── Preview pane ────────────────────────────────────────────────────
    function refreshPreview() {
        var iframe = $('wiz-preview-iframe');
        var open = $('wiz-preview-open');
        if (open) open.href = publicSiteUrl();
        if (!iframe) return;
        // Cache-bust so each refresh really re-renders the template.
        iframe.src = publicSiteUrl() + '?_t=' + Date.now();
    }

    function wirePreviewButtons() {
        var refresh = $('wiz-preview-refresh');
        if (refresh) refresh.addEventListener('click', refreshPreview);
        var toggle = $('wiz-preview-toggle');
        var preview = $('onboarding-wiz-preview');
        if (toggle && preview) {
            toggle.addEventListener('click', function () {
                var open = preview.classList.toggle('open');
                toggle.setAttribute('aria-expanded', String(open));
            });
        }
    }

    // ─── "You're live" screen ────────────────────────────────────────────
    async function populateLivePanel() {
        var urlEl = $('wiz-live-url');
        var pinEl = $('wiz-live-pin');
        if (urlEl) { urlEl.textContent = publicSiteUrl(); urlEl.href = publicSiteUrl(); }
        if (!state.pin) {
            var r = await fetchJson('host/pin');
            if (r.ok && r.body.pin) state.pin = String(r.body.pin);
        }
        if (pinEl) pinEl.textContent = state.pin || '—';
    }

    // ─── Utility ─────────────────────────────────────────────────────────
    function val(id) { var el = $(id); return el ? el.value : ''; }
    function setVal(id, v) { var el = $(id); if (el) el.value = v; }
    function setValidation(step, text) {
        var el = validationEl(step);
        if (el) { el.textContent = text; el.style.display = text ? '' : 'none'; }
    }
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

    function readAsDataURL(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(file);
        });
    }

    // ─── Wiring ──────────────────────────────────────────────────────────
    function wireForms() {
        // Basics: all inputs recompute dirty.
        var basicsForm = $('onboarding-form-basics');
        if (basicsForm) {
            basicsForm.addEventListener('input', function () { recomputeDirty('basics'); });
            basicsForm.addEventListener('click', function (e) {
                var t = e.target;
                if (t && t.classList && t.classList.contains('wiz-hours-copy')) {
                    var day = t.getAttribute('data-day');
                    if (day) {
                        basicsCopyDayToAll(day);
                        recomputeDirty('basics');
                    }
                }
            });
            basicsForm.addEventListener('change', function (e) {
                var t = e.target;
                if (t && t.classList && t.classList.contains('wiz-day-closed')) {
                    var day = t.getAttribute('data-day');
                    if (day) applyBasicsClosedToggle(day);
                }
                recomputeDirty('basics');
            });
        }

        // Template cards: clicking a radio highlights + makes dirty. Clicking
        // the whole card also flips the radio.
        overlay.querySelectorAll('.wiz-template-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var input = card.querySelector('input[type="radio"]');
                if (input && !input.checked) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
            });
        });
        var templateForm = $('onboarding-form-template');
        if (templateForm) {
            templateForm.addEventListener('change', function () {
                overlay.querySelectorAll('.wiz-template-card').forEach(function (c) {
                    var inp = c.querySelector('input[type="radio"]');
                    c.classList.toggle('selected', !!(inp && inp.checked));
                });
                recomputeDirty('template');
            });
        }

        // Content: listen to input.
        var contentForm = $('onboarding-form-content');
        if (contentForm) contentForm.addEventListener('input', function () { recomputeDirty('content'); });

        // Dishes: file inputs + text.
        overlay.querySelectorAll('.wiz-dish-file').forEach(function (input) {
            input.addEventListener('change', async function () {
                var idx = Number(input.getAttribute('data-dish-index'));
                var file = input.files && input.files[0];
                if (!file) return;
                var dataUrl = await readAsDataURL(file);
                var match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
                if (!match) return;
                state.dishData[idx].pendingUpload = { mime: match[1], data: match[2] };
                state.dishData[idx].cleared = false;
                var previewEl = overlay.querySelector('.wiz-dish-preview[data-dish-index="' + idx + '"]');
                if (previewEl) { previewEl.src = dataUrl; previewEl.style.display = ''; }
                recomputeDirty('dishes');
            });
        });
        overlay.querySelectorAll('.wiz-dish-title, .wiz-dish-desc').forEach(function (el) {
            el.addEventListener('input', function () { recomputeDirty('dishes'); });
        });

        // Menu
        var menuForm = $('onboarding-form-menu');
        if (menuForm) menuForm.addEventListener('input', function () { recomputeDirty('menu'); });

        // Staff
        var queueAdd = $('wiz-staff-queue-add');
        if (queueAdd) queueAdd.addEventListener('click', staffQueueAdd);
        var queueList = $('wiz-staff-queue-list');
        if (queueList) queueList.addEventListener('click', function (e) {
            var btn = e.target.closest('.wiz-staff-queue-remove');
            if (!btn) return;
            var idx = Number(btn.getAttribute('data-idx'));
            state.staffQueue.splice(idx, 1);
            renderStaffQueue();
        });

        // Save / Cancel buttons (delegated).
        overlay.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || !target.classList) return;
            if (target.classList.contains('wiz-save')) {
                var step = target.getAttribute('data-step');
                if (step) saveStep(step);
            } else if (target.classList.contains('wiz-cancel')) {
                var s = target.getAttribute('data-step');
                if (s) cancelStep(s);
            } else if (target.classList.contains('wiz-next') || target.getAttribute('data-action') === 'next') {
                onNext();
            } else if (target.classList.contains('wiz-back') || target.getAttribute('data-action') === 'back') {
                backStep();
            } else if (target.classList.contains('wiz-skip') || target.getAttribute('data-action') === 'skip') {
                onSkip();
            } else if (target.classList.contains('wiz-finish') || target.id === 'wiz-finish-close') {
                hideOverlay(true);
            }
        });

        // Progress nav: jump to any completed step (or the current step).
        overlay.querySelectorAll('.onboarding-wiz-step').forEach(function (li, idx) {
            li.addEventListener('click', function () {
                if (state.completed[STEP_IDS[idx]] || idx <= state.currentIndex) {
                    showStep(idx);
                }
            });
        });
    }

    // ─── Show / hide ─────────────────────────────────────────────────────
    function isDismissedThisSession() {
        try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
    }
    function rememberDismissed() { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {} }
    function showOverlay() { overlay.style.display = 'flex'; pill.style.display = 'none'; }
    function hideOverlay(done) {
        overlay.style.display = 'none';
        var doneCount = Object.keys(state.completed).filter(function (k) { return state.completed[k]; }).length;
        pill.style.display = (done && doneCount >= STEP_IDS.length) ? 'none' : '';
    }

    // ─── Save form state across storage events (multi-tab continuity) ────
    function persistWizardState() {
        try {
            sessionStorage.setItem(WIZ_STATE_KEY, JSON.stringify({
                currentIndex: state.currentIndex,
                staffQueue: state.staffQueue,
            }));
        } catch (e) {}
    }
    function rehydrateWizardState() {
        try {
            var raw = sessionStorage.getItem(WIZ_STATE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (typeof parsed.currentIndex === 'number') state.currentIndex = parsed.currentIndex;
            if (Array.isArray(parsed.staffQueue)) state.staffQueue = parsed.staffQueue;
        } catch (e) {}
    }
    window.addEventListener('storage', function (ev) {
        if (ev && ev.key === WIZ_STATE_KEY) rehydrateWizardState();
    });

    // ─── Boot ────────────────────────────────────────────────────────────
    async function boot() {
        renderHoursGrid();
        wireForms();
        wirePreviewButtons();

        state.loc = await loadAll();
        (state.loc.onboarding.steps || []).forEach(function (s) { state.completed[s] = true; });

        basicsLoad(state.loc.site, state.loc.voice);
        templateLoad(state.loc.website);
        contentLoad(state.loc.website);
        dishesLoad(state.loc.website);
        menuLoad(state.loc.visit);
        renderStaffQueue();

        // Land on first unfinished step.
        var firstUnfinished = STEP_IDS.findIndex(function (id) { return !state.completed[id]; });
        state.currentIndex = firstUnfinished < 0 ? STEP_IDS.length : firstUnfinished;

        rehydrateWizardState();
        showStep(state.currentIndex);
        renderProgress();

        // Decide visibility. If every step complete + previously dismissed → pill only.
        var allDone = STEP_IDS.every(function (id) { return state.completed[id]; });
        if (allDone) {
            hideOverlay(true);
        } else if (isDismissedThisSession()) {
            hideOverlay(false);
        } else {
            showOverlay();
        }

        setInterval(persistWizardState, 1500);
    }

    if (dismiss1) dismiss1.addEventListener('click', function () { rememberDismissed(); hideOverlay(false); });
    pill.addEventListener('click', function () {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        showOverlay();
    });

    var adminView = $('admin-view');
    if (!adminView) return;
    function onVisible() { if (adminView.style.display !== 'none') boot(); }
    if (adminView.style.display !== 'none') boot();
    else {
        var mo = new MutationObserver(function () {
            if (adminView.style.display !== 'none') { mo.disconnect(); boot(); }
        });
        mo.observe(adminView, { attributes: true, attributeFilter: ['style'] });
    }
})();
