/* Table-driven tests for the axle-load and overload-penalty engine.
   Run from the repo root:  node --test */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../assets/engine.js");

/* ---------- helpers ---------- */

/* Walk every number in a result and fail on NaN / Infinity / -Infinity. */
function assertAllFinite(value, path) {
  path = path || "result";
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), path + " is not finite: " + String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertAllFinite(v, path + "[" + i + "]"));
    return;
  }
  if (value && typeof value === "object") {
    Object.keys(value).forEach((k) => assertAllFinite(value[k], path + "." + k));
  }
}

const close = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

/* A 3-axle rigid: 7.0 t steer + 21 t tandem = 28 t permissible. */
const BASE = {
  regime: "IN",
  presetId: "rigid3",
  unladenTonnes: 10,
  loadTonnes: 15,
  limitSource: "config"
};
const withBase = (over) => Object.assign({}, BASE, over);

/* ================================================================== *
 * 1. The permissible-weight table itself
 * ================================================================== */

test("the axle-weight table carries its instrument, section and authority", () => {
  const t = E.IN_SAFE_AXLE_WEIGHT;
  assert.match(t.madeUnder, /Section 58\(1\)/, "names the enabling section");
  assert.match(t.instrument, /S\.O\. 3467\(E\)/, "names the notification");
  assert.match(t.amendedBy, /6 August 2018/, "names the amendment");
  assert.match(t.status, /INDICATIVE/, "is labelled indicative");
  assert.ok(t.confirmAgainst.length > 0, "names an authority to confirm against");
  assert.equal(t.entries.length, 7, "all seven table entries are present");
  assert.equal(t.pneumaticSuspensionBonusTonnesPerAxle, 1);
});

test("every notified axle-group weight is the one in the table", () => {
  const cases = [
    { code: "1.1", tonnes: 3.0, axles: 1, starred: false },
    { code: "1.2", tonnes: 7.0, axles: 1, starred: false },
    { code: "1.3", tonnes: 11.5, axles: 1, starred: true },
    { code: "2.1", tonnes: 21, axles: 2, starred: true },
    { code: "2.2", tonnes: 28.5, axles: 2, starred: false },
    { code: "3.1", tonnes: 27, axles: 3, starred: true },
    { code: "4", tonnes: 18, axles: 2, starred: false }
  ];
  for (const c of cases) {
    const entry = E.entryByCode(c.code);
    assert.ok(entry, "entry " + c.code + " exists");
    assert.equal(entry.tonnes, c.tonnes, c.code + " tonnage");
    assert.equal(entry.axles, c.axles, c.code + " axle count");
    assert.equal(!!entry.pneumaticBonus, c.starred, c.code + " pneumatic eligibility");
    assert.equal(E.axleGroupLimitTonnes(c.code), c.tonnes, c.code + " plain limit");
    const expected = c.starred ? c.tonnes + c.axles : c.tonnes;
    assert.equal(
      E.axleGroupLimitTonnes(c.code, { pneumaticSuspension: true }),
      expected,
      c.code + " with pneumatic suspension (1 t per axle, starred entries only)"
    );
  }
});

test("an unknown axle code contributes nothing rather than NaN", () => {
  assert.equal(E.axleGroupLimitTonnes("9.9"), 0);
  assert.equal(E.axleGroupLimitTonnes(undefined), 0);
  assert.equal(E.axleGroupLimitTonnes(""), 0);
});

/* ================================================================== *
 * 2. Every axle configuration
 * ================================================================== */

test("each preset configuration sums to its notified permissible GVW", () => {
  const cases = [
    { id: "rigid2", plain: 18.5, pneumatic: 19.5, axles: 2, cls: "rigid" },
    { id: "rigid3", plain: 28.0, pneumatic: 30.0, axles: 3, cls: "rigid" },
    { id: "rigid4", plain: 35.0, pneumatic: 37.0, axles: 4, cls: "rigid" },
    { id: "rigid5", plain: 41.0, pneumatic: 44.0, axles: 5, cls: "rigid" },
    { id: "artic4", plain: 39.5, pneumatic: 42.5, axles: 4, cls: "articulated" },
    { id: "artic5", plain: 45.5, pneumatic: 49.5, axles: 5, cls: "articulated" },
    /* 7 + 23 + 30 = 60 t of axle capacity, but the 55 t ceiling bites. */
    { id: "artic6", plain: 55.0, pneumatic: 55.0, axles: 6, cls: "articulated", capsAtPneumatic: true }
  ];
  for (const c of cases) {
    const p = E.presetById(c.id);
    assert.ok(p, c.id + " preset exists");
    assert.equal(p.vehicleClass, c.cls, c.id + " vehicle class");

    const plain = E.permissibleGvw({ groups: p.groups, vehicleClass: p.vehicleClass });
    assert.equal(plain.permissibleTonnes, c.plain, c.id + " permissible GVW");
    assert.equal(plain.axleCount, c.axles, c.id + " axle count");
    assert.equal(plain.capApplied, false, c.id + " is not capped on steel suspension");
    assertAllFinite(plain, c.id);

    const pneu = E.permissibleGvw({
      groups: p.groups,
      vehicleClass: p.vehicleClass,
      pneumaticSuspension: true
    });
    assert.equal(pneu.permissibleTonnes, c.pneumatic, c.id + " permissible GVW, pneumatic");
    assert.equal(!!pneu.capApplied, !!c.capsAtPneumatic, c.id + " cap behaviour, pneumatic");
  }
});

test("the statutory ceiling caps the sum of axle limits, and only then", () => {
  /* Three tri-axle groups = 81 t of axle capacity. */
  const heavy = { single1: 0, single2: 0, single4: 0, tandem: 0, tridem: 3 };
  const rigid = E.permissibleGvw({ groups: heavy, vehicleClass: "rigid" });
  assert.equal(rigid.sumOfAxleLimitsTonnes, 81);
  assert.equal(rigid.statutoryCapTonnes, E.IN_GVW_CAP.rigidTonnes);
  assert.equal(rigid.permissibleTonnes, 49, "rigid vehicles are capped at 49 t");
  assert.equal(rigid.capApplied, true);

  const artic = E.permissibleGvw({ groups: heavy, vehicleClass: "articulated" });
  assert.equal(artic.permissibleTonnes, 55, "semi-articulated and truck-trailers at 55 t");
  assert.equal(artic.capApplied, true);

  const modular = E.permissibleGvw({ groups: heavy, vehicleClass: "modularHydraulic" });
  assert.equal(modular.statutoryCapTonnes, null, "modular hydraulic trailers have no numeric cap");
  assert.equal(modular.permissibleTonnes, 81);
  assert.equal(modular.capApplied, false);

  /* Exactly at the cap is not over it. */
  const exact = E.permissibleGvw({
    groups: { single1: 0, single2: 1, single4: 0, tandem: 1, tridem: 1 },
    vehicleClass: "articulated"
  });
  assert.equal(exact.sumOfAxleLimitsTonnes, 55);
  assert.equal(exact.permissibleTonnes, 55);
  assert.equal(exact.capApplied, false, "equal to the ceiling is not capped");
});

test("an unrecognised vehicle class falls back to the rigid ceiling", () => {
  const r = E.permissibleGvw({
    groups: { tridem: 3 },
    vehicleClass: "spaceship"
  });
  assert.equal(r.vehicleClass, "rigid");
  assert.equal(r.permissibleTonnes, 49);
});

test("the table is user-overridable without touching the engine", () => {
  const myTable = JSON.parse(JSON.stringify(E.IN_SAFE_AXLE_WEIGHT));
  myTable.entries.find((e) => e.code === "1.2").tonnes = 6;
  myTable.entries.find((e) => e.code === "2.1").tonnes = 19;
  myTable.pneumaticSuspensionBonusTonnesPerAxle = 0.5;

  const r = E.permissibleGvw({
    groups: E.presetById("rigid3").groups,
    vehicleClass: "rigid",
    table: myTable
  });
  assert.equal(r.permissibleTonnes, 25, "6 + 19 with the overridden table");
  assert.equal(
    E.permissibleGvw({
      groups: E.presetById("rigid3").groups,
      vehicleClass: "rigid",
      table: myTable,
      pneumaticSuspension: true
    }).permissibleTonnes,
    26,
    "the overridden bonus applies: 6 + (19 + 0.5*2)"
  );

  /* The caps are overridable too. */
  const capped = E.permissibleGvw({
    groups: { tridem: 3 },
    vehicleClass: "rigid",
    caps: { source: "state rule", rigidTonnes: 40, articulatedTonnes: 45, modularHydraulicTonnes: null }
  });
  assert.equal(capped.permissibleTonnes, 40);
});

/* ================================================================== *
 * 3. At / just under / just over the permissible limit
 * ================================================================== */

test("the contravention gate: at, just under and just over the limit", () => {
  /* 28 t permissible, 5% tolerance => 29.4 t threshold. */
  const cases = [
    { laden: 27.999, over: false, why: "just under the limit" },
    { laden: 28.0, over: false, why: "exactly at the limit" },
    { laden: 28.001, over: false, why: "just over the limit but inside the 5% tolerance" },
    { laden: 29.399, over: false, why: "just under the tolerance threshold" },
    { laden: 29.4, over: false, why: "exactly at the tolerance threshold — equal is not over" },
    { laden: 29.401, over: true, why: "just over the tolerance threshold" },
    { laden: 35, over: true, why: "well over" }
  ];
  for (const c of cases) {
    const r = E.overload({
      limitTonnes: 28,
      ladenTonnes: c.laden,
      tolerancePercent: E.IN_GVW_TOLERANCE.percent
    });
    assert.equal(r.thresholdTonnes, 29.4, "threshold is limit + 5%");
    assert.equal(r.inContravention, c.over, c.why + " (laden " + c.laden + ")");
    assertAllFinite(r, "overload@" + c.laden);
  }
});

test("with the tolerance set to zero, the limit itself is the gate", () => {
  const cases = [
    { laden: 28.0, over: false },
    { laden: 28.001, over: true }
  ];
  for (const c of cases) {
    const r = E.overload({ limitTonnes: 28, ladenTonnes: c.laden, tolerancePercent: 0 });
    assert.equal(r.thresholdTonnes, 28);
    assert.equal(r.inContravention, c.over, "laden " + c.laden);
  }
});

test("remaining safe payload is the headline when the truck is still legal", () => {
  const cases = [
    { unladen: 10, load: 0, remaining: 18, verdict: "under" },
    { unladen: 10, load: 17, remaining: 1, verdict: "under" },
    { unladen: 10, load: 18, remaining: 0, verdict: "atLimit" },
    { unladen: 10, load: 18.5, remaining: -0.5, verdict: "withinTolerance" },
    { unladen: 10, load: 20, remaining: -2, verdict: "over" }
  ];
  for (const c of cases) {
    const r = E.compute(withBase({ unladenTonnes: c.unladen, loadTonnes: c.load }));
    assert.equal(r.limit.limitTonnes, 28);
    assert.equal(r.load.payloadCapacityTonnes, 18, "28 t permissible less 10 t unladen");
    assert.equal(r.load.remainingPayloadTonnes, c.remaining, "remaining payload @" + c.load);
    assert.equal(r.verdict, c.verdict, "verdict @" + c.load);
    assertAllFinite(r, "compute@" + c.load);
  }
});

test("the tonnage that must come off is measured to the limit, not the tolerance", () => {
  const r = E.compute(withBase({ unladenTonnes: 10, loadTonnes: 20 }));
  assert.equal(r.load.ladenTonnes, 30);
  assert.equal(r.load.mustOffloadTonnes, 2, "30 t back to 28 t");
  assert.equal(r.consequences.offloadTonnes, 2);
  assert.equal(r.consequences.mustOffloadBeforeMoving, true);

  /* Inside the tolerance there is no offence, but there is still weight above
     the registered limit, and the officer's power is to restore compliance. */
  const inside = E.compute(withBase({ unladenTonnes: 10, loadTonnes: 19 }));
  assert.equal(inside.load.inContravention, false);
  assert.equal(inside.load.mustOffloadTonnes, 1);
});

/* ================================================================== *
 * 4. The penalty, including exactly zero excess
 * ================================================================== */

test("zero excess is no penalty — not the base amount, not part of it", () => {
  const cases = [
    { label: "no contravention, no excess", input: { inContravention: false, excessTonnes: 0 } },
    { label: "no contravention but excess passed in", input: { inContravention: false, excessTonnes: 5 } },
    { label: "contravention flag set but excess is exactly zero", input: { inContravention: true, excessTonnes: 0 } },
    { label: "contravention flag set, excess negative", input: { inContravention: true, excessTonnes: -3 } }
  ];
  for (const c of cases) {
    const p = E.penaltyIndia(c.input);
    assert.equal(p.totalInr, 0, c.label + ": total must be zero");
    assert.equal(p.baseFineInr, 0, c.label + ": no base charge");
    assert.equal(p.perTonneTotalInr, 0, c.label + ": no per-tonne charge");
    assert.equal(p.tonnesCharged, 0, c.label);
  }

  /* And the same through the whole computation, at exactly the limit. */
  const atLimit = E.compute(withBase({ unladenTonnes: 10, loadTonnes: 18 }));
  assert.equal(atLimit.load.ladenTonnes, 28);
  assert.equal(atLimit.load.excessTonnes, 0);
  assert.equal(atLimit.totalPenalty, 0, "a truck exactly at its limit owes nothing");
  assert.equal(atLimit.penalty.baseFineInr, 0);
});

test("section 194(1) is base plus per-tonne, on whole started tonnes by default", () => {
  const base = E.IN_PENALTY_S194.baseFineInr; /* 20,000 */
  const per = E.IN_PENALTY_S194.perTonneOfExcessInr; /* 2,000 */
  assert.equal(base, 20000);
  assert.equal(per, 2000);

  const cases = [
    { excess: 0.001, ceil: 1, exact: 0.001 },
    { excess: 0.5, ceil: 1, exact: 0.5 },
    { excess: 1, ceil: 1, exact: 1 },
    { excess: 1.4, ceil: 2, exact: 1.4 },
    { excess: 2, ceil: 2, exact: 2 },
    { excess: 3, ceil: 3, exact: 3 },
    { excess: 9.25, ceil: 10, exact: 9.25 }
  ];
  for (const c of cases) {
    const ceiled = E.penaltyIndia({ inContravention: true, excessTonnes: c.excess });
    assert.equal(ceiled.tonnesCharged, c.ceil, "ceil rounding at " + c.excess + " t");
    assert.equal(ceiled.totalInr, base + c.ceil * per, "ceil total at " + c.excess + " t");

    const exact = E.penaltyIndia({ inContravention: true, excessTonnes: c.excess, rounding: "exact" });
    assert.ok(close(exact.tonnesCharged, c.exact), "exact rounding at " + c.excess + " t");
    assert.equal(exact.totalInr, Math.round(base + c.exact * per), "exact total at " + c.excess + " t");
  }
});

test("a whole-number excess is never rounded up by floating-point noise", () => {
  /* 0.05 * 18.5 = 0.9250000000000001 and 3 * 1.1 = 3.3000000000000003. */
  assert.equal(E.penaltyIndia({ inContravention: true, excessTonnes: 0.05 * 18.5 }).tonnesCharged, 1);
  assert.equal(E.penaltyIndia({ inContravention: true, excessTonnes: 29.4 - 28 }).tonnesCharged, 2);
  assert.equal(E.penaltyIndia({ inContravention: true, excessTonnes: 0.1 + 0.2 }).tonnesCharged, 1);
  assert.equal(E.penaltyIndia({ inContravention: true, excessTonnes: 3.0 }).tonnesCharged, 3);
});

test("the pre-2019 figures are kept for comparison and are not the live ones", () => {
  const s = E.IN_PENALTY_S194;
  assert.equal(s.previous.baseFineInr, 2000);
  assert.equal(s.previous.perTonneOfExcessInr, 1000);
  assert.match(s.amendedBy, /Act 32 of 2019/);
  assert.equal(s.inForceFrom, "2019-09-01");
  assert.equal(s.refusalToWeighInr, 40000, "s.194(2)");
  assert.equal(s.projectingLoadInr, 20000, "s.194(1A)");
  assert.equal(s.offloadingChargesInr, null, "no statutory off-loading rate exists");
  assert.ok(s.caveats.length >= 2, "s.199B and s.200 are both flagged");
  assert.match(s.caveats.join(" "), /199B/);
  assert.match(s.caveats.join(" "), /200/);
});

test("refusing the weighbridge is a separate offence, added only when it happened", () => {
  const plain = E.penaltyIndia({ inContravention: true, excessTonnes: 2 });
  assert.equal(plain.refusalToWeighIncluded, false);
  assert.equal(plain.totalInr, 24000);

  const refused = E.penaltyIndia({ inContravention: true, excessTonnes: 2, refusalToWeigh: true });
  assert.equal(refused.refusalToWeighIncluded, true);
  assert.equal(refused.totalInr, 24000 + 40000);

  /* It does not conjure a penalty where there is no overload offence. */
  const clean = E.penaltyIndia({ inContravention: false, excessTonnes: 0, refusalToWeigh: true });
  assert.equal(clean.totalInr, 0);
});

test("the fine amounts are overridable, for a state notification or an increase", () => {
  const r = E.penaltyIndia({
    inContravention: true,
    excessTonnes: 3,
    baseFineInr: 22000,
    perTonneOfExcessInr: 2200
  });
  assert.equal(r.baseFineInr, 22000);
  assert.equal(r.perTonneRateInr, 2200);
  assert.equal(r.totalInr, 22000 + 3 * 2200);
});

test("the two excess bases differ exactly by the tolerance, and both are honest", () => {
  const cases = [
    { laden: 30, basisLimit: 2, basisTolerance: 0.6 },
    { laden: 32, basisLimit: 4, basisTolerance: 2.6 },
    { laden: 29.401, basisLimit: 1.401, basisTolerance: 0.001 }
  ];
  for (const c of cases) {
    const a = E.overload({ limitTonnes: 28, ladenTonnes: c.laden, tolerancePercent: 5 });
    assert.ok(close(a.excessTonnes, c.basisLimit, 1e-3), "default basis at " + c.laden);
    const b = E.overload({
      limitTonnes: 28,
      ladenTonnes: c.laden,
      tolerancePercent: 5,
      excessBasis: "tolerance"
    });
    assert.ok(close(b.excessTonnes, c.basisTolerance, 1e-3), "tolerance basis at " + c.laden);
    assert.ok(close(a.excessTonnes - b.excessTonnes, 1.4, 1e-3), "the gap is the 5% tolerance");
  }
});

/* ================================================================== *
 * 5. Zero and negative inputs
 * ================================================================== */

test("zero everywhere gives zeroes, a noLimit verdict and no penalty", () => {
  const r = E.compute({
    regime: "IN",
    groups: { single1: 0, single2: 0, single4: 0, tandem: 0, tridem: 0 },
    unladenTonnes: 0,
    loadTonnes: 0,
    limitSource: "config"
  });
  assert.equal(r.permissible.permissibleTonnes, 0);
  assert.equal(r.limit.limitTonnes, 0);
  assert.equal(r.load.inContravention, false);
  assert.equal(r.totalPenalty, 0);
  assert.equal(r.verdict, "noLimit");
  assertAllFinite(r, "allZero");
});

test("empty, null and undefined inputs are treated as zero, never as NaN", () => {
  const blanks = [
    { unladenTonnes: "", loadTonnes: "" },
    { unladenTonnes: null, loadTonnes: null },
    { unladenTonnes: undefined, loadTonnes: undefined },
    { unladenTonnes: "abc", loadTonnes: "  " },
    { unladenTonnes: NaN, loadTonnes: Infinity },
    { unladenTonnes: -Infinity, loadTonnes: "1e400" }
  ];
  for (const b of blanks) {
    const r = E.compute(withBase(b));
    assertAllFinite(r, "blank " + JSON.stringify(b));
    assert.ok(r.load.ladenTonnes >= 0, "laden weight never goes negative");
    assert.ok(r.totalPenalty >= 0, "penalty never goes negative");
  }
  assertAllFinite(E.compute(), "compute() with no argument");
  assertAllFinite(E.compute(null), "compute(null)");
  assertAllFinite(E.overload(), "overload()");
  assertAllFinite(E.permissibleGvw(), "permissibleGvw()");
  assertAllFinite(E.penaltyIndia(), "penaltyIndia()");
  assertAllFinite(E.penaltyPhilippines(), "penaltyPhilippines()");
});

test("negative inputs are clamped to zero, not propagated", () => {
  const r = E.compute(withBase({ unladenTonnes: -10, loadTonnes: -15 }));
  assert.equal(r.load.unladenTonnes, 0);
  assert.equal(r.load.loadTonnes, 0);
  assert.equal(r.load.ladenTonnes, 0);
  assert.equal(r.load.inContravention, false);
  assert.equal(r.totalPenalty, 0);
  assert.equal(r.load.remainingPayloadTonnes, 28, "the whole permissible weight is still available");

  const negLimit = E.overload({ limitTonnes: -5, ladenTonnes: 40, tolerancePercent: 5 });
  assert.equal(negLimit.limitTonnes, 0);
  assert.equal(negLimit.inContravention, false, "an unknown limit cannot found an offence");
  assert.equal(negLimit.excessTonnes, 0);

  const negTol = E.overload({ limitTonnes: 28, ladenTonnes: 29, tolerancePercent: -50 });
  assert.equal(negTol.tolerancePercent, 0);
  assert.equal(negTol.inContravention, true);

  const negCounts = E.permissibleGvw({
    groups: { single2: -3, tandem: -1, tridem: 1 },
    vehicleClass: "rigid"
  });
  assert.equal(negCounts.permissibleTonnes, 27, "only the one real tri-axle group counts");
  assert.equal(negCounts.axleCount, 3);
});

test("absurd axle counts are clamped instead of producing a 10,000 tonne truck", () => {
  const r = E.permissibleGvw({ groups: { tridem: 99999 }, vehicleClass: "rigid" });
  assert.equal(r.rows[0].groups, 20, "clamped");
  assert.equal(r.permissibleTonnes, 49, "and the statutory ceiling still applies");
  assertAllFinite(r, "absurd");
});

test("fractional axle-group counts floor to whole groups", () => {
  const r = E.permissibleGvw({ groups: { single2: 1.9, tandem: 0.9 }, vehicleClass: "rigid" });
  assert.equal(r.permissibleTonnes, 7, "1 steer axle; 0.9 of a tandem is no tandem");
});

/* ================================================================== *
 * 6. Which limit binds: the RC figure or the notification
 * ================================================================== */

test("the certificate of registration figure wins when it is supplied", () => {
  const cases = [
    { rc: 25, source: "rc", limit: 25, why: "RC below the notified ceiling — the RC binds" },
    { rc: 16.2, source: "rc", limit: 16.2, why: "an older registration, never re-rated" },
    { rc: 0, source: "config", limit: 28, why: "no RC figure — fall back to the configuration" },
    { rc: "", source: "config", limit: 28, why: "blank RC field" },
    { rc: -5, source: "config", limit: 28, why: "nonsense RC figure" }
  ];
  for (const c of cases) {
    const r = E.compute(withBase({ rcGvwTonnes: c.rc, limitSource: "rc" }));
    assert.equal(r.limit.source, c.source, c.why);
    assert.equal(r.limit.limitTonnes, c.limit, c.why);
    assert.equal(r.limit.configTonnes, 28, "the notified figure stays visible as a cross-check");
  }

  /* Asking for the configuration figure ignores the RC. */
  const forced = E.compute(withBase({ rcGvwTonnes: 25, limitSource: "config" }));
  assert.equal(forced.limit.limitTonnes, 28);
  assert.equal(forced.limit.rcTonnes, 25);
});

test("a lower RC rating produces a real offence the notification would not", () => {
  const r = E.compute(withBase({ rcGvwTonnes: 16.2, limitSource: "rc", unladenTonnes: 7, loadTonnes: 12 }));
  assert.equal(r.load.ladenTonnes, 19);
  assert.equal(r.load.thresholdTonnes, 17.01, "16.2 t + 5%");
  assert.equal(r.load.inContravention, true);
  assert.equal(r.load.excessTonnes, 2.8);
  assert.equal(r.penalty.tonnesCharged, 3);
  assert.equal(r.totalPenalty, 20000 + 3 * 2000);
});

/* ================================================================== *
 * 7. The optional per-axle-group check
 * ================================================================== */

test("a weighed axle group is checked against its own notified limit", () => {
  const cases = [
    { code: "1.2", weighed: 6.5, over: 0, isOver: false },
    { code: "1.2", weighed: 7.0, over: 0, isOver: false },
    { code: "1.2", weighed: 7.4, over: 0.4, isOver: true },
    { code: "1.3", weighed: 11.5, over: 0, isOver: false },
    { code: "1.3", weighed: 13, over: 1.5, isOver: true },
    { code: "2.1", weighed: 22.5, over: 1.5, isOver: true },
    { code: "3.1", weighed: 26, over: 0, isOver: false },
    { code: "3.1", weighed: 30, over: 3, isOver: true }
  ];
  for (const c of cases) {
    const r = E.axleGroupCheck({ entryCode: c.code, weighedTonnes: c.weighed });
    assert.ok(close(r.overTonnes, c.over), c.code + " @" + c.weighed + " t over by");
    assert.equal(r.isOver, c.isOver, c.code + " @" + c.weighed + " t verdict");
  }
  /* Pneumatic suspension lifts the starred groups by 1 t per axle. */
  const pneu = E.axleGroupCheck({ entryCode: "3.1", weighedTonnes: 30, pneumaticSuspension: true });
  assert.equal(pneu.limitTonnes, 30);
  assert.equal(pneu.isOver, false);

  const unsupplied = E.axleGroupCheck({ entryCode: "2.1", weighedTonnes: 0 });
  assert.equal(unsupplied.supplied, false);
  assert.equal(unsupplied.isOver, false, "nothing weighed is not an offence");
  assert.equal(unsupplied.headroomTonnes, 21);
});

/* ================================================================== *
 * 8. Philippine mode — only what could be sourced
 * ================================================================== */

test("RA 8794 is a percentage of the MVUC, and says so in its own words", () => {
  const p = E.PH_RA8794;
  assert.match(p.statute, /Section 6, Republic Act No\. 8794/);
  assert.equal(p.penaltyPercentOfMvuc, 25);
  assert.equal(p.maxAxleLoadKg, 13500);
  assert.equal(p.tolerancePercent, 0, "no tolerance could be sourced, so none is assumed");
  assert.ok(p.notSourced.length >= 2, "the gaps are named");
  assert.match(p.notSourced.join(" "), /gross vehicle weight by axle configuration/);
});

test("Philippine mode penalises 25% of the MVUC and never guesses the GVW", () => {
  const cases = [
    { gvw: 41.5, laden: 41.5, mvuc: 12000, over: false, penalty: 0 },
    { gvw: 41.5, laden: 41.501, mvuc: 12000, over: true, penalty: 3000 },
    { gvw: 41.5, laden: 60, mvuc: 12000, over: true, penalty: 3000 },
    { gvw: 41.5, laden: 60, mvuc: 0, over: true, penalty: 0 },
    { gvw: 0, laden: 60, mvuc: 12000, over: false, penalty: 0 }
  ];
  for (const c of cases) {
    const r = E.compute({
      regime: "PH",
      rcGvwTonnes: c.gvw,
      ladenTonnes: c.laden,
      mvucPhp: c.mvuc
    });
    assert.equal(r.currency, "PHP");
    assert.equal(r.load.tolerancePercent, 0, "no tolerance in PH mode");
    assert.equal(r.load.inContravention, c.over, "GVW " + c.gvw + " laden " + c.laden);
    assert.equal(r.totalPenalty, c.penalty, "25% of " + c.mvuc);
    assertAllFinite(r, "PH " + JSON.stringify(c));
  }
  /* A zero MVUC is a missing input, and the result says so rather than showing
     a confident zero. */
  const noMvuc = E.compute({ regime: "PH", rcGvwTonnes: 41.5, ladenTonnes: 60, mvucPhp: 0 });
  assert.equal(noMvuc.penalty.mvucSupplied, false);
});

test("the Philippine axle cap is checked in kilograms", () => {
  const cases = [
    { tonnes: 13.0, over: 0 },
    { tonnes: 13.5, over: 0 },
    { tonnes: 14.2, over: 700 }
  ];
  for (const c of cases) {
    const r = E.compute({
      regime: "PH",
      rcGvwTonnes: 41.5,
      ladenTonnes: 40,
      mvucPhp: 12000,
      weighedAxleGroupTonnes: c.tonnes
    });
    assert.equal(r.penalty.axleCapKg, 13500);
    assert.equal(r.penalty.axleOverKg, c.over, c.tonnes + " t against the 13,500 kg cap");
  }
});

/* ================================================================== *
 * 9. The consequences that are not the fine
 * ================================================================== */

test("the movement bar and the insurance risk are stated, not computed", () => {
  const r = E.compute(withBase({ unladenTonnes: 10, loadTonnes: 22 }));
  assert.match(r.consequences.movementBar, /shall not be allowed to move/);
  assert.match(r.consequences.weighingPower, /off-load the excess weight/);
  assert.match(r.consequences.offloadingCharges, /off-loading/);
  assert.match(r.consequences.insurance, /repudiate/);
  assert.match(r.consequences.insurance, /non-standard/);
  assert.equal(r.consequences.offloadTonnes, 4);
  assert.equal(r.consequences.mustOffloadBeforeMoving, true);

  const legal = E.compute(withBase({ unladenTonnes: 10, loadTonnes: 10 }));
  assert.equal(legal.consequences.mustOffloadBeforeMoving, false);
  assert.equal(legal.consequences.offloadTonnes, 0);
});

test("the figures that could not be sourced are named rather than invented", () => {
  assert.ok(E.IN_NOT_SOURCED.length >= 4);
  const joined = E.IN_NOT_SOURCED.join(" ");
  assert.match(joined, /Off-loading/);
  assert.match(joined, /compounding/);
  assert.match(joined, /199B/);
});

/* ================================================================== *
 * 10. Sweep: every preset against a range of loads
 * ================================================================== */

test("every preset stays finite and self-consistent across a load sweep", () => {
  for (const preset of E.AXLE_CONFIG_PRESETS) {
    for (let load = 0; load <= 70; load += 2.5) {
      for (const pneumatic of [false, true]) {
        for (const basis of ["limit", "tolerance"]) {
          for (const rounding of ["ceil", "exact"]) {
            const r = E.compute({
              regime: "IN",
              presetId: preset.id,
              vehicleClass: preset.vehicleClass,
              pneumaticSuspension: pneumatic,
              unladenTonnes: 9,
              loadTonnes: load,
              tolerancePercent: 5,
              excessBasis: basis,
              rounding: rounding,
              limitSource: "config"
            });
            const tag = preset.id + " load=" + load + " pneu=" + pneumatic + " " + basis + "/" + rounding;
            assertAllFinite(r, tag);
            assert.ok(r.totalPenalty >= 0, tag + ": penalty is never negative");
            assert.ok(r.load.excessTonnes >= 0, tag + ": excess is never negative");
            assert.ok(r.load.mustOffloadTonnes >= 0, tag + ": offload tonnage is never negative");
            if (!r.load.inContravention) {
              assert.equal(r.totalPenalty, 0, tag + ": no offence, no money");
            } else {
              assert.ok(
                r.totalPenalty >= E.IN_PENALTY_S194.baseFineInr,
                tag + ": an offence costs at least the base amount"
              );
            }
            if (r.load.ladenTonnes <= r.limit.limitTonnes) {
              assert.equal(r.load.mustOffloadTonnes, 0, tag + ": nothing to offload");
            }
          }
        }
      }
    }
  }
});

test("the engine loads as a module and as a browser global without a DOM", () => {
  assert.equal(typeof E.compute, "function");
  assert.equal(typeof globalThis.AxleLoad, "object");
  assert.equal(globalThis.AxleLoad.compute, E.compute);
});
