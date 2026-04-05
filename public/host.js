// SKB host-stand UI
(function () {
    const $ = (id) => document.getElementById(id);
    const loginView = $('login-view');
    const queueView = $('queue-view');
    const loginForm = $('login-form');
    const loginError = $('login-error');
    const rows = $('rows');
    const countWaiting = $('count-waiting');
    const countOldest = $('count-oldest');
    const turnInput = $('turn');
    const logoutBtn = $('logout-btn');

    let pollTimer = null;

    function fmtTime(iso) {
        try {
            return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch { return '—'; }
    }

    async function checkAuth() {
        const r = await fetch('/api/host/queue');
        return r.status !== 401;
    }

    async function refresh() {
        try {
            const r = await fetch('/api/host/queue');
            if (r.status === 401) { showLogin(); return; }
            if (!r.ok) throw new Error('queue fetch failed');
            const data = await r.json();
            countWaiting.textContent = String(data.parties.length);
            countOldest.textContent = data.oldestWaitMinutes + 'm';
            turnInput.value = String(data.avgTurnTimeMinutes);
            if (data.parties.length === 0) {
                rows.innerHTML = '<tr><td colspan="7" class="empty">Nobody waiting.</td></tr>';
                return;
            }
            rows.innerHTML = data.parties.map(p => {
                const callsList = Array.isArray(p.callsMinutesAgo) ? p.callsMinutesAgo : [];
                const calledBadge = p.state === 'called'
                    ? (callsList.length > 0
                        ? ' ' + callsList.map((m, i) => `<span class="badge-called">Call ${i + 1}: ${m}m ago</span>`).join(' ')
                        : ' <span class="badge-called">CALLED</span>')
                    : '';
                const callLabel = p.state === 'called' ? 'Recall' : 'Call';
                return `
                <tr data-id="${p.id}" class="${p.state === 'called' ? 'row-called' : ''}">
                    <td class="num">${p.position}</td>
                    <td>${escapeHtml(p.name)}${calledBadge}</td>
                    <td class="size">${p.partySize}</td>
                    <td class="phone">${p.phoneLast4 ? '••' + p.phoneLast4 : '—'}</td>
                    <td class="eta">${fmtTime(p.etaAt)}</td>
                    <td class="wait">${p.waitingMinutes}m</td>
                    <td class="actions">
                        <button class="call-btn" data-action="call">${callLabel}</button>
                        <button class="remove" data-reason="seated">Seated</button>
                        <button class="remove" data-reason="no_show">No-show</button>
                    </td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('refresh error', e);
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    async function onRemove(id, reason) {
        const r = await fetch('/api/host/queue/' + encodeURIComponent(id) + '/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
        });
        if (r.status === 401) { showLogin(); return; }
        await refresh();
    }

    async function onCall(id) {
        const r = await fetch('/api/host/queue/' + encodeURIComponent(id) + '/call', {
            method: 'POST',
        });
        if (r.status === 401) { showLogin(); return; }
        await refresh();
    }

    async function onTurnChange() {
        const n = Number(turnInput.value);
        await fetch('/api/host/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avgTurnTimeMinutes: n }),
        });
        await refresh();
    }

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
    turnInput.addEventListener('change', onTurnChange);
    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/host/logout', { method: 'POST' });
        showLogin();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const pin = $('pin').value;
        const r = await fetch('/api/host/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
        });
        if (r.ok) { showQueue(); return; }
        const body = await r.json().catch(() => ({}));
        loginError.textContent = body.error || 'Login failed';
        loginError.style.display = '';
    });

    function showLogin() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        loginView.style.display = '';
        queueView.style.display = 'none';
    }

    function showQueue() {
        loginView.style.display = 'none';
        queueView.style.display = '';
        refresh();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refresh, 5000);
    }

    (async function boot() {
        if (await checkAuth()) showQueue(); else showLogin();
    })();
})();
