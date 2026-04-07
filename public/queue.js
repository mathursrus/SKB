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

    async function loadStatus(code) {
        try {
            const res = await fetch('api/queue/status?code=' + encodeURIComponent(code));
            if (!res.ok) throw new Error('status failed');
            const s = await res.json();
            if (s.state === 'not_found' || s.state === 'seated' || s.state === 'no_show') {
                localStorage.removeItem(STORAGE_KEY);
                joinCard.style.display = '';
                confCard.style.display = 'none';
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
            return false; // skip reloading state
        } catch {
            // fall back to join view
            joinCard.style.display = '';
            confCard.style.display = 'none';
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
        const phoneLast4 = $('phone').value.trim();
        try {
            const res = await fetch('api/queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    partySize,
                    phoneLast4: phoneLast4 || undefined,
                }),
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
    })();
})();
