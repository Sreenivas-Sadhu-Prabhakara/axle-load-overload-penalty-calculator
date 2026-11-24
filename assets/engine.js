/* Axle-load and overload-penalty engine — pure arithmetic and rule lookup.
   No DOM, no network, no dependencies. Loaded in the browser as window.AxleLoad
   and exported as a CommonJS module so the same code is exercised by tests/.

   EVERY statutory figure lives exactly once, in a named constant below, with its
   section reference, the instrument that set it and the authority to confirm it
   against. Nothing numeric is hard-coded further down. Where a figure could not
   be sourced confidently it is marked NOT_SOURCED instead of being invented. */
(function (root) {
  "use strict";

  /* ================================================================== *
   * 1. INDIA — permissible weight
   * ================================================================== */

  /* Maximum safe axle weight. Set by notification under section 58(1) of the
     Motor Vehicles Act 1988, not by the Act itself, so it changes without the
     Act changing. This table is the whole of that notification's table.

     Primary instrument : S.O. 3467(E), Ministry of Road Transport & Highways,
                          dated 16 July 2018, Gazette of India Extraordinary
                          Part II Section 3 Sub-section (ii), No. 2696,
                          F. No. RT-11028/11/2017-MVL. It supersedes
                          S.O. 728(E) dated 18 October 1996.
     Amended by         : notification dated 6 August 2018, which substituted
                          entry 1.2 (single axle with two tyres) from 7.5 t to
                          7.0 t. The gazette serial for that amendment is read
                          here from a scan and is therefore marked uncertain.

     INDICATIVE. Confirm against the Gazette of India and your State Transport
     Department before relying on it at a check-post. */
  var IN_SAFE_AXLE_WEIGHT = {
    id: "IN_MAX_SAFE_AXLE_WEIGHT",
    title: "Maximum Safe Axle Weight",
    madeUnder: "Section 58(1), Motor Vehicles Act 1988 (59 of 1988)",
    instrument: "S.O. 3467(E) dated 16 July 2018",
    supersedes: "S.O. 728(E) dated 18 October 1996",
    amendedBy: "Notification dated 6 August 2018 — entry 1.2 substituted, 7.5 t to 7.0 t",
    amendmentSerialConfidence:
      "The 6 August 2018 amendment is cited in the Ministry's own advisory; its gazette serial " +
      "(read as S.O. 3881(E)) comes from a scanned copy and is NOT treated as sourced here.",
    authority: "Ministry of Road Transport & Highways, Government of India",
    confirmAgainst: "Gazette of India; your State Transport Department",
    status: "INDICATIVE — a planning figure, not a certificate of registration",
    checkedOn: "2026-11",
    /* 1 tonne extra per axle, allowed only on the starred entries below. */
    pneumaticSuspensionBonusTonnesPerAxle: 1,
    entries: [
      {
        code: "1.1",
        group: "single",
        axles: 1,
        tyresPerAxle: 1,
        tonnes: 3.0,
        pneumaticBonus: false,
        label: "Single axle with single tyre"
      },
      {
        code: "1.2",
        group: "single",
        axles: 1,
        tyresPerAxle: 2,
        tonnes: 7.0,
        pneumaticBonus: false,
        label: "Single axle with two tyres",
        typicalRole: "Steering (non-driving) axle of most goods vehicles",
        history: "7.5 t as first notified on 16 July 2018; substituted to 7.0 t on 6 August 2018."
      },
      {
        code: "1.3",
        group: "single",
        axles: 1,
        tyresPerAxle: 4,
        tonnes: 11.5,
        pneumaticBonus: true,
        label: "Single axle with four tyres",
        typicalRole: "Driving axle of a two-axle truck or a two-axle tractor"
      },
      {
        code: "2.1",
        group: "tandem",
        axles: 2,
        tonnes: 21,
        pneumaticBonus: true,
        label: "Tandem axle — rigid vehicles, trailers and semi-trailers",
        geometry: "Two axles less than 1.8 m apart"
      },
      {
        code: "2.2",
        group: "tandem",
        axles: 2,
        tonnes: 28.5,
        pneumaticBonus: false,
        label: "Tandem axle — puller tractors for hydraulic and pneumatic trailers",
        geometry: "Two axles less than 1.8 m apart"
      },
      {
        code: "3.1",
        group: "tridem",
        axles: 3,
        tonnes: 27,
        pneumaticBonus: true,
        label: "Tri-axle — rigid vehicles, trailers and semi-trailers",
        geometry: "Outer axles less than 3 m apart"
      },
      {
        code: "4",
        group: "axleRow",
        axles: 2,
        tonnes: 18,
        pneumaticBonus: false,
        label: "Axle row (two axles, four tyres each) in modular hydraulic trailers",
        note: "9 t is permissible for a single axle of such a row."
      }
    ]
  };

  /* Gross vehicle weight ceiling, from paragraph 2 of the same notification:
     GVW shall not exceed the total permissible safe axle weight and in no case
     shall exceed 49 t (rigid) or 55 t (semi-articulated trailers and truck-
     trailers except modular hydraulic trailers). Modular hydraulic trailers may
     carry indivisible goods of any weight subject to regulatory approvals, so
     there is no numeric cap to state for them. */
  var IN_GVW_CAP = {
    source: "Paragraph 2, S.O. 3467(E) dated 16 July 2018",
    rigidTonnes: 49,
    articulatedTonnes: 55,
    modularHydraulicTonnes: null,
    modularHydraulicNote:
      "No numeric ceiling: indivisible goods of any weight, subject to regulatory approvals."
  };

  /* The 5% tolerance. From the Explanation to the same notification:
     "tolerance upto five per cent. in the gross vehicle weight shall be allowed
     for the purpose of compliance to sub-section (3) of section 113". */
  var IN_GVW_TOLERANCE = {
    source: "Explanation to S.O. 3467(E) dated 16 July 2018",
    appliesTo: "Compliance with section 113(3), Motor Vehicles Act 1988",
    percent: 5
  };

  /* What section 113(3) actually tests. It is the figure in the certificate of
     registration, not the notification: section 58(2)(c) requires the
     registering authority to enter the gross vehicle weight and the registered
     weight for each axle in the RC, and section 58(3) forbids an RC figure that
     differs from the notification for that make, model and tyre fitment. So the
     notification figure is the ceiling the RC is built from; the RC figure is
     what an officer reads. */
  var IN_WEIGHT_OFFENCE = {
    prohibition: "Section 113(3), Motor Vehicles Act 1988",
    prohibitionText:
      "No person shall drive or cause or allow to be driven in any public place any motor " +
      "vehicle or trailer (a) the unladen weight of which exceeds the unladen weight " +
      "specified in the certificate of registration, or (b) the laden weight of which " +
      "exceeds the gross vehicle weight specified in the certificate of registration.",
    rcEntries: "Section 58(2)(c) — GVW and registered weight for each axle are entered in the RC",
    rcCannotDiffer: "Section 58(3) — the RC may not show a figure differing from the notification",
    weighingPower: "Section 114(1), Motor Vehicles Act 1988",
    weighingPowerText:
      "An authorised officer may require the driver to convey the vehicle to a weighing device " +
      "within 10 km on the forward route or 20 km from the destination; if it is found in " +
      "contravention he may, by order in writing, direct the driver to off-load the excess " +
      "weight at his own risk and not to remove the vehicle until the laden weight has been " +
      "reduced so that it complies with section 113."
  };

  /* ================================================================== *
   * 2. INDIA — the penalty
   * ================================================================== */

  /* Section 194 as it stands after the Motor Vehicles (Amendment) Act 2019.
     Each amount is one named field. The 2019 Act deleted the word "minimum"
     from sub-section (1), so the figure is the fine, not a floor. */
  var IN_PENALTY_S194 = {
    section: "Section 194, Motor Vehicles Act 1988",
    heading: "Driving vehicle exceeding permissible weight",
    amendedBy: "Motor Vehicles (Amendment) Act 2019 (Act 32 of 2019), section 78",
    inForceFrom: "2019-09-01",
    commencement: "S.O. 3110(E) dated 28 August 2019",
    authority: "Ministry of Road Transport & Highways, Government of India",
    confirmAgainst:
      "Gazette of India; India Code (indiacode.nic.in); your State Transport Department's " +
      "compounding notification under section 200",
    status: "INDICATIVE — confirm before quoting it to anyone",

    /* s.194(1): the base amount. */
    baseFineInr: 20000,
    baseFineWords: "twenty thousand rupees",

    /* s.194(1): the per-tonne amount, charged on the excess load. */
    perTonneOfExcessInr: 2000,
    perTonneWords: "two thousand rupees per tonne of excess load",

    /* s.194(1): off-loading charges, payable on top. The section creates the
       liability but fixes no amount, so there is no constant to state. */
    offloadingChargesInr: null,
    offloadingCharges:
      "Liable in addition — section 194(1) imposes the liability to pay charges for " +
      "off-loading the excess load but fixes no amount.",

    /* s.194(1) proviso, inserted in 2019. */
    movementBar:
      "Proviso to section 194(1): such motor vehicle shall not be allowed to move before " +
      "such excess load is removed, or is caused or allowed to be removed, by the person in " +
      "control of the vehicle.",

    /* s.194(1A), inserted in 2019 — a projecting load, not an overweight one. */
    projectingLoadInr: 20000,
    projectingLoad:
      "Section 194(1A): a load extending laterally beyond the body, or to the front, rear or " +
      "in height beyond the permissible limit, is a separate 20,000 rupee offence plus " +
      "off-loading charges, and the vehicle may not move until the load is re-arranged.",

    /* s.194(2) — a separate offence, not an add-on to the overload fine. */
    refusalToWeighInr: 40000,
    refusalToWeigh:
      "Section 194(2): refusing to stop and submit the vehicle to weighing when directed " +
      "under section 114, or removing the load or part of it before weighing, is a separate " +
      "40,000 rupee offence.",

    /* What the figures were before 1 September 2019, kept so the change is
       visible rather than asserted. */
    previous: {
      baseFineInr: 2000,
      perTonneOfExcessInr: 1000,
      words:
        "The 2019 Act substituted the words 'of two thousand rupees and an additional amount " +
        "of one thousand rupees per tonne of excess load' with 'of twenty thousand rupees and " +
        "an additional amount of two thousand rupees per tonne of excess load', and omitted " +
        "the word 'minimum'."
    },

    /* Two live reasons the figures above may not be what is collected. */
    caveats: [
      "Section 199B, inserted by the 2019 Act, lets the Central Government raise every fine " +
        "in the Act by up to 10% a year with effect from 1 April. No notification actually " +
        "effecting such an increase could be sourced here, so the 2019 figures are used as " +
        "they stand. If one has since been issued, override the amounts in the fields.",
      "Section 200 lets State Governments notify the amount at which an offence is compounded. " +
        "What is collected at a roadside or a check-post is often that compounding amount, not " +
        "the figure in the Act."
    ]
  };

  /* Figures deliberately not shipped as constants, because they could not be
     sourced to a standard that would justify putting a number on a loader's
     screen. Named so the gap is visible instead of silently filled. */
  var IN_NOT_SOURCED = [
    "Off-loading, crane, labour and godown charges under section 194(1) — no statutory rate; " +
      "set by the agency doing the work.",
    "Detention and demurrage while the vehicle stands at the check-post — commercial, not statutory.",
    "State compounding amounts notified under section 200 — one per State, and none is reproduced here.",
    "Any increase notified under section 199B after 1 September 2019.",
    "Per-axle enforcement practice at State check-posts, which varies; section 113(3) is " +
      "written in terms of laden weight against the RC's gross vehicle weight."
  ];

  /* ================================================================== *
   * 3. PHILIPPINES — sourced only as far as it could be
   * ================================================================== */

  /* Republic Act No. 8794, section 6. The penalty is a percentage of the motor
     vehicle user's charge, so there is no rupee-style fixed amount. The
     configuration-by-configuration permissible GVW table lives in DPWH
     issuances under the Act's implementing rules and is NOT reproduced here —
     it could not be sourced confidently, so Philippine mode asks the operator
     for the permissible GVW from the OR/CR instead of guessing one. */
  var PH_RA8794 = {
    statute: "Section 6, Republic Act No. 8794 (Philippines)",
    authority: "Department of Public Works and Highways; Land Transportation Office",
    confirmAgainst: "RA 8794 and its implementing rules; current DPWH anti-overloading issuances",
    status: "INDICATIVE — partially sourced, see notSourced below",
    penaltyPercentOfMvuc: 25,
    penaltyWords:
      "An amount equivalent to twenty five percent (25%) of the MVUC shall be imposed on " +
      "trucks and trailers for loading beyond their prescribed gross vehicle weight.",
    maxAxleLoadKg: 13500,
    maxAxleLoadWords: "No axle load shall exceed thirteen thousand five hundred kilograms.",
    tolerancePercent: 0,
    notSourced: [
      "The permissible gross vehicle weight by axle configuration — set by DPWH issuances " +
        "under the implementing rules of RA 8794, not by the Act. Enter the figure from your " +
        "OR/CR or the current DPWH table.",
      "Any weight tolerance comparable to India's 5% — none was found in RA 8794 section 6, " +
        "so the tolerance defaults to zero and is left editable.",
      "Proposals to lower the 13,500 kg axle cap have been filed in Congress; no enacted " +
        "amendment was sourced, so the Act's own figure is used."
    ]
  };

  /* ================================================================== *
   * 4. Axle configurations — presets, each a count of axle groups
   * ================================================================== */

  var AXLE_CONFIG_PRESETS = [
    {
      id: "rigid2",
      label: "2-axle rigid (4x2)",
      vehicleClass: "rigid",
      groups: { single1: 0, single2: 1, single4: 1, tandem: 0, tridem: 0 },
      about: "Steering axle on two tyres, driving axle on four."
    },
    {
      id: "rigid3",
      label: "3-axle rigid (6x2 / 6x4)",
      vehicleClass: "rigid",
      groups: { single1: 0, single2: 1, single4: 0, tandem: 1, tridem: 0 },
      about: "Steering axle plus a tandem rear bogie."
    },
    {
      id: "rigid4",
      label: "4-axle rigid (8x2 / 8x4)",
      vehicleClass: "rigid",
      groups: { single1: 0, single2: 2, single4: 0, tandem: 1, tridem: 0 },
      about: "Twin-steer plus a tandem rear bogie."
    },
    {
      id: "rigid5",
      label: "5-axle rigid (twin-steer + tri-axle)",
      vehicleClass: "rigid",
      groups: { single1: 0, single2: 2, single4: 0, tandem: 0, tridem: 1 },
      about: "Twin-steer plus a tri-axle rear bogie."
    },
    {
      id: "artic4",
      label: "Tractor-trailer, 4 axles",
      vehicleClass: "articulated",
      groups: { single1: 0, single2: 1, single4: 1, tandem: 1, tridem: 0 },
      about: "Two-axle tractor plus a tandem semi-trailer."
    },
    {
      id: "artic5",
      label: "Tractor-trailer, 5 axles",
      vehicleClass: "articulated",
      groups: { single1: 0, single2: 1, single4: 1, tandem: 0, tridem: 1 },
      about: "Two-axle tractor plus a tri-axle semi-trailer."
    },
    {
      id: "artic6",
      label: "Tractor-trailer, 6 axles",
      vehicleClass: "articulated",
      groups: { single1: 0, single2: 1, single4: 0, tandem: 1, tridem: 1 },
      about: "Three-axle tractor plus a tri-axle semi-trailer."
    }
  ];

  /* Which table entry each count maps to. One place, so the table stays the
     single source of the tonnages. */
  var GROUP_ENTRY_CODE = {
    single1: "1.1",
    single2: "1.2",
    single4: "1.3",
    tandem: "2.1",
    tridem: "3.1"
  };

  var GROUP_KEYS = ["single1", "single2", "single4", "tandem", "tridem"];

  /* ================================================================== *
   * 5. Numeric helpers. Nothing here may return NaN or Infinity.
   * ================================================================== */

  function num(v, fallback) {
    var d = fallback === undefined ? 0 : fallback;
    if (v === null || v === undefined || v === "") return d;
    var n = typeof v === "number" ? v : parseFloat(v);
    if (typeof n !== "number" || !isFinite(n)) return d;
    return n;
  }

  function nonNeg(v, fallback) {
    var n = num(v, fallback);
    return n > 0 ? n : 0;
  }

  function count(v) {
    var n = Math.floor(num(v, 0));
    if (!(n > 0)) return 0;
    return n > 20 ? 20 : n; /* a sane ceiling; nothing on a road has 20 axle groups */
  }

  function round(v, dp) {
    var p = Math.pow(10, dp === undefined ? 3 : dp);
    var n = Math.round(num(v, 0) * p) / p;
    return isFinite(n) ? n : 0;
  }

  /* Ceil with a float-noise guard, so 0.05 * 18.5 = 0.9250000000000001 does not
     become 2 tonnes, and an exact 3.0 does not become 4. */
  function ceilTonne(v) {
    var n = num(v, 0);
    if (n <= 0) return 0;
    return Math.ceil(n - 1e-9);
  }

  function entryByCode(code, table) {
    var t = table || IN_SAFE_AXLE_WEIGHT;
    for (var i = 0; i < t.entries.length; i++) {
      if (t.entries[i].code === code) return t.entries[i];
    }
    return null;
  }

  function presetById(id) {
    for (var i = 0; i < AXLE_CONFIG_PRESETS.length; i++) {
      if (AXLE_CONFIG_PRESETS[i].id === id) return AXLE_CONFIG_PRESETS[i];
    }
    return null;
  }

  /* ================================================================== *
   * 6. Permissible weight from the axle configuration
   * ================================================================== */

  /* One axle group's permissible weight. The pneumatic-suspension bonus is
     1 tonne per axle and applies only to the starred entries. */
  function axleGroupLimitTonnes(entryCode, opts) {
    var o = opts || {};
    var table = o.table || IN_SAFE_AXLE_WEIGHT;
    var entry = entryByCode(entryCode, table);
    if (!entry) return 0;
    var t = nonNeg(entry.tonnes, 0);
    if (o.pneumaticSuspension && entry.pneumaticBonus) {
      t += nonNeg(table.pneumaticSuspensionBonusTonnesPerAxle, 0) * nonNeg(entry.axles, 0);
    }
    return round(t, 3);
  }

  /* Sum the configuration, then apply the statutory ceiling.
     input: { groups:{single1,single2,single4,tandem,tridem}, vehicleClass,
              pneumaticSuspension, table, caps } */
  function permissibleGvw(input) {
    var i = input || {};
    var table = i.table || IN_SAFE_AXLE_WEIGHT;
    var caps = i.caps || IN_GVW_CAP;
    var groups = i.groups || {};
    var pneumatic = !!i.pneumaticSuspension;
    var cls = i.vehicleClass === "articulated" || i.vehicleClass === "modularHydraulic"
      ? i.vehicleClass
      : "rigid";

    var rows = [];
    var sum = 0;
    var axles = 0;
    for (var k = 0; k < GROUP_KEYS.length; k++) {
      var key = GROUP_KEYS[k];
      var n = count(groups[key]);
      if (n === 0) continue;
      var code = GROUP_ENTRY_CODE[key];
      var entry = entryByCode(code, table);
      var per = axleGroupLimitTonnes(code, { pneumaticSuspension: pneumatic, table: table });
      var groupAxles = entry ? nonNeg(entry.axles, 0) : 0;
      sum += per * n;
      axles += groupAxles * n;
      rows.push({
        key: key,
        code: code,
        label: entry ? entry.label : key,
        groups: n,
        axlesPerGroup: groupAxles,
        baseTonnes: entry ? nonNeg(entry.tonnes, 0) : 0,
        limitTonnesPerGroup: per,
        limitTonnes: round(per * n, 3),
        pneumaticApplied: !!(pneumatic && entry && entry.pneumaticBonus)
      });
    }

    sum = round(sum, 3);

    var cap = null;
    if (cls === "rigid") cap = nonNeg(caps.rigidTonnes, 0) || null;
    else if (cls === "articulated") cap = nonNeg(caps.articulatedTonnes, 0) || null;
    else cap = caps.modularHydraulicTonnes === null ? null : nonNeg(caps.modularHydraulicTonnes, 0);

    var permissible = sum;
    var capApplied = false;
    if (cap !== null && sum > cap) {
      permissible = cap;
      capApplied = true;
    }

    return {
      vehicleClass: cls,
      rows: rows,
      axleCount: axles,
      axleGroupCount: rows.reduce(function (a, r) { return a + r.groups; }, 0),
      sumOfAxleLimitsTonnes: sum,
      statutoryCapTonnes: cap,
      capApplied: capApplied,
      permissibleTonnes: round(permissible, 3),
      pneumaticSuspension: pneumatic,
      source: table.instrument,
      capSource: caps.source
    };
  }

  /* ================================================================== *
   * 7. Excess over the permissible limit
   * ================================================================== */

  /* Which figure the permissible limit comes from. The RC is what an officer
     reads, so it wins when supplied; the notification figure is the cross-check.
     input: { rcGvwTonnes, configPermissibleTonnes, limitSource } */
  function bindingLimit(input) {
    var i = input || {};
    var rc = nonNeg(i.rcGvwTonnes, 0);
    var cfg = nonNeg(i.configPermissibleTonnes, 0);
    var want = i.limitSource === "config" ? "config" : "rc";
    if (want === "rc" && rc > 0) {
      return { limitTonnes: round(rc, 3), source: "rc", rcTonnes: round(rc, 3), configTonnes: round(cfg, 3) };
    }
    return { limitTonnes: round(cfg, 3), source: "config", rcTonnes: round(rc, 3), configTonnes: round(cfg, 3) };
  }

  /* The weighbridge arithmetic.
     input: { unladenTonnes, loadTonnes, ladenTonnes, limitTonnes,
              tolerancePercent, excessBasis } where excessBasis is
              "limit"     — excess measured from the permissible limit (default), or
              "tolerance" — excess measured from the tolerance threshold. */
  function overload(input) {
    var i = input || {};
    var limit = nonNeg(i.limitTonnes, 0);
    var unladen = nonNeg(i.unladenTonnes, 0);
    var load = nonNeg(i.loadTonnes, 0);
    var laden = i.ladenTonnes === undefined || i.ladenTonnes === null || i.ladenTonnes === ""
      ? unladen + load
      : nonNeg(i.ladenTonnes, 0);
    laden = round(laden, 3);

    var tolPct = nonNeg(i.tolerancePercent, 0);
    if (tolPct > 100) tolPct = 100;
    var toleranceTonnes = round(limit * tolPct / 100, 3);
    var threshold = round(limit + toleranceTonnes, 3);

    /* Offence only once the tolerance threshold is passed. Equal is not over. */
    var inContravention = limit > 0 && laden > threshold;

    var basis = i.excessBasis === "tolerance" ? "tolerance" : "limit";
    var from = basis === "tolerance" ? threshold : limit;
    var excess = inContravention ? round(laden - from, 3) : 0;
    if (excess < 0) excess = 0;

    /* How much must physically come off before the vehicle may move: enough to
       get back to the limit, not merely to the tolerance threshold. */
    var mustOffload = laden > limit ? round(laden - limit, 3) : 0;

    var payloadCapacity = round(limit - unladen, 3);
    if (payloadCapacity < 0) payloadCapacity = 0;
    var remainingPayload = round(payloadCapacity - load, 3);
    var headroomToThreshold = round(threshold - laden, 3);

    return {
      unladenTonnes: round(unladen, 3),
      loadTonnes: round(load, 3),
      ladenTonnes: laden,
      limitTonnes: round(limit, 3),
      tolerancePercent: tolPct,
      toleranceTonnes: toleranceTonnes,
      thresholdTonnes: threshold,
      inContravention: inContravention,
      excessBasis: basis,
      excessTonnes: excess,
      mustOffloadTonnes: mustOffload,
      payloadCapacityTonnes: payloadCapacity,
      remainingPayloadTonnes: remainingPayload,
      headroomToThresholdTonnes: headroomToThreshold,
      utilisationPercent: limit > 0 ? round(laden / limit * 100, 1) : 0
    };
  }

  /* ================================================================== *
   * 8. The penalty
   * ================================================================== */

  /* Section 194(1). No contravention means no penalty at all — not the base
     amount, not a part of it. The base amount is a consequence of the offence,
     so it cannot exist without one.
     input: { inContravention, excessTonnes, rounding, baseFineInr,
              perTonneOfExcessInr, refusalToWeigh } */
  function penaltyIndia(input) {
    var i = input || {};
    var scale = IN_PENALTY_S194;
    var base = nonNeg(i.baseFineInr === undefined ? scale.baseFineInr : i.baseFineInr, 0);
    var perTonne = nonNeg(
      i.perTonneOfExcessInr === undefined ? scale.perTonneOfExcessInr : i.perTonneOfExcessInr,
      0
    );
    var rounding = i.rounding === "exact" ? "exact" : "ceil";

    /* Zero excess means zero penalty, whatever the caller thinks. The base
       amount is part of the punishment for carrying excess load, so it cannot
       stand alone: "twenty thousand rupees AND an additional amount of two
       thousand rupees per tonne of excess load" presupposes excess load. */
    if (!i.inContravention || nonNeg(i.excessTonnes, 0) <= 0) {
      return {
        inContravention: false,
        currency: "INR",
        baseFineInr: 0,
        tonnesCharged: 0,
        perTonneRateInr: perTonne,
        perTonneTotalInr: 0,
        totalInr: 0,
        rounding: rounding,
        refusalToWeighInr: nonNeg(scale.refusalToWeighInr, 0),
        refusalToWeighIncluded: false,
        section: scale.section,
        amendedBy: scale.amendedBy
      };
    }

    var excess = nonNeg(i.excessTonnes, 0);
    var charged = rounding === "exact" ? round(excess, 3) : ceilTonne(excess);
    var perTonneTotal = Math.round(charged * perTonne);
    var refusal = i.refusalToWeigh ? nonNeg(scale.refusalToWeighInr, 0) : 0;
    var total = Math.round(base + perTonneTotal + refusal);

    return {
      inContravention: true,
      currency: "INR",
      baseFineInr: Math.round(base),
      tonnesCharged: charged,
      perTonneRateInr: perTonne,
      perTonneTotalInr: perTonneTotal,
      totalInr: isFinite(total) ? total : 0,
      rounding: rounding,
      refusalToWeighInr: nonNeg(scale.refusalToWeighInr, 0),
      refusalToWeighIncluded: !!i.refusalToWeigh,
      section: scale.section,
      amendedBy: scale.amendedBy
    };
  }

  /* RA 8794 section 6 — a percentage of the MVUC, so the MVUC must be supplied.
     input: { inContravention, mvucPhp, percentOfMvuc, axleLoadKg } */
  function penaltyPhilippines(input) {
    var i = input || {};
    var pct = nonNeg(i.percentOfMvuc === undefined ? PH_RA8794.penaltyPercentOfMvuc : i.percentOfMvuc, 0);
    var mvuc = nonNeg(i.mvucPhp, 0);
    var axleKg = nonNeg(i.axleLoadKg, 0);
    var axleCap = nonNeg(PH_RA8794.maxAxleLoadKg, 0);
    var axleOver = axleKg > axleCap ? Math.round(axleKg - axleCap) : 0;

    if (!i.inContravention) {
      return {
        inContravention: false,
        currency: "PHP",
        percentOfMvuc: pct,
        mvucPhp: Math.round(mvuc),
        totalPhp: 0,
        axleLoadKg: Math.round(axleKg),
        axleCapKg: axleCap,
        axleOverKg: axleOver,
        axleOverCap: axleOver > 0,
        statute: PH_RA8794.statute
      };
    }
    var total = Math.round(mvuc * pct / 100);
    return {
      inContravention: true,
      currency: "PHP",
      percentOfMvuc: pct,
      mvucPhp: Math.round(mvuc),
      totalPhp: isFinite(total) ? total : 0,
      mvucSupplied: mvuc > 0,
      axleLoadKg: Math.round(axleKg),
      axleCapKg: axleCap,
      axleOverKg: axleOver,
      axleOverCap: axleOver > 0,
      statute: PH_RA8794.statute
    };
  }

  /* ================================================================== *
   * 9. Optional per-axle-group check against the notified limit
   * ================================================================== */

  /* input: { entryCode, weighedTonnes, pneumaticSuspension, table } */
  function axleGroupCheck(input) {
    var i = input || {};
    var code = i.entryCode || "1.3";
    var table = i.table || IN_SAFE_AXLE_WEIGHT;
    var entry = entryByCode(code, table);
    var limit = axleGroupLimitTonnes(code, { pneumaticSuspension: i.pneumaticSuspension, table: table });
    var weighed = nonNeg(i.weighedTonnes, 0);
    var over = weighed > limit ? round(weighed - limit, 3) : 0;
    return {
      entryCode: code,
      label: entry ? entry.label : code,
      limitTonnes: limit,
      weighedTonnes: round(weighed, 3),
      supplied: weighed > 0,
      overTonnes: over,
      isOver: weighed > 0 && over > 0,
      headroomTonnes: weighed > 0 ? round(limit - weighed, 3) : limit
    };
  }

  /* ================================================================== *
   * 10. The whole computation
   * ================================================================== */

  function compute(input) {
    var i = input || {};
    var regime = i.regime === "PH" ? "PH" : "IN";

    /* Axle configuration — a preset, or the counts as given. */
    var preset = i.presetId ? presetById(i.presetId) : null;
    var groups = {};
    for (var g = 0; g < GROUP_KEYS.length; g++) {
      var key = GROUP_KEYS[g];
      if (i.groups && i.groups[key] !== undefined && i.groups[key] !== null && i.groups[key] !== "") {
        groups[key] = count(i.groups[key]);
      } else if (preset) {
        groups[key] = count(preset.groups[key]);
      } else {
        groups[key] = 0;
      }
    }
    var vehicleClass = i.vehicleClass || (preset ? preset.vehicleClass : "rigid");

    var perm = permissibleGvw({
      groups: groups,
      vehicleClass: vehicleClass,
      pneumaticSuspension: i.pneumaticSuspension,
      table: i.table,
      caps: i.caps
    });

    /* The binding limit. In Philippine mode the configuration table is not the
       authority, so the operator's own figure is the only limit used. */
    var limit;
    if (regime === "PH") {
      var phLimit = nonNeg(i.rcGvwTonnes, 0);
      limit = { limitTonnes: round(phLimit, 3), source: "rc", rcTonnes: round(phLimit, 3), configTonnes: 0 };
    } else {
      limit = bindingLimit({
        rcGvwTonnes: i.rcGvwTonnes,
        configPermissibleTonnes: perm.permissibleTonnes,
        limitSource: i.limitSource
      });
    }

    var tolPct = i.tolerancePercent === undefined || i.tolerancePercent === null || i.tolerancePercent === ""
      ? (regime === "PH" ? PH_RA8794.tolerancePercent : IN_GVW_TOLERANCE.percent)
      : nonNeg(i.tolerancePercent, 0);

    var load = overload({
      unladenTonnes: i.unladenTonnes,
      loadTonnes: i.loadTonnes,
      ladenTonnes: i.ladenTonnes,
      limitTonnes: limit.limitTonnes,
      tolerancePercent: tolPct,
      excessBasis: i.excessBasis
    });

    var penalty;
    if (regime === "PH") {
      penalty = penaltyPhilippines({
        inContravention: load.inContravention,
        mvucPhp: i.mvucPhp,
        axleLoadKg: nonNeg(i.weighedAxleGroupTonnes, 0) * 1000
      });
    } else {
      penalty = penaltyIndia({
        inContravention: load.inContravention,
        excessTonnes: load.excessTonnes,
        rounding: i.rounding,
        baseFineInr: i.baseFineInr,
        perTonneOfExcessInr: i.perTonneOfExcessInr,
        refusalToWeigh: i.refusalToWeigh
      });
    }

    var axleCheck = axleGroupCheck({
      entryCode: i.weighedAxleGroupCode,
      weighedTonnes: i.weighedAxleGroupTonnes,
      pneumaticSuspension: i.pneumaticSuspension,
      table: i.table
    });

    /* Verdict. "noLimit" keeps the page honest when nothing is known yet. */
    var verdict;
    if (limit.limitTonnes <= 0) verdict = "noLimit";
    else if (load.inContravention) verdict = "over";
    else if (load.ladenTonnes > limit.limitTonnes) verdict = "withinTolerance";
    else if (load.remainingPayloadTonnes <= 0) verdict = "atLimit";
    else verdict = "under";

    var total = regime === "PH" ? penalty.totalPhp : penalty.totalInr;

    return {
      regime: regime,
      currency: regime === "PH" ? "PHP" : "INR",
      groups: groups,
      vehicleClass: vehicleClass,
      presetId: preset ? preset.id : null,
      permissible: perm,
      limit: limit,
      load: load,
      penalty: penalty,
      axleCheck: axleCheck,
      verdict: verdict,
      totalPenalty: isFinite(total) ? total : 0,
      /* The two consequences that are not the fine. Stated, not computed. */
      consequences: {
        offloadTonnes: load.mustOffloadTonnes,
        mustOffloadBeforeMoving: load.mustOffloadTonnes > 0,
        movementBar: IN_PENALTY_S194.movementBar,
        weighingPower: IN_WEIGHT_OFFENCE.weighingPowerText,
        offloadingCharges: IN_PENALTY_S194.offloadingCharges,
        insurance:
          "Overloading puts the insurance claim at risk. Indian insurers routinely repudiate " +
          "or reduce a claim on a vehicle that was overloaded at the time of the loss, and " +
          "consumer forums have both upheld full repudiation where the overload had a nexus " +
          "with the accident and allowed a reduced 'non-standard' settlement (commonly 75%) " +
          "where it did not. The outcome turns on the facts, so treat the whole insured value " +
          "of the vehicle and the cargo as the amount at stake — not the fine."
      }
    };
  }

  /* ================================================================== *
   * 11. Exports
   * ================================================================== */

  var API = {
    /* constants */
    IN_SAFE_AXLE_WEIGHT: IN_SAFE_AXLE_WEIGHT,
    IN_GVW_CAP: IN_GVW_CAP,
    IN_GVW_TOLERANCE: IN_GVW_TOLERANCE,
    IN_WEIGHT_OFFENCE: IN_WEIGHT_OFFENCE,
    IN_PENALTY_S194: IN_PENALTY_S194,
    IN_NOT_SOURCED: IN_NOT_SOURCED,
    PH_RA8794: PH_RA8794,
    AXLE_CONFIG_PRESETS: AXLE_CONFIG_PRESETS,
    GROUP_ENTRY_CODE: GROUP_ENTRY_CODE,
    GROUP_KEYS: GROUP_KEYS,
    /* functions */
    entryByCode: entryByCode,
    presetById: presetById,
    axleGroupLimitTonnes: axleGroupLimitTonnes,
    permissibleGvw: permissibleGvw,
    bindingLimit: bindingLimit,
    overload: overload,
    penaltyIndia: penaltyIndia,
    penaltyPhilippines: penaltyPhilippines,
    axleGroupCheck: axleGroupCheck,
    compute: compute
  };

  if (typeof module === "object" && module && module.exports) module.exports = API;
  if (root) root.AxleLoad = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
