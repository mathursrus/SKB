// SKB diner queue UI
(function () {
    const $ = (id) => document.getElementById(id);
    const lineLen = $('line-len');
    const etaNew = $('eta-new');
    const joinCard = $('join-card');
    const confCard = $('conf-card');
    const confPos = $('conf-pos');
    const confCode = $('conf-code');
    const confEta = $('conf-eta');
    const calledCallout = $('called-callout');
    const joinForm = $('join-form');
    const joinError = $('join-error');
    const submitBtn = $('submit-btn');

    const STORAGE_KEY = 'skb_queue_code';

    // --- Auto-refresh polling ---
    // R5: diner view updates at least every 15s while waiting.
    const STATUS_POLL_MS = 15_000;  // 15s when diner is in the queue
    const STATE_POLL_MS  = 60_000;  // 60s when browsing (not in queue)
    let pollTimer = null;
    let lastJoinedAtMs = null;       // base for the live-tick waiting counter
    let tickTimer = null;

    function startPolling(mode) {
        stopPolling();
        const ms = mode === 'status' ? STATUS_POLL_MS : STATE_POLL_MS;
        pollTimer = setInterval(async () => {
            if (mode === 'status') {
                const code = localStorage.getItem(STORAGE_KEY);
                if (!code) { startPolling('state'); return; }
                const left = await loadStatus(code);
                if (left) startPolling('state');
            } else {
                await loadState();
            }
        }, ms);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // Pause when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            const code = localStorage.getItem(STORAGE_KEY);
            startPolling(code && confCard.style.display !== 'none' ? 'status' : 'state');
        }
    });

    function fmtTime(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch { return '—'; }
    }

    async function loadState() {
        try {
            const res = await fetch('api/queue/state');
            if (!res.ok) throw new Error('state failed');
            const s = await res.json();
            lineLen.textContent = String(s.partiesWaiting);
            etaNew.textContent =
                `Estimated wait for a new party: ~${s.etaForNewPartyMinutes} min`;
        } catch {
            etaNew.textContent = 'Wait time temporarily unavailable.';
        }
    }

    const statusCard = document.getElementById('status-card');
    const confEtaMins = document.getElementById('conf-eta-mins');
    const calledTimes = document.getElementById('called-times');
    const waitElapsed = document.getElementById('wait-elapsed');
    const waitElapsedVal = document.getElementById('wait-elapsed-val');
    const ackBtn = document.getElementById('ack-btn');
    const publicListCard = document.getElementById('public-list-card');
    const publicListRows = document.getElementById('public-list-rows');
    const publicListCount = document.getElementById('public-list-count');

    function fmtDuration(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    function startLiveTick() {
        stopLiveTick();
        tickTimer = setInterval(() => {
            // Tick the viewer's own wait counter
            if (lastJoinedAtMs != null) {
                const s = Math.max(0, Math.floor((Date.now() - lastJoinedAtMs) / 1000));
                if (waitElapsedVal) waitElapsedVal.textContent = fmtDuration(s);
            }
            // Tick every row in the public list
            const rowEls = publicListRows ? publicListRows.querySelectorAll('[data-joined]') : [];
            rowEls.forEach(el => {
                const j = Number(el.getAttribute('data-joined'));
                if (!Number.isFinite(j)) return;
                const s = Math.max(0, Math.floor((Date.now() - j) / 1000));
                const waitEl = el.querySelector('.pqr-wait');
                if (waitEl) waitEl.textContent = fmtDuration(s);
            });
        }, 1000);
    }

    function stopLiveTick() {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    function renderPublicList(queue) {
        if (!publicListCard || !publicListRows) return;
        if (!Array.isArray(queue) || queue.length === 0) {
            publicListCard.style.display = 'none';
            publicListRows.innerHTML = '';
            return;
        }
        publicListCard.style.display = '';
        publicListCount.textContent = queue.length + (queue.length === 1 ? ' party' : ' parties');
        publicListRows.innerHTML = queue.map(row => {
            const joined = new Date(Date.now() - row.waitingSeconds * 1000).getTime();
            const klass = row.isMe ? 'pqr pqr-me' : 'pqr';
            const me = row.isMe ? ' <span class="pqr-you">(you)</span>' : '';
            return '<div class="' + klass + '" role="listitem" data-joined="' + joined + '">' +
                '<span class="pqr-pos">#' + row.position + '</span>' +
                '<span class="pqr-name">' + escapeHtml(row.displayName) + me + '</span>' +
                '<span class="pqr-size">' + row.partySize + '</span>' +
                '<span class="pqr-eta">' + fmtTime(row.promisedEtaAt) + '</span>' +
                '<span class="pqr-wait">' + fmtDuration(row.waitingSeconds) + '</span>' +
            '</div>';
        }).join('');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function fmtCalls(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return '';
        if (arr.length === 1) return 'Called ' + arr[0] + 'm ago';
        return 'Called ' + arr.map(m => m + 'm ago').join(' · ');
    }

    // "You're next" highlight
    function updateNextUp(position) {
        if (position === 1) {
            confCard.classList.add('next-up');
        } else {
            confCard.classList.remove('next-up');
        }
    }

    async function loadStatus(code) {
        try {
            const res = await fetch('api/queue/status?code=' + encodeURIComponent(code));
            if (res.status === 429) {
                // Rate limited — just skip this cycle; next poll will retry.
                return false;
            }
            if (!res.ok) throw new Error('status failed');
            const s = await res.json();
            if (s.state === 'seated') {
                // R7 terminal: "Seated at table <N>"
                statusCard.style.display = 'none';
                joinCard.style.display = 'none';
                confCard.style.display = '';
                confCard.classList.remove('next-up');
                confCode.textContent = s.code;
                confPos.textContent = s.tableNumber ? ('Table ' + s.tableNumber) : 'Seated';
                confEta.textContent = 'Enjoy your meal';
                confEtaMins.textContent = '';
                calledCallout.style.display = 'none';
                if (waitElapsed) waitElapsed.style.display = 'none';
                renderPublicList([]);
                stopLiveTick();
                stopPolling();
                localStorage.removeItem(STORAGE_KEY);
                return false;
            }
            if (s.state === 'not_found' || s.state === 'no_show' || s.state === 'departed') {
                localStorage.removeItem(STORAGE_KEY);
                joinCard.style.display = '';
                confCard.style.display = 'none';
                confCard.classList.remove('next-up');
                statusCard.style.display = '';
                renderPublicList([]);
                stopLiveTick();
                return true; // caller should still reload state
            }
            // In queue — hide the "should I join?" card
            statusCard.style.display = 'none';
            joinCard.style.display = 'none';
            confCard.style.display = '';
            confCode.textContent = s.code;
            confPos.textContent = s.position === 1 ? "You're next" : ('#' + s.position + ' of ' + (s.totalParties || s.position));
            confEta.textContent = s.etaAt ? fmtTime(s.etaAt) : '—';
            confEtaMins.textContent =
                (typeof s.etaMinutes === 'number')
                    ? ('in ~' + s.etaMinutes + ' min')
                    : '';
            // Compute lastJoinedAtMs from my row's waitingSeconds (server-authoritative).
            const myRow = Array.isArray(s.queue) ? s.queue.find(r => r.isMe) : null;
            if (myRow) {
                lastJoinedAtMs = Date.now() - myRow.waitingSeconds * 1000;
                if (waitElapsed) {
                    waitElapsed.style.display = '';
                    waitElapsedVal.textContent = fmtDuration(myRow.waitingSeconds);
                }
            }
            renderPublicList(s.queue || []);
            startLiveTick();
            if (s.state === 'called') {
                calledCallout.style.display = '';
                calledTimes.textContent = fmtCalls(s.callsMinutesAgo);
                if (ackBtn) {
                    // If the diner already acked on a prior poll, surface confirmed state.
                    if (s.onMyWayAt) {
                        ackBtn.textContent = "On the way \u2713";
                        ackBtn.disabled = true;
                    } else {
                        ackBtn.textContent = "I'm on my way";
                        ackBtn.disabled = false;
                    }
                }
            } else {
                calledCallout.style.display = 'none';
            }
            updateNextUp(s.position);
            return false; // skip reloading state
        } catch {
            // fall back to join view
            joinCard.style.display = '';
            confCard.style.display = 'none';
            confCard.classList.remove('next-up');
            statusCard.style.display = '';
            renderPublicList([]);
            stopLiveTick();
            return true;
        }
    }

    async function onAcknowledge() {
        const code = localStorage.getItem(STORAGE_KEY);
        if (!code || !ackBtn) return;
        ackBtn.disabled = true;
        const oldText = ackBtn.textContent;
        ackBtn.textContent = 'Sending…';
        try {
            const res = await fetch('api/queue/acknowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) throw new Error('ack failed');
            ackBtn.textContent = "On the way \u2713";
        } catch {
            ackBtn.textContent = oldText;
            ackBtn.disabled = false;
        }
    }

    async function onJoin(e) {
        e.preventDefault();
        joinError.style.display = 'none';
        submitBtn.disabled = true;
        const name = $('name').value.trim();
        const partySize = Number($('size').value);
        const phone = $('phone').value.trim();
        if (!/^\d{10}$/.test(phone)) {
            joinError.textContent = 'Please enter a valid 10-digit phone number.';
            joinError.style.display = '';
            submitBtn.disabled = false;
            return;
        }
        try {
            const res = await fetch('api/queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, partySize, phone }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || ('HTTP ' + res.status));
            }
            const r = await res.json();
            localStorage.setItem(STORAGE_KEY, r.code);
            confCode.textContent = r.code;
            confPos.textContent = '#' + r.position;
            confEta.textContent = fmtTime(r.etaAt);
            confEtaMins.textContent = 'in ~' + r.etaMinutes + ' min';
            calledCallout.style.display = 'none';
            statusCard.style.display = 'none';
            joinCard.style.display = 'none';
            confCard.style.display = '';
            updateNextUp(r.position);
            startPolling('status');
        } catch (err) {
            joinError.textContent = err && err.message ? err.message : 'Join failed';
            joinError.style.display = '';
        } finally {
            submitBtn.disabled = false;
        }
    }

    joinForm.addEventListener('submit', onJoin);
    $('refresh-btn').addEventListener('click', async () => {
        const code = localStorage.getItem(STORAGE_KEY);
        const needStateLoad = code ? await loadStatus(code) : true;
        if (needStateLoad) await loadState();
    });
    if (ackBtn) ackBtn.addEventListener('click', onAcknowledge);

    // Boot
    (async function () {
        const existing = localStorage.getItem(STORAGE_KEY);
        let needStateLoad = true;
        if (existing) {
            needStateLoad = await loadStatus(existing);
        }
        if (needStateLoad) await loadState();

        // Start auto-refresh
        startPolling(existing && !needStateLoad ? 'status' : 'state');
    })();
})();
