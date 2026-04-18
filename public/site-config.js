// ============================================================================
// SKB — Diner-facing website config loader (issue #45)
// ============================================================================
// Fetches the public subset of the Location config from /api/public-config
// and fills in brand name, address, and hours blocks on any page that has
// the relevant element IDs. Used by home.html, hours-location.html, and
// contact.html. No-op if the expected elements aren't on the page.
// ============================================================================

(function () {
    'use strict';

    var DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    var DAY_LABEL = {
        mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
        fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
    };

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function formatTime(hhmm) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
        if (!m) return hhmm || '';
        var h = parseInt(m[1], 10);
        var mins = m[2];
        if (h === 0) return '12:' + mins + ' AM';
        if (h < 12) return h + ':' + mins + ' AM';
        if (h === 12) return '12:' + mins + ' PM';
        return (h - 12) + ':' + mins + ' PM';
    }

    function renderAddress(address, el) {
        if (!address || !el) return;
        var zip = address.zip ? ' ' + esc(address.zip) : '';
        el.innerHTML = '<p>' + esc(address.street) + '</p>' +
                       '<p>' + esc(address.city) + ', ' + esc(address.state) + zip + '</p>';
    }

    function renderAddressLines(address, el) {
        if (!address || !el) return;
        var zip = address.zip ? ' ' + esc(address.zip) : '';
        el.innerHTML =
            '<div class="line"><strong id="address-brand"></strong></div>' +
            '<div class="line">' + esc(address.street) + '</div>' +
            '<div class="line">' + esc(address.city) + ', ' + esc(address.state) + zip + '</div>';
    }

    // Map JS getDay() (0=Sun..6=Sat) to the DAY_ORDER keys (mon..sun).
    var JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    function renderHoursCompact(hours, el) {
        if (!hours || !el) return;
        // Previously this picked the FIRST OPEN DAY and rendered its
        // lunch/dinner windows as the global home-page hours. That's
        // wrong for restaurants whose hours vary by day — a diner
        // landing on Saturday saw Tuesday's schedule labeled as if it
        // applied today. Fix: render TODAY specifically, with the day
        // name as the label, and a link to the full grid for other days.
        //
        // Timezone note: uses the browser's local clock, which matches
        // the diner's perspective ("what are your hours right now?").
        // Close to, but not exactly, the restaurant's configured TZ —
        // close enough for a compact home-page display.
        var today = new Date();
        var todayKey = JS_DAY_TO_KEY[today.getDay()];
        var entry = hours[todayKey];
        var label = DAY_LABEL[todayKey] || 'Today';
        var body;
        if (entry === 'closed' || entry === undefined) {
            body = '<p><strong>' + label + '</strong> · Closed today</p>';
        } else {
            var windows = [];
            if (entry.lunch) windows.push(formatTime(entry.lunch.open) + ' – ' + formatTime(entry.lunch.close));
            if (entry.dinner) windows.push(formatTime(entry.dinner.open) + ' – ' + formatTime(entry.dinner.close));
            body = '<p><strong>' + label + '</strong> · ' + (windows.length ? windows.join(' &middot; ') : 'Closed today') + '</p>';
        }
        el.innerHTML = body + '<p class="hours-see-full"><a href="./hours">See full hours &rarr;</a></p>';
    }

    function renderHoursTable(hours, el) {
        if (!hours || !el) return;
        var rows = [];
        for (var i = 0; i < DAY_ORDER.length; i++) {
            var day = DAY_ORDER[i];
            var entry = hours[day];
            var label = DAY_LABEL[day];
            if (entry === 'closed' || entry === undefined) {
                rows.push('<tr><td>' + label + '</td><td class="hours-closed">Closed</td></tr>');
                continue;
            }
            var parts = [];
            if (entry.lunch) parts.push(formatTime(entry.lunch.open) + ' – ' + formatTime(entry.lunch.close));
            if (entry.dinner) parts.push(formatTime(entry.dinner.open) + ' – ' + formatTime(entry.dinner.close));
            rows.push('<tr><td>' + label + '</td><td>' + (parts.length ? parts.join(' &middot; ') : 'Closed') + '</td></tr>');
        }
        el.innerHTML = rows.join('\n');
    }

    function buildMapsEmbedUrl(address) {
        if (!address) return '';
        var parts = [address.street, address.city, address.state, address.zip]
            .map(function (p) { return (p || '').trim(); })
            .filter(Boolean);
        if (parts.length < 2) return '';
        return 'https://www.google.com/maps?q=' + encodeURIComponent(parts.join(', ')) + '&output=embed';
    }

    function buildMapsSearchUrl(address) {
        if (!address) return '#';
        var parts = [address.street, address.city, address.state, address.zip]
            .map(function (p) { return (p || '').trim(); })
            .filter(Boolean);
        if (parts.length < 2) return '#';
        return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(parts.join(', '));
    }

    function applyConfig(cfg) {
        var brandEls = document.querySelectorAll('#brand-name, #address-brand');
        brandEls.forEach(function (el) { el.textContent = cfg.name || el.textContent; });

        renderAddress(cfg.address, document.getElementById('home-address-block'));
        renderHoursCompact(cfg.hours, document.getElementById('home-hours-block'));

        renderAddressLines(cfg.address, document.getElementById('hours-address-lines'));
        var addressBrand = document.getElementById('address-brand');
        if (addressBrand) addressBrand.textContent = cfg.name || '';

        renderHoursTable(cfg.hours, document.getElementById('hours-table-body'));

        var mapEmbed = document.getElementById('map-embed');
        if (mapEmbed && cfg.address) {
            var embedUrl = buildMapsEmbedUrl(cfg.address);
            if (embedUrl) mapEmbed.src = embedUrl;
        }

        var mapCta = document.getElementById('map-cta');
        if (mapCta && cfg.address) {
            mapCta.href = buildMapsSearchUrl(cfg.address);
        }

        var footerContact = document.getElementById('footer-contact');
        if (footerContact && cfg.address) {
            var a = cfg.address;
            var line = a.street + ', ' + a.city + ' ' + a.state + ' ' + a.zip;
            // Include the contact email only if this tenant has configured one;
            // a default/hardcoded email leaks across tenants (seen on ABCD demo).
            var email = cfg.content && cfg.content.contactEmail;
            if (email) line += ' · ' + email;
            footerContact.textContent = line;
        }

        var phoneLinks = document.querySelectorAll('a[data-front-desk-phone]');
        if (cfg.frontDeskPhone) {
            phoneLinks.forEach(function (a) {
                a.href = 'tel:+1' + cfg.frontDeskPhone;
                if (a.dataset.frontDeskPhone === 'display') {
                    var p = cfg.frontDeskPhone;
                    a.textContent = '(' + p.slice(0, 3) + ') ' + p.slice(3, 6) + '-' + p.slice(6);
                }
            });
        }
    }

    fetch('api/public-config')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) { if (cfg) applyConfig(cfg); })
        .catch(function () { /* no-op: pages render their fallback content */ });
})();
