/* Page wiring for the axle-load and overload-penalty calculator.
   All arithmetic and every statutory figure live in engine.js; this file only
   reads the form, calls the engine and writes the result. No network, no eval. */
(function () {
  "use strict";

  var E = window.AxleLoad;
  if (!E) return;

  /* ---------- formatting ---------- */

  var money = {
    INR: new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }),
    PHP: new Intl.NumberFormat("en-PH", {
      style: "currency", currency: "PHP", maximumFractionDigits: 0
    })
  };
  var tonneFmt = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 3
  });
  var kgFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  function fin(n) {
    return typeof n === "number" && isFinite(n) ? n : 0;
  }
  function inr(n, cur) {
    return (money[cur] || money.INR).format(fin(n));
  }
  function t(n) {
    return tonneFmt.format(fin(n)) + " t";
  }
  function signedT(n) {
    var v = fin(n);
    return (v > 0 ? "+" : "") + tonneFmt.format(v) + " t";
  }
  function kg(n) {
    return kgFmt.format(fin(n)) + " kg";
  }
  function pct(n) {
    return tonneFmt.format(fin(n)) + "%";
  }

  /* ---------- element lookup ---------- */

  function el(id) { return document.getElementById(id); }

  var nodes = {
    rKey: el("r-key"),
    rValue: el("r-value"),
    rSub: el("r-sub"),
    rRows: el("r-rows"),
    rConsequence: el("r-consequence"),
    rcLabel: el("rc-gvw-label"),
    toleranceHint: el("tolerance-hint")
  };

  var NUMBER_IDS = [
    "g-single1", "g-single2", "g-single4", "g-tandem", "g-tridem",
    "rc-gvw", "unladen", "load", "laden", "axle-weighed",
    "tolerance", "base-fine", "per-tonne", "mvuc"
  ];

  /* Fields shown only for one regime. Hidden with the `hidden` attribute, never
     with an inline style: the page's CSP forbids inline styles outright. */
  var IN_ONLY = [
    "f-preset", "f-counts-a", "f-counts-b", "f-counts-c", "f-class",
    "f-susp", "f-limitsrc", "f-basis", "f-rounding", "f-fines", "f-refusal"
  ];
  var PH_ONLY = ["f-mvuc"];

  /* ---------- segmented controls ---------- */

  /* Each seg is a group of buttons with aria-pressed; exactly one is pressed. */
  var SEGS = [
    { id: "regime-seg", attr: "data-regime", key: "regime" },
    { id: "preset-seg", attr: "data-preset", key: "presetId" },
    { id: "class-seg", attr: "data-class", key: "vehicleClass" },
    { id: "susp-seg", attr: "data-susp", key: "suspension" },
    { id: "limit-seg", attr: "data-limit", key: "limitSource" },
    { id: "axle-seg", attr: "data-axle", key: "axleCode" },
    { id: "basis-seg", attr: "data-basis", key: "excessBasis" },
    { id: "rounding-seg", attr: "data-rounding", key: "rounding" },
    { id: "refusal-seg", attr: "data-refusal", key: "refusal" }
  ];

  var state = {};
  var initialState = {};
  var initialNumbers = {};

  function segValue(seg) {
    var box = el(seg.id);
    if (!box) return null;
    var pressed = box.querySelector("[aria-pressed='true']");
    return pressed ? pressed.getAttribute(seg.attr) : null;
  }

  function setSeg(seg, value) {
    var box = el(seg.id);
    if (!box) return;
    var btns = box.querySelectorAll("button[" + seg.attr + "]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute(seg.attr) === value ? "true" : "false");
    }
    state[seg.key] = value;
  }

  function clearSeg(seg) {
    var box = el(seg.id);
    if (!box) return;
    var btns = box.querySelectorAll("button[" + seg.attr + "]");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", "false");
    state[seg.key] = null;
  }

  /* ---------- reading the form ---------- */

  function raw(id) {
    var node = el(id);
    return node ? node.value : "";
  }

  function readInput() {
    return {
      regime: state.regime === "PH" ? "PH" : "IN",
      presetId: null, /* presets only seed the count fields; the counts are the truth */
      groups: {
        single1: raw("g-single1"),
        single2: raw("g-single2"),
        single4: raw("g-single4"),
        tandem: raw("g-tandem"),
        tridem: raw("g-tridem")
      },
      vehicleClass: state.vehicleClass || "rigid",
      pneumaticSuspension: state.suspension === "pneumatic",
      rcGvwTonnes: raw("rc-gvw"),
      limitSource: state.limitSource || "rc",
      unladenTonnes: raw("unladen"),
      loadTonnes: raw("load"),
      ladenTonnes: raw("laden"),
      tolerancePercent: raw("tolerance"),
      excessBasis: state.excessBasis || "limit",
      rounding: state.rounding || "ceil",
      baseFineInr: raw("base-fine"),
      perTonneOfExcessInr: raw("per-tonne"),
      refusalToWeigh: state.refusal === "yes",
      mvucPhp: raw("mvuc"),
      weighedAxleGroupCode: state.axleCode || "1.3",
      weighedAxleGroupTonnes: raw("axle-weighed")
    };
  }

  /* ---------- building the breakdown table ---------- */

  function row(label, value, opts) {
    var o = opts || {};
    var tr = document.createElement("tr");
    if (o.cls) tr.className = o.cls;
    var th = document.createElement("td");
    th.textContent = label;
    var td = document.createElement("td");
    td.className = o.neg ? "num neg" : "num";
    td.textContent = value;
    tr.appendChild(th);
    tr.appendChild(td);
    return tr;
  }

  function render(result) {
    var cur = result.currency;
    var perm = result.permissible;
    var load = result.load;
    var pen = result.penalty;
    var rows = [];

    /* 1. where the permissible weight came from */
    if (result.regime === "IN") {
      for (var i = 0; i < perm.rows.length; i++) {
        var r = perm.rows[i];
        var name = r.label + (r.groups > 1 ? " × " + r.groups : "");
        rows.push(row(name + (r.pneumaticApplied ? " (pneumatic)" : ""), t(r.limitTonnes), { cls: "sub" }));
      }
      rows.push(row("Sum of notified axle limits", t(perm.sumOfAxleLimitsTonnes)));
      if (perm.statutoryCapTonnes !== null) {
        rows.push(row(
          perm.capApplied ? "Ceiling applied (para 2)" : "Ceiling (para 2)",
          t(perm.statutoryCapTonnes),
          { cls: "sub" }
        ));
      } else {
        rows.push(row("Ceiling (para 2)", "none — regulatory approval", { cls: "sub" }));
      }
      rows.push(row("Permissible GVW, notified", t(perm.permissibleTonnes)));
      if (load.limitTonnes > 0 && result.limit.source === "rc") {
        rows.push(row("Gross vehicle weight on the RC", t(result.limit.rcTonnes)));
      }
    }

    rows.push(row(
      result.regime === "PH" ? "Permissible GVW as entered" : "Limit that binds (s.113(3))",
      load.limitTonnes > 0 ? t(load.limitTonnes) : "not set"
    ));

    /* 2. what is on the vehicle */
    rows.push(row("Unladen weight", t(load.unladenTonnes), { cls: "sub" }));
    rows.push(row("Load", t(load.loadTonnes), { cls: "sub" }));
    rows.push(row("Laden weight", t(load.ladenTonnes)));
    if (load.limitTonnes > 0) {
      rows.push(row("Utilisation of the limit", pct(load.utilisationPercent), { cls: "sub" }));
    }

    /* 3. the tolerance and the offence gate */
    if (load.tolerancePercent > 0) {
      rows.push(row("Tolerance at " + pct(load.tolerancePercent), signedT(load.toleranceTonnes), { cls: "sub" }));
    }
    rows.push(row("Offence threshold", load.limitTonnes > 0 ? t(load.thresholdTonnes) : "not set", { cls: "sub" }));

    /* 4. the verdict in tonnes */
    if (load.inContravention) {
      rows.push(row("Excess load", signedT(load.excessTonnes), { neg: true }));
      if (result.regime === "IN") {
        rows.push(row(
          pen.rounding === "ceil" ? "Charged as whole tonnes" : "Charged pro-rata",
          t(pen.tonnesCharged),
          { cls: "sub" }
        ));
      }
    } else {
      rows.push(row(
        "Remaining safe payload",
        t(load.remainingPayloadTonnes),
        { neg: load.remainingPayloadTonnes < 0 }
      ));
    }

    /* 5. the money */
    if (result.regime === "IN") {
      rows.push(row("Base fine, s.194(1)", inr(pen.baseFineInr, cur)));
      rows.push(row(
        inr(pen.perTonneRateInr, cur) + " × " + t(pen.tonnesCharged),
        inr(pen.perTonneTotalInr, cur)
      ));
      if (pen.refusalToWeighIncluded) {
        rows.push(row("Refusing the weighbridge, s.194(2)", inr(pen.refusalToWeighInr, cur)));
      }
    } else {
      rows.push(row(
        "Penalty at " + pct(pen.percentOfMvuc) + " of the MVUC",
        pen.mvucPhp > 0 ? inr(pen.mvucPhp, cur) : "MVUC not entered"
      ));
      if (pen.axleOverCap) {
        rows.push(row(
          "Over the " + kg(pen.axleCapKg) + " axle cap by",
          kg(pen.axleOverKg),
          { neg: true }
        ));
      }
    }
    rows.push(row("Off-loading charges", "extra — no statutory rate", { cls: "sub" }));
    rows.push(row("Penalty exposure", inr(result.totalPenalty, cur), { cls: "total" }));

    /* 6. the optional axle-group check, kept last so it reads as an aside */
    if (result.axleCheck.supplied) {
      rows.push(row(
        "Weighed group vs its limit (" + t(result.axleCheck.limitTonnes) + ")",
        result.axleCheck.isOver ? signedT(result.axleCheck.overTonnes) : t(result.axleCheck.headroomTonnes) + " spare",
        { neg: result.axleCheck.isOver }
      ));
    }

    while (nodes.rRows.firstChild) nodes.rRows.removeChild(nodes.rRows.firstChild);
    for (var k = 0; k < rows.length; k++) nodes.rRows.appendChild(rows[k]);
  }

  function renderPrimary(result) {
    var load = result.load;
    var cur = result.currency;
    var key, value, sub;

    if (result.verdict === "noLimit") {
      key = "Permissible gross vehicle weight";
      value = "—";
      sub = result.regime === "PH"
        ? "Enter the permissible gross vehicle weight from the OR/CR or the current DPWH table."
        : "Enter the axle groups on the vehicle, or the gross vehicle weight on the RC.";
    } else if (result.verdict === "over") {
      key = "Overloaded by";
      value = signedT(load.excessTonnes);
      sub = "Penalty " + inr(result.totalPenalty, cur) + " · " +
        t(load.mustOffloadTonnes) + " must come off before the vehicle may move.";
    } else if (result.verdict === "withinTolerance") {
      key = "Over the registered weight by";
      value = signedT(load.ladenTonnes - load.limitTonnes);
      sub = "Inside the " + pct(load.tolerancePercent) + " tolerance, so no offence yet. " +
        t(load.headroomToThresholdTonnes) + " to the threshold.";
    } else if (result.verdict === "atLimit") {
      key = "Remaining safe payload";
      value = t(0);
      sub = "Exactly at " + t(load.limitTonnes) + ". Anything more is excess load.";
    } else {
      key = "Remaining safe payload";
      value = t(load.remainingPayloadTonnes);
      sub = "Out of " + t(load.payloadCapacityTonnes) + " of payload on a " +
        t(load.limitTonnes) + " limit. Cross the threshold and the fine starts at " +
        inr(result.penalty.baseFineInr || E.IN_PENALTY_S194.baseFineInr, cur) + ".";
    }

    nodes.rKey.textContent = key;
    nodes.rValue.textContent = value;
    nodes.rSub.textContent = sub;
  }

  function renderConsequence(result) {
    var c = result.consequences;
    var text;
    if (result.load.mustOffloadTonnes > 0) {
      text = t(c.offloadTonnes) + " has to come off before the vehicle may move — " +
        "the proviso to section 194(1) bars movement until the excess is removed, and under " +
        "section 114(1) an officer may order the off-load and hold the vehicle there. " +
        "Off-loading charges are payable on top, with no statutory rate. " +
        "Overloading also puts the insurance claim at risk: insurers repudiate or cut claims " +
        "on vehicles that were overloaded at the time of the loss, so the amount at stake is " +
        "the insured value of the vehicle and the cargo, not the fine.";
    } else {
      text = "If you cross the limit, two costs land before the fine does: the vehicle may not " +
        "move until the excess is off, and overloading puts the insurance claim at risk. " +
        "Both are usually larger than the penalty.";
    }
    nodes.rConsequence.textContent = text;
  }

  /* ---------- regime switching ---------- */

  function applyRegime() {
    var ph = state.regime === "PH";
    var i;
    for (i = 0; i < IN_ONLY.length; i++) {
      var a = el(IN_ONLY[i]);
      if (a) a.hidden = ph;
    }
    for (i = 0; i < PH_ONLY.length; i++) {
      var b = el(PH_ONLY[i]);
      if (b) b.hidden = !ph;
    }
    if (nodes.rcLabel) {
      nodes.rcLabel.textContent = ph
        ? "Permissible gross vehicle weight"
        : "Gross vehicle weight on the RC";
      var hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = ph
        ? " from the OR/CR or the current DPWH table"
        : " leave blank to use the notified figure";
      nodes.rcLabel.appendChild(hint);
    }
    if (nodes.toleranceHint) {
      nodes.toleranceHint.textContent = ph
        ? "none sourced in RA 8794 s.6"
        : "5% under S.O. 3467(E)";
    }
  }

  /* ---------- the recompute loop ---------- */

  function recompute() {
    var result;
    try {
      result = E.compute(readInput());
    } catch (err) {
      return;
    }
    renderPrimary(result);
    render(result);
    renderConsequence(result);
  }

  /* ---------- wiring ---------- */

  function applyPreset(id) {
    var p = E.presetById(id);
    if (!p) return;
    var map = {
      single1: "g-single1", single2: "g-single2", single4: "g-single4",
      tandem: "g-tandem", tridem: "g-tridem"
    };
    Object.keys(map).forEach(function (key) {
      var node = el(map[key]);
      if (node) node.value = String(p.groups[key]);
    });
    setSeg({ id: "class-seg", attr: "data-class", key: "vehicleClass" }, p.vehicleClass);
  }

  function wire() {
    var i;

    for (i = 0; i < SEGS.length; i++) {
      (function (seg) {
        var box = el(seg.id);
        if (!box) return;
        state[seg.key] = segValue(seg);
        initialState[seg.key] = state[seg.key];
        box.addEventListener("click", function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest("button[" + seg.attr + "]") : null;
          if (!btn) return;
          setSeg(seg, btn.getAttribute(seg.attr));
          if (seg.key === "presetId") applyPreset(state.presetId);
          if (seg.key === "regime") applyRegime();
          recompute();
        });
      })(SEGS[i]);
    }

    for (i = 0; i < NUMBER_IDS.length; i++) {
      (function (id) {
        var node = el(id);
        if (!node) return;
        initialNumbers[id] = node.getAttribute("value") || "";
        node.addEventListener("input", function () {
          /* Hand-editing a count means the vehicle is no longer a preset. */
          if (id.indexOf("g-") === 0) clearSeg({ id: "preset-seg", attr: "data-preset", key: "presetId" });
          recompute();
        });
      })(NUMBER_IDS[i]);
    }

    var printBtn = el("print");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });

    var resetBtn = el("reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(initialNumbers).forEach(function (id) {
          var node = el(id);
          if (node) node.value = initialNumbers[id];
        });
        for (var s = 0; s < SEGS.length; s++) setSeg(SEGS[s], initialState[SEGS[s].key]);
        applyRegime();
        recompute();
      });
    }
  }

  wire();
  applyRegime();
  recompute();
})();
