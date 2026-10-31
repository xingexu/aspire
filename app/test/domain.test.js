'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/domain.js');

const NOW = new Date(2026, 9, 31, 11, 20).getTime();

function fresh() {
  const { pilotStart, events } = D.seedEvents(NOW);
  return { pilotStart, events, state: D.fold(events, pilotStart) };
}

function countsFrom(stock, overrides) {
  const counts = {};
  D.CATEGORIES.forEach((c) => {
    counts[c.id] = Object.assign({ before: stock[c.id], added: 0, removed: 0 }, (overrides || {})[c.id]);
  });
  return counts;
}

const OK_CHECK = { sealed: true, dated: true, shelfStable: true };

test('seed is internally consistent', () => {
  const { events, state } = fresh();
  assert.ok(events.length > 300);
  for (const e of events) {
    if (e.type !== 'restock') continue;
    for (const v of Object.values(e.counts)) {
      assert.ok(v.before >= 0 && v.added >= 0 && v.removed >= 0, 'no negative counts');
      assert.ok(v.removed <= v.before, 'cannot remove more than was on the shelf');
    }
  }
  for (const p of Object.values(state.points)) {
    for (const c of D.CATEGORIES) assert.ok(p.stock[c.id] >= 0);
  }
  for (let i = 1; i < events.length; i++) assert.ok(events[i].at >= events[i - 1].at, 'events sorted');
  assert.ok(events.every((e) => e.at <= NOW), 'nothing from the future');
});

test('seed history does not change with the time of day', () => {
  const morning = D.seedEvents(new Date(2026, 9, 31, 9, 0).getTime());
  const noon = D.seedEvents(new Date(2026, 9, 31, 12, 0).getTime());
  const before9 = noon.events.filter((e) => e.at <= new Date(2026, 9, 31, 9, 0).getTime());
  assert.deepEqual(before9.map((e) => e.id + e.at), morning.events.map((e) => e.id + e.at));
});

test('simulated pilot sits near target pace with realistic KPIs', () => {
  const { state } = fresh();
  const m = D.metrics(state, NOW);
  assert.equal(m.week, 6);
  assert.ok(Math.abs(m.pacePct) <= 25, 'pace within 25% of target: ' + m.pacePct);
  assert.ok(m.wastePct < D.TARGETS.wastePct, 'waste under target');
  assert.ok(m.medianRestockMin > 0 && m.medianRestockMin < 120);
  assert.equal(m.partners, 3);
  assert.equal(m.byDay.length, 14);
});

test('restock validation blocks bad input and requires the safety checklist', () => {
  const { state } = fresh();
  const stock = state.points.ucc.stock;
  let v = D.validateRestock(state, { pointId: 'nope', counts: {}, checklist: OK_CHECK });
  assert.equal(v.ok, false);
  v = D.validateRestock(state, { pointId: 'ucc', counts: countsFrom(stock), checklist: {} });
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 3);
  v = D.validateRestock(state, { pointId: 'ucc', counts: countsFrom(stock, { grains: { before: -1 } }), checklist: OK_CHECK });
  assert.equal(v.ok, false);
  v = D.validateRestock(state, { pointId: 'ucc', counts: countsFrom(stock, { grains: { before: 2, removed: 3 } }), checklist: OK_CHECK });
  assert.equal(v.ok, false);
  v = D.validateRestock(state, { pointId: 'ucc', counts: countsFrom(stock, { grains: { before: 2.5 } }), checklist: OK_CHECK });
  assert.equal(v.ok, false);
  v = D.validateRestock(state, { pointId: 'ucc', counts: countsFrom(stock), checklist: OK_CHECK });
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /No change/.test(w)));
});

test('restock records items taken as the drop since the last count', () => {
  const { state } = fresh();
  const p = state.points.ucc;
  const prev = Object.assign({}, p.stock);
  const counts = countsFrom(prev, { grains: { before: prev.grains - 5, added: 7, removed: 1 } });
  const r = D.restockEvent(state, { pointId: 'ucc', counts, checklist: OK_CHECK }, NOW);
  assert.equal(r.ok, true);
  const ledgerLen = state.ledger.length;
  D.apply(state, r.event);
  assert.equal(state.ledger.length, ledgerLen + 1);
  const last = state.ledger[state.ledger.length - 1];
  assert.equal(last.taken.grains, 5);
  assert.equal(last.takenTotal, 5);
  assert.equal(last.added, 7);
  assert.equal(last.removed, 1);
  assert.equal(p.stock.grains, prev.grains - 5 - 1 + 7);
  assert.equal(p.lastCheckAt, NOW);
  assert.equal(p.lastRestockAt, NOW);
});

test('a higher count than last time warns and never records negative takes', () => {
  const { state } = fresh();
  const p = state.points.ucc;
  const prev = p.stock.snacks;
  const counts = countsFrom(p.stock, { snacks: { before: prev + 3 } });
  const v = D.validateRestock(state, { pointId: 'ucc', counts, checklist: OK_CHECK });
  assert.ok(v.warnings.some((w) => /Was stock added/.test(w)));
  const r = D.restockEvent(state, { pointId: 'ucc', counts, checklist: OK_CHECK }, NOW);
  D.apply(state, r.event);
  assert.equal(state.ledger[state.ledger.length - 1].taken.snacks, 0);
});

test('empty-shelf reports flag the shelf, merge duplicates and resolve on restock', () => {
  const { state } = fresh();
  const r1 = D.reportEvent(state, 'ucc', 'protein', NOW);
  const r2 = D.reportEvent(state, 'ucc', 'protein', NOW + 60000);
  assert.equal(D.reportEvent(state, 'ucc', 'caviar', NOW).ok, false);
  D.apply(state, r1.event);
  D.apply(state, r2.event);
  const open = D.openReports(state, 'ucc');
  assert.equal(open.length, 1);
  assert.equal(open[0].count, 2);
  assert.ok(state.points.ucc.flags.protein);
  const p = state.points.ucc;
  const counts = countsFrom(p.stock, { protein: { before: 0, added: 14 } });
  const rs = D.restockEvent(state, { pointId: 'ucc', counts, checklist: OK_CHECK }, NOW + 30 * D.MIN);
  D.apply(state, rs.event);
  assert.equal(D.openReports(state, 'ucc').length, 0);
  assert.equal(state.points.ucc.flags.protein, undefined);
  const resolved = state.reports[state.reports.length - 1];
  assert.equal(resolved.resolvedAt - resolved.at, 30 * D.MIN);
});

test('drop rules: sealed, labelled, dated, and short windows for perishables', () => {
  const base = { partner: 'Café', title: 'Sandwiches', kind: 'prepared', qty: 10, place: 'UCC', windowMin: 60, sealed: true, labelled: true, cold: true };
  assert.equal(D.evaluateDrop(base, NOW).ok, true);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { sealed: false }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { labelled: false }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { windowMin: 240 }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { windowMin: 10 }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { qty: 0 }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { qty: 201 }), NOW).ok, false);
  assert.equal(D.evaluateDrop(Object.assign({}, base, { kind: 'chilled', cold: false }), NOW).ok, false);
  const shelf = Object.assign({}, base, { kind: 'shelf', windowMin: 600 });
  assert.equal(D.evaluateDrop(shelf, NOW).ok, false, 'shelf-stable needs a best-before date');
  assert.equal(D.evaluateDrop(Object.assign({}, shelf, { bestBefore: '2026-10-01' }), NOW).ok, false);
  const ok = D.evaluateDrop(Object.assign({}, shelf, { bestBefore: '2027-03-01' }), NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.route, 'pickup_or_point');
  const soon = D.evaluateDrop(Object.assign({}, shelf, { bestBefore: '2026-11-02' }), NOW);
  assert.equal(soon.ok, true);
  assert.equal(soon.route, 'pickup');
});

test('reservations count down, stop at zero and after the window, and pickups verify codes', () => {
  const { state } = fresh();
  const d = D.dropEvent({ partner: 'Café', title: 'Wraps', kind: 'prepared', qty: 2, place: 'UCC', windowMin: 30, sealed: true, labelled: true }, NOW);
  assert.equal(d.ok, true);
  D.apply(state, d.event);
  const dropId = d.event.drop.id;
  assert.equal(D.liveDrops(state, NOW).length, 1);
  const r1 = D.reserveEvent(state, dropId, NOW + 1000);
  D.apply(state, r1.event);
  const r2 = D.reserveEvent(state, dropId, NOW + 2000);
  D.apply(state, r2.event);
  assert.notEqual(r1.event.code, r2.event.code);
  assert.equal(state.drops[dropId].remaining, 0);
  assert.equal(D.reserveEvent(state, dropId, NOW + 3000).ok, false);
  assert.equal(D.dropStatus(state.drops[dropId], NOW + 3000), 'claimed');
  assert.equal(D.dropStatus(state.drops[dropId], NOW + 31 * D.MIN), 'ended');
  assert.equal(D.pickupEvent(state, 'abc', NOW).ok, false);
  assert.equal(D.pickupEvent(state, 'FL-0000', NOW).ok, false);
  const pk = D.pickupEvent(state, r1.event.code.toLowerCase(), NOW + 5000);
  assert.equal(pk.ok, true);
  D.apply(state, pk.event);
  assert.equal(state.drops[dropId].picked, 1);
  assert.equal(D.pickupEvent(state, r1.event.code, NOW + 6000).ok, false, 'no double pickup');
});

test('days-left forecast reflects recent demand', () => {
  const { state } = fresh();
  const p = state.points.ucc;
  const dl = D.daysLeft(p, 'protein');
  assert.ok(dl !== null && dl < 1, 'UCC protein is low today: ' + dl);
});

test('open-hours helper and isOpen', () => {
  const p = D.POINTS[0];
  const d0 = D.startOfDay(NOW);
  assert.equal(D.openHoursBetween(p, D.atHour(d0, 6), D.atHour(d0, 10)), 2);
  assert.equal(D.openHoursBetween(p, D.atHour(d0, 21), D.atHour(D.addDays(d0, 1), 9)), 2, 'across midnight and the DST change');
  assert.equal(D.isOpen(p, D.atHour(d0, 12)), true);
  assert.equal(D.isOpen(p, D.atHour(d0, 23)), false);
});

test('seed and metrics survive the daylight-saving change', () => {
  for (const day of [1, 2, 3, 15]) {
    const now = new Date(2026, 10, day, 11, 0).getTime(); // November, after clocks fall back
    const { pilotStart, events } = D.seedEvents(now);
    const state = D.fold(events, pilotStart);
    const m = D.metrics(state, now);
    assert.equal(new Date(pilotStart).getHours(), 0, 'pilot starts at local midnight');
    assert.equal(m.week, 6);
    assert.equal(m.byDay.length, 14);
    assert.ok(m.byDay.every((r) => new Date(r.day).getHours() === 0));
    assert.ok(Math.abs(m.pacePct) <= 25);
    for (const e of events) if (e.type === 'restock') for (const v of Object.values(e.counts)) assert.ok(v.before >= 0 && v.removed <= v.before);
  }
});
