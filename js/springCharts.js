// ============================================================
// KASPERCALC SPRING CHARTS — DEBUG VERSION
// Console logs added to trace exactly where rendering breaks
// Search for [KC-CHART] to find all debug output
// ============================================================

// console.log('[KC-CHART] springCharts.js: script started parsing');

let _lastChartParams = null;

const _charts = {
  loadVsDeflection:   null,
  loadVsLength:       null,
  pctMTSvsDeflection: null,
  stressVsLength:     null,
  fatigueStrength:    null,
  stressVsLoad:       null,
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
  presetClr: '#7b5ea7',
};

const BASE_FONT = { family: "'Roboto', Arial, sans-serif", size: 11 };

// ── Check Chart.js availability immediately ───────────────────
// console.log('[KC-CHART] Chart.js available at parse time:', typeof Chart !== 'undefined' ? `YES (v${Chart.version})` : 'NO — window.Chart is undefined');

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
  const valid = values.filter(v => Number.isFinite(v));  // already filters NaN and Infinity
  if (!valid.length) {
    console.warn('[KC-CHART] smartAxis: no finite values, returning default {0,1}');
    return { min: 0, max: 1 };
  }

  let lo = Math.min(...valid);
  let hi = Math.max(...valid);

  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad; hi += pad;
  }

  const pad = (hi - lo) * 0.08;
  const result = {
    min: forceZeroMin ? 0 : lo - pad,
    max: hi + pad,
  };
  return result;
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
        ticks: { callback: v => Number(v).toFixed(3) },
      },
      y: {
        type: 'linear', min: yR.min, max: yR.max,
        title: { display: true, text: yLabel },
        ticks: {
          maxTicksLimit: 8,   // ← ADD THIS
          callback: v => Math.abs(v) > 1000
            ? v.toLocaleString()
            : Number(v).toFixed(2),
        },
      },
    },
    layout: { padding: 10 },
  };
}

// ── Rebuild chart ─────────────────────────────────────────────
function rebuildChart(key, canvasId, config) {
  // console.log(`[KC-CHART] rebuildChart("${key}", "${canvasId}") called`);

  // 1. Destroy old instance
  if (_charts[key]) {
    // console.log(`[KC-CHART]   destroying existing chart for key="${key}"`);
    try { _charts[key].destroy(); } catch(e) { console.warn(`[KC-CHART]   destroy failed:`, e); }
    _charts[key] = null;
  }

  // 2. Find canvas
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`[KC-CHART]   FAIL: canvas #${canvasId} not found in DOM`);
    return;
  }
  // console.log(`[KC-CHART]   canvas found: offsetWidth=${canvas.offsetWidth}, offsetHeight=${canvas.offsetHeight}, width attr=${canvas.width}, height attr=${canvas.height}, style.height="${canvas.style.height}"`);

  // 3. Check parent visibility
  const parent = canvas.parentElement;
  const parentDisplay = parent ? getComputedStyle(parent).display : 'unknown';
  const parentVis     = parent ? getComputedStyle(parent).visibility : 'unknown';
  // console.log(`[KC-CHART]   parent .${parent?.className}: display=${parentDisplay}, visibility=${parentVis}`);

  // If canvas has no layout dimensions, Chart.js will miscalculate
  // its internal buffer size and can exceed the browser's max canvas limit.
  // Skip silently — switchGraphTab() will render it when the tab is opened.
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
    // console.log(`[KC-CHART]   SKIP — canvas has zero dimensions (parent hidden), will render on tab switch`);
    return;
  }

  // 4. Fix zero height
  if (!canvas.height || canvas.height === 0) {
    // console.warn(`[KC-CHART]   canvas.height was 0, forcing to 350`);
    canvas.height = 350;
  }

  // 5. Check Chart.js
  if (typeof Chart === 'undefined') {
    console.error(`[KC-CHART]   FAIL: Chart.js (window.Chart) is not defined — library not loaded`);
    return;
  }
  // console.log(`[KC-CHART]   Chart.js version: ${Chart.version}`);

  // 6. Inspect config
  // console.log(`[KC-CHART]   config.type="${config.type}", datasets count=${config.data?.datasets?.length}`);
  config.data?.datasets?.forEach((ds, i) => {
    // console.log(`[KC-CHART]     dataset[${i}] label="${ds.label}" points=${ds.data?.length}`);
  });

  // 7. Log axis ranges
  const sc = config.options?.scales;
  if (sc) {
    // console.log(`[KC-CHART]   x-axis: min=${sc.x?.min}, max=${sc.x?.max}`);
    // console.log(`[KC-CHART]   y-axis: min=${sc.y?.min}, max=${sc.y?.max}`);
  }

  // console.log(`[KC-CHART] axis ranges before new Chart(): x=${JSON.stringify(config.options?.scales?.x && {min: config.options.scales.x.min, max: config.options.scales.x.max})}, y=${JSON.stringify(config.options?.scales?.y && {min: config.options.scales.y.min, max: config.options.scales.y.max})}`);

  // 8. Create chart
  // console.log(`[KC-CHART]   calling new Chart()...`);
  try {
    _charts[key] = new Chart(canvas.getContext('2d'), config);
    // console.log(`[KC-CHART]   new Chart() succeeded for key="${key}"`);
  } catch(e) {
    console.error(`[KC-CHART]   new Chart() THREW:`, e);
  }
}

// ── Stress helpers ────────────────────────────────────────────
function corrStress(F, Kw, D, d) {
  if (F == null || Kw == null || D == null || d == null) return null;
  return Kw * (8 * F * D) / (Math.PI * Math.pow(d, 3));
}
function uncorrStress(F, D, d) {
  if (F == null || D == null || d == null) return null;
  return (8 * F * D) / (Math.PI * Math.pow(d, 3));
}

function stressThresholds(mts, preset, peened) {
  if (!mts) return { warn: null, err: null, preset: null };
  const warnPct   = preset ? (peened ? 0.50 : 0.45) : (peened ? 0.36 : 0.30);
  const errPct    = preset ? (peened ? 0.72 : 0.67) : 0.45;
  const presetPct = 0.45;
  return {
    warn:   mts * warnPct,
    err:    mts * errPct,
    preset: mts * presetPct,
  };
}

function stressToLoad(stressPsi, mts, Kw, d, D) {
  if (!stressPsi || !Kw || !d || !D) return null;
  return (stressPsi * Math.PI * Math.pow(d, 3)) / (8 * D * Kw);
}


// ============================================================
// MASTER UPDATE
// ============================================================

function updateAllCharts(p) {
  if (!window.Chart) return;
  if (!p || !p.k || !p.Lf || !p.defS || p.defS <= 0) return;
  if (!p.d || !p.D) return;

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
    _chartLoadVsDeflection,
    _chartLoadVsLength,
    _chartPctMTSvsDeflection,
    _chartStressVsLength,
    _chartFatigueStrength,
    _chartStressVsLoad,
  ];

  const fn = chartFns[activeN];
  if (fn) fn(p);
}


// ============================================================
// 1. LOAD vs. DEFLECTION
// ============================================================
function _chartLoadVsDeflection(p) {
  // console.log('[KC-CHART] _chartLoadVsDeflection(): building datasets');
  const { k, defS, F1, F2, Fs, def1, def2, F1tol, F2tol, hasL1, hasL2 } = p;

  const STEPS = 50;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defS / STEPS) * i;
    line.push({ x: def, y: k * def });
  }
  // console.log(`[KC-CHART]   main line: ${line.length} points, first=${JSON.stringify(line[0])}, last=${JSON.stringify(line[line.length-1])}`);

  const allX = [0, defS];
  const allY = [0, k * defS];
  if (hasL1 && def1 != null) { allX.push(def1); if (F1 != null) allY.push(F1); }
  if (hasL2 && def2 != null) { allX.push(def2); if (F2 != null) allY.push(F2); }
  if (Fs != null) allY.push(Fs);

  const hasTol1 = hasL1 && F1tol != null && F1tol > 0;
  const hasTol2 = hasL2 && F2tol != null && F2tol > 0;
  if (hasTol1 && F1 != null) { allY.push(F1 + F1tol, F1 - F1tol); }
  if (hasTol2 && F2 != null) { allY.push(F2 + F2tol, F2 - F2tol); }

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);
  // console.log(`[KC-CHART]   axes: x=${JSON.stringify(xR)}, y=${JSON.stringify(yR)}`);

  const datasets = [
    lineDs('Load', line, KC.blue),
    annotDs('15% deflection', vLineData(defS * 0.15, yR.min, yR.max), KC.grey),
    annotDs('85% deflection', vLineData(defS * 0.85, yR.min, yR.max), KC.grey),
  ];

  if (hasTol1 && def1 != null && F1 != null) {
    datasets.push(...tolBandDs(line, F1tol, KC.green, 'L1'));
  }
  if (hasTol2 && def2 != null && F2 != null) {
    datasets.push(...tolBandDs(line, F2tol, KC.orange, 'L2'));
  }

  if (hasL1 && def1 != null && F1 != null)
    datasets.push(pointDs('L1', [{ x: def1, y: F1 }], KC.green));
  if (hasL2 && def2 != null && F2 != null)
    datasets.push(pointDs('L2', [{ x: def2, y: F2 }], KC.orange));
  if (Fs != null)
    datasets.push(pointDs('At Solid', [{ x: defS, y: Fs }], KC.red, { pointStyle: 'rectRot' }));

  rebuildChart('loadVsDeflection', 'chartLoadVsDeflection', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Deflection (in)', 'Load (lb)', xR, yR),
  });
}


// ============================================================
// 2. LOAD vs. LENGTH
// ============================================================
function _chartLoadVsLength(p) {
  // console.log('[KC-CHART] _chartLoadVsLength(): building datasets');
  const { k, Lf, Ls_final, defS, F1, L1, F2, L2, Fs,
          F1tol, F2tol, hasL1, hasL2, mts, Kw, d, D, preset, peened } = p;

  const STEPS = 50;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const length = Lf - (defS / STEPS) * i;
    line.push({ x: length, y: k * (Lf - length) });
  }
  // console.log(`[KC-CHART]   main line: ${line.length} points`);

  const allX = [Ls_final ?? (Lf - defS), Lf];
  const allY = [0, k * defS];
  if (hasL1 && L1 != null) { allX.push(L1); if (F1 != null) allY.push(F1); }
  if (hasL2 && L2 != null) { allX.push(L2); if (F2 != null) allY.push(F2); }
  if (Fs != null) allY.push(Fs);

  const hasTol1 = hasL1 && F1tol != null && F1tol > 0;
  const hasTol2 = hasL2 && F2tol != null && F2tol > 0;
  if (hasTol1 && F1 != null) allY.push(F1 + F1tol, F1 - F1tol);
  if (hasTol2 && F2 != null) allY.push(F2 + F2tol, F2 - F2tol);

  const thresh = stressThresholds(mts, preset, peened);
  let warnF = null, errF = null, presetReqF = null;
  if (mts && Kw && d && D) {
    warnF      = stressToLoad(thresh.warn,   mts, Kw, d, D);
    errF       = stressToLoad(thresh.err,    mts, Kw, d, D);
    presetReqF = stressToLoad(thresh.preset, mts, Kw, d, D);
    if (warnF)      allY.push(warnF);
    if (errF)       allY.push(errF);
    if (presetReqF) allY.push(presetReqF);
  }

  const validX = allX.filter(v => Number.isFinite(v));
  const xMin   = Math.min(...validX);
  const xMax   = Math.max(...validX);
  const xPad   = (xMax - xMin) * 0.08 || 0.1;
  const xR     = { min: xMin - xPad, max: xMax + xPad };
  const yR     = smartAxis(allY, true);
  // console.log(`[KC-CHART]   axes: x=${JSON.stringify(xR)}, y=${JSON.stringify(yR)}`);

  const datasets = [
    lineDs('Load vs. Length', line, KC.blue),
    annotDs('85% deflection', vLineData(Lf - defS * 0.15, yR.min, yR.max), KC.grey),
    annotDs('15% deflection', vLineData(Lf - defS * 0.85, yR.min, yR.max), KC.grey),
  ];

  if (errF       != null) datasets.push(annotDs('Stress limit',      hLineData(errF,       xR.min, xR.max), KC.err));
  if (warnF      != null) datasets.push(annotDs('Warn threshold',     hLineData(warnF,      xR.min, xR.max), KC.warn));
  if (presetReqF != null && !preset)
    datasets.push(annotDs('Preset required', hLineData(presetReqF, xR.min, xR.max), KC.presetClr, [8, 4]));

  if (hasTol1 && L1 != null && F1 != null)
    datasets.push(...tolBandDs(line, F1tol, KC.green, 'L1'));
  if (hasTol2 && L2 != null && F2 != null)
    datasets.push(...tolBandDs(line, F2tol, KC.orange, 'L2'));

  if (hasL1 && L1 != null && F1 != null)
    datasets.push(pointDs('L1', [{ x: L1, y: F1 }], KC.green));
  if (hasL2 && L2 != null && F2 != null)
    datasets.push(pointDs('L2', [{ x: L2, y: F2 }], KC.orange));
  if (Fs != null && Ls_final != null)
    datasets.push(pointDs('At Solid', [{ x: Ls_final, y: Fs }], KC.red, { pointStyle: 'rectRot' }));

  rebuildChart('loadVsLength', 'chartLoadVsLength', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Length (in)', 'Load (lb)', xR, yR, { xExtra: { reverse: true } }),
  });
}


// ============================================================
// 3. % MTS vs. DEFLECTION
// ============================================================
function _chartPctMTSvsDeflection(p) {
  // console.log('[KC-CHART] _chartPctMTSvsDeflection(): building datasets');
  const { k, defS, mts, Kw, d, D, hasL1, hasL2, def1, def2, F1, F2, F1tol, F2tol, Fs, preset, peened } = p;

  if (!mts || !Kw || !d || !D) {
    console.warn(`[KC-CHART]   SKIP — missing mts=${mts}, Kw=${Kw}, d=${d}, D=${D}`);
    return;
  }

  const STEPS = 60;
  const line  = [];
  for (let i = 0; i <= STEPS; i++) {
    const def = (defS / STEPS) * i;
    const pct = corrStress(k * def, Kw, D, d) / mts * 100;
    if (pct != null) line.push({ x: def, y: pct });
  }
  // console.log(`[KC-CHART]   line: ${line.length} points`);

  const warnPct = preset ? (peened ? 50 : 45) : (peened ? 36 : 30);
  const errPct  = preset ? (peened ? 72 : 67) : 45;

  const allX = [0, defS];
  const allY = line.map(pt => pt.y).concat([warnPct, errPct]);
  if (hasL1 && def1 != null) allX.push(def1);
  if (hasL2 && def2 != null) allX.push(def2);

  const hasTol1 = hasL1 && F1tol != null && F1tol > 0 && F1 != null;
  const hasTol2 = hasL2 && F2tol != null && F2tol > 0 && F2 != null;
  if (hasTol1) {
    const pctHi = corrStress(F1 + F1tol, Kw, D, d) / mts * 100;
    const pctLo = corrStress(F1 - F1tol, Kw, D, d) / mts * 100;
    if (pctHi != null) allY.push(pctHi);
    if (pctLo != null) allY.push(pctLo);
  }
  if (hasTol2) {
    const pctHi = corrStress(F2 + F2tol, Kw, D, d) / mts * 100;
    const pctLo = corrStress(F2 - F2tol, Kw, D, d) / mts * 100;
    if (pctHi != null) allY.push(pctHi);
    if (pctLo != null) allY.push(pctLo);
  }

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);
  // console.log(`[KC-CHART]   axes: x=${JSON.stringify(xR)}, y=${JSON.stringify(yR)}`);

  function tolPctLine(tol) {
    return line.map(pt => {
      const F   = pt.x * k;
      const pct = corrStress(F + tol, Kw, D, d) / mts * 100;
      return { x: pt.x, y: pct ?? pt.y };
    });
  }

  const datasets = [
    lineDs('% Corrected MTS', line, KC.blue),
    annotDs(`Warn (${warnPct}%)`, hLineData(warnPct, xR.min, xR.max), KC.warn),
    annotDs(`Limit (${errPct}%)`, hLineData(errPct,  xR.min, xR.max), KC.err),
  ];

  if (hasTol1) {
    datasets.push(tolDs('L1 +tol', tolPctLine( F1tol), KC.green));
    datasets.push(tolDs('L1 −tol', tolPctLine(-F1tol), KC.green));
  }
  if (hasTol2) {
    datasets.push(tolDs('L2 +tol', tolPctLine( F2tol), KC.orange));
    datasets.push(tolDs('L2 −tol', tolPctLine(-F2tol), KC.orange));
  }

  if (hasL1 && def1 != null && F1 != null) {
    const pct = corrStress(F1, Kw, D, d) / mts * 100;
    if (pct != null) datasets.push(pointDs('L1', [{ x: def1, y: pct }], KC.green));
  }
  if (hasL2 && def2 != null && F2 != null) {
    const pct = corrStress(F2, Kw, D, d) / mts * 100;
    if (pct != null) datasets.push(pointDs('L2', [{ x: def2, y: pct }], KC.orange));
  }
  if (Fs != null) {
    const pct = corrStress(Fs, Kw, D, d) / mts * 100;
    if (pct != null) datasets.push(pointDs('At Solid', [{ x: defS, y: pct }], KC.red, { pointStyle: 'rectRot' }));
  }

  rebuildChart('pctMTSvsDeflection', 'chartPctMTSvsDeflection', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Deflection (in)', '% of MTS', xR, yR),
  });
}


// ============================================================
// 4. STRESS vs. LENGTH  (units: ksi)
// ============================================================
function _chartStressVsLength(p) {
  // console.log('[KC-CHART] _chartStressVsLength(): building datasets');
  const { k, Lf, Ls_final, defS, mts, Kw, d, D,
          hasL1, hasL2, L1, L2, F1, F2, F1tol, F2tol, Fs, preset, peened } = p;

  if (!Kw || !d || !D) {
    console.warn(`[KC-CHART]   SKIP — missing Kw=${Kw}, d=${d}, D=${D}`);
    return;
  }

  const PSI_TO_KSI = 1 / 1000;
  const STEPS    = 60;
  const corrLine = [], uncorrLine = [];
  for (let i = 0; i <= STEPS; i++) {
    const length = Lf - (defS / STEPS) * i;
    const F      = k * (Lf - length);
    const cs     = corrStress(F, Kw, D, d);
    const us     = uncorrStress(F, D, d);
    if (cs != null) corrLine.push({ x: length, y: cs * PSI_TO_KSI });
    if (us != null) uncorrLine.push({ x: length, y: us * PSI_TO_KSI });
  }
  // console.log(`[KC-CHART]   corrLine: ${corrLine.length} pts, uncorrLine: ${uncorrLine.length} pts`);

  const allX = [Ls_final ?? (Lf - defS), Lf];
  const allY = corrLine.map(pt => pt.y);
  if (hasL1 && L1 != null) allX.push(L1);
  if (hasL2 && L2 != null) allX.push(L2);

  const thresh = stressThresholds(mts, preset, peened);
  const warnKsi      = thresh.warn   ? thresh.warn   * PSI_TO_KSI : null;
  const errKsi       = thresh.err    ? thresh.err    * PSI_TO_KSI : null;
  const presetReqKsi = thresh.preset ? thresh.preset * PSI_TO_KSI : null;

  if (warnKsi)      allY.push(warnKsi);
  if (errKsi)       allY.push(errKsi);
  if (presetReqKsi) allY.push(presetReqKsi);

  const hasTol1 = hasL1 && F1tol != null && F1tol > 0 && F1 != null;
  const hasTol2 = hasL2 && F2tol != null && F2tol > 0 && F2 != null;

  function corrLineTolShift(tol) {
    return corrLine.map((pt, i) => {
      const length = Lf - (defS / STEPS) * i;
      const F      = k * (Lf - length) + tol;
      const cs     = corrStress(F, Kw, D, d);
      return { x: pt.x, y: cs != null ? cs * PSI_TO_KSI : pt.y };
    });
  }

  if (hasTol1) {
    const hiKsi = corrStress(F1 + F1tol, Kw, D, d) * PSI_TO_KSI;
    const loKsi = corrStress(F1 - F1tol, Kw, D, d) * PSI_TO_KSI;
    allY.push(hiKsi, loKsi);
  }
  if (hasTol2) {
    const hiKsi = corrStress(F2 + F2tol, Kw, D, d) * PSI_TO_KSI;
    const loKsi = corrStress(F2 - F2tol, Kw, D, d) * PSI_TO_KSI;
    allY.push(hiKsi, loKsi);
  }

  const validX = allX.filter(v => Number.isFinite(v));
  const xMin   = Math.min(...validX);
  const xMax   = Math.max(...validX);
  const xPad   = (xMax - xMin) * 0.08 || 0.1;
  const xR     = { min: xMin - xPad, max: xMax + xPad };
  const yR     = smartAxis(allY, true);
  // console.log(`[KC-CHART]   axes: x=${JSON.stringify(xR)}, y=${JSON.stringify(yR)}`);

  const datasets = [
    lineDs('Corrected Stress',   corrLine,   KC.blue),
    lineDs('Uncorrected Stress', uncorrLine, KC.teal, { borderDash: [4, 3] }),
  ];

  if (errKsi       != null) datasets.push(annotDs(`Limit (${errKsi.toFixed(1)} ksi)`,       hLineData(errKsi,       xR.min, xR.max), KC.err));
  if (warnKsi      != null) datasets.push(annotDs(`Warn (${warnKsi.toFixed(1)} ksi)`,        hLineData(warnKsi,      xR.min, xR.max), KC.warn));
  if (presetReqKsi != null && !preset)
    datasets.push(annotDs(`Preset required (${presetReqKsi.toFixed(1)} ksi)`, hLineData(presetReqKsi, xR.min, xR.max), KC.presetClr, [8, 4]));

  if (hasTol1) {
    datasets.push(tolDs('L1 stress +tol', corrLineTolShift( F1tol), KC.green));
    datasets.push(tolDs('L1 stress −tol', corrLineTolShift(-F1tol), KC.green));
  }
  if (hasTol2) {
    datasets.push(tolDs('L2 stress +tol', corrLineTolShift( F2tol), KC.orange));
    datasets.push(tolDs('L2 stress −tol', corrLineTolShift(-F2tol), KC.orange));
  }

  if (hasL1 && L1 != null && F1 != null) {
    const cs = corrStress(F1, Kw, D, d);
    if (cs != null) datasets.push(pointDs('L1', [{ x: L1, y: cs * PSI_TO_KSI }], KC.green));
  }
  if (hasL2 && L2 != null && F2 != null) {
    const cs = corrStress(F2, Kw, D, d);
    if (cs != null) datasets.push(pointDs('L2', [{ x: L2, y: cs * PSI_TO_KSI }], KC.orange));
  }
  if (Fs != null && Ls_final != null) {
    const cs = corrStress(Fs, Kw, D, d);
    if (cs != null) datasets.push(pointDs('At Solid', [{ x: Ls_final, y: cs * PSI_TO_KSI }], KC.red, { pointStyle: 'rectRot' }));
  }

  const opts = makeOpts('Length (in)', 'Torsional Stress (ksi)', xR, yR, { xExtra: { reverse: true } });
  opts.scales.y.ticks.callback = v => Number(v).toFixed(2);

  rebuildChart('stressVsLength', 'chartStressVsLength', {
    type: 'scatter',
    data: { datasets },
    options: opts,
  });
}


// ============================================================
// 5. FATIGUE STRENGTH DIAGRAM (Modified Goodman)
// ============================================================
function _chartFatigueStrength(p) {
  // console.log('[KC-CHART] _chartFatigueStrength(): building datasets');
  const { mts, Kw, d, D, hasL1, hasL2, F1, F2, F1tol, F2tol, peened, preset } = p;

  if (!mts || !Kw || !d || !D) {
    console.warn(`[KC-CHART]   SKIP — missing mts=${mts}, Kw=${Kw}, d=${d}, D=${D}`);
    return;
  }

  const Se_up  = [0.36, 0.33, 0.30];
  const Se_pe  = [0.42, 0.39, 0.36];
  const labels  = ['10⁵ cycles', '10⁶ cycles', '10⁷ cycles'];
  const lColors = [KC.err, KC.darkTeal, KC.green];

  const staticLimitPct = preset ? 0.67 : 0.45;
  const convergX = staticLimitPct;
  const convergY = staticLimitPct;

  const datasets = [];

  for (let i = 0; i < 3; i++) {
    const Se = (peened ? Se_pe : Se_up)[i];
    datasets.push({
      label: labels[i],
      data: [{ x: 0, y: Se }, { x: convergX, y: convergY }],
      borderColor: lColors[i],
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      showLine: true,
      parsing: false,
    });
  }

  datasets.push({
    label: `Static limit (${Math.round(staticLimitPct * 100)}% MTS)`,
    data: [{ x: 0, y: staticLimitPct }, { x: convergX, y: staticLimitPct }],
    borderColor: KC.blue,
    fill: false,
    pointRadius: 0,
    borderWidth: 1.5,
    showLine: true,
    parsing: false,
  });

  datasets.push({
    label: 'τ_max = τ_min',
    data: [{ x: 0, y: 0 }, { x: convergX, y: convergY }],
    borderColor: KC.blue,
    fill: false,
    pointRadius: 0,
    borderDash: [6, 4],
    borderWidth: 1,
    showLine: true,
    parsing: false,
  });

  let tau_min_n = 0, tau_max_n = 0;
  if (hasL1 && hasL2 && F1 != null && F2 != null) {
    const s1 = corrStress(F1, Kw, D, d) / mts;
    const s2 = corrStress(F2, Kw, D, d) / mts;
    tau_min_n = Math.min(s1, s2);
    tau_max_n = Math.max(s1, s2);
  } else if (hasL1 && F1 != null) {
    tau_max_n = corrStress(F1, Kw, D, d) / mts;
  } else if (hasL2 && F2 != null) {
    tau_max_n = corrStress(F2, Kw, D, d) / mts;
  }

  // console.log(`[KC-CHART]   operating point: tau_min=${tau_min_n}, tau_max=${tau_max_n}`);

  if (tau_max_n > 0) {
    datasets.push({
      label: 'Operating point',
      data: [{ x: tau_min_n, y: tau_max_n }],
      borderColor: KC.darkTeal,
      backgroundColor: 'transparent',
      pointRadius: 9,
      pointStyle: 'circle',
      borderWidth: 1.5,
      showLine: false,
      parsing: false,
    });
    datasets.push({
      label: '_inner',
      data: [{ x: tau_min_n, y: tau_max_n }],
      borderColor: KC.darkTeal,
      backgroundColor: KC.darkTeal,
      pointRadius: 3,
      pointStyle: 'circle',
      borderWidth: 1,
      showLine: false,
      parsing: false,
    });
  }

  const opts = makeOpts(
    'Initial Stress / Tensile Strength Ratio',
    'Max. Stress/Tensile Strength',
    { min: 0, max: 0.80 },
    { min: 0.10, max: 0.70 }
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
// 6. STRESS vs. LOAD
// ============================================================
function _chartStressVsLoad(p) {
  // console.log('[KC-CHART] _chartStressVsLoad(): building datasets');
  const { k, defS, mts, Kw, d, D, hasL1, hasL2, F1, F2, F1tol, F2tol, Fs, preset, peened } = p;

  if (!Kw || !d || !D) {
    console.warn(`[KC-CHART]   SKIP — missing Kw=${Kw}, d=${d}, D=${D}`);
    return;
  }

  const Fmax     = k * defS;
  const STEPS    = 60;
  const corrLine = [], uncorrLine = [];
  for (let i = 0; i <= STEPS; i++) {
    const F  = (Fmax / STEPS) * i;
    const cs = corrStress(F, Kw, D, d);
    const us = uncorrStress(F, D, d);
    if (cs != null) corrLine.push({ x: F, y: cs });
    if (us != null) uncorrLine.push({ x: F, y: us });
  }
  // console.log(`[KC-CHART]   corrLine: ${corrLine.length} pts, Fmax=${Fmax}`);

  const allX = [0, Fmax];
  const allY = corrLine.map(pt => pt.y);
  if (hasL1 && F1 != null) allX.push(F1);
  if (hasL2 && F2 != null) allX.push(F2);
  if (Fs != null)           allX.push(Fs);

  const hasTol1 = hasL1 && F1tol != null && F1tol > 0 && F1 != null;
  const hasTol2 = hasL2 && F2tol != null && F2tol > 0 && F2 != null;
  if (hasTol1) allX.push(F1 + F1tol, F1 - F1tol);
  if (hasTol2) allX.push(F2 + F2tol, F2 - F2tol);

  const thresh = stressThresholds(mts, preset, peened);
  if (thresh.warn)   allY.push(thresh.warn);
  if (thresh.err)    allY.push(thresh.err);
  if (thresh.preset) allY.push(thresh.preset);

  const xR = smartAxis(allX, true);
  const yR = smartAxis(allY, true);
  // console.log(`[KC-CHART]   axes: x=${JSON.stringify(xR)}, y=${JSON.stringify(yR)}`);

  const datasets = [
    lineDs('Corrected Stress',   corrLine,   KC.blue),
    lineDs('Uncorrected Stress', uncorrLine, KC.teal, { borderDash: [4, 3] }),
  ];

  if (thresh.err)    datasets.push(annotDs(`Limit (${Math.round(thresh.err).toLocaleString()} psi)`,    hLineData(thresh.err,    xR.min, xR.max), KC.err));
  if (thresh.warn)   datasets.push(annotDs(`Warn (${Math.round(thresh.warn).toLocaleString()} psi)`,    hLineData(thresh.warn,   xR.min, xR.max), KC.warn));
  if (thresh.preset && !preset)
    datasets.push(annotDs(`Preset required (${Math.round(thresh.preset).toLocaleString()} psi)`, hLineData(thresh.preset, xR.min, xR.max), KC.presetClr, [8, 4]));

  if (hasTol1) {
    const csHi = corrStress(F1 + F1tol, Kw, D, d);
    const csLo = corrStress(F1 - F1tol, Kw, D, d);
    datasets.push(tolDs('L1 +tol', vLineData(F1 + F1tol, yR.min, csHi ?? yR.max), KC.green));
    datasets.push(tolDs('L1 −tol', vLineData(F1 - F1tol, yR.min, csLo ?? yR.max), KC.green));
  }
  if (hasTol2) {
    const csHi = corrStress(F2 + F2tol, Kw, D, d);
    const csLo = corrStress(F2 - F2tol, Kw, D, d);
    datasets.push(tolDs('L2 +tol', vLineData(F2 + F2tol, yR.min, csHi ?? yR.max), KC.orange));
    datasets.push(tolDs('L2 −tol', vLineData(F2 - F2tol, yR.min, csLo ?? yR.max), KC.orange));
  }

  if (hasL1 && F1 != null) {
    const cs = corrStress(F1, Kw, D, d);
    if (cs != null) datasets.push(pointDs('L1', [{ x: F1, y: cs }], KC.green));
  }
  if (hasL2 && F2 != null) {
    const cs = corrStress(F2, Kw, D, d);
    if (cs != null) datasets.push(pointDs('L2', [{ x: F2, y: cs }], KC.orange));
  }
  if (Fs != null) {
    const cs = corrStress(Fs, Kw, D, d);
    if (cs != null) datasets.push(pointDs('At Solid', [{ x: Fs, y: cs }], KC.red, { pointStyle: 'rectRot' }));
  }

  rebuildChart('stressVsLoad', 'chartStressVsLoad', {
    type: 'scatter',
    data: { datasets },
    options: makeOpts('Load (lb)', 'Torsional Stress (psi)', xR, yR),
  });
}


// ── Expose for tab-switch re-rendering ────────────────────────
window.updateAllCharts          = updateAllCharts;
window._chartLoadVsDeflection   = _chartLoadVsDeflection;
window._chartLoadVsLength       = _chartLoadVsLength;
window._chartPctMTSvsDeflection = _chartPctMTSvsDeflection;
window._chartStressVsLength     = _chartStressVsLength;
window._chartFatigueStrength    = _chartFatigueStrength;
window._chartStressVsLoad       = _chartStressVsLoad;

// console.log('[KC-CHART] springCharts.js: finished, window.updateAllCharts =', typeof window.updateAllCharts);