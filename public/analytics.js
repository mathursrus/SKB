// SKB Analytics page — vertical histogram rendering (time on x-axis)
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
            const res = await fetch(`api/host/analytics?range=${range}&partySize=${encodeURIComponent(currentSize)}`);
            if (res.status === 401) {
                container.innerHTML = '<div class="hist-empty">Session expired. <a href="host.html">Log in</a></div>';
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

        // Trim trailing zero buckets
        let buckets = hist.buckets.slice();
        while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop();

        const maxCount = Math.max(...buckets.map(b => b.count), 1);
        const CHART_HEIGHT = 180; // px

        let barsHtml = '';
        for (const b of buckets) {
            const pct = Math.max((b.count / maxCount) * 100, b.count > 0 ? 3 : 0);
            const probPct = (b.probability * 100).toFixed(1);
            const barH = Math.round(CHART_HEIGHT * pct / 100);
            const xLabel = b.label.replace('m', '').replace('-', '-');
            barsHtml += `
                <div class="vbar-col">
                    <div class="vbar-value">${probPct}%</div>
                    <div class="vbar-track" style="height:${CHART_HEIGHT}px">
                        <div class="vbar-fill" style="height:${barH}px" title="${b.count} parties (${probPct}%)"></div>
                    </div>
                    <div class="vbar-label">${esc(xLabel)}</div>
                </div>`;
        }

        card.innerHTML = `
            <h3>${esc(hist.label)}</h3>
            <div class="hist-meta">${hist.total} parties · avg ${hist.avg ?? '—'}m</div>
            <div class="vbar-chart">
                <div class="vbar-y-label">probability</div>
                <div class="vbar-bars">${barsHtml}</div>
            </div>
            <div class="vbar-x-label">time (minutes)</div>`;
        return card;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    load();
})();
