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
    // We poll aggressively while the diner is in the queue so state changes
    // (called, seated) reach the page without a manual refresh. The server
    // rate-limits status at 1/5s/code so 10s is safely within the budget.
    const STATUS_POLL_MS = 10_000;
    const STATE_POLL_MS  = 60_000;
    let pollTimer = null;
    let pollMode = null;             // 'status' | 'state' | null
    let lastJoinedAtMs = null;       // base for the live-tick waiting counter
    let lastEtaAtMs = null;          // base for the live countdown to promised time
    let lastSeenState = null;        // so we can pulse when the state flips
    let lastSeenCallCount = 0;       // pulse + alert on every re-notify (issue #50 bug 3)
    let tickTimer = null;

    // Diner chat state (issue #50 bug 1)
    let lastChatAtIso = null;        // last message timestamp we rendered
    let chatPollTimer = null;
    const CHAT_POLL_MS = 4000;

    function chatCard() { return document.getElementById('chat-card'); }
    function chatThreadEl() { return document.getElementById('chat-thread'); }
    function chatInputEl() { return document.getElementById('chat-input'); }
    function chatErrorEl() { return document.getElementById('chat-error'); }

    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }
    function formatChatTime(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } catch { return ''; }
    }

    function renderChatThread(messages) {
        const thread = chatThreadEl();
        if (!thread) return;
        if (!messages || messages.length === 0) {
            thread.innerHTML = '<div class="chat-empty">No messages yet. Reply here or text the SKB number — we\'re listening on both.</div>';
            return;
        }
        const rows = messages.map((m) => {
            const side = m.direction === 'outbound' ? 'from-host' : 'from-me';
            const who = m.direction === 'outbound' ? 'Host' : 'You';
            return `<div class="chat-row ${side}">`
                + `<div class="chat-bubble"><div class="chat-who">${who}</div>`
                + `<div class="chat-body">${escHtml(m.body)}</div>`
                + `<div class="chat-meta">${formatChatTime(m.at)}</div></div></div>`;
        });
        thread.innerHTML = rows.join('');
        thread.scrollTop = thread.scrollHeight;
    }

    async function loadChat(code) {
        try {
            const res = await fetch('api/queue/chat/' + encodeURIComponent(code));
            if (res.status === 404) {
                if (chatCard()) chatCard().style.display = 'none';
                return;
            }
            if (res.status === 429) return; // skip cycle
            if (!res.ok) return;
            const data = await res.json();
            const messages = data.messages || [];
            // Only show the chat card if the host has sent at least one
            // message (direction === 'outbound'). Until then the diner
            // shouldn't be able to initiate — it would just be noise for
            // the host who hasn't started a conversation yet.
            const hostHasSent = messages.some((m) => m.direction === 'outbound');
            if (!hostHasSent) {
                if (chatCard()) chatCard().style.display = 'none';
                return;
            }
            const latestAt = messages.length ? messages[messages.length - 1].at : null;
            if (latestAt !== lastChatAtIso) {
                renderChatThread(messages);
                lastChatAtIso = latestAt;
            }
            if (chatCard()) chatCard().style.display = '';
        } catch {
            // non-blocking — user can still read status card
        }
    }

    function startChatPoll(code) {
        if (chatPollTimer) clearInterval(chatPollTimer);
        loadChat(code);
        chatPollTimer = setInterval(() => loadChat(code), CHAT_POLL_MS);
    }

    function stopChatPoll() {
        if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
    }

    async function sendChat(code, body) {
        const err = chatErrorEl();
        if (err) err.style.display = 'none';
        try {
            const res = await fetch('api/queue/chat/' + encodeURIComponent(code), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (err) {
                    err.textContent = data.error || 'Could not send — please try again.';
                    err.style.display = '';
                }
                return false;
            }
            // Force-reload the thread so the diner sees their own bubble immediately.
            await loadChat(code);
            return true;
        } catch {
            if (err) { err.textContent = 'Network error — please try again.'; err.style.display = ''; }
            return false;
        }
    }

    // Wire up the send button once on DOM ready.
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('chat-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = localStorage.getItem(STORAGE_KEY);
            if (!code) return;
            const input = chatInputEl();
            const body = (input?.value || '').trim();
            if (!body) return;
            const ok = await sendChat(code, body);
            if (ok && input) input.value = '';
        });
    });

    async function pollOnce() {
        if (pollMode === 'status') {
            const code = localStorage.getItem(STORAGE_KEY);
            if (!code) { startPolling('state'); return; }
            const left = await loadStatus(code);
            if (left) startPolling('state');
        } else {
            await loadState();
        }
    }

    function startPolling(mode) {
        stopPolling();
        pollMode = mode;
        const ms = mode === 'status' ? STATUS_POLL_MS : STATE_POLL_MS;
        pollTimer = setInterval(pollOnce, ms);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // When the tab becomes visible again (phone unlock, app switch), fire an
    // immediate refresh BEFORE restarting the interval so the diner sees the
    // current state right away — not after another 10-60s wait.
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            stopPolling();
            return;
        }
        const code = localStorage.getItem(STORAGE_KEY);
        const mode = code && confCard.style.display !== 'none' ? 'status' : 'state';
        // Immediate fetch
        pollMode = mode;
        await pollOnce();
        // Then resume the periodic poll
        startPolling(mode);
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
            // Tick the "in ~N min" live countdown against the promised time.
            // This decreases smoothly minute by minute instead of sitting on a
            // static number until the server reports a position change.
            if (lastEtaAtMs != null && confEtaMins) {
                const remainingMs = lastEtaAtMs - Date.now();
                if (remainingMs <= 30_000) {
                    // Within 30s of promised time — switch wording
                    confEtaMins.textContent = 'any minute now';
                } else {
                    const mins = Math.max(0, Math.round(remainingMs / 60_000));
                    confEtaMins.textContent = 'in ~' + mins + ' min';
                }
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
                // R7 terminal: "Seated at table <N>" — hide the waiting-card
                // furniture (ETA line, Refresh, hint) and surface a clean
                // "Enjoy your meal" caption instead.
                statusCard.style.display = 'none';
                joinCard.style.display = 'none';
                confCard.style.display = '';
                confCard.classList.remove('next-up');
                confCard.classList.add('is-seated');
                confCode.textContent = s.code;
                confPos.textContent = s.tableNumber ? ('Table ' + s.tableNumber) : 'Seated';
                document.getElementById('conf-pos-label').textContent = 'your table';
                document.getElementById('conf-eta-line').style.display = 'none';
                document.getElementById('conf-hint').style.display = 'none';
                document.getElementById('seated-caption').style.display = '';
                // refresh-btn was removed (page auto-polls)
                calledCallout.style.display = 'none';
                if (waitElapsed) waitElapsed.style.display = 'none';
                renderPublicList([]);
                stopLiveTick();
                stopPolling();
                stopChatPoll();
                if (chatCard()) chatCard().style.display = 'none';
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
                stopChatPoll();
                if (chatCard()) chatCard().style.display = 'none';
                return true; // caller should still reload state
            }
            // In queue — hide the "should I join?" card
            statusCard.style.display = 'none';
            joinCard.style.display = 'none';
            confCard.style.display = '';
            confCard.classList.remove('is-seated');
            confCode.textContent = s.code;
            confPos.textContent = s.position === 1 ? "You're next" : ('#' + s.position + ' of ' + (s.totalParties || s.position));
            confEta.textContent = s.etaAt ? fmtTime(s.etaAt) : '—';
            // Capture the promised time so the 1s tick can count it down
            // smoothly minute by minute.
            lastEtaAtMs = s.etaAt ? new Date(s.etaAt).getTime() : null;
            if (lastEtaAtMs != null) {
                const remainingMs = lastEtaAtMs - Date.now();
                const mins = Math.max(0, Math.round(remainingMs / 60_000));
                confEtaMins.textContent = remainingMs <= 30_000 ? 'any minute now' : ('in ~' + mins + ' min');
            } else {
                confEtaMins.textContent = '';
            }
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
            // Start (or keep running) the chat poll for every active state
            // (waiting/called), so host messages surface in-page in ~4s.
            startChatPoll(s.code);
            if (s.state === 'called') {
                const currentCallCount = (s.callsMinutesAgo || []).length;
                calledCallout.style.display = '';
                calledTimes.textContent = fmtCalls(s.callsMinutesAgo);
                // Issue #50 bug 3: show a conspicuous "re-notified" banner after
                // the first call. The host pressing Notify again needs to be
                // obvious to the diner even if they're already on the called view.
                const renotifyBanner = document.getElementById('renotify-banner');
                if (renotifyBanner) {
                    if (currentCallCount >= 2) {
                        renotifyBanner.textContent = `The host has called you ${currentCallCount} times — please come to the front now.`;
                        renotifyBanner.style.display = '';
                    } else {
                        renotifyBanner.style.display = 'none';
                    }
                }
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
                // Pulse + haptic + notification on both (a) first transition to
                // called AND (b) every subsequent renotify when the host calls
                // again while we're already in the called state.
                const firstTransitionToCalled = lastSeenState && lastSeenState !== 'called';
                const renotified = lastSeenState === 'called' && currentCallCount > lastSeenCallCount;
                if (firstTransitionToCalled || renotified) {
                    confCard.classList.remove('state-flip');
                    // Force reflow so the animation restarts if the class lingers
                    void confCard.offsetWidth;
                    confCard.classList.add('state-flip');
                    if (navigator.vibrate) { try { navigator.vibrate([180, 80, 180, 80, 180]); } catch {} }
                    try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                            const title = renotified ? 'SKB: Called again — please come now' : 'SKB: Your table is ready';
                            new Notification(title, {
                                body: renotified
                                    ? `The host has called ${currentCallCount} times. Please head to the front stand.`
                                    : 'Please head to the front stand.',
                                tag: 'skb-table-ready',
                                renotify: true,
                            });
                        }
                    } catch {}
                }
                lastSeenCallCount = currentCallCount;
            } else {
                calledCallout.style.display = 'none';
                const renotifyBanner = document.getElementById('renotify-banner');
                if (renotifyBanner) renotifyBanner.style.display = 'none';
                lastSeenCallCount = 0;
            }
            lastSeenState = s.state;
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
            confPos.textContent = r.position === 1 ? "You're next" : ('#' + r.position);
            confEta.textContent = fmtTime(r.etaAt);
            lastEtaAtMs = r.etaAt ? new Date(r.etaAt).getTime() : null;
            if (lastEtaAtMs != null) {
                const remainingMs = lastEtaAtMs - Date.now();
                const mins = Math.max(0, Math.round(remainingMs / 60_000));
                confEtaMins.textContent = remainingMs <= 30_000 ? 'any minute now' : ('in ~' + mins + ' min');
            }
            calledCallout.style.display = 'none';
            statusCard.style.display = 'none';
            joinCard.style.display = 'none';
            confCard.style.display = '';
            updateNextUp(r.position);
            // Best-effort notification permission so we can ping the diner when
            // their table is ready even if the tab is backgrounded. Must run
            // inside a user gesture (form submit counts) per browser rules.
            if ('Notification' in window && Notification.permission === 'default') {
                try { Notification.requestPermission(); } catch {}
            }
            // Fire an immediate status refresh to populate the public list +
            // live wait counter without waiting for the first poll tick.
            await loadStatus(r.code);
            startPolling('status');
        } catch (err) {
            joinError.textContent = err && err.message ? err.message : 'Join failed';
            joinError.style.display = '';
        } finally {
            submitBtn.disabled = false;
        }
    }

    joinForm.addEventListener('submit', onJoin);
    // "Check now" button removed — the page auto-polls every 10s. The
    // button was a leftover from before polling was added and confused
    // diners into thinking the page doesn't update itself.
    if (ackBtn) ackBtn.addEventListener('click', onAcknowledge);

    // Boot
    (async function () {
        // Allow ?code=SKB-XXX in the URL to override localStorage so shared
        // deep links (and the join confirmation SMS) just work.
        const params = new URLSearchParams(window.location.search);
        const urlCode = params.get('code');
        if (urlCode) {
            localStorage.setItem(STORAGE_KEY, urlCode);
        }
        const existing = localStorage.getItem(STORAGE_KEY);
        let needStateLoad = true;
        try {
            if (existing) {
                needStateLoad = await loadStatus(existing);
            }
            if (needStateLoad) await loadState();
        } finally {
            // Reveal whatever card queue.js decided to show. Until this point,
            // body.queue-boot keeps everything hidden to avoid the flash of
            // "join form" that happens on a deep link for a seated/called user.
            document.body.classList.remove('queue-boot');
            document.body.classList.add('queue-ready');
        }

        // Start auto-refresh
        startPolling(existing && !needStateLoad ? 'status' : 'state');
    })();
})();
