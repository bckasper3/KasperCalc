// ============================================================
// KASPERCALC TORSION SPRING CHARTS
//
// Torsion-specific adaptation of springCharts.js (the compression spring
// chart module this was originally cloned from). The two calculators share
// a rendering engine (rebuildChart, makeOpts, smartAxis, dataset helpers)
// but the physics differs enough to need its own chart-building functions:
//
//   - The load quantity is torque M (lbf-in), not force F (lb).
//   - The "position" axis is angular deflection (deg), not linear length —
//     and where compression pairs deflection with free-length-minus-
//     deflection, torsion pairs it with the moving arm's absolute angle
//     (angFree + deflection), since torsion has no "solid height" analogue.
//   - Torsion springs are stressed in BENDING and fail from the inner
//     fibre, so where compression shows one corrected/uncorrected shear
//     stress line, torsion shows two: inner-fibre and outer-fibre bending
//     stress (si, so). The inner fibre is always the higher of the two.
//   - There is no "preset" concept for torsion (that's a compression/
//     extension spring manufacturing process). The static bending
//     allowable is a flat 80% (warn) / 100% (yield) of tensile strength,
//     matching the thresholds already used in runDeterministicPostPass.
//   - Only two S-N reference points are published (1e5, 1e6 cycles),
//     against compression's three — and the torsion Goodman relation
//     happens to converge exactly at 100% MTS (see the derivation in
//     _chartFatigueStrength), so that line is drawn to its true
//     mathematical limit rather than a separately-tracked static cutoff.
// ============================================================

let _lastChartParams = null;

const _charts = {
  torqueVsDeflection: null,
  torqueVsAngle:      null,
  pctMTSvsDeflection: null,
  stressVsAngle:      null,
  fatigueStrength:    null,
  stressVsTorque:     null,
};

// Print-shadow registry — canvases live in #springGraphsPrint (position:fixed;left:-9999px)
// so they always have real pixel dimensions regardless of which tab is active.
const _printCharts = {
  torqueVsDeflection: null,
  torqueVsAngle:      null,
  pctMTSvsDeflection: null,
  stressVsAngle:      null,
  fatigueStrength:    null,
  stressVsTorque:     null,
};

const KC = {
  blue:      '#3a7ab0',
  blueFaint: 'rgba(58,122,176,0.35)',
  green:     '#2a7a2a',
  red:       '#cc2222',
  orange:    '#cc7700',
  teal:      '#61828A',
  darkTeal:  '#1a3a40',
  grey:      '#aaa',
  warn:      '#cc7700',
  err:       '#cc2222',
};

const BASE_FONT = { family: "'Roboto', Arial, sans-serif", size: 11 };

// ── Dataset helpers ───────────────────────────────────────────

function lineDs(label, data, color, extra = {}) {
  return {
    label, data,
    borderColor: color, backgroundColor: color,
    borderWidth: 2, fill: false,
    showLine: true, pointRadius: 0, parsing: false,
    ...extra,
  };
}

function tolDs(label, data, color) {
  return {
    label, data,
    borderColor: color, borderWidth: 1,
    borderDash: [3, 3],
    pointRadius: 0, fill: false,
    showLine: true, parsing: false,
  };
}

function annotDs(label, data, color, dash = [5, 4]) {
  return {
    label, data,
    borderColor: color, borderWidth: 1.5,
    borderDash: dash,
    pointRadius: 0, fill: false,
    showLine: true, parsing: false,
  };
}

function pointDs(label, data, color, extra = {}) {
  return {
    label, data,
    borderColor: color, backgroundColor: color,
    pointRadius: 7, showLine: false, parsing: false,
    ...extra,
  };
}

// ── Smart axis ────────────────────────────────────────────────
function smartAxis(values, forceZeroMin = false) {
  const valid = values.filter(v => Number.isFinite(v));
  if (!valid.length) return { min: 0, max: 1 };

  let lo = Math.min(...valid);
  let hi = Math.max(...valid);

  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad; hi += pad;
  }

  const pad = (hi - lo) * 0.08;
  return {
    min: forceZeroMin ? 0 : lo - pad,
    max: hi + pad,
  };
}

// ── Annotation data helpers ───────────────────────────────────
function vLineData(x, yMin, yMax) { return [{ x, y: yMin }, { x, y: yMax }]; }
function hLineData(y, xMin, xMax) { return [{ x: xMin, y }, { x: xMax, y }]; }

function tolBandDs(centerLine, tol, color, labelPrefix) {
  const upper = centerLine.map(pt => ({ x: pt.x, y: pt.y + tol }));
  const lower = centerLine.map(pt => ({ x: pt.x, y: pt.y - tol }));
  return [
    tolDs(`${labelPrefix} +tol`, upper, color),
    tolDs(`${labelPrefix} −tol`, lower, color),
  ];
}

// ── Base chart options ────────────────────────────────────────
function makeOpts(xLabel, yLabel, xR, yR, extras = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: {
      legend: { position: 'top', labels: { font: BASE_FONT } },
      tooltip: { mode: 'nearest', intersect: false },
    },
    elements: {
      line:  { tension: 0.15 },
      point: { radius: 0 },
    },
    scales: {
      x: {
        type: 'linear', min: xR.min, max: xR.max,
        reverse: extras?.xExtra?.reverse || false,
        title: { display: true, text: xLabel },
        ticks: { callback: v => Number(v).toFixed(1) },
      },
      y: {
        type: 'linear', min: yR.min, max: yR.max,
        title: { display: true, text: yLabel },
        ticks: {
          maxTicksLimit: 8,
          callback: v => Math.abs(v) > 1000
            ? v.toLocaleString()
            : Number(v).toFixed(3),
        },
      },
    },
    layout: { padding: 10 },
  };
}

// ── Rebuild chart ─────────────────────────────────────────────
function rebuildChart(key, canvasId, config) {

  // ── Main canvas ──
  // Only renders when the canvas has real layout dimensions (its tab is
  // active). switchGraphTab() calls the chart function again on tab switch.
  if (_charts[key]) {
    try { _charts[key].destroy(); } catch(e) {}
    _charts[key] = null;
  }

  const canvas = document.getElementById(canvasId);
  if (canvas && canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
    if (!canvas.height || canvas.height === 0) canvas.height = 350;
    if (typeof Chart !== 'undefined') {
      try {
        _charts[key] = new Chart(canvas.getContext('2d'), config);
      } catch(e) {
        console.error('[torsion chart] new Chart() threw:', e);
      }
    }
  }

  // ── Print-shadow canvas ──
  // Lives in #springGraphsPrint (position:fixed;left:-9999px;width:750px) so
  // it always has real pixel dimensions — renders every time, no tab restriction.
  if (_printCharts[key]) {
    try { _printCharts[key].destroy(); } catch(e) {}
    _printCharts[key] = null;
  }
  const printCanvas = document.getElementById(canvasId + '_p');
  if (printCanvas && typeof Chart !== 'undefined') {
    try {
      _printCharts[key] = new Chart(printCanvas.getContext('2d'), config);
    } catch(e) {}
  }
}

// ── Bending stress helpers ─────────────────────────────────────
// Torsion wire is stressed in bending, not shear: sigma = K * 32M / (pi d^3).
// K is the inner- or outer-fibre curvature factor (Ki > Ko always) — the
// caller decides whether that's the toggle-respecting kIn/kOut (matches
// what's shown in the results table) or the unconditional Ki/Ko (matches
// the cycle-life estimate, which applies the correction regardless of the
// "Use Wahl Factor" checkbox — see computeOperatingStressRange()).
function siStress(M, d, K) {
  if (M == null || d == null || !K) return null;
  return K * (32 * M) / (Math.PI * Math.pow(d, 3));
}

// Flat static bending allowable — no preset concept for torsion springs,
// and (unlike compression) not conditioned on shot-peening either; peening
// only shifts the fatigue S-N points, not the static limit. Matches the
// warnPct/errPct pair in runDeterministicPostPass exactly.
function torsionStressThresholds(mts) {
  if (!mts) return { warn: null, err: null };
  return { warn: mts * 0.80, err: mts * 1.00 };
}

function stressToTorque(stressPsi, d, K) {
  if (!stressPsi || !K || !d) return null;
  return (stressPsi * Math.PI * Math.pow(d, 3)) / (32 * K);
}


// ============================================================
// MASTER UPDATE
// ============================================================

function updateAllCharts(p) {
  if (!window.Chart) return;
  if (!p || !p.k || !p.d || !p.D || !p.defMax || p.defMax <= 0) return;

  _lastChartParams        = p;
  window._lastChartParams = p;

  // Only render the currently active tab — the others have display:none
  // and Chart.js measures 0x0 on hidden canvases, producing blank charts.
  // switchGraphTab() re-renders the correct chart when the user switches.
  const activeTab = document.querySelector('.graph-tab.active');
  const activeN   = activeTab
    ? parseInt(activeTab.getAttribute('onclick')?.match(/\d+/)?.[0] ?? '1')
    : 1;

  const chartFns = [
    null,
    _chartTorqueVsDeflection,
    _chartTorqueVsAngle,
    _chartPctMTSvsDeflection,
    _chartStressVsAngle,
    _chartFatigueStrength,
    _chartStressVsTorque,
  ];

  const fn = chartFns[activeN];
  if (fn) fn(p);
}


// ============================================================
// 1. TORQUE vs. DEFLECTION
// ============================================================
function _chartTorqueVsDeflection(p) {
  const { k, defMax, M1, defl1, M2, defl2, Mset, deflSet, loadTol, hasM1, hasM2 } = p;

  const STEPS = 50;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defMax / STEPS) * i;
    line.push({ x: def, y: k * def });
  }

  const allX = [0, defMax];
  const allY = [0, k * defMax];
  if (hasM1 && defl1 != null) { allX.push(defl1); if (M1 != null) allY.push(M1); }
  if (hasM2 && defl2 != null) { allX.push(defl2); if (M2 != null) allY.push(M2); }
  if (Mset != null && deflSet != null) { allX.push(deflSet); allY.push(Mset); }

  const hasTol = loadTol != null && loadTol > 0;
  if (hasTol && M1 != null) allY.push(M1 + loadTol, M1 - loadTol);
  if (hasTol && M2 != null) allY.push(M2 + loadTol, M2 - loadTol);

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);

  const datasets = [ lineDs('Torque', line, KC.blue) ];

  if (hasTol && hasM1 && defl1 != null && M1 != null) datasets.push(...tolBandDs(line, loadTol, KC.green, 'M1'));
  if (hasTol && hasM2 && defl2 != null && M2 != null) datasets.push(...tolBandDs(line, loadTol, KC.orange, 'M2'));

  if (hasM1 && defl1 != null && M1 != null)
    datasets.push(pointDs('M1', [{ x: defl1, y: M1 }], KC.green));
  if (hasM2 && defl2 != null && M2 != null)
    datasets.push(pointDs('M2', [{ x: defl2, y: M2 }], KC.orange));
  if (Mset != null && deflSet != null)
    datasets.push(pointDs('At Set', [{ x: deflSet, y: Mset }], KC.red, { pointStyle: 'rectRot' }));

  rebuildChart('torqueVsDeflection', 'chartTorqueVsDeflection', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Deflection (deg)', 'Torque (lbf·in)', xR, yR),
  });
}


// ============================================================
// 2. TORQUE vs. ARM ANGLE
// ============================================================
// Compression pairs deflection with free-length-minus-deflection because a
// compression spring's other natural position readout IS its length. A
// torsion spring's other natural readout is the moving arm's absolute
// angle: angFree + deflection. Plotted unwrapped (not mod 360) so the curve
// stays a single continuous line even if winding carries the arm past
// where it reads back around on a drawing — see wrap360() in
// SpringTorsionRound.js for why the dimensioned angle itself does wrap.
function _chartTorqueVsAngle(p) {
  const { k, defMax, angFree, M1, defl1, M2, defl2, Mset, deflSet, loadTol, hasM1, hasM2 } = p;
  if (angFree == null) return;

  const STEPS = 50;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defMax / STEPS) * i;
    line.push({ x: angFree + def, y: k * def });
  }

  const ang1 = hasM1 && defl1 != null ? angFree + defl1 : null;
  const ang2 = hasM2 && defl2 != null ? angFree + defl2 : null;
  const angSetPt = deflSet != null ? angFree + deflSet : null;

  const allX = [angFree, angFree + defMax];
  const allY = [0, k * defMax];
  if (ang1 != null) { allX.push(ang1); if (M1 != null) allY.push(M1); }
  if (ang2 != null) { allX.push(ang2); if (M2 != null) allY.push(M2); }
  if (Mset != null && angSetPt != null) { allX.push(angSetPt); allY.push(Mset); }

  const hasTol = loadTol != null && loadTol > 0;
  if (hasTol && M1 != null) allY.push(M1 + loadTol, M1 - loadTol);
  if (hasTol && M2 != null) allY.push(M2 + loadTol, M2 - loadTol);

  const validX = allX.filter(Number.isFinite);
  const xMin = Math.min(...validX), xMax = Math.max(...validX);
  const xPad = (xMax - xMin) * 0.08 || 1;
  const xR = { min: xMin - xPad, max: xMax + xPad };
  const yR = smartAxis(allY, true);

  const datasets = [ lineDs('Torque', line, KC.blue) ];

  if (hasTol && ang1 != null && M1 != null) datasets.push(...tolBandDs(line, loadTol, KC.green, 'M1'));
  if (hasTol && ang2 != null && M2 != null) datasets.push(...tolBandDs(line, loadTol, KC.orange, 'M2'));

  if (ang1 != null && M1 != null) datasets.push(pointDs('M1', [{ x: ang1, y: M1 }], KC.green));
  if (ang2 != null && M2 != null) datasets.push(pointDs('M2', [{ x: ang2, y: M2 }], KC.orange));
  if (Mset != null && angSetPt != null)
    datasets.push(pointDs('At Set', [{ x: angSetPt, y: Mset }], KC.red, { pointStyle: 'rectRot' }));

  rebuildChart('torqueVsAngle', 'chartTorqueVsAngle', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Moving Arm Angle (deg)', 'Torque (lbf·in)', xR, yR),
  });
}


// ============================================================
// 3. % MTS vs. DEFLECTION
// ============================================================
// Uses the inner fibre (si) at whichever correction the results table
// itself shows (kIn — respects the "Use Wahl Factor" toggle), so the M1/M2
// dots always land exactly on the curve regardless of that setting.
function _chartPctMTSvsDeflection(p) {
  const { k, defMax, d, mts, kIn, M1, defl1, M2, defl2, Mset, deflSet, hasM1, hasM2 } = p;
  if (!mts || !kIn || !d) return;

  const STEPS = 60;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defMax / STEPS) * i;
    const pct = siStress(k * def, d, kIn) / mts * 100;
    line.push({ x: def, y: pct });
  }

  const warnPct = 80, errPct = 100;

  const allX = [0, defMax];
  const allY = line.map(pt => pt.y).concat([warnPct, errPct]);
  if (hasM1 && defl1 != null) allX.push(defl1);
  if (hasM2 && defl2 != null) allX.push(defl2);
  if (deflSet != null) allX.push(deflSet);

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);

  const datasets = [
    lineDs('% MTS (inner fibre)', line, KC.blue),
    annotDs(`Warn (${warnPct}%)`, hLineData(warnPct, xR.min, xR.max), KC.warn),
    annotDs(`Yield (${errPct}%)`, hLineData(errPct,  xR.min, xR.max), KC.err),
  ];

  if (hasM1 && defl1 != null && M1 != null) {
    const pct = siStress(M1, d, kIn) / mts * 100;
    datasets.push(pointDs('M1', [{ x: defl1, y: pct }], KC.green));
  }
  if (hasM2 && defl2 != null && M2 != null) {
    const pct = siStress(M2, d, kIn) / mts * 100;
    datasets.push(pointDs('M2', [{ x: defl2, y: pct }], KC.orange));
  }
  if (Mset != null && deflSet != null) {
    const pct = siStress(Mset, d, kIn) / mts * 100;
    datasets.push(pointDs('At Set', [{ x: deflSet, y: pct }], KC.red, { pointStyle: 'rectRot' }));
  }

  rebuildChart('pctMTSvsDeflection', 'chartPctMTSvsDeflection', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Deflection (deg)', '% of MTS', xR, yR),
  });
}


// ============================================================
// 4. STRESS vs. ARM ANGLE  (inner + outer fibre, ksi)
// ============================================================
function _chartStressVsAngle(p) {
  const { k, defMax, d, angFree, kIn, kOut, M1, defl1, M2, defl2, Mset, deflSet, hasM1, hasM2 } = p;
  if (!kIn || !kOut || !d || angFree == null) return;

  const PSI_TO_KSI = 1 / 1000;
  const STEPS = 60;
  const siLine = [], soLine = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defMax / STEPS) * i;
    const M   = k * def;
    siLine.push({ x: angFree + def, y: siStress(M, d, kIn)  * PSI_TO_KSI });
    soLine.push({ x: angFree + def, y: siStress(M, d, kOut) * PSI_TO_KSI });
  }

  const ang1 = hasM1 && defl1 != null ? angFree + defl1 : null;
  const ang2 = hasM2 && defl2 != null ? angFree + defl2 : null;
  const angSetPt = deflSet != null ? angFree + deflSet : null;

  const allX = [angFree, angFree + defMax];
  const allY = siLine.map(pt => pt.y);
  if (ang1 != null) allX.push(ang1);
  if (ang2 != null) allX.push(ang2);
  if (angSetPt != null) allX.push(angSetPt);

  const validX = allX.filter(Number.isFinite);
  const xMin = Math.min(...validX), xMax = Math.max(...validX);
  const xPad = (xMax - xMin) * 0.08 || 1;
  const xR = { min: xMin - xPad, max: xMax + xPad };
  const yR = smartAxis(allY, true);

  const datasets = [
    lineDs('Inner fibre (σi)', siLine, KC.blue),
    lineDs('Outer fibre (σo)', soLine, KC.teal, { borderDash: [4, 3] }),
  ];

  if (ang1 != null && M1 != null)
    datasets.push(pointDs('M1', [{ x: ang1, y: siStress(M1, d, kIn) * PSI_TO_KSI }], KC.green));
  if (ang2 != null && M2 != null)
    datasets.push(pointDs('M2', [{ x: ang2, y: siStress(M2, d, kIn) * PSI_TO_KSI }], KC.orange));
  if (Mset != null && angSetPt != null)
    datasets.push(pointDs('At Set', [{ x: angSetPt, y: siStress(Mset, d, kIn) * PSI_TO_KSI }], KC.red, { pointStyle: 'rectRot' }));

  const opts = makeOpts('Moving Arm Angle (deg)', 'Bending Stress (ksi)', xR, yR);
  opts.scales.y.ticks.callback = v => Number(v).toFixed(2);

  rebuildChart('stressVsAngle', 'chartStressVsAngle', {
    type: 'scatter',
    data: { datasets },
    options: opts,
  });
}


// ============================================================
// 5. FATIGUE STRENGTH DIAGRAM (Modified Goodman)
// ============================================================
// The S-N reference points (see estimateTorsionCycleLife in
// SpringTorsionRound.js) are defined as sar = Se at a given cycle life,
// where sar = sa/(1-sm/mts) is the Goodman-corrected fully-reversed
// equivalent. Solving that boundary condition for (sigma_min, sigma_max)
// as a function of mean stress sm gives two affine expressions in sm —
// i.e. the boundary is exactly a straight line in (sigma_min, sigma_max)
// space, running from (0, Se) at sm=Se·mts/(mts+Se) up to (mts, mts) — so
// unlike the compression diagram (which truncates at a separately-defined
// static limit below true ultimate), the torsion Se lines are drawn to
// their real mathematical convergence at 100% MTS, which is also exactly
// where the static yield threshold sits.
function _chartFatigueStrength(p) {
  const { mts, d, Ki, M1, M2, hasM1, hasM2, peened } = p;
  if (!mts || !Ki || !d) return;

  // Se as a fraction of mts, from the same table estimateTorsionCycleLife
  // uses: S/(2-S/mts) normalized by mts reduces to Spct/(2-Spct).
  const toSeNorm = spct => spct / (2 - spct);
  const se1 = toSeNorm(peened ? 0.62 : 0.53);   // 1e5 cycles
  const se2 = toSeNorm(peened ? 0.60 : 0.50);   // 1e6 cycles
  const labels  = ['10⁵ cycles', '10⁶ cycles'];
  const seVals  = [se1, se2];
  const lColors = [KC.err, KC.darkTeal];

  const datasets = [];
  for (let i = 0; i < 2; i++) {
    datasets.push({
      label: labels[i],
      data: [{ x: 0, y: seVals[i] }, { x: 1, y: 1 }],
      borderColor: lColors[i],
      fill: false, pointRadius: 0, borderWidth: 2,
      showLine: true, parsing: false,
    });
  }

  datasets.push({
    label: 'Yield (100% MTS)',
    data: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
    borderColor: KC.blue,
    fill: false, pointRadius: 0, borderWidth: 1.5,
    showLine: true, parsing: false,
  });

  datasets.push({
    label: 'σmax = σmin',
    data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    borderColor: KC.blue,
    fill: false, pointRadius: 0, borderDash: [6, 4], borderWidth: 1,
    showLine: true, parsing: false,
  });

  let siMin = 0, siMax = 0;
  if (hasM1 && hasM2 && M1 != null && M2 != null) {
    const s1 = siStress(M1, d, Ki) / mts;
    const s2 = siStress(M2, d, Ki) / mts;
    siMin = Math.min(s1, s2);
    siMax = Math.max(s1, s2);
  } else if (hasM1 && M1 != null) {
    siMax = siStress(M1, d, Ki) / mts;
  } else if (hasM2 && M2 != null) {
    siMax = siStress(M2, d, Ki) / mts;
  }

  if (siMax > 0) {
    datasets.push({
      label: 'Operating point',
      data: [{ x: siMin, y: siMax }],
      borderColor: KC.darkTeal, backgroundColor: 'transparent',
      pointRadius: 9, pointStyle: 'circle', borderWidth: 1.5,
      showLine: false, parsing: false,
    });
    datasets.push({
      label: '_inner',
      data: [{ x: siMin, y: siMax }],
      borderColor: KC.darkTeal, backgroundColor: KC.darkTeal,
      pointRadius: 3, pointStyle: 'circle', borderWidth: 1,
      showLine: false, parsing: false,
    });
  }

  const opts = makeOpts(
    'Minimum Stress / Tensile Strength',
    'Maximum Stress / Tensile Strength',
    { min: 0, max: 1.0 },
    { min: 0, max: 1.0 }
  );
  opts.scales.y.ticks.callback = v => Number(v).toFixed(2);
  opts.scales.x.ticks.callback = v => Number(v).toFixed(2);
  opts.plugins.legend.labels = {
    ...opts.plugins.legend.labels,
    filter: item => item.text !== '_inner',
  };

  rebuildChart('fatigueStrength', 'chartFatigueStrength', {
    type: 'scatter',
    data: { datasets },
    options: opts,
  });
}


// ============================================================
// 6. STRESS vs. TORQUE  (inner + outer fibre, psi)
// ============================================================
function _chartStressVsTorque(p) {
  const { k, defMax, d, kIn, kOut, mts, M1, M2, Mset, hasM1, hasM2 } = p;
  if (!kIn || !kOut || !d) return;

  const Mmax  = k * defMax;
  const STEPS = 60;
  const siLine = [], soLine = [];
  for (let i = 0; i <= STEPS; i++) {
    const M = (Mmax / STEPS) * i;
    siLine.push({ x: M, y: siStress(M, d, kIn) });
    soLine.push({ x: M, y: siStress(M, d, kOut) });
  }

  const allX = [0, Mmax];
  const allY = siLine.map(pt => pt.y);
  if (hasM1 && M1 != null) allX.push(M1);
  if (hasM2 && M2 != null) allX.push(M2);
  if (Mset != null) allX.push(Mset);

  const thresh = torsionStressThresholds(mts);
  if (thresh.warn) allY.push(thresh.warn);
  if (thresh.err)  allY.push(thresh.err);

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);

  const datasets = [
    lineDs('Inner fibre (σi)', siLine, KC.blue),
    lineDs('Outer fibre (σo)', soLine, KC.teal, { borderDash: [4, 3] }),
  ];

  if (thresh.err)  datasets.push(annotDs(`Yield (${Math.round(thresh.err).toLocaleString()} psi)`, hLineData(thresh.err,  xR.min, xR.max), KC.err));
  if (thresh.warn) datasets.push(annotDs(`Warn (${Math.round(thresh.warn).toLocaleString()} psi)`, hLineData(thresh.warn, xR.min, xR.max), KC.warn));

  if (hasM1 && M1 != null) datasets.push(pointDs('M1', [{ x: M1, y: siStress(M1, d, kIn) }], KC.green));
  if (hasM2 && M2 != null) datasets.push(pointDs('M2', [{ x: M2, y: siStress(M2, d, kIn) }], KC.orange));
  if (Mset != null) datasets.push(pointDs('At Set', [{ x: Mset, y: siStress(Mset, d, kIn) }], KC.red, { pointStyle: 'rectRot' }));

  rebuildChart('stressVsTorque', 'chartStressVsTorque', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Torque (lbf·in)', 'Bending Stress (psi)', xR, yR),
  });
}


// ── Expose for tab-switch re-rendering ────────────────────────
window.updateAllCharts          = updateAllCharts;
window._chartTorqueVsDeflection = _chartTorqueVsDeflection;
window._chartTorqueVsAngle      = _chartTorqueVsAngle;
window._chartPctMTSvsDeflection = _chartPctMTSvsDeflection;
window._chartStressVsAngle      = _chartStressVsAngle;
window._chartFatigueStrength    = _chartFatigueStrength;
window._chartStressVsTorque     = _chartStressVsTorque;
