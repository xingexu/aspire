/*
 * FoodLink domain logic. Pure functions, no DOM, no I/O.
 * Runs in the browser (inlined into the page) and in Node (server + tests).
 * State is derived by folding an append-only event log, so every restock,
 * report and surplus drop is auditable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FoodLinkDomain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  var PILOT_WEEKS = 11;
  var TARGETS = {
    items: 1000, // items taken from Points over the pilot
    wastePct: 5, // % of stocked items discarded
    restockMinutes: 120, // median minutes from an empty report to a restock
    partners: 3, // surplus partners posting drops
  };

  var CATEGORIES = [
    { id: 'grains', label: 'Pasta & rice', unit: 'packs', cap: 24 },
    { id: 'protein', label: 'Canned protein', unit: 'cans', cap: 24 },
    { id: 'breakfast', label: 'Oats & cereal', unit: 'boxes', cap: 16 },
    { id: 'sauces', label: 'Sauce & soup', unit: 'jars', cap: 16 },
    { id: 'snacks', label: 'Snacks', unit: 'bars', cap: 40 },
    { id: 'hygiene', label: 'Period & hygiene', unit: 'packs', cap: 16 },
  ];
  var CAT_BY_ID = {};
  CATEGORIES.forEach(function (c) { CAT_BY_ID[c.id] = c; });

  var POINTS = [
    { id: 'ucc', name: 'UCC Point', place: 'UCC lower level, beside the hamper lockers', open: 8, close: 22 },
    { id: 'weldon', name: 'Weldon Point', place: 'Weldon Library, main floor (proposed)', open: 8, close: 23 },
  ];
  var POINT_BY_ID = {};
  POINTS.forEach(function (p) { POINT_BY_ID[p.id] = p; });

  var DROP_KINDS = {
    shelf: { label: 'Shelf-stable, packaged', maxWindowMin: 7 * 24 * 60, toPoint: true },
    chilled: { label: 'Chilled, sealed', maxWindowMin: 120, toPoint: false },
    prepared: { label: 'Prepared today, sealed', maxWindowMin: 120, toPoint: false },
  };

  /* ---------- helpers ---------- */
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function clampInt(n, lo, hi) { n = Math.round(Number(n) || 0); return Math.max(lo, Math.min(hi, n)); }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function atHour(dayStart, h, m) { var d = new Date(dayStart); d.setHours(h, m || 0, 0, 0); return d.getTime(); }
  // Calendar-day arithmetic that stays at local midnight across daylight-saving changes.
  function addDays(t, n) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function emptyStock(fill) {
    var s = {};
    CATEGORIES.forEach(function (c) { s[c.id] = fill ? Math.round(c.cap * fill) : 0; });
    return s;
  }

  function isOpen(point, t) {
    var h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    return h >= point.open && h < point.close;
  }

  /* ---------- validation ---------- */

  // input: { pointId, counts: {cat: {before, added, removed}}, checklist: {sealed, dated, shelfStable} }
  function validateRestock(state, input) {
    var errors = [];
    var warnings = [];
    var point = input && state.points[input.pointId];
    if (!point) { errors.push('Choose a FoodLink Point.'); return { ok: false, errors: errors, warnings: warnings }; }
    var counts = input.counts || {};
    var any = false;
    CATEGORIES.forEach(function (c) {
      var r = counts[c.id];
      if (!r) { errors.push(c.label + ': missing counts.'); return; }
      ['before', 'added', 'removed'].forEach(function (k) {
        if (!isInt(r[k]) || r[k] < 0 || r[k] > 500) errors.push(c.label + ': ' + k + ' must be a whole number from 0 to 500.');
      });
      if (isInt(r.removed) && isInt(r.before) && r.removed > r.before) {
        errors.push(c.label + ': you can only remove items that were on the shelf (' + r.before + ').');
      }
      if (isInt(r.before) && r.before > point.stock[c.id]) {
        warnings.push(c.label + ': ' + r.before + ' counted, but the last check left ' + point.stock[c.id] + '. Was stock added without a check-in?');
      }
      var after = (r.before || 0) - (r.removed || 0) + (r.added || 0);
      if (after > c.cap) warnings.push(c.label + ': ' + after + ' is over the shelf space for ' + c.cap + '.');
      if (r.added || r.removed || r.before !== point.stock[c.id]) any = true;
    });
    var ck = input.checklist || {};
    if (!ck.sealed) errors.push('Confirm every item is sealed in its original packaging.');
    if (!ck.dated) errors.push('Confirm you checked best-before dates.');
    if (!ck.shelfStable) errors.push('Confirm nothing on the shelf needs a fridge.');
    if (!any && !errors.length) warnings.push('No change from the last check. It will still be logged as a check.');
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // input: { partner, title, kind, qty, place, windowMin, sealed, labelled, cold, bestBefore (YYYY-MM-DD) }
  function evaluateDrop(input, now) {
    var reasons = [];
    var blockers = [];
    var kind = DROP_KINDS[input && input.kind];
    if (!input || !String(input.partner || '').trim()) blockers.push('Name the partner posting this drop.');
    if (!input || !String(input.title || '').trim()) blockers.push('Say what the food is.');
    if (!kind) blockers.push('Choose what kind of food this is.');
    var qty = Number(input && input.qty);
    if (!isInt(qty) || qty < 1 || qty > 200) blockers.push('Quantity must be 1 to 200 items.');
    if (!input || !String(input.place || '').trim()) blockers.push('Say where students pick it up.');
    if (!input || !input.sealed) blockers.push('Only food sealed in its packaging can be shared. Open or homemade food is not accepted.');
    if (!input || !input.labelled) blockers.push('Packaging must show ingredients and allergens.');
    var windowMin = Number(input && input.windowMin);
    if (!isInt(windowMin) || windowMin < 15) blockers.push('The pickup window must be at least 15 minutes.');
    if (kind && isInt(windowMin) && windowMin > kind.maxWindowMin) {
      blockers.push(kind.label + ' food can be held for pickup for at most ' + Math.round(kind.maxWindowMin / 60) + ' hours.');
    }
    if (kind && input.kind !== 'shelf' && !input.cold && input.kind === 'chilled') {
      blockers.push('Chilled food must stay in a fridge until pickup.');
    }
    if (input && input.kind === 'shelf') {
      if (!input.bestBefore) blockers.push('Add the best-before date.');
      else {
        var bb = Date.parse(input.bestBefore + 'T23:59:59');
        if (isNaN(bb)) blockers.push('Best-before date is not a valid date.');
        else if (bb < now) blockers.push('This is past its best-before date.');
        else if (bb - now < 7 * DAY) reasons.push('Best before in under a week: list it as a pickup drop, not for a shelf.');
      }
    }
    var route = 'pickup';
    if (kind && kind.toPoint && !reasons.length) route = 'pickup_or_point';
    if (kind && !kind.toPoint) reasons.push('Partner keeps it ' + (input.kind === 'chilled' ? 'cold' : 'on site') + ' and hands it over at pickup.');
    return {
      ok: blockers.length === 0,
      blockers: blockers,
      notes: reasons,
      route: route,
    };
  }

  /* ---------- event application ---------- */

  function initialState(pilotStart) {
    var points = {};
    POINTS.forEach(function (p) {
      points[p.id] = {
        id: p.id, name: p.name, place: p.place, open: p.open, close: p.close,
        stock: emptyStock(0), lastCheckAt: null, lastRestockAt: null,
        flags: {}, // cat -> time a student reported it empty (cleared by the next check that finds stock)
        history: [], // [{at, taken:{cat:n}, after:{cat:n}}] (last 6 checks)
      };
    });
    return {
      pilotStart: pilotStart,
      points: points,
      drops: {},
      reservations: {},
      reports: [], // {id, pointId, cat, at, count, resolvedAt}
      ledger: [], // per restock: {at, pointId, taken, added, removed}
      partners: {},
      feed: [], // recent human-readable events, newest first (max 40)
      seq: 0,
    };
  }

  function pushFeed(state, ev, text, tone) {
    state.feed.unshift({ at: ev.at, text: text, tone: tone || 'info', type: ev.type, id: ev.id });
    if (state.feed.length > 40) state.feed.length = 40;
  }

  function apply(state, ev) {
    state.seq++;
    var p, c;
    switch (ev.type) {
      case 'restock': {
        p = state.points[ev.pointId];
        if (!p) return state;
        var taken = {}, added = 0, removed = 0, takenTotal = 0;
        var after = {};
        CATEGORIES.forEach(function (cat) {
          var r = ev.counts[cat.id] || { before: p.stock[cat.id], added: 0, removed: 0 };
          var t = Math.max(0, p.stock[cat.id] - r.before);
          taken[cat.id] = t; takenTotal += t;
          added += r.added; removed += r.removed;
          after[cat.id] = Math.max(0, r.before - r.removed + r.added);
        });
        p.stock = after;
        p.lastCheckAt = ev.at;
        if (added > 0) p.lastRestockAt = ev.at;
        CATEGORIES.forEach(function (cat) { if (after[cat.id] > 0) delete p.flags[cat.id]; });
        p.history.push({ at: ev.at, taken: taken, after: after });
        if (p.history.length > 6) p.history.shift();
        state.ledger.push({ at: ev.at, pointId: p.id, taken: taken, takenTotal: takenTotal, added: added, removed: removed });
        // resolve open reports for categories that now have stock
        state.reports.forEach(function (r) {
          if (!r.resolvedAt && r.pointId === p.id && after[r.cat] > 0) r.resolvedAt = ev.at;
        });
        pushFeed(state, ev, p.name + ' checked: ' + takenTotal + ' taken since last check, ' + added + ' added' + (removed ? ', ' + removed + ' removed' : ''), 'good');
        return state;
      }
      case 'report': {
        p = state.points[ev.pointId];
        c = CAT_BY_ID[ev.cat];
        if (!p || !c) return state;
        var open = null;
        for (var i = state.reports.length - 1; i >= 0; i--) {
          var r0 = state.reports[i];
          if (!r0.resolvedAt && r0.pointId === p.id && r0.cat === c.id) { open = r0; break; }
        }
        if (open) { open.count++; open.lastAt = ev.at; }
        else state.reports.push({ id: ev.id, pointId: p.id, cat: c.id, at: ev.at, lastAt: ev.at, count: 1, resolvedAt: null });
        // Counted stock stays as the last check recorded it (so "taken" stays accurate);
        // the flag tells students and volunteers the shelf is believed empty.
        p.flags[c.id] = ev.at;
        pushFeed(state, ev, c.label + ' reported empty at ' + p.name, 'warn');
        return state;
      }
      case 'drop_post': {
        var d = ev.drop;
        state.drops[d.id] = {
          id: d.id, partner: d.partner, title: d.title, kind: d.kind, qty: d.qty, remaining: d.qty,
          place: d.place, createdAt: ev.at, windowEnd: ev.at + d.windowMin * MIN, picked: 0,
        };
        state.partners[d.partner] = (state.partners[d.partner] || 0) + 1;
        pushFeed(state, ev, d.partner + ' posted ' + d.qty + ' × ' + d.title, 'info');
        return state;
      }
      case 'reserve': {
        var drop = state.drops[ev.dropId];
        if (!drop || drop.remaining <= 0 || ev.at > drop.windowEnd) return state;
        drop.remaining -= 1;
        state.reservations[ev.code] = { code: ev.code, dropId: drop.id, at: ev.at, pickedAt: null };
        pushFeed(state, ev, 'Reserved 1 × ' + drop.title + ' (' + drop.remaining + ' left)', 'info');
        return state;
      }
      case 'pickup': {
        var res = state.reservations[ev.code];
        if (!res || res.pickedAt) return state;
        res.pickedAt = ev.at;
        var dd = state.drops[res.dropId];
        if (dd) dd.picked += 1;
        pushFeed(state, ev, 'Pickup confirmed: ' + ev.code, 'good');
        return state;
      }
      default:
        return state;
    }
  }

  function fold(events, pilotStart) {
    var s = initialState(pilotStart);
    for (var i = 0; i < events.length; i++) apply(s, events[i]);
    return s;
  }

  /* ---------- action -> event (validates; returns {ok, event|errors}) ---------- */

  function makeId(prefix, rand) {
    var r = rand || Math.random;
    return prefix + '_' + Math.floor(r() * 36 ** 6).toString(36).padStart(6, '0');
  }

  function reservationCode(rand) {
    var r = rand || Math.random;
    return 'FL-' + String(1000 + Math.floor(r() * 9000));
  }

  function restockEvent(state, input, now) {
    var v = validateRestock(state, input);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    var counts = {};
    CATEGORIES.forEach(function (c) {
      var r = input.counts[c.id];
      counts[c.id] = { before: r.before, added: r.added, removed: r.removed };
    });
    return { ok: true, warnings: v.warnings, event: { id: makeId('rs'), type: 'restock', at: now, pointId: input.pointId, counts: counts } };
  }

  function reportEvent(state, pointId, cat, now) {
    if (!state.points[pointId] || !CAT_BY_ID[cat]) return { ok: false, errors: ['Unknown shelf.'] };
    return { ok: true, event: { id: makeId('rp'), type: 'report', at: now, pointId: pointId, cat: cat } };
  }

  function dropEvent(input, now) {
    var e = evaluateDrop(input, now);
    if (!e.ok) return { ok: false, errors: e.blockers };
    return {
      ok: true,
      event: {
        id: makeId('dp'), type: 'drop_post', at: now,
        drop: {
          id: makeId('d'), partner: String(input.partner).trim().slice(0, 60), title: String(input.title).trim().slice(0, 60),
          kind: input.kind, qty: Number(input.qty), place: String(input.place).trim().slice(0, 80), windowMin: Number(input.windowMin),
        },
      },
    };
  }

  function reserveEvent(state, dropId, now, rand) {
    var d = state.drops[dropId];
    if (!d) return { ok: false, errors: ['That drop no longer exists.'] };
    if (now > d.windowEnd) return { ok: false, errors: ['Pickup window has closed.'] };
    if (d.remaining <= 0) return { ok: false, errors: ['All claimed.'] };
    var code;
    do { code = reservationCode(rand); } while (state.reservations[code]);
    return { ok: true, event: { id: makeId('rv'), type: 'reserve', at: now, dropId: dropId, code: code } };
  }

  function pickupEvent(state, code, now) {
    code = String(code || '').trim().toUpperCase();
    if (!/^FL-\d{4}$/.test(code)) return { ok: false, errors: ['Codes look like FL-1234.'] };
    var r = state.reservations[code];
    if (!r) return { ok: false, errors: ['No reservation with that code.'] };
    if (r.pickedAt) return { ok: false, errors: ['Already picked up.'] };
    return { ok: true, event: { id: makeId('pk'), type: 'pickup', at: now, code: code } };
  }

  /* ---------- selectors ---------- */

  function dropStatus(d, now) {
    if (now > d.windowEnd) return 'ended';
    if (d.remaining <= 0) return 'claimed';
    return 'live';
  }

  function liveDrops(state, now) {
    return Object.keys(state.drops).map(function (k) { return state.drops[k]; })
      .filter(function (d) { return dropStatus(d, now) === 'live'; })
      .sort(function (a, b) { return a.windowEnd - b.windowEnd; });
  }

  function openReports(state, pointId) {
    return state.reports.filter(function (r) { return !r.resolvedAt && (!pointId || r.pointId === pointId); });
  }

  // Items per hour taken for a category, from the last few checks.
  function takeRate(point, cat) {
    var h = point.history;
    if (h.length < 2) return 0;
    var span = h[h.length - 1].at - h[0].at;
    if (span <= 0) return 0;
    var taken = 0;
    for (var i = 1; i < h.length; i++) taken += h[i].taken[cat] || 0;
    var openHoursShare = (point.close - point.open) / 24; // takes only happen while open
    return taken / (span / HOUR) / openHoursShare;
  }

  // Earliest category likely to run out while the Point is open today.
  function forecast(point, now) {
    if (!isOpen(point, now)) return null;
    var closeAt = atHour(startOfDay(now), point.close);
    var best = null;
    CATEGORIES.forEach(function (c) {
      var stock = point.stock[c.id];
      if (stock <= 0 || point.flags[c.id]) return;
      var rate = takeRate(point, c.id);
      if (rate <= 0) return;
      var at = now + (stock / rate) * HOUR;
      if (at < closeAt && (!best || at < best.at)) best = { cat: c.id, at: at };
    });
    return best;
  }

  function level(stock, cap) {
    if (stock <= 0) return 'out';
    if (stock / cap <= 0.25) return 'low';
    return 'ok';
  }

  function metrics(state, now) {
    var takenTotal = 0, added = 0, removed = 0;
    var byCat = {};
    CATEGORIES.forEach(function (c) { byCat[c.id] = 0; });
    var days = 14;
    var today0 = startOfDay(now);
    var byDay = [];
    for (var i = days - 1; i >= 0; i--) {
      var d0 = addDays(today0, -i);
      var row = { day: d0 };
      POINTS.forEach(function (p) { row[p.id] = 0; });
      byDay.push(row);
    }
    state.ledger.forEach(function (l) {
      takenTotal += l.takenTotal; added += l.added; removed += l.removed;
      CATEGORIES.forEach(function (c) { byCat[c.id] += l.taken[c.id] || 0; });
      var idx = days - 1 - dayDiff(today0, l.at);
      if (idx >= 0 && idx < days) byDay[idx][l.pointId] += l.takenTotal;
    });
    var resolveMins = state.reports.filter(function (r) { return r.resolvedAt; })
      .map(function (r) { return (r.resolvedAt - r.at) / MIN; });
    var dropItems = 0, dropReserved = 0, dropPicked = 0;
    Object.keys(state.drops).forEach(function (k) {
      var d = state.drops[k];
      dropItems += d.qty; dropReserved += d.qty - d.remaining; dropPicked += d.picked;
    });
    var elapsedDays = Math.max(0, dayDiff(now, state.pilotStart) + (now - startOfDay(now)) / DAY);
    var pilotDays = PILOT_WEEKS * 7;
    var week = Math.min(PILOT_WEEKS, Math.floor(elapsedDays / 7) + 1);
    var expected = TARGETS.items * Math.min(1, elapsedDays / pilotDays);
    return {
      week: week,
      weeks: PILOT_WEEKS,
      itemsTaken: takenTotal,
      itemsTarget: TARGETS.items,
      itemsExpected: Math.round(expected),
      pacePct: expected > 0 ? Math.round((takenTotal / expected - 1) * 100) : 0,
      added: added,
      removed: removed,
      wastePct: added > 0 ? Math.round((removed / added) * 1000) / 10 : 0,
      wasteTarget: TARGETS.wastePct,
      medianRestockMin: resolveMins.length ? Math.round(median(resolveMins)) : null,
      restockTarget: TARGETS.restockMinutes,
      reportsOpen: openReports(state).length,
      reportsTotal: state.reports.length,
      partners: Object.keys(state.partners).length,
      partnersTarget: TARGETS.partners,
      dropItems: dropItems,
      dropReserved: dropReserved,
      dropPicked: dropPicked,
      byCat: byCat,
      byDay: byDay,
    };
  }

  /* ---------- simulated pilot (clearly labelled demo data) ---------- */

  // Open hours of a Point that fall between times a and b (handles day boundaries).
  function openHoursBetween(point, a, b) {
    if (b <= a) return 0;
    var total = 0;
    for (var d0 = startOfDay(a); d0 < b; d0 = addDays(d0, 1)) {
      var o = atHour(d0, point.open), c = atHour(d0, point.close);
      var lo = Math.max(a, o), hi = Math.min(b, c);
      if (hi > lo) total += (hi - lo) / HOUR;
    }
    return total;
  }

  // Simulated pilot used for the demo (clearly labelled as simulated in the UI).
  // The full history is generated independently of the time of day, then cut at `now`,
  // so reloading the demo during the day never rewrites the past.
  function seedEvents(now, seed) {
    var rand = mulberry32(seed || 20261031);
    var today0 = startOfDay(now);
    var pilotStart = addDays(today0, -37); // today is day 38 -> week 6 of 11
    var events = [];
    var seq = 0;
    function id(p) { seq++; return p + '_s' + seq; }
    var DAILY = 5.7; // ordinary items a Point gives out on an average day
    // Days on which one category at one Point is cleared out in a rush (then reported empty)
    var RUSH_DAYS = { 3: 'weldon', 8: 'ucc', 13: 'weldon', 17: 'ucc', 22: 'weldon', 27: 'ucc', 31: 'weldon', 35: 'ucc' };
    var weekdayLoad = [0.55, 1.05, 1.1, 1.25, 1.1, 0.85, 0.5]; // Sun..Sat
    var catShare = { grains: 0.24, protein: 0.22, breakfast: 0.14, sauces: 0.12, snacks: 0.2, hygiene: 0.08 };

    POINTS.forEach(function (p, pi) {
      var mult = pi === 0 ? 1.15 : 0.85;
      var stock = emptyStock(0);
      var lastT = pilotStart + 8 * HOUR;

      function takesSince(t) {
        var hours = openHoursBetween(p, lastT, t);
        var load = weekdayLoad[new Date(t).getDay()];
        var res = {};
        CATEGORIES.forEach(function (c) {
          var exp = DAILY * mult * load * catShare[c.id] * (hours / (p.close - p.open));
          var n = Math.floor(exp) + (rand() < exp - Math.floor(exp) ? 1 : 0);
          res[c.id] = Math.max(0, Math.min(stock[c.id], n));
        });
        lastT = t;
        return res;
      }

      for (var day = 0; day < 38; day++) {
        var d0 = addDays(pilotStart, day);
        var lastDay = day === 37;
        var moments = [
          { t: atHour(d0, 8, 45), kind: 'check', phase: 0 },
          { t: atHour(d0, 16, 30), kind: 'check', phase: 1 },
          { t: atHour(d0, 21, 15), kind: 'check', phase: 2 },
        ];
        var rushRoll = rand(), rushAt = atHour(d0, 11 + Math.floor(rand() * 5), Math.floor(rand() * 60));
        var rushCatRoll = rand(), fixDelay = (25 + Math.floor(rand() * 85)) * MIN;
        if (RUSH_DAYS[day] === p.id && rushRoll >= 0) {
          var rcat = rushCatRoll < 0.5 ? 'protein' : (rushCatRoll < 0.75 ? 'hygiene' : 'grains');
          moments.push({ t: rushAt, kind: 'report', cat: rcat });
          moments.push({ t: rushAt + fixDelay, kind: 'fix', cat: rcat });
        }
        moments.sort(function (a, b) { return a.t - b.t; });
        for (var m = 0; m < moments.length; m++) {
          var mo = moments[m];
          if (mo.kind === 'report') {
            // A rush cleared this category; a student reports the empty shelf.
            events.push({ id: id('rp'), type: 'report', at: mo.t, pointId: p.id, cat: mo.cat });
            continue;
          }
          var takes = takesSince(mo.t);
          if (mo.kind === 'fix') takes[mo.cat] = stock[mo.cat];
          var counts = {};
          CATEGORIES.forEach(function (c) {
            var before = stock[c.id] - takes[c.id];
            var removed = (mo.kind === 'check' && mo.phase === 0 && before > 0 && rand() < 0.05) ? 1 : 0;
            var target = Math.round(c.cap * (0.72 + rand() * 0.14));
            var added = 0;
            if (mo.kind === 'fix') added = c.id === mo.cat ? Math.round(c.cap * 0.6) : 0;
            else if (mo.phase === 0) added = Math.max(0, target - (before - removed));
            else if (mo.phase === 1) added = before <= c.cap * 0.25 ? Math.max(0, Math.round(c.cap * 0.6) - before) : 0;
            else if (rand() < 0.5) added = Math.max(0, Math.round(c.cap * 0.5) - (before - removed));
            counts[c.id] = { before: before, added: added, removed: removed };
            stock[c.id] = before - removed + added;
          });
          events.push({ id: id('rs'), type: 'restock', at: mo.t, pointId: p.id, counts: counts });
        }
      }
    });

    // Surplus drops on Tuesdays and Thursdays from three pilot partners
    var partners = ['Campus café (pilot partner)', 'Grocery partner (pilot)', 'Event catering (pilot)'];
    var dropTitles = {
      shelf: ['Granola bars, boxed', 'Instant noodles, sealed', 'Canned chickpeas'],
      chilled: ['Yogurt cups, sealed', 'Sealed salads'],
      prepared: ['Wrapped sandwiches', 'Boxed lunches, sealed'],
    };
    var places = ['Somerville House, main desk', 'UCC, room 40F', 'Social Science Centre lobby'];
    var pIdx = 0;
    for (var day2 = 0; day2 < 38; day2++) {
      var dd0 = addDays(pilotStart, day2);
      var dow = new Date(dd0).getDay();
      if (dow !== 2 && dow !== 4) continue;
      var ptime = atHour(dd0, 13, 10);
      var kind = ['shelf', 'chilled', 'prepared'][Math.floor(rand() * 3)];
      var partner = partners[pIdx++ % partners.length];
      var qty = 8 + Math.floor(rand() * 13);
      var dropId = 'd_s' + day2;
      var title = dropTitles[kind][Math.floor(rand() * dropTitles[kind].length)];
      var place = places[Math.floor(rand() * places.length)];
      events.push({
        id: id('dp'), type: 'drop_post', at: ptime,
        drop: { id: dropId, partner: partner, title: title, kind: kind, qty: qty, place: place, windowMin: 120 },
      });
      var claimed = Math.min(qty, Math.round(qty * (0.7 + rand() * 0.3)));
      for (var k = 0; k < claimed; k++) {
        var at = ptime + (2 + k * 4 + Math.floor(rand() * 3)) * MIN;
        var pk = at + (15 + Math.floor(rand() * 40)) * MIN;
        var picks = rand() < 0.9;
        if (at > ptime + 120 * MIN) break;
        var code = 'FL-' + String(1000 + ((day2 * 97 + k * 31) % 9000));
        events.push({ id: id('rv'), type: 'reserve', at: at, dropId: dropId, code: code });
        if (picks) events.push({ id: id('pk'), type: 'pickup', at: pk, code: code });
      }
    }
    events = events.filter(function (e) { return e.at <= now; });
    events.sort(function (a, b) { return a.at - b.at; });
    // Story for the demo: protein donations ran short, so UCC's latest check left canned protein low.
    for (var i = events.length - 1; i >= 0; i--) {
      var e = events[i];
      if (e.type === 'restock' && e.pointId === 'ucc') {
        var pr = e.counts.protein;
        e.counts.protein = { before: Math.min(pr.before, 4), added: 0, removed: 0 };
        break;
      }
    }
    return { pilotStart: pilotStart, events: events };
  }

  // Days a category will last at the recent pace (null if no recent demand).
  function daysLeft(point, cat) {
    var rate = takeRate(point, cat); // items per open hour
    if (rate <= 0) return null;
    var stock = point.flags[cat] ? 0 : point.stock[cat];
    return stock / (rate * (point.close - point.open));
  }

  return {
    MIN: MIN, HOUR: HOUR, DAY: DAY,
    PILOT_WEEKS: PILOT_WEEKS, TARGETS: TARGETS,
    CATEGORIES: CATEGORIES, CAT_BY_ID: CAT_BY_ID,
    POINTS: POINTS, POINT_BY_ID: POINT_BY_ID,
    DROP_KINDS: DROP_KINDS,
    validateRestock: validateRestock,
    evaluateDrop: evaluateDrop,
    initialState: initialState,
    apply: apply,
    fold: fold,
    restockEvent: restockEvent,
    reportEvent: reportEvent,
    dropEvent: dropEvent,
    reserveEvent: reserveEvent,
    pickupEvent: pickupEvent,
    dropStatus: dropStatus,
    liveDrops: liveDrops,
    openReports: openReports,
    takeRate: takeRate,
    forecast: forecast,
    level: level,
    isOpen: isOpen,
    metrics: metrics,
    seedEvents: seedEvents,
    daysLeft: daysLeft,
    openHoursBetween: openHoursBetween,
    startOfDay: startOfDay,
    addDays: addDays,
    dayDiff: dayDiff,
    atHour: atHour,
    mulberry32: mulberry32,
  };
});
