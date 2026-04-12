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
    const STATUS_POLL_MS = 30_000;  // 30s when diner is in the queue
    const STATE_POLL_MS  = 60_000;  // 60s when browsing (not in queue)
    let pollTimer = null;

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
            if (!res.ok) throw new Error('status failed');
            const s = await res.json();
            if (s.state === 'not_found' || s.state === 'seated' || s.state === 'no_show') {
                localStorage.removeItem(STORAGE_KEY);
                joinCard.style.display = '';
                confCard.style.display = 'none';
                confCard.classList.remove('next-up');
                statusCard.style.display = '';
                return true; // caller should still reload state
            }
            // In queue — hide the "should I join?" card
            statusCard.style.display = 'none';
            joinCard.style.display = 'none';
            confCard.style.display = '';
            confCode.textContent = s.code;
            confPos.textContent = '#' + s.position;
            confEta.textContent = s.etaAt ? fmtTime(s.etaAt) : '—';
            confEtaMins.textContent =
                (typeof s.etaMinutes === 'number')
                    ? ('in ~' + s.etaMinutes + ' min')
                    : '';
            if (s.state === 'called') {
                calledCallout.style.display = '';
                calledTimes.textContent = fmtCalls(s.callsMinutesAgo);
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
            return true;
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
