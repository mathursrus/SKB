// SKB Analytics page — histogram rendering
(function () {
    const rangeSelect = document.getElementById('range');
    const sizePills = document.getElementById('size-pills');
    const container = document.getElementById('histograms');
    let currentSize = 'all';

    sizePills.addEventListener('click', (e) => {
        const pill = e.target.closest('.size-pill');
        if (!pill) return;
        sizePills.querySelectorAll('.size-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentSize = pill.dataset.size;
        load();
    });

    rangeSelect.addEventListener('change', load);

    async function load() {
        container.innerHTML = '<div class="hist-empty">Loading...</div>';
        try {
            const range = rangeSelect.value;
            const res = await fetch(`/api/host/analytics?range=${range}&partySize=${encodeURIComponent(currentSize)}`);
            if (res.status === 401) {
                container.innerHTML = '<div class="hist-empty">Session expired. <a href="/host.html">Log in</a></div>';
                return;
            }
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();

            if (data.totalParties === 0) {
                container.innerHTML = '<div class="hist-empty">No data for this filter. Try a wider date range or different party size.</div>';
                return;
            }

            container.innerHTML = '';
            for (const hist of data.histograms) {
                container.appendChild(renderHistogram(hist));
            }
        } catch (err) {
            container.innerHTML = '<div class="hist-empty">Failed to load analytics.</div>';
            console.error(err);
        }
    }

    function renderHistogram(hist) {
        const card = document.createElement('div');
        card.className = 'hist-card';

        if (hist.total === 0) {
            card.innerHTML = `<h3>${esc(hist.label)}</h3><div class="hist-meta">No data</div>`;
            return card;
        }

        const maxCount = Math.max(...hist.buckets.map(b => b.count), 1);

        let barsHtml = '';
        for (const b of hist.buckets) {
            if (b.count === 0 && hist.buckets.indexOf(b) > 0 && hist.buckets.slice(hist.buckets.indexOf(b)).every(x => x.count === 0)) break;
            const pct = Math.max((b.count / maxCount) * 100, b.count > 0 ? 2 : 0);
            const probPct = (b.probability * 100).toFixed(1);
            barsHtml += `
                <div class="hist-bar-row">
                    <div class="hist-label">${esc(b.label)}</div>
                    <div class="hist-bar-bg"><div class="hist-bar" style="width:${pct}%"></div></div>
                    <div class="hist-value">${b.count} (${probPct}%)</div>
                </div>`;
        }

        card.innerHTML = `
            <h3>${esc(hist.label)}</h3>
            <div class="hist-meta">${hist.total} parties · avg ${hist.avg ?? '—'}m</div>
            <div class="hist-chart">${barsHtml}</div>`;
        return card;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    load();
})();
