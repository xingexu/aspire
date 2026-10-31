/* FoodLink UI. Depends on window.FoodLinkDomain. Runs standalone (local demo store)
 * or against the FoodLink API when window.FOODLINK_API is set (e.g. "/api"). */
(function () {
  'use strict';
  var D = window.FoodLinkDomain;
  var API = window.FOODLINK_API || null;
  var CATS = D.CATEGORIES;

  /* ================= utilities ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var clockFmt = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' });
  var dayFmt = new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  function clock(t) { return clockFmt.format(new Date(t)); }
  // Ends a sentence without doubling the period after "a.m." / "p.m.".
  function endSentence(str) { return /[.!?]$/.test(str) ? str : str + '.'; }
  function rel(t, now) {
    var s = Math.round((now - t) / 1000);
    if (s < 45) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + ' h' + (mm ? ' ' + mm + ' min' : '') + ' ago';
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day' : ' days') + ' ago';
  }
  function until(t, now) {
    var m = Math.max(0, Math.round((t - now) / 60000));
    if (m < 60) return m + ' min left';
    var h = Math.floor(m / 60), mm = m % 60;
    return h + ' h' + (mm ? ' ' + mm + ' min' : '') + ' left';
  }
  // "8:45 a.m." today, "yesterday 8:45 a.m.", otherwise "Oct 28, 8:45 a.m.".
  var shortDateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });
  function dayClock(t, now) {
    var diff = D.dayDiff(now, t); // days since t
    if (diff === 0) return clock(t);
    if (diff === 1) return 'yesterday ' + clock(t);
    return shortDateFmt.format(new Date(t)) + ', ' + clock(t);
  }
  // Whole days only: a forecast to one decimal is false precision.
  function daysText(dl, stock) {
    if (dl === null) return stock + ' left';
    if (dl < 1) return '< 1 day';
    if (dl < 2) return '~1 day';
    return '~' + Math.round(dl) + ' days';
  }
  function daysTone(dl, flagged) {
    if (flagged || (dl !== null && dl < 1)) return 'bad';
    if (dl === null) return 'none';
    return dl < 2 ? 'warn' : 'good';
  }
  function hourLabel(h) { return clock(new Date(2026, 0, 1, h, 0).getTime()).replace(':00', ''); }
  function num(n) { return Number(n).toLocaleString('en-CA'); }
  function lsGet(k) { try { var v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable: demo still works in memory */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function catLabel(id) { return D.CAT_BY_ID[id] ? D.CAT_BY_ID[id].label : id; }

  /* ================= store ================= */
  var LS_KEY = 'foodlink:v1';
  var Store = {
    ready: false,
    pilotStart: 0,
    seed: [],
    live: [],
    state: null,
    seen: {},
    listeners: [],
    bc: null,
    es: null,
    error: null,
    subscribe: function (fn) { this.listeners.push(fn); },
    notify: function (ev) { this.listeners.forEach(function (fn) { fn(ev); }); },
    rebuild: function () {
      var all = this.seed.concat(this.live).slice().sort(function (a, b) { return a.at - b.at; });
      this.seen = {};
      var self = this;
      all.forEach(function (e) { self.seen[e.id] = true; });
      this.state = D.fold(all, this.pilotStart);
    },
    commit: function (ev, fromRemote) {
      if (this.seen[ev.id]) return;
      this.seen[ev.id] = true;
      this.live.push(ev);
      D.apply(this.state, ev);
      if (!API) {
        lsSet(LS_KEY, { day: dayKey(Date.now()), events: this.live });
        if (!fromRemote && this.bc) { try { this.bc.postMessage({ kind: 'event', event: ev }); } catch (e) { /* ignore */ } }
      }
      this.notify(ev);
    },
    init: function () {
      var self = this;
      if (API) return this.initApi();
      var saved = lsGet(LS_KEY);
      if (!saved || saved.day !== dayKey(Date.now()) || !Array.isArray(saved.events)) saved = { events: [] };
      var seed = D.seedEvents(Date.now());
      this.pilotStart = seed.pilotStart;
      this.seed = seed.events;
      this.live = saved.events.filter(function (e) { return e && e.id && e.type && typeof e.at === 'number'; });
      this.rebuild();
      try {
        this.bc = new BroadcastChannel('foodlink:v1');
        this.bc.onmessage = function (m) {
          var d = m.data || {};
          if (d.kind === 'event' && d.event) self.commit(d.event, true);
          if (d.kind === 'reset') { self.live = []; self.rebuild(); self.notify({ type: 'reset' }); }
        };
      } catch (e) { this.bc = null; }
      this.ready = true;
      return Promise.resolve();
    },
    initApi: function () {
      var self = this;
      return fetch(API + '/state', { headers: { accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          self.pilotStart = d.pilotStart;
          self.seed = d.events || [];
          self.live = [];
          self.rebuild();
          self.ready = true;
          // One stream per page: close the old one (reset reloads), and ask for everything after this
          // snapshot so an event posted between the two requests is not missed.
          if (self.es) { try { self.es.close(); } catch (e) { /* ignore */ } self.es = null; }
          var lastId = self.seed.length ? self.seed[self.seed.length - 1].id : '';
          try {
            self.es = new EventSource(API + '/stream' + (lastId ? '?lastEventId=' + encodeURIComponent(lastId) : ''));
            self.es.addEventListener('ev', function (m) { try { self.commit(JSON.parse(m.data), true); } catch (e) { /* ignore */ } });
            self.es.addEventListener('reset', function () { self.initApi().then(function () { self.notify({ type: 'reset' }); }); });
          } catch (e) { /* live updates unavailable */ }
        })
        .catch(function (err) { self.error = 'Could not reach the FoodLink server (' + err.message + ').'; self.ready = false; });
    },
    act: function (action, input) {
      var self = this;
      if (API) {
        var pin = ssGet('foodlink:pin');
        var headers = { 'content-type': 'application/json' };
        if (pin) headers['x-foodlink-pin'] = pin;
        return fetch(API + '/actions', { method: 'POST', headers: headers, body: JSON.stringify({ action: action, input: input }) })
          .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
          .then(function (res) {
            if (res.status === 401) return { ok: false, needPin: true, errors: (res.body && res.body.errors && res.body.errors.length) ? res.body.errors : ['Enter the volunteer PIN to do this.'] };
            if (res.body && res.body.ok && res.body.event) self.commit(res.body.event, true);
            return res.body;
          })
          .catch(function () { return { ok: false, errors: ['Network problem. Try again.'] }; });
      }
      var now = Date.now(), res;
      var s = this.state;
      switch (action) {
        case 'restock': res = D.restockEvent(s, input, now); break;
        case 'report': res = D.reportEvent(s, input.pointId, input.cat, now); break;
        case 'drop': res = D.dropEvent(input, now); break;
        case 'reserve': res = D.reserveEvent(s, input.dropId, now); break;
        case 'pickup': res = D.pickupEvent(s, input.code, now); break;
        default: res = { ok: false, errors: ['Unknown action.'] };
      }
      if (res.ok) this.commit(res.event);
      return Promise.resolve(res);
    },
    reset: function () {
      var self = this;
      if (API) {
        var send = function (pin) {
          var headers = {};
          if (pin) headers['x-foodlink-pin'] = pin;
          return fetch(API + '/reset', { method: 'POST', headers: headers });
        };
        // Reset can need the admin PIN; ask for it once rather than storing it.
        return send(ssGet('foodlink:pin'))
          .then(function (r) {
            if (r.status !== 401) return r;
            var pin = window.prompt('Admin PIN to reset the demo');
            return pin ? send(pin) : r;
          })
          .then(function (r) {
            if (r.ok) return self.initApi();
            return r.json().catch(function () { return {}; }).then(function (j) {
              throw new Error((j && j.errors && j.errors[0]) || 'Reset failed (HTTP ' + r.status + ').');
            });
          })
          .then(function () { self.notify({ type: 'reset' }); });
      }
      this.live = [];
      lsSet(LS_KEY, { day: dayKey(Date.now()), events: [] });
      var seed = D.seedEvents(Date.now());
      this.pilotStart = seed.pilotStart;
      this.seed = seed.events;
      this.rebuild();
      if (this.bc) { try { this.bc.postMessage({ kind: 'reset' }); } catch (e) { /* ignore */ } }
      this.notify({ type: 'reset' });
      return Promise.resolve();
    },
  };

  /* ================= UI state ================= */
  var ROUTES = ['find', 'restock', 'drops', 'impact', 'present'];
  var NAV = [
    { id: 'find', label: 'Find food' },
    { id: 'restock', label: 'Restock' },
    { id: 'drops', label: 'Partner drops' },
    { id: 'impact', label: 'Dashboard' },
    { id: 'present', label: 'Live demo' },
  ];
  var myCodes = lsGet('foodlink:codes') || {};
  var flashKeys = {};
  var toastTimer = null;
  var panes = {};
  var present = { tab: 'impact', done: {}, running: false };

  function newPane(id, view) {
    return { id: id, view: view, el: null, scrollEl: null, ui: {} };
  }

  function flash(keys) {
    var until = Date.now() + 1700;
    keys.forEach(function (k) { flashKeys[k] = until; });
  }
  function flashAttr(key) {
    return flashKeys[key] && flashKeys[key] > Date.now() ? ' flash' : '';
  }

  function toast(text) {
    var wrap = document.getElementById('toast');
    if (!wrap) return;
    wrap.innerHTML = '<div class="toast" role="status">' + esc(text) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { wrap.innerHTML = ''; }, 3200);
  }

  /* ================= shared bits ================= */

  function lastUpdate(state) {
    return state.feed.length ? state.feed[0].at : state.pilotStart;
  }

  function openLabel(p, now) {
    if (D.isOpen(p, now)) return { open: true, text: 'Open · until ' + hourLabel(p.close) };
    return { open: false, text: 'Closed · opens ' + hourLabel(p.open) };
  }

  /* ================= views: Find food ================= */
  var HELP = [
    { name: 'USC Food Support walk-in', chip: 'Mon–Thu, 10–4', tone: '',
      body: 'Take what you need at the food bank in UCC 40F, in the basement near the Peer Support Centre. Monday to Thursday, 10 a.m. to 4 p.m.; closed Friday to Sunday.' },
    { name: 'USC food hamper', chip: 'Check the date', tone: 'warn',
      body: 'Five to seven days of groceries. Request online, then collect it from UCC 40F or a UCC basement locker (opening instructions come by email). Ready in 48 hours at the earliest. The USC page still says requests reopen September 8, 2025.' },
    { name: 'London Food Bank', chip: 'Students: Sat 9–11 a.m.', tone: '',
      body: '926 Leathorne St. Bring a student card and proof of income, if you have any. Weekdays 9 a.m. to 4 p.m. Phone 519-659-4045.' },
    { name: "St. Paul's Social Services", chip: 'Weekdays', tone: '',
      body: '472 Richmond St. Three-day emergency food supply, weekdays 9 to 11:30 a.m. Hot lunch Monday and Wednesday, 11:30 a.m. to 12:30 p.m. Phone 519-434-8979.' },
    { name: 'Salvation Army Basic Needs', chip: 'Weekdays', tone: '',
      body: 'Weekdays 8 a.m. to 3:30 p.m. Bring ID for everyone in your household and proof of a London address. Phone 519-661-0343, ext. 227.' },
    { name: 'SOGS Food Bank', chip: 'Graduate students', tone: '',
      body: 'A $100 grocery gift card for Loblaw-owned stores. Apply in advance. Teaching assistants are not eligible.' },
  ];

  function renderCat(p, c, now) {
    var flagged = p.flags[c.id];
    var stock = flagged ? 0 : p.stock[c.id];
    var lvl = flagged ? 'out' : D.level(stock, c.cap);
    var pct = Math.max(0, Math.min(100, Math.round((stock / c.cap) * 100)));
    var state = flagged ? 'Reported empty · ' + rel(flagged, now) : lvl === 'out' ? 'Out' : lvl === 'low' ? 'Running low' : 'In stock';
    var key = 'cat-' + p.id + '-' + c.id;
    return '<div class="cat ' + (lvl === 'ok' ? '' : lvl) + flashAttr(key) + '" data-testid="' + key + '">' +
      '<div class="cat-top"><span class="cat-label">' + esc(c.label) + '</span><span class="cat-count" aria-label="' + stock + ' ' + esc(c.unit) + '">' + stock + '</span></div>' +
      '<div class="bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
      '<div class="cat-state">' + esc(state) + '</div></div>';
  }

  function renderPoint(pane, p, now) {
    var ol = openLabel(p, now);
    var picker = pane.ui.reportOpen === p.id;
    var html = '<article class="card" data-testid="point-' + p.id + '">' +
      '<div class="point-head"><div><h2 class="point-name">' + esc(p.name) + '</h2><div class="muted">' + esc(p.place) + '</div></div>' +
      '<span class="chip ' + (ol.open ? 'good' : '') + '">' + esc(ol.text) + '</span></div>' +
      '<div class="cats">' + CATS.map(function (c) { return renderCat(p, c, now); }).join('') + '</div>' +
      '<div class="point-foot"><span class="hint">Counted ' + (p.lastCheckAt ? esc(rel(p.lastCheckAt, now)) : 'not yet') +
      (p.lastRestockAt ? ' · restocked ' + esc(dayClock(p.lastRestockAt, now)) : '') + '</span>' +
      '<button class="btn small" data-act="report-open" data-point="' + p.id + '" aria-expanded="' + (picker ? 'true' : 'false') + '">Report an empty shelf</button></div>';
    if (picker) {
      html += '<div class="report-picker" role="group" aria-label="What ran out at ' + esc(p.name) + '?">' +
        '<div class="label" style="margin-bottom:8px">What ran out?</div><div class="row">' +
        CATS.map(function (c) { return '<button class="btn small" data-act="report" data-point="' + p.id + '" data-cat="' + c.id + '">' + esc(c.label) + '</button>'; }).join('') +
        '</div><div class="hint" style="margin-top:8px">Anonymous. The volunteer on shift gets the alert.</div></div>';
    }
    return html + '</article>';
  }

  function renderDropCard(pane, d, now) {
    var code = myCodes[d.id];
    var key = 'drop-' + d.id;
    return '<article class="card drop' + flashAttr(key) + '" data-testid="' + key + '">' +
      '<div style="min-width:0"><div class="row"><span class="chip accent">' + esc(D.DROP_KINDS[d.kind] ? D.DROP_KINDS[d.kind].label : d.kind) + '</span>' +
      '<span class="countdown">' + esc(until(d.windowEnd, now)) + '</span></div>' +
      '<div class="drop-title" style="margin-top:6px">' + esc(d.title) + '</div>' +
      '<div class="drop-meta">' + esc(d.partner) + ' · ' + esc(d.place) + ' · until ' + esc(clock(d.windowEnd)) + '</div>' +
      '<div class="drop-meta"><b style="color:var(--ink)">' + d.remaining + '</b> of ' + d.qty + ' left</div></div>' +
      '<div>' + (code
        ? '<div class="hint" style="margin-bottom:4px">Your pickup code</div><div class="code" data-testid="code-' + d.id + '" aria-label="Your pickup code ' + esc(code) + '">' + esc(code) + '</div>'
        : '<button class="btn primary" data-act="reserve" data-drop="' + d.id + '"' + (d.remaining > 0 ? '' : ' disabled') + '>Reserve one</button>') +
      '</div></article>';
  }

  function viewFind(pane) {
    var s = Store.state, now = Date.now();
    var points = D.POINTS.map(function (p) { return s.points[p.id]; });
    var drops = D.liveDrops(s, now);
    var html = '<div class="narrow">' +
      '<h1 class="h1">Free food on campus</h1>' +
      '<p class="lede">Walk up to a FoodLink shelf and take what you need. No forms, no names.</p>' +
      '<p class="hint" style="margin:8px 0 0">Shelf counts updated ' + esc(rel(lastUpdate(s), now)) + '</p>' +
      '<section class="section" aria-labelledby="pts-' + pane.id + '"><div class="section-head"><h2 class="h2" id="pts-' + pane.id + '">FoodLink shelves</h2>' +
      '<span class="hint">Take what you need for today</span></div><div class="stack">' +
      points.map(function (p) { return renderPoint(pane, p, now); }).join('') + '</div></section>' +
      '<section class="section" aria-labelledby="drops-' + pane.id + '" data-testid="drops-section"><div class="section-head"><h2 class="h2" id="drops-' + pane.id + '">Surplus food from campus partners</h2>' +
      '<span class="hint">Sealed, reserve and pick up today</span></div>' +
      (drops.length ? '<div class="stack">' + drops.map(function (d) { return renderDropCard(pane, d, now); }).join('') + '</div>'
        : '<div class="empty" data-testid="no-drops">Nothing right now. When a partner has sealed food to give away, it appears here.</div>') +
      '</section>' +
      '<section class="section" aria-labelledby="help-' + pane.id + '"><div class="section-head"><h2 class="h2" id="help-' + pane.id + '">Other places to get food</h2>' +
      '<span class="hint">From the USC Food Support page, checked Oct 31, 2026</span></div><div class="help">' +
      HELP.map(function (h) {
        return '<div class="card help-item"><h3 class="h3">' + esc(h.name) + '</h3><span class="chip ' + h.tone + '">' + esc(h.chip) + '</span><p>' + esc(h.body) + '</p></div>';
      }).join('') + '</div></section>' +
      '<p class="note" style="margin-top:24px">FoodLink never asks for your name or student number. In this demo, shelf counts come from a simulated six-week pilot, and anything you do updates live.</p>' +
      '</div>';
    return html;
  }

  /* ================= views: Restock ================= */
  function restockInit(pane, pointId) {
    var p = Store.state.points[pointId];
    var counts = {};
    CATS.forEach(function (c) { counts[c.id] = { before: p.flags[c.id] ? 0 : p.stock[c.id], added: 0, removed: 0 }; });
    pane.ui.rs = { pointId: pointId, counts: counts, checklist: { sealed: false, dated: false, shelfStable: false }, baseCheck: p.lastCheckAt, baseSeq: Store.state.seq, result: null };
  }

  function stepper(cat, field, value, label) {
    var key = 'rs-' + cat + '-' + field;
    return '<div class="stepper" role="group" aria-label="' + esc(label) + '">' +
      '<button type="button" data-act="rs-step" data-cat="' + cat + '" data-field="' + field + '" data-delta="-1" aria-label="Decrease ' + esc(label) + '">−</button>' +
      '<input type="number" inputmode="numeric" min="0" max="500" step="1" value="' + value + '" data-key="' + key + '" data-model="rs" data-cat="' + cat + '" data-field="' + field + '" aria-label="' + esc(label) + '">' +
      '<button type="button" data-act="rs-step" data-cat="' + cat + '" data-field="' + field + '" data-delta="1" aria-label="Increase ' + esc(label) + '">+</button></div>';
  }

  function viewRestock(pane) {
    var s = Store.state, now = Date.now();
    if (!pane.ui.rs) restockInit(pane, 'ucc');
    var rs = pane.ui.rs;
    var p = s.points[rs.pointId];
    var reports = D.openReports(s, p.id);
    var changed = p.lastCheckAt !== rs.baseCheck;
    var takenTotal = 0, afterTotal = 0;
    var rows = CATS.map(function (c) {
      var r = rs.counts[c.id];
      var taken = Math.max(0, p.stock[c.id] - r.before);
      var after = r.before - r.removed + r.added;
      takenTotal += taken; afterTotal += Math.max(0, after);
      var dl = D.daysLeft(p, c.id);
      var dlTxt = dl === null ? 'No recent takes' : daysText(dl, 0);
      var dlTone = daysTone(dl, false);
      return '<tr data-testid="rs-row-' + c.id + '"><td><div style="font-weight:700">' + esc(c.label) + '</div>' +
        '<div class="hint">Last count ' + p.stock[c.id] + (p.flags[c.id] ? ' · <span style="color:var(--bad);font-weight:700">reported empty</span>' : '') + '</div></td>' +
        '<td>' + stepper(c.id, 'before', r.before, c.label + ' on shelf now') + '</td>' +
        '<td>' + stepper(c.id, 'added', r.added, c.label + ' added') + '</td>' +
        '<td class="hide-sm">' + stepper(c.id, 'removed', r.removed, c.label + ' removed, expired or damaged') + '</td>' +
        '<td class="num" aria-label="After check" data-after="' + c.id + '">' + Math.max(0, after) + '</td>' +
        '<td class="hide-sm"><span class="dl ' + dlTone + '">' + dlTxt + '</span></td></tr>';
    }).join('');
    var res = rs.result;
    var html = '<div class="stack" style="gap:16px">' +
      '<div class="spread" style="align-items:flex-end"><div><h1 class="h1">Restock check-in</h1>' +
      '<p class="lede">Count what is on the shelf, add new stock and remove anything expired. Each check-in records what was taken since the last one.</p></div>' +
      '<div class="seg" role="group" aria-label="Choose a Point">' + D.POINTS.map(function (pt) {
        return '<button type="button" data-act="rs-point" data-point="' + pt.id + '" aria-pressed="' + (pt.id === p.id) + '">' + esc(pt.name) + '</button>';
      }).join('') + '</div></div>' +
      (reports.length ? '<div class="msg bad" data-testid="rs-reports"><b>Reported empty:</b> ' + reports.map(function (r) {
        return esc(catLabel(r.cat)) + ' (' + r.count + (r.count > 1 ? ' reports' : ' report') + ', ' + esc(rel(r.at, now)) + ')';
      }).join('; ') + '</div>' : '') +
      (changed ? '<div class="msg warn">Someone logged a check at ' + esc(p.name) + ' while you were counting. <button class="btn small" data-act="rs-reload">Load new counts</button></div>' : '') +
      '<div class="card"><div class="spread" style="margin-bottom:8px"><div class="h3">' + esc(p.name) + ' <span class="muted" style="font-weight:500">· last check ' + (p.lastCheckAt ? esc(dayClock(p.lastCheckAt, now)) + ' (' + esc(rel(p.lastCheckAt, now)) + ')' : 'none') + '</span></div></div>' +
      '<div class="scroll-x"><table class="rs-table"><thead><tr><th>Category</th><th>On shelf now</th><th>Added</th><th class="hide-sm">Removed</th><th>After</th><th class="hide-sm">Lasts</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="spread" style="margin-top:12px"><div><span class="taken" data-testid="rs-taken">' + takenTotal + ' taken</span> <span class="muted">since the last check</span></div>' +
      '<div class="muted"><span data-testid="rs-after-total">' + afterTotal + '</span> items on the shelf after this check</div></div></div>' +
      '<div class="card stack"><div class="label">Food-safety checklist</div>' +
      ckbox('sealed', 'Everything on the shelf is sealed in its original packaging.', rs.checklist.sealed) +
      ckbox('dated', 'I checked best-before dates and removed anything past date.', rs.checklist.dated) +
      ckbox('shelfStable', 'Nothing on the shelf needs a fridge.', rs.checklist.shelfStable) + '</div>' +
      (res ? renderResult(res) : '') +
      (API && res && res.needPin ? pinField('Volunteer PIN', 'pin-rs') : '') +
      '<div class="row"><button class="btn primary" data-act="rs-submit" data-testid="rs-submit">Log check-in</button>' +
      '<button class="btn" data-act="rs-reload">Start over</button></div></div>';
    return html;
  }

  function ckbox(key, text, checked) {
    return '<label class="check"><input type="checkbox" data-model="rs-check" data-check="' + key + '" data-key="ck-' + key + '"' + (checked ? ' checked' : '') + '><span>' + esc(text) + '</span></label>';
  }

  function pinField(label, key) {
    return '<div class="field"><label for="' + key + '">' + esc(label) + '</label><input id="' + key + '" class="input" type="password" autocomplete="off" data-model="pin" data-key="' + key + '"></div>';
  }

  function renderResult(res) {
    if (res.ok) {
      return '<div class="msg good" role="status">' + esc(res.okText || 'Saved.') +
        (res.warnings && res.warnings.length ? '<ul>' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    return '<div class="msg bad" role="alert"><b>Not saved yet.</b><ul>' + (res.errors || []).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ================= views: Partner drops ================= */
  function dropDefaults() {
    return { partner: 'Campus café (pilot partner)', title: 'Wrapped sandwiches', kind: 'prepared', qty: 12, place: 'UCC, room 40F', windowMin: 90, sealed: true, labelled: true, cold: false, bestBefore: '' };
  }

  function viewDrops(pane) {
    var s = Store.state, now = Date.now();
    if (!pane.ui.dp) pane.ui.dp = { form: dropDefaults(), result: null, code: '', pickup: null };
    var dp = pane.ui.dp, f = dp.form;
    var ev = D.evaluateDrop(f, now);
    var drops = D.liveDrops(s, now);
    var kinds = Object.keys(D.DROP_KINDS);
    var windows = [[30, '30 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours'], [240, '4 hours'], [1440, '24 hours'], [4320, '3 days']];
    var html = '<div class="grid2" style="align-items:start">' +
      '<div class="stack"><div><h1 class="h1">Post a surplus drop</h1>' +
      '<p class="lede">Share sealed food that students can pick up today. They reserve it with an anonymous code. The food-safety check runs as you type.</p></div>' +
      '<div class="card stack">' +
      field('dp-partner', 'Partner', '<input class="input" id="dp-partner-' + pane.id + '" data-model="dp" data-field="partner" data-key="dp-partner" value="' + esc(f.partner) + '" maxlength="60">') +
      field('dp-title', 'What is it?', '<input class="input" id="dp-title-' + pane.id + '" data-model="dp" data-field="title" data-key="dp-title" value="' + esc(f.title) + '" maxlength="60">') +
      '<div class="field"><span class="label">Kind of food</span><div class="radio-cards" role="radiogroup" aria-label="Kind of food">' +
      kinds.map(function (k) {
        return '<label class="radio-card"><input type="radio" name="dp-kind-' + pane.id + '" data-model="dp" data-field="kind" data-key="dp-kind-' + k + '" value="' + k + '"' + (f.kind === k ? ' checked' : '') + '><span>' + esc(D.DROP_KINDS[k].label) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="grid2" style="gap:12px">' +
      field('dp-qty', 'How many', '<input class="input" type="number" min="1" max="200" id="dp-qty-' + pane.id + '" data-model="dp" data-field="qty" data-key="dp-qty" value="' + esc(f.qty) + '">') +
      field('dp-window', 'Pickup window', '<select class="input" id="dp-window-' + pane.id + '" data-model="dp" data-field="windowMin" data-key="dp-window">' +
        windows.map(function (w) { return '<option value="' + w[0] + '"' + (Number(f.windowMin) === w[0] ? ' selected' : '') + '>' + w[1] + '</option>'; }).join('') + '</select>') +
      '</div>' +
      field('dp-place', 'Pickup place', '<input class="input" id="dp-place-' + pane.id + '" data-model="dp" data-field="place" data-key="dp-place" value="' + esc(f.place) + '" maxlength="80">') +
      (f.kind === 'shelf' ? field('dp-bb', 'Best before', '<input class="input" type="date" id="dp-bb-' + pane.id + '" data-model="dp" data-field="bestBefore" data-key="dp-bb" value="' + esc(f.bestBefore) + '">') : '') +
      '<div class="stack" style="gap:8px">' +
      dpCheck('sealed', 'Sealed in its original packaging', f.sealed) +
      dpCheck('labelled', 'Ingredients and allergens are on the label', f.labelled) +
      (f.kind === 'chilled' ? dpCheck('cold', 'It stays in our fridge until pickup', f.cold) : '') + '</div>' +
      '<div data-slot="dp-rules">' + dropRulesHtml(ev) + '</div>' +
      (dp.result ? renderResult(dp.result) : '') +
      (API && dp.result && dp.result.needPin ? pinField('Partner PIN', 'pin-dp') : '') +
      '<div class="row"><button class="btn primary" data-act="dp-submit" data-testid="dp-submit"' + (ev.ok ? '' : ' disabled') + '>Post drop</button></div>' +
      '</div></div>' +
      '<div class="stack"><div><h2 class="h2">Confirm a pickup</h2><p class="hint" style="margin:4px 0 0">Students show a code like FL-1234. No names, no ID.</p></div>' +
      '<div class="card stack"><div class="row" style="flex-wrap:nowrap"><input class="input mono" placeholder="FL-1234" aria-label="Pickup code" data-model="pk" data-key="pk-code" value="' + esc(dp.code) + '" style="text-transform:uppercase">' +
      '<button class="btn dark" data-act="pickup">Confirm</button></div>' + (dp.pickup ? renderResult(dp.pickup) : '') +
      (API && dp.pickup && dp.pickup.needPin ? pinField('Partner PIN', 'pin-pk') : '') + '</div>' +
      '<div><h2 class="h2" style="margin-top:8px">Live drops</h2></div>' +
      (drops.length ? drops.map(function (d) {
        return '<div class="card" data-testid="live-drop-' + d.id + '"><div class="spread"><b>' + esc(d.title) + '</b><span class="countdown">' + esc(until(d.windowEnd, now)) + '</span></div>' +
          '<div class="hint">' + esc(d.partner) + ' · ' + esc(d.place) + '</div><div style="margin-top:6px"><b>' + (d.qty - d.remaining) + '</b> of ' + d.qty + ' reserved · ' + d.picked + ' picked up</div></div>';
      }).join('') : '<div class="empty">No live drops.</div>') +
      '</div></div>';
    return html;
  }

  function dropRulesHtml(ev) {
    var items = ev.ok
      ? ev.notes.concat(ev.route === 'pickup_or_point' ? ['Shelf-stable and dated: a volunteer can also move it to a Point.'] : [])
      : ev.blockers;
    return '<div class="msg ' + (ev.ok ? 'good' : 'bad') + '" data-testid="dp-rules" aria-live="polite"><b>' + (ev.ok ? 'Passes the food-safety rules.' : 'Can’t post yet:') + '</b>' +
      (items.length ? '<ul>' + items.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
  }

  // Update only the parts of a form that depend on what is being typed, so the field keeps focus.
  function updateDropLive(pane) {
    if (!pane.el || !pane.ui.dp) return;
    var ev = D.evaluateDrop(pane.ui.dp.form, Date.now());
    var slot = pane.el.querySelector('[data-slot="dp-rules"]');
    if (slot) slot.innerHTML = dropRulesHtml(ev);
    var btn = pane.el.querySelector('[data-act="dp-submit"]');
    if (btn) btn.disabled = !ev.ok;
  }

  function updateRestockLive(pane) {
    if (!pane.el || !pane.ui.rs) return;
    var rs = pane.ui.rs, p = Store.state.points[rs.pointId];
    var takenTotal = 0, afterTotal = 0;
    CATS.forEach(function (c) {
      var r = rs.counts[c.id];
      var after = Math.max(0, r.before - r.removed + r.added);
      takenTotal += Math.max(0, p.stock[c.id] - r.before);
      afterTotal += after;
      var cell = pane.el.querySelector('[data-after="' + c.id + '"]');
      if (cell) cell.textContent = String(after);
    });
    var t = pane.el.querySelector('[data-testid="rs-taken"]');
    if (t) t.textContent = takenTotal + ' taken';
    var a = pane.el.querySelector('[data-testid="rs-after-total"]');
    if (a) a.textContent = String(afterTotal);
  }

  function field(id, label, control) {
    return '<div class="field"><label class="label">' + esc(label) + '</label>' + control + '</div>';
  }
  function dpCheck(key, text, checked) {
    return '<label class="check"><input type="checkbox" data-model="dp-check" data-check="' + key + '" data-key="dp-ck-' + key + '"' + (checked ? ' checked' : '') + '><span>' + esc(text) + '</span></label>';
  }

  /* ================= views: Impact ================= */
  function barsByDay(m) {
    var W = 440, H = 232, padL = 26, padB = 34, padT = 10, padR = 4;
    var max = 1;
    m.byDay.forEach(function (r) { max = Math.max(max, r.ucc + r.weldon); });
    var niceMax = Math.ceil(max / 10) * 10;
    var bw = (W - padL - padR) / m.byDay.length;
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / niceMax); };
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Items taken per day over the last 14 days, by Point">';
    [0, niceMax / 2, niceMax].forEach(function (g) {
      out += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" font-size="12" fill="var(--ink-3)" font-family="Schibsted Grotesk, sans-serif">' + g + '</text>';
    });
    m.byDay.forEach(function (r, i) {
      var x = padL + i * bw + bw * 0.18, w = bw * 0.64;
      var y1 = y(r.ucc), y2 = y(r.ucc + r.weldon);
      var today = i === m.byDay.length - 1;
      out += '<g><title>' + esc(dayFmt.format(new Date(r.day))) + ': UCC ' + r.ucc + ', Weldon ' + r.weldon + '</title>' +
        '<rect x="' + x + '" y="' + y1 + '" width="' + w + '" height="' + Math.max(0, y(0) - y1) + '" rx="2" fill="var(--ucc)"/>' +
        '<rect x="' + x + '" y="' + y2 + '" width="' + w + '" height="' + Math.max(0, y1 - y2) + '" rx="2" fill="var(--weldon)"/></g>' +
        '<text x="' + (x + w / 2) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="12" fill="' + (today ? 'var(--ink)' : 'var(--ink-3)') + '" font-family="Schibsted Grotesk, sans-serif"' + (today ? ' font-weight="700"' : '') + '>' + new Date(r.day).getDate() + '</text>';
    });
    out += '<text x="' + (W - padR) + '" y="' + (H - 4) + '" text-anchor="end" font-size="12" fill="var(--ink-3)" font-family="Schibsted Grotesk, sans-serif">Day of month; today is the last bar</text></svg>';
    return out;
  }

  function catBars(m) {
    var max = 1;
    CATS.forEach(function (c) { max = Math.max(max, m.byCat[c.id]); });
    return '<div class="stack" style="gap:10px">' + CATS.slice().sort(function (a, b) { return m.byCat[b.id] - m.byCat[a.id]; }).map(function (c) {
      var pct = Math.round((m.byCat[c.id] / max) * 100);
      return '<div><div class="spread" style="font-size:14px"><span>' + esc(c.label) + '</span><b>' + num(m.byCat[c.id]) + '</b></div>' +
        '<div class="bar" style="height:8px"><span style="width:' + pct + '%;background:var(--accent)"></span></div></div>';
    }).join('') + '</div>';
  }

  function viewImpact(pane) {
    var s = Store.state, now = Date.now();
    var m = D.metrics(s, now);
    var elapsed = Math.max(1, (now - s.pilotStart) / D.DAY);
    var projected = Math.round((m.itemsTaken / elapsed) * D.PILOT_WEEKS * 7);
    var itemsPct = Math.min(100, Math.round((m.itemsTaken / m.itemsTarget) * 100));
    var expectedPct = Math.min(100, Math.round((m.itemsExpected / m.itemsTarget) * 100));
    var wasteOk = m.wastePct < m.wasteTarget;
    var restockOk = m.medianRestockMin !== null && m.medianRestockMin <= m.restockTarget;
    var partnersOk = m.partners >= m.partnersTarget;
    var paceTxt = (m.pacePct >= 0 ? '+' : '') + m.pacePct + '% vs. target pace';
    var html = '<div class="stack" style="gap:18px">' +
      '<div><div class="title-row"><h1 class="h1">Pilot dashboard</h1><span class="badge" data-testid="sim-badge">Simulated data</span></div><p class="lede">Week ' + m.week + ' of ' + m.weeks + '. Is FoodLink meeting its targets?</p></div>' +
      '<p class="note">These numbers come from a simulated six-week pilot plus anything you do in this demo. They are not results.</p>' +
      '<div class="kpis-wrap"><div class="kpis">' +
      kpi('kpi-items', 'Items taken', num(m.itemsTaken), 'of ' + num(m.itemsTarget), paceTxt + ' · on track for ~' + num(projected), itemsPct, expectedPct) +
      kpi('kpi-waste', 'Thrown away', m.wastePct + '%', 'target < ' + m.wasteTarget + '%', num(m.removed) + ' of ' + num(m.added) + ' stocked items expired or damaged', Math.min(100, (m.wastePct / (m.wasteTarget * 2)) * 100), 50) +
      kpi('kpi-restock', 'Empty shelf to restocked', m.medianRestockMin === null ? '—' : m.medianRestockMin + ' min', 'median', m.reportsTotal + ' empty-shelf reports · ' + m.reportsOpen + ' open now', m.medianRestockMin === null ? 0 : Math.min(100, (m.medianRestockMin / (m.restockTarget * 2)) * 100), 50) +
      kpi('kpi-drops', 'Surplus rescued', num(m.dropReserved), 'of ' + num(m.dropItems) + ' items', m.partners + ' partners posting · ' + num(m.dropPicked) + ' picked up', m.dropItems ? Math.round((m.dropReserved / m.dropItems) * 100) : 0, null) +
      '</div></div>' +
      '<div class="grid2">' +
      '<div class="card chart"><div class="spread" style="margin-bottom:6px"><h2 class="h3">Items taken per day</h2><div class="legend"><span><i class="swatch" style="background:var(--ucc)"></i>UCC</span><span><i class="swatch" style="background:var(--weldon)"></i>Weldon</span></div></div>' + barsByDay(m) + '</div>' +
      '<div class="card"><h2 class="h3" style="margin-bottom:12px">What students take</h2>' + catBars(m) + '</div></div>' +
      '<div class="grid2" style="align-items:start">' +
      '<div class="card"><h2 class="h3" style="margin-bottom:8px">Stock left at today’s pace</h2><div class="scroll-x"><table class="dl-table"><thead><tr><th>Category</th>' +
      D.POINTS.map(function (p) { return '<th>' + esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      CATS.map(function (c) {
        return '<tr><td>' + esc(c.label) + '</td>' + D.POINTS.map(function (p) {
          var pt = s.points[p.id];
          var dl = D.daysLeft(pt, c.id);
          var stock = pt.flags[c.id] ? 0 : pt.stock[c.id];
          var txt = pt.flags[c.id] ? 'Empty' : daysText(dl, stock);
          var tone = daysTone(dl, pt.flags[c.id]);
          return '<td><span class="dl ' + tone + flashAttr('dl-' + p.id + '-' + c.id) + '">' + esc(txt) + '</span></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="hint" style="margin:8px 0 0">Days until each shelf runs out at its recent take rate. “13 left” means nothing was taken lately, so there is no rate yet.</p></div>' +
      '<div class="card"><h2 class="h3" style="margin-bottom:4px">Live activity</h2><ul class="feed" data-testid="feed">' +
      feedItems(s.feed.slice(0, 8), now) + '</ul></div></div>' +
      '<div class="card"><h2 class="h3" style="margin-bottom:10px">Week-11 decision: continue if four of these five hold</h2><ul class="criteria">' +
      crit('1,000 items taken by week 11', projected >= m.itemsTarget, 'On track (~' + num(projected) + ')', 'At risk (~' + num(projected) + ')') +
      crit('Less than 5% thrown away', wasteOk, m.wastePct + '%', m.wastePct + '%') +
      crit('Empty shelves restocked within 2 hours (median)', restockOk, (m.medianRestockMin === null ? '—' : m.medianRestockMin + ' min'), (m.medianRestockMin === null ? 'No data' : m.medianRestockMin + ' min')) +
      crit('Three surplus partners posting', partnersOk, m.partners + ' of 3', m.partners + ' of 3') +
      crit('Zero food-safety incidents', true, '0 reported', '') +
      '</ul></div></div>';
    return html;
  }

  // Activity rows, with a divider wherever the day changes so evening times are not read as today.
  function feedItems(items, now) {
    var today = D.startOfDay(now), lastDay = today;
    return items.map(function (f, i) {
      var day = D.startOfDay(f.at), head = '';
      if (day !== lastDay) {
        var diff = D.dayDiff(today, day);
        head = '<li class="feed-day">' + (diff === 1 ? 'Yesterday' : esc(dayFmt.format(new Date(f.at)))) + '</li>';
        lastDay = day;
      }
      return head + '<li class="' + (i === 0 ? flashAttr('feed-top').trim() : '') + '"><time>' + esc(clock(f.at)) + '</time><span class="' + (f.tone === 'warn' ? 'warn' : f.tone === 'good' ? 'good' : '') + '">' + esc(f.text) + '</span></li>';
    }).join('');
  }

  function kpi(key, label, value, small, sub, pct, marker) {
    return '<div class="card kpi' + flashAttr(key) + '" data-testid="' + key + '"><div class="kpi-label">' + esc(label) + '</div>' +
      '<div class="kpi-value">' + esc(value) + '<small>' + esc(small) + '</small></div>' +
      '<div class="meter" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span>' + (marker !== null ? '<i style="left:' + marker + '%"></i>' : '') + '</div>' +
      '<div class="kpi-sub">' + esc(sub) + '</div></div>';
  }
  function crit(label, ok, okTxt, badTxt) {
    return '<li><span>' + esc(label) + '</span><span class="chip ' + (ok ? 'good' : 'warn') + '">' + esc(ok ? okTxt : badTxt || 'At risk') + '</span></li>';
  }

  /* ================= presenter ================= */
  var STEPS = [
    { n: 1, label: 'Student reports UCC’s canned protein empty' },
    { n: 2, label: 'Volunteer restocks UCC' },
    { n: 3, label: 'Campus café posts sealed sandwiches' },
    { n: 4, label: 'Student reserves one with a code' },
    { n: 5, label: 'USC sees it on the dashboard' },
  ];

  function renderPresent() {
    var app = document.getElementById('app');
    document.body.classList.add('demo-body');
    var phone = panes.phone || (panes.phone = newPane('phone', 'find'));
    var screen = panes.screen || (panes.screen = newPane('screen', present.tab));
    screen.view = present.tab;
    app.innerHTML = appBar() +
      '<div class="demo-page"><div class="demo-head"><div><h1 class="h1">Live demo</h1>' +
      '<p class="lede">The phone is a student. The screen on the right switches between the volunteer, partner and USC views. Both use the same data and update together.</p></div>' +
      '<div class="row"><button class="btn small" data-act="reset" data-testid="reset">Reset demo</button></div></div>' +
      '<div class="demo-grid"><div><p class="frame-label">Student’s phone</p><div class="phone"><div class="phone-screen" id="phone-scroll"><div class="phone-inner" id="pane-phone"></div></div></div></div>' +
      '<div><p class="frame-label">Volunteer, partner and USC</p><div class="screen"><div class="screen-bar"><div class="screen-tabs" role="group" aria-label="Choose a view">' +
      [['impact', 'USC dashboard'], ['restock', 'Volunteer restock'], ['drops', 'Partner drop']].map(function (t) {
        return '<button data-act="present-tab" data-tab="' + t[0] + '" aria-pressed="' + (present.tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div></div><div class="screen-body" id="screen-scroll"><div id="pane-screen"></div></div></div></div></div>' +
      '<div class="script" role="region" aria-label="Demo steps"><div class="script-inner">' +
      STEPS.map(function (st) {
        return '<button class="step' + (present.done[st.n] ? ' done' : '') + '" data-act="present-step" data-step="' + st.n + '" data-testid="step-' + st.n + '"><b>' + (present.done[st.n] ? '✓' : st.n) + '</b><span>' + esc(st.label) + '</span></button>';
      }).join('') + '</div></div></div>';
    phone.el = document.getElementById('pane-phone');
    phone.scrollEl = document.getElementById('phone-scroll');
    screen.el = document.getElementById('pane-screen');
    screen.scrollEl = document.getElementById('screen-scroll');
    renderPane(phone);
    renderPane(screen);
    fitNav();
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function scrollIntoPane(pane, selector) {
    if (!pane || !pane.el || !pane.scrollEl) return;
    var el = pane.el.querySelector(selector);
    if (!el) return;
    var top = el.getBoundingClientRect().top - pane.scrollEl.getBoundingClientRect().top + pane.scrollEl.scrollTop - 40;
    try { pane.scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); } catch (e) { pane.scrollEl.scrollTop = Math.max(0, top); }
  }

  function runStep(n) {
    if (present.running) return;
    present.running = true;
    var phone = panes.phone, screen = panes.screen;
    var p = Promise.resolve();
    if (n === 1) {
      p = p.then(function () { phone.ui.reportOpen = 'ucc'; renderPane(phone); scrollIntoPane(phone, '[data-testid="point-ucc"]'); return wait(700); })
        .then(function () { phone.ui.reportOpen = null; return Store.act('report', { pointId: 'ucc', cat: 'protein' }); })
        .then(function () { toast('Student report sent. No name, no login.'); });
    } else if (n === 2) {
      present.tab = 'restock';
      screen.ui.rs = null;
      renderPresent();
      restockInit(screen, 'ucc');
      var rs = screen.ui.rs;
      rs.counts.protein.before = 0;
      rs.counts.protein.added = 14;
      rs.checklist = { sealed: true, dated: true, shelfStable: true };
      renderPane(screen);
      flash(['rs-protein']);
      p = p.then(function () { scrollIntoPane(screen, '[data-testid="rs-row-protein"]'); return wait(1400); })
        .then(function () { return submitRestock(screen); })
        .then(function () { scrollIntoPane(phone, '[data-testid="point-ucc"]'); });
    } else if (n === 3) {
      present.tab = 'drops';
      renderPresent();
      screen.ui.dp = { form: dropDefaults(), result: null, code: '', pickup: null };
      renderPane(screen);
      p = p.then(function () { return wait(1300); })
        .then(function () { return submitDrop(screen); })
        .then(function () { scrollIntoPane(phone, '[data-testid="drops-section"]'); });
    } else if (n === 4) {
      var drops = D.liveDrops(Store.state, Date.now());
      var target = drops.filter(function (d) { return !myCodes[d.id] && d.remaining > 0; })[0];
      if (!target) { toast('No live drop to reserve. Run step 3 first.'); present.running = false; return; }
      scrollIntoPane(phone, '[data-testid="drop-' + target.id + '"]');
      p = p.then(function () { return wait(600); }).then(function () { return reserve(target.id); });
    } else if (n === 5) {
      present.tab = 'impact';
      renderPresent();
      flash(['kpi-items', 'kpi-restock', 'kpi-drops', 'feed-top']);
      renderPane(screen);
    }
    p.then(function () {
      present.done[n] = true;
      present.running = false;
      if (route === 'present') {
        document.querySelectorAll('[data-act="present-step"]').forEach(function (b) {
          var k = Number(b.getAttribute('data-step'));
          b.classList.toggle('done', !!present.done[k]);
          var badge = b.querySelector('b');
          if (badge) badge.textContent = present.done[k] ? '✓' : String(k);
        });
      }
    }, function () { present.running = false; });
  }

  /* ================= actions ================= */
  function submitRestock(pane) {
    var rs = pane.ui.rs;
    var input = { pointId: rs.pointId, counts: JSON.parse(JSON.stringify(rs.counts)), checklist: rs.checklist };
    var before = Store.state.points[rs.pointId];
    var changedCats = CATS.filter(function (c) {
      var r = input.counts[c.id];
      return r.added > 0 || r.removed > 0 || r.before !== before.stock[c.id] || before.flags[c.id];
    }).map(function (c) { return 'cat-' + rs.pointId + '-' + c.id; });
    return Store.act('restock', input).then(function (res) {
      if (res.ok) {
        var taken = 0;
        var last = Store.state.ledger[Store.state.ledger.length - 1];
        if (last) taken = last.takenTotal;
        res.okText = 'Logged at ' + endSentence(clock(Date.now())) + ' ' + taken + ' taken since the last check.';
        var keep = res;
        restockInit(pane, rs.pointId);
        pane.ui.rs.result = keep;
        flash(changedCats.concat(['kpi-items', 'kpi-restock', 'feed-top']));
        toast(Store.state.points[rs.pointId].name + ' restocked.');
      } else {
        rs.result = res;
      }
      renderAll();
      return res;
    });
  }

  function submitDrop(pane) {
    var dp = pane.ui.dp;
    var f = dp.form;
    var input = {
      partner: f.partner, title: f.title, kind: f.kind, qty: Number(f.qty), place: f.place, windowMin: Number(f.windowMin),
      sealed: !!f.sealed, labelled: !!f.labelled, cold: !!f.cold, bestBefore: f.bestBefore,
    };
    return Store.act('drop', input).then(function (res) {
      if (res.ok) {
        res.okText = 'Live now. Students can reserve it until ' + endSentence(clock(Date.now() + input.windowMin * 60000));
        dp.result = res;
        flash(['drop-' + res.event.drop.id, 'feed-top']);
        toast('Drop posted: ' + input.qty + ' × ' + input.title);
      } else dp.result = res;
      renderAll();
      return res;
    });
  }

  function reserve(dropId) {
    return Store.act('reserve', { dropId: dropId }).then(function (res) {
      if (res.ok) {
        myCodes[dropId] = res.event.code;
        lsSet('foodlink:codes', myCodes);
        flash(['drop-' + dropId, 'kpi-drops', 'feed-top']);
        toast('Reserved. Your code is ' + res.event.code + '.');
      } else toast(res.errors && res.errors[0] ? res.errors[0] : 'Could not reserve.');
      renderAll();
      return res;
    });
  }

  function paneOf(el) {
    var host = el.closest('[data-pane]');
    return host ? panes[host.getAttribute('data-pane')] : null;
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var pane = paneOf(t);
    if (act === 'report-open' && pane) {
      var pid = t.getAttribute('data-point');
      pane.ui.reportOpen = pane.ui.reportOpen === pid ? null : pid;
      renderPane(pane);
    } else if (act === 'report' && pane) {
      var point = t.getAttribute('data-point'), cat = t.getAttribute('data-cat');
      pane.ui.reportOpen = null;
      Store.act('report', { pointId: point, cat: cat }).then(function (res) {
        if (res.ok) { flash(['cat-' + point + '-' + cat, 'feed-top']); toast('Thanks. A volunteer has been told.'); }
        else toast(res.errors[0]);
        renderAll();
      });
    } else if (act === 'reserve') {
      reserve(t.getAttribute('data-drop'));
    } else if (act === 'rs-step' && pane) {
      var rs = pane.ui.rs, c = t.getAttribute('data-cat'), fld = t.getAttribute('data-field');
      rs.counts[c][fld] = Math.max(0, Math.min(500, (rs.counts[c][fld] || 0) + Number(t.getAttribute('data-delta'))));
      rs.result = null;
      renderPane(pane);
    } else if (act === 'rs-point' && pane) {
      restockInit(pane, t.getAttribute('data-point'));
      renderPane(pane);
    } else if (act === 'rs-reload' && pane) {
      restockInit(pane, pane.ui.rs.pointId);
      renderPane(pane);
    } else if (act === 'rs-submit' && pane) {
      submitRestock(pane);
    } else if (act === 'dp-submit' && pane) {
      submitDrop(pane);
    } else if (act === 'pickup' && pane) {
      var dp = pane.ui.dp;
      Store.act('pickup', { code: dp.code }).then(function (res) {
        if (res.ok) { res.okText = 'Picked up: ' + res.event.code + '.'; dp.code = ''; flash(['kpi-drops', 'feed-top']); }
        dp.pickup = res;
        renderAll();
      });
    } else if (act === 'present-tab') {
      present.tab = t.getAttribute('data-tab');
      renderPresent();
    } else if (act === 'present-step') {
      runStep(Number(t.getAttribute('data-step')));
    } else if (act === 'reset') {
      myCodes = {};
      lsSet('foodlink:codes', myCodes);
      present.done = {};
      Object.keys(panes).forEach(function (k) { panes[k].ui = {}; });
      Store.reset().then(function () { toast('Demo reset.'); }, function (err) { toast(err && err.message ? err.message : 'Could not reset the demo.'); });
    }
  });

  function onModelInput(e) {
    var t = e.target;
    var model = t.getAttribute && t.getAttribute('data-model');
    if (!model) return;
    var pane = paneOf(t);
    if (!pane) return;
    if (model === 'rs') {
      var v = parseInt(t.value, 10);
      pane.ui.rs.counts[t.getAttribute('data-cat')][t.getAttribute('data-field')] = isNaN(v) ? 0 : Math.max(0, Math.min(500, v));
      pane.ui.rs.result = null;
      updateRestockLive(pane);
    } else if (model === 'rs-check') {
      if (e.type !== 'change') return;
      pane.ui.rs.checklist[t.getAttribute('data-check')] = t.checked;
      pane.ui.rs.result = null;
      renderPane(pane, true);
    } else if (model === 'dp') {
      var fld = t.getAttribute('data-field');
      pane.ui.dp.form[fld] = t.value;
      pane.ui.dp.result = null;
      if (fld === 'kind') { if (e.type === 'change') renderPane(pane, true); }
      else updateDropLive(pane);
    } else if (model === 'dp-check') {
      if (e.type !== 'change') return;
      pane.ui.dp.form[t.getAttribute('data-check')] = t.checked;
      pane.ui.dp.result = null;
      renderPane(pane, true);
    } else if (model === 'pk') {
      pane.ui.dp.code = t.value.toUpperCase();
      pane.ui.dp.pickup = null;
    } else if (model === 'pin') {
      ssSet('foodlink:pin', t.value);
    }
  }
  document.addEventListener('input', onModelInput);
  document.addEventListener('change', onModelInput);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-model') === 'pk') {
      e.preventDefault();
      var btn = t.parentNode.querySelector('[data-act="pickup"]');
      if (btn) btn.click();
    }
  });


  /* ================= rendering ================= */
  var VIEWS = { find: viewFind, restock: viewRestock, drops: viewDrops, impact: viewImpact };

  function isTyping(pane) {
    var a = document.activeElement;
    if (!a || !pane.el.contains(a)) return false;
    var tag = a.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return ['checkbox', 'radio', 'button', 'submit'].indexOf(a.type) < 0;
  }

  // force=false is used for background refreshes (timers, other tabs): they wait until
  // the person stops typing so a field never gets replaced under their cursor.
  function renderPane(pane, force) {
    if (!pane || !pane.el) return;
    if (force === false && isTyping(pane)) { pane.deferred = true; return; }
    pane.deferred = false;
    var active = document.activeElement;
    var key = active && pane.el.contains(active) ? active.getAttribute('data-key') : null;
    var sel = null;
    if (key) { try { sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; } }
    var scroll = pane.scrollEl ? pane.scrollEl.scrollTop : null;
    pane.el.setAttribute('data-pane', pane.id);
    pane.el.innerHTML = VIEWS[pane.view](pane);
    if (key) {
      var el = pane.el.querySelector('[data-key="' + key + '"]');
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && sel[0] !== null) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } }
      }
    }
    if (scroll !== null) pane.scrollEl.scrollTop = scroll;
  }

  var route = 'find';
  function appBar() {
    return '<header class="appbar"><a class="brand" href="#find" aria-label="FoodLink home">FoodLink</a>' +
      '<nav class="nav" aria-label="Views">' + NAV.map(function (n) {
        return '<a href="#' + n.id + '"' + (route === n.id ? ' aria-current="page"' : '') + '>' + esc(n.label) + '</a>';
      }).join('') + '</nav></header>';
  }

  // Keeps the current tab in view when the nav scrolls sideways on a phone, and fades only the edge with more tabs.
  function fitNav() {
    var nav = document.querySelector('.appbar .nav');
    if (!nav) return;
    var cur = nav.querySelector('[aria-current="page"]');
    if (cur && nav.scrollWidth > nav.clientWidth) {
      var left = cur.offsetLeft - nav.offsetLeft, right = left + cur.offsetWidth;
      if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, left - (nav.clientWidth - cur.offsetWidth) / 2);
    }
    navEdges(nav);
    if (!nav.__edges) { nav.__edges = true; nav.addEventListener('scroll', function () { navEdges(nav); }, { passive: true }); }
  }
  function navEdges(nav) {
    nav.classList.toggle('more-left', nav.scrollLeft > 2);
    nav.classList.toggle('more-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  }
  window.addEventListener('resize', function () { var nav = document.querySelector('.appbar .nav'); if (nav) navEdges(nav); });

  function renderShell() {
    var app = document.getElementById('app');
    document.body.classList.remove('demo-body');
    app.innerHTML = appBar() + '<main id="pane-main"></main>';
    var main = panes.main || (panes.main = newPane('main', route));
    if (main.view !== route) { main.view = route; }
    main.el = document.getElementById('pane-main');
    main.scrollEl = null;
    renderPane(main);
    fitNav();
  }

  function renderAll(background) {
    if (!Store.ready) return renderStatus();
    var force = background ? false : true;
    if (route === 'present') {
      if (panes.phone && panes.phone.el && document.body.contains(panes.phone.el)) { renderPane(panes.phone, force); renderPane(panes.screen, force); }
      else renderPresent();
    } else {
      if (panes.main && panes.main.el && document.body.contains(panes.main.el) && panes.main.view === route) renderPane(panes.main, force);
      else renderShell();
    }
  }
  document.addEventListener('focusout', function (e) {
    var host = e.target && e.target.closest && e.target.closest('[data-pane]');
    var pane = host ? panes[host.getAttribute('data-pane')] : null;
    if (!pane || !pane.deferred) return;
    setTimeout(function () { if (!isTyping(pane)) renderPane(pane, false); }, 0);
  });

  function renderStatus() {
    var app = document.getElementById('app');
    app.innerHTML = '<main><div class="narrow"><p class="hint">FoodLink</p><h1 class="h2">' +
      esc(Store.error || 'Loading…') + '</h1>' + (Store.error ? '<p class="lede">Check that the server is running, then reload.</p>' : '') + '</div></main>';
  }

  function setRoute() {
    var h = (location.hash || '').replace('#', '');
    route = ROUTES.indexOf(h) >= 0 ? h : 'find';
    if (route === 'present') renderPresent();
    else renderShell();
    if (route !== 'present') window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', setRoute);
  Store.subscribe(function (ev) {
    if (ev && ev.type === 'reset') { Object.keys(panes).forEach(function (k) { panes[k].ui = {}; }); }
    if (ev && ev.type === 'report') flash(['cat-' + ev.pointId + '-' + ev.cat, 'feed-top']);
    if (ev && ev.type === 'drop_post') flash(['drop-' + ev.drop.id]);
    renderAll(true);
  });
  setInterval(function () { if (Store.ready) renderAll(true); }, 30000);

  renderStatus();
  Store.init().then(function () {
    if (!Store.ready) return renderStatus();
    setRoute();
  });

  // test/debug hook
  window.__foodlink = { Store: Store, D: D, panes: panes };
})();
