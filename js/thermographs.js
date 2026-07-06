/**
 * thermographs.js  —  v1.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Live property charts and property tables for ThermoDynamicsLand.html.
 * Powered by Chart.js 4 and window.ThermoCalc (thermodynamicsland.js).
 *
 * Charts
 * ──────
 *  chartPropVsT     —  Property vs Temperature (11-pt T-sweep at fixed P, linear)
 *  chartPropVsP     —  Property vs Pressure    (11-pt P-sweep at fixed T, log P)
 *  chartPhaseDiagram — Saturation envelope + critical point in T–P space (scatter)
 *                       • Blue line  : full saturation curve (T_sat vs P_sat)
 *                       • Red star   : critical point  (T_c, P_c) from meta
 *                       • Orange dot : current operating state (T_K, P_Pa)
 *                       Y axis is logarithmic (pressure spans many decades);
 *                       falls back to linear if display P values go ≤ 0 (e.g. psig).
 *
 *  Chart height fix: canvases live inside position:relative / fixed-height
 *  wrapper divs in the HTML.  responsive:true + maintainAspectRatio:false then
 *  sizes the canvas to exactly that div — no runaway growth.
 *
 * Tables
 * ──────
 *  tblSatByTBody  —  Saturation properties centred on current P (11 rows)
 *  tblSatByPBody  —  Same data, Psat-first column order
 *  tblGridBody    —  T-sweep rows (fixed P) + P-sweep rows (fixed T)
 *
 * Public API
 * ──────────
 *  ThermoGraphs.update(fluid, T_K, P_Pa, props)  — call after every runCalc()
 *  ThermoGraphs.repopulate()                      — call on unit change (no fetch)
 *  ThermoGraphs.clear()                           — blank charts + reset tables
 */
'use strict';

window.ThermoGraphs = (function () {

  // ── Property registry ────────────────────────────────────────────────────────
  // Y-axis (charts) and property-column values are always in SI.
  // T and P axes (charts) are converted to the current display unit from DOM.

  var PROPS = [
    { key: 'rho',     label: 'Density ρ',              unitSI: 'kg/m³' },
    { key: 'h',       label: 'Sp. Enthalpy h',              unitSI: 'J/kg'       },
    { key: 'u',       label: 'Sp. Int. Energy u',           unitSI: 'J/kg'       },
    { key: 's',       label: 'Sp. Entropy s',               unitSI: 'J/(kg·K)' },
    { key: 'cp',      label: 'Sp. Heat cᵖ',            unitSI: 'J/(kg·K)' },
    { key: 'cv',      label: 'Sp. Heat cᵥ',            unitSI: 'J/(kg·K)' },
    { key: 'visc',    label: 'Dyn. Viscosity μ',       unitSI: 'Pa·s'  },
    { key: 'cond',    label: 'Thermal Cond. λ',        unitSI: 'W/(m·K)' },
    { key: 'prandtl', label: 'Prandtl Pr',                  unitSI: '—'     },
    { key: 'v',       label: 'Sp. Volume v',                unitSI: 'm³/kg' },
    { key: 'nu',      label: 'Kin. Viscosity ν',       unitSI: 'm²/s'  },
    { key: 'alpha',   label: 'Thermal Diff. α',        unitSI: 'm²/s'  }
  ];

  var DEFAULT_PROP  = 'h';
  var N_SWEEP       = 11;    // 5 before + current point + 5 after
  var N_SAT_ROWS    = 11;    // 5 before + nearest sat point + 5 after

  // Phase name / badge color (mirrors thermodynamicsland.js)
  var _PHASE_NAMES = {
    0: 'Liquid (subcooled)', 1: 'Gas / SC vapor',
    2: 'Two-phase',          3: 'SC liquid',
    4: 'SC gas',             255: 'Failed'
  };
  var _PHASE_BG = {
    0: '#cce5ff', 1: '#d4edda', 2: '#fff3cd',
    3: '#d1ecf1', 4: '#e2d9f3', 255: '#f8d7da'
  };
  var _PHASE_FG = {
    0: '#004085', 1: '#155724', 2: '#856404',
    3: '#0c5460', 4: '#4a235a', 255: '#721c24'
  };

  // ── Module state ─────────────────────────────────────────────────────────────

  var _chartT         = null;
  var _chartP         = null;
  var _chartPhase     = null;   // Phase diagram: sat. envelope in T–P space

  // Print-shadow charts — live in #thermoGraphsPrint (position:fixed;left:-9999px)
  // so they always have real pixel dimensions regardless of which tab is active.
  var _chartT_p       = null;
  var _chartP_p       = null;
  var _chartPhase_p   = null;
  var _propKeyT       = DEFAULT_PROP;
  var _propKeyP       = DEFAULT_PROP;
  var _sweepTData     = null;   // Array<{ T_K,  props }> — N_SWEEP results
  var _sweepPData     = null;   // Array<{ P_Pa, props }> — N_SWEEP results
  var _currentProps   = null;   // result for exact (T_K, P_Pa) point
  var _satRows        = null;   // full saturation curve rows (cached for repopulate)
  var _meta           = null;   // fluid meta (critical_point, valid_range, …)
  var _lastFluid      = null;
  var _lastT_K        = null;
  var _lastP_Pa       = null;

  // ── Math helpers ─────────────────────────────────────────────────────────────
  // (_linspace / _logspace removed — T-sweep now reads all grid rows via getTColumn)

  // ── Property extraction ──────────────────────────────────────────────────────

  function _extract(props, key) {
    if (!props || props.phase === 255) return NaN;
    if (key === 'v')     return (props.rho > 0) ? 1.0 / props.rho : NaN;
    if (key === 'nu')    return (props.rho > 0) ? props.visc / props.rho : NaN;
    if (key === 'alpha') return (props.rho > 0 && props.cp > 0)
                                ? props.cond / (props.rho * props.cp) : NaN;
    var v = props[key];
    return (v !== undefined && isFinite(v)) ? v : NaN;
  }

  function _propInfo(key) {
    for (var i = 0; i < PROPS.length; i++) {
      if (PROPS[i].key === key) return PROPS[i];
    }
    return PROPS[1];
  }

  // ── T / P axis unit conversion (for charts only) ─────────────────────────────

  var _CONV_T = {
    'K'  : function(k) { return k; },
    '°C': function(k) { return k - 273.15; },
    'C'  : function(k) { return k - 273.15; },
    '°F': function(k) { return (k - 273.15) * 1.8 + 32; },
    'F'  : function(k) { return (k - 273.15) * 1.8 + 32; },
    '°R': function(k) { return k * 1.8; },
    'R'  : function(k) { return k * 1.8; }
  };
  var _CONV_P = {
    'Pa'     : function(p) { return p; },
    'kPa'    : function(p) { return p * 1e-3; },
    'MPa'    : function(p) { return p * 1e-6; },
    'bar'    : function(p) { return p * 1e-5; },
    'mbar'   : function(p) { return p * 0.01; },
    'psia'   : function(p) { return p / 6894.757293168; },
    'psig'   : function(p) { return p / 6894.757293168 - 14.6959488; },
    'atm'    : function(p) { return p / 101325; },
    'mmHg'   : function(p) { return p / 133.32239; },
    'inHg'   : function(p) { return p / 3386.389; },
    'inH₂O': function(p) { return p / 249.089; },
    'inH2O'  : function(p) { return p / 249.089; }
  };

  function _tUnit() {
    var el = document.getElementById('calcTUnit');
    return el ? el.textContent.trim() : 'K';
  }
  function _pUnit() {
    var el = document.getElementById('calcPUnit');
    return el ? el.textContent.trim() : 'Pa';
  }
  function _toDispT(T_K)  { var f = _CONV_T[_tUnit()]; return f ? f(T_K)  : T_K;  }
  function _toDispP(P_Pa) { var f = _CONV_P[_pUnit()]; return f ? f(P_Pa) : P_Pa; }

  // ── Number formatter ─────────────────────────────────────────────────────────

  function _fmt(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a < 1e-8 || a >= 1e10) return v.toPrecision(4);
    if (a < 1e-4) return v.toExponential(3);
    if (a < 1)    return v.toFixed(6);
    if (a < 100)  return v.toFixed(4);
    if (a < 1e4)  return v.toFixed(2);
    if (a < 1e6)  return v.toFixed(1);
    return v.toFixed(0);
  }

  // Same but for table cells — slightly fewer decimals for readability
  function _fmtTbl(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a < 1e-7 || a >= 1e10) return v.toPrecision(4);
    if (a < 1e-4) return v.toExponential(3);
    if (a < 1)    return v.toFixed(5);
    if (a < 100)  return v.toFixed(3);
    if (a < 1e4)  return v.toFixed(1);
    if (a < 1e6)  return v.toFixed(0);
    return v.toExponential(3);
  }

  // ── Sweep point arrays ───────────────────────────────────────────────────────

  /**
   * Build N_SWEEP P values centred on P_Pa in log space.
   * Log-step = 1/10 of the fluid's full log-pressure range.
   * Points are clamped to [P_min, P_max].
   * Indices: -5 … 0 (current) … +5
   */
  function _buildPValues(meta, P_Pa) {
    var bands = meta.grid.pressure_bands;
    var P_min = Math.max(bands[0].p_min, 1);
    var P_max = bands[bands.length - 1].p_max;
    if (P_max <= P_min) P_max = P_min * 1000;
    var lMin  = Math.log10(P_min);
    var lMax  = Math.log10(P_max);
    var lStep = (lMax - lMin) / 10;
    var lP    = Math.log10(Math.max(P_min, Math.min(P_max, P_Pa)));
    var pts   = [];
    for (var i = -5; i <= 5; i++) {
      var lp = Math.max(lMin, Math.min(lMax, lP + i * lStep));
      pts.push(Math.pow(10, lp));
    }
    return pts;   // 11 values
  }

  // ── Chart.js helpers ─────────────────────────────────────────────────────────

  var _STYLE = {
    lineColor  : '#61828A',
    lineFill   : 'rgba(97,130,138,0.10)',
    markerColor: '#cc4400',
    markerFill : 'rgba(204,68,0,0.90)'
  };

  /**
   * @param {boolean} [dense]  true → pointRadius 0 (hundreds of pts; dots = blob)
   */
  function _makeDatasets(xArr, yArr, curX, curY, dense) {
    return [
      {
        label           : 'sweep',
        data            : xArr.map(function(x, i) {
          return { x: x, y: isFinite(yArr[i]) ? yArr[i] : null };
        }),
        borderColor     : _STYLE.lineColor,
        backgroundColor : _STYLE.lineFill,
        borderWidth     : 2,
        pointRadius     : dense ? 0 : 3,
        pointHoverRadius: dense ? 4 : 6,
        tension         : 0.1,
        spanGaps        : false,
        fill            : false,
        order           : 1
      },
      {
        label           : 'current',
        data            : (curX !== null && isFinite(curY))
                          ? [{ x: curX, y: curY }] : [],
        borderColor     : _STYLE.markerColor,
        backgroundColor : _STYLE.markerFill,
        pointRadius     : 8,
        pointHoverRadius: 10,
        pointStyle      : 'circle',
        showLine        : false,
        order           : 0
      }
    ];
  }

  function _makeOptions(xLabel, yLabel, xLog) {
    return {
      responsive         : true,
      maintainAspectRatio: false,   // canvas fills the fixed-height wrapper div
      interaction        : { mode: 'nearest', intersect: false },
      animation          : { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              return xLabel + ': ' + _fmt(items[0].parsed.x);
            },
            label: function(item) {
              var prefix = (item.datasetIndex === 1) ? '● Current' : 'Value';
              return prefix + ': ' + _fmt(item.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          type : xLog ? 'logarithmic' : 'linear',
          title: { display: true, text: xLabel, font: { size: 11 }, color: '#444' },
          ticks: { font: { size: 10 }, maxTicksLimit: 8 },
          grid : { color: 'rgba(0,0,0,0.07)' }
        },
        y: {
          title: { display: true, text: yLabel, font: { size: 11 }, color: '#444' },
          ticks: { font: { size: 10 } },
          grid : { color: 'rgba(0,0,0,0.07)' }
        }
      }
    };
  }

  function _createChart(canvasId, xLabel, yLabel, xLog) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('[ThermoGraphs] Chart.js or canvas "' + canvasId + '" not found.');
      return null;
    }
    return new Chart(canvas, {
      type   : 'line',
      data   : { datasets: [] },
      options: _makeOptions(xLabel, yLabel, xLog)
    });
  }

  // ── Phase diagram (Chart 3) ──────────────────────────────────────────────────

  function _makePhaseOptions() {
    return {
      responsive          : true,
      maintainAspectRatio : false,
      interaction         : { mode: 'nearest', intersect: false },
      animation           : { duration: 300 },
      plugins: {
        legend: {
          display : true,
          position: 'top',
          labels  : { font: { size: 10 }, boxWidth: 14, padding: 8, color: '#333' }
        },
        tooltip: {
          callbacks: {
            title: function(items) {
              return 'T: ' + _fmt(items[0].parsed.x) + ' [' + _tUnit() + ']';
            },
            label: function(item) {
              return (item.dataset.label || 'P') +
                     '  —  P: ' + _fmt(item.parsed.y) + ' [' + _pUnit() + ']';
            }
          }
        }
      },
      scales: {
        x: {
          type : 'linear',
          title: { display: true, text: 'T [K]', font: { size: 11 }, color: '#444' },
          ticks: { font: { size: 10 }, maxTicksLimit: 8 },
          grid : { color: 'rgba(0,0,0,0.07)' }
        },
        y: {
          type : 'logarithmic',
          title: { display: true, text: 'P [Pa]', font: { size: 11 }, color: '#444' },
          ticks: {
            font        : { size: 10 },
            maxTicksLimit: 8,
            callback    : function(v) { return _fmt(v); }
          },
          grid: { color: 'rgba(0,0,0,0.07)' }
        }
      }
    };
  }

  function _createPhaseChart(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('[ThermoGraphs] Chart.js or canvas "' + canvasId + '" not found.');
      return null;
    }
    return new Chart(canvas, {
      type   : 'scatter',
      data   : { datasets: [] },
      options: _makePhaseOptions()
    });
  }

  /**
   * Redraw the phase diagram using cached _satRows + _meta.
   * Safe to call whenever display units change (no network).
   */
  function _redrawPhase() {
    if (!_chartPhase || !_satRows || !_meta) return;

    var tUnit = _tUnit();
    var pUnit = _pUnit();

    // ── Dataset 1: saturation curve (T_sat vs P_sat, full curve) ────────────
    var satData = _satRows.map(function(r) {
      return { x: _toDispT(r.T), y: _toDispP(r.P) };
    });

    // ── Dataset 2: critical point ────────────────────────────────────────────
    var cp     = _meta.critical_point;
    var cpData = (cp && cp.T_K && cp.P_Pa)
      ? [{ x: _toDispT(cp.T_K), y: _toDispP(cp.P_Pa) }]
      : [];

    // ── Dataset 3: current operating point ──────────────────────────────────
    var curData = (_lastT_K !== null && _lastP_Pa !== null)
      ? [{ x: _toDispT(_lastT_K), y: _toDispP(_lastP_Pa) }]
      : [];

    // Fall back to linear Y if any display P ≤ 0 (e.g. psig near atmospheric)
    var allPs = satData.map(function(d) { return d.y; });
    if (cpData.length)  allPs.push(cpData[0].y);
    if (curData.length) allPs.push(curData[0].y);
    var useLogY = allPs.every(function(v) { return v > 0; });

    var phaseDatasets = [
      {
        label           : 'Saturation curve',
        data            : satData,
        showLine        : true,
        borderColor     : '#2166ac',
        backgroundColor : 'rgba(33,102,172,0.10)',
        borderWidth     : 2,
        pointRadius     : 0,
        pointHoverRadius: 5,
        tension         : 0.2,
        spanGaps        : false,
        fill            : false,
        order           : 2
      },
      {
        label           : 'Critical point',
        data            : cpData,
        showLine        : false,
        borderColor     : '#d73027',
        backgroundColor : '#d73027',
        pointRadius     : 10,
        pointHoverRadius: 13,
        pointStyle      : 'star',
        order           : 0
      },
      {
        label           : 'Current state',
        data            : curData,
        showLine        : false,
        borderColor     : _STYLE.markerColor,
        backgroundColor : _STYLE.markerFill,
        pointRadius     : 8,
        pointHoverRadius: 11,
        pointStyle      : 'circle',
        order           : 1
      }
    ];

    _chartPhase.data                        = { datasets: phaseDatasets };
    _chartPhase.options.scales.x.title.text = 'T [' + tUnit + ']';
    _chartPhase.options.scales.y.type       = useLogY ? 'logarithmic' : 'linear';
    _chartPhase.options.scales.y.title.text = 'P [' + pUnit + ']';
    _chartPhase.update('none');

    // ── keep print-shadow in sync ────────────────────────────────────────────
    if (_chartPhase_p) {
      _chartPhase_p.data                        = { datasets: phaseDatasets };
      _chartPhase_p.options.scales.x.title.text = 'T [' + tUnit + ']';
      _chartPhase_p.options.scales.y.type       = useLogY ? 'logarithmic' : 'linear';
      _chartPhase_p.options.scales.y.title.text = 'P [' + pUnit + ']';
      _chartPhase_p.update('none');
    }
  }

  // ── Toolbar injection (property selector above each chart) ───────────────────

  function _injectToolbar(panelId, selectId) {
    var panel = document.getElementById(panelId);
    if (!panel || document.getElementById(selectId)) return;

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;';

    var lbl = document.createElement('label');
    lbl.setAttribute('for', selectId);
    lbl.textContent = 'Property:';
    lbl.style.cssText = 'font-size:11px;color:#555;font-weight:600;' +
                        'font-family:"Roboto",Arial,sans-serif;white-space:nowrap;';

    var sel = document.createElement('select');
    sel.id = selectId;
    sel.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:5px;' +
                        'border:1.5px solid #434343;background:#d9d9d9;color:#000;' +
                        'font-family:"Roboto",Arial,sans-serif;height:22px;cursor:pointer;';

    PROPS.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.label;
      if (p.key === DEFAULT_PROP) opt.selected = true;
      sel.appendChild(opt);
    });

    bar.appendChild(lbl);
    bar.appendChild(sel);
    panel.insertBefore(bar, panel.firstChild);
  }

  // ── Chart redraw (uses cached sweep data — no network) ───────────────────────

  function _redrawT() {
    if (!_chartT || !_sweepTData) return;
    var info   = _propInfo(_propKeyT);
    var xArr   = _sweepTData.map(function(r) { return _toDispT(r.T_K); });
    var yArr   = _sweepTData.map(function(r) { return _extract(r.props, _propKeyT); });
    var curX   = (_lastT_K !== null) ? _toDispT(_lastT_K) : null;
    var curY   = _currentProps ? _extract(_currentProps, _propKeyT) : NaN;
    var yLabel = info.label + (info.unitSI !== '—' ? ' [' + info.unitSI + ']' : '');
    var tLabel = 'T [' + _tUnit() + ']';

    // dense=true: suppress point dots — hundreds of grid rows would render as a blob
    _chartT.data                        = { datasets: _makeDatasets(xArr, yArr, curX, curY, true) };
    _chartT.options.scales.x.title.text = tLabel;
    _chartT.options.scales.y.title.text = yLabel;
    _chartT.update('none');

    // ── keep print-shadow in sync ────────────────────────────────────────────
    if (_chartT_p) {
      _chartT_p.data                        = { datasets: _makeDatasets(xArr, yArr, curX, curY, true) };
      _chartT_p.options.scales.x.title.text = tLabel;
      _chartT_p.options.scales.y.title.text = yLabel;
      _chartT_p.update('none');
    }
  }

  function _redrawP() {
    if (!_chartP || !_sweepPData) return;
    var info   = _propInfo(_propKeyP);
    var dispPs = _sweepPData.map(function(r) { return _toDispP(r.P_Pa); });
    var yArr   = _sweepPData.map(function(r) { return _extract(r.props, _propKeyP); });
    var curX   = (_lastP_Pa !== null) ? _toDispP(_lastP_Pa) : null;
    var curY   = _currentProps ? _extract(_currentProps, _propKeyP) : NaN;
    var yLabel = info.label + (info.unitSI !== '—' ? ' [' + info.unitSI + ']' : '');
    var useLog = dispPs.every(function(v) { return v > 0; });
    var pLabel = 'P [' + _pUnit() + ']';

    _chartP.data                        = { datasets: _makeDatasets(dispPs, yArr, curX, curY) };
    _chartP.options.scales.x.type       = useLog ? 'logarithmic' : 'linear';
    _chartP.options.scales.x.title.text = pLabel;
    _chartP.options.scales.y.title.text = yLabel;
    _chartP.update('none');

    // ── keep print-shadow in sync ────────────────────────────────────────────
    if (_chartP_p) {
      _chartP_p.data                        = { datasets: _makeDatasets(dispPs, yArr, curX, curY) };
      _chartP_p.options.scales.x.type       = useLog ? 'logarithmic' : 'linear';
      _chartP_p.options.scales.x.title.text = pLabel;
      _chartP_p.options.scales.y.title.text = yLabel;
      _chartP_p.update('none');
    }
  }

  // ── Table helpers ────────────────────────────────────────────────────────────
  // Rely on the existing .lt CSS class for all basic td styling.

  function _td(text) {
    var cell = document.createElement('td');
    cell.textContent = text;
    return cell;
  }

  function _phaseTd(phase) {
    var cell = document.createElement('td');
    cell.style.textAlign = 'center';
    var span = document.createElement('span');
    var name = (_PHASE_NAMES[phase] !== undefined) ? _PHASE_NAMES[phase] : ('Phase ' + phase);
    span.textContent = name;
    span.style.cssText = 'background:'  + (_PHASE_BG[phase] || '#eee') + ';' +
                         'color:'       + (_PHASE_FG[phase] || '#333') + ';' +
                         'border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;' +
                         'white-space:nowrap;';
    cell.appendChild(span);
    return cell;
  }

  function _clearBody(tbodyId) {
    var el = document.getElementById(tbodyId);
    if (el) el.innerHTML = '';
    return el;
  }

  // ── Table 1 & 2: Saturation ──────────────────────────────────────────────────

  /**
   * Find the index in the saturation curve whose pressure is closest to P_Pa.
   * The saturation array is sorted by increasing T (hence increasing P).
   */
  function _findSatCenterIdx(satRows, P_Pa) {
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < satRows.length; i++) {
      var d = Math.abs(satRows[i].P - P_Pa);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  /**
   * Return N_SAT_ROWS rows centred on centerIdx (5 before + centre + 5 after),
   * clamped to the array bounds.
   */
  function _sampleSatRows(satRows, centerIdx) {
    var half  = Math.floor(N_SAT_ROWS / 2);          // 5
    var start = Math.max(0, centerIdx - half);
    var end   = start + (N_SAT_ROWS - 1);
    if (end >= satRows.length) {
      end   = satRows.length - 1;
      start = Math.max(0, end - (N_SAT_ROWS - 1));
    }
    var out = [];
    for (var i = start; i <= end; i++) out.push(satRows[i]);
    return out;
  }

  function _fillSatTables(satRows, P_Pa) {
    var centerIdx = _findSatCenterIdx(satRows, P_Pa);
    var rows      = _sampleSatRows(satRows, centerIdx);

    var bodyT = _clearBody('tblSatByTBody');
    var bodyP = _clearBody('tblSatByPBody');
    if (!bodyT && !bodyP) return;

    rows.forEach(function(r) {
      var hfg = r.vap_enthalpy - r.liq_enthalpy;
      var prf = (r.liq_conductivity > 0)
                ? (r.liq_cp * r.liq_viscosity) / r.liq_conductivity
                : NaN;

      // ── tblSatByT: T | Psat | ρf | ρg | hf | hfg | hg | sf | sg | μf | λf | Prf
      if (bodyT) {
        var rowT = document.createElement('tr');
        [r.T,            r.P,
         r.liq_density,  r.vap_density,
         r.liq_enthalpy, hfg,           r.vap_enthalpy,
         r.liq_entropy,  r.vap_entropy,
         r.liq_viscosity,r.liq_conductivity, prf
        ].forEach(function(v) { rowT.appendChild(_td(_fmtTbl(v))); });
        bodyT.appendChild(rowT);
      }

      // ── tblSatByP: Psat | Tsat | ρf | ρg | hf | hfg | hg | sf | sg | cpf | μf | Prf
      if (bodyP) {
        var rowP = document.createElement('tr');
        [r.P,             r.T,
         r.liq_density,   r.vap_density,
         r.liq_enthalpy,  hfg,           r.vap_enthalpy,
         r.liq_entropy,   r.vap_entropy,
         r.liq_cp,        r.liq_viscosity, prf
        ].forEach(function(v) { rowP.appendChild(_td(_fmtTbl(v))); });
        bodyP.appendChild(rowP);
      }
    });
  }

  // ── Table 3: Property Grid ───────────────────────────────────────────────────
  // Shows the T-sweep (fixed P) rows followed by the P-sweep (fixed T) rows,
  // separated by a labelled divider row.

  function _gridSectionHeader(tbody, label, colspan) {
    var row  = document.createElement('tr');
    var cell = document.createElement('td');
    cell.colSpan         = colspan;
    cell.textContent     = label;
    cell.style.cssText   = 'background:#d1e7ef;color:#0c3a4a;font-weight:700;' +
                           'font-size:10px;text-transform:uppercase;letter-spacing:0.05em;' +
                           'padding:3px 7px;border-top:2px solid #8ab4be;border-bottom:1px solid #a8c4cc;';
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function _fillGridTable(tSweep, pSweep, T_K, P_Pa) {
    var tbody = _clearBody('tblGridBody');
    if (!tbody) return;

    var COLS = 11;

    // ── T-sweep section (fixed P, varying T) ──────────────────────────────
    _gridSectionHeader(tbody,
      'T-sweep — Temperature scan at P ≈ ' + _fmtTbl(P_Pa) + ' Pa  (fixed pressure)',
      COLS);

    tSweep.forEach(function(r) {
      var props = r.props;
      var row   = document.createElement('tr');
      var phase = props ? props.phase : 255;
      // T (K) | P (Pa) | Phase | ρ | h | s | cp | u | μ | λ | Pr
      row.appendChild(_td(_fmtTbl(r.T_K)));
      row.appendChild(_td(_fmtTbl(props ? props.P : NaN)));
      row.appendChild(_phaseTd(phase));
      ['rho','h','s','cp','u','visc','cond','prandtl'].forEach(function(k) {
        row.appendChild(_td(_fmtTbl(_extract(props, k))));
      });
      tbody.appendChild(row);
    });

    // ── P-sweep section (fixed T, varying P) ──────────────────────────────
    _gridSectionHeader(tbody,
      'P-sweep — Pressure scan at T ≈ ' + _fmtTbl(T_K) + ' K  (fixed temperature)',
      COLS);

    pSweep.forEach(function(r) {
      var props = r.props;
      var row   = document.createElement('tr');
      var phase = props ? props.phase : 255;
      // T (K) | P (Pa) | Phase | ρ | h | s | cp | u | μ | λ | Pr
      row.appendChild(_td(_fmtTbl(props ? props.T : NaN)));
      row.appendChild(_td(_fmtTbl(r.P_Pa)));
      row.appendChild(_phaseTd(phase));
      ['rho','h','s','cp','u','visc','cond','prandtl'].forEach(function(k) {
        row.appendChild(_td(_fmtTbl(_extract(props, k))));
      });
      tbody.appendChild(row);
    });
  }

  // ── Main entry point ─────────────────────────────────────────────────────────

  /**
   * Fetch the T-sweep, P-sweep, and saturation curve, then update all charts
   * and tables.  Called by runCalc() in ThermoDynamicsLand.html after every
   * successful lookup.
   *
   * @param {string} fluid         CoolProp fluid name
   * @param {number} T_K           current temperature [K]
   * @param {number} P_Pa          current pressure [Pa]
   * @param {Object} [currentProps] result from ThermoCalc.calcAndDisplay (SI)
   */
  function update(fluid, T_K, P_Pa, currentProps) {
    if (typeof window.ThermoCalc === 'undefined') {
      console.warn('[ThermoGraphs] ThermoCalc not available');
      return;
    }

    _lastFluid    = fluid;
    _lastT_K      = T_K;
    _lastP_Pa     = P_Pa;
    _currentProps = currentProps || null;

    ThermoCalc.getFluidMeta(fluid).then(function(meta) {
      _meta = meta;   // cache for repopulate() — critical_point, valid_range, etc.

      var pValues = _buildPValues(meta, P_Pa);  // 11 pts centred on P_Pa (log-spaced)

      // ── T-sweep: read every pre-computed T row in the band at fixed P ────────
      // One band file fetch, ~450-550 real grid data points — no hand-picked samples.
      var tDone = ThermoCalc.getTColumn(fluid, P_Pa)
        .then(function(colRows) {
          // colRows: Array<props> sorted ascending by T
          _sweepTData = colRows.map(function(props) {
            return { T_K: props.T, props: props };
          });
          _redrawT();
          return _sweepTData;
        })
        .catch(function(err) {
          console.warn('[ThermoGraphs] T-column fetch failed:', err);
          _sweepTData = [];
          return [];
        });

      // ── P-sweep: 11 lookups at fixed T, varying P (log-spaced) ──────────────
      var pPromises = pValues.map(function(p) {
        return ThermoCalc.lookupPoint(fluid, T_K, p)
          .then(function(pr) { return { P_Pa: p, props: pr }; })
          .catch(function()   { return { P_Pa: p, props: null }; });
      });

      var pDone = Promise.all(pPromises).then(function(results) {
        _sweepPData = results;
        _redrawP();
        return results;
      });

      // ── Grid table: fill once both sweeps are ready ───────────────────────────
      Promise.all([tDone, pDone]).then(function(both) {
        _fillGridTable(both[0], both[1], T_K, P_Pa);
      });

      // ── Saturation curve (already cached — resolves instantly) ────────────────
      var satPromise = ThermoCalc.getSaturationCurve(fluid).catch(function() { return null; });

      satPromise.then(function(satRows) {
        if (satRows && satRows.length > 0) {
          _satRows = satRows;           // cache for repopulate() + _redrawPhase()
          _fillSatTables(satRows, P_Pa);
          _redrawPhase();               // draw saturation envelope + critical point
        }
      });

    }).catch(function(err) {
      console.warn('[ThermoGraphs] update failed:', err);
    });
  }

  /**
   * Re-render all three charts using the current display units.
   * No network requests.  Call this whenever the unit system changes.
   */
  function repopulate() {
    _redrawT();
    _redrawP();
    _redrawPhase();
  }

  // ── Table placeholder helper ──────────────────────────────────────────────────

  function _resetTableBody(tbodyId, colspan, msg) {
    var el = document.getElementById(tbodyId);
    if (!el) return;
    el.innerHTML = '';
    var row  = document.createElement('tr');
    var cell = document.createElement('td');
    cell.colSpan       = colspan;
    cell.textContent   = msg;
    cell.style.cssText = 'text-align:center;color:#888;padding:20px;font-style:italic;';
    row.appendChild(cell);
    el.appendChild(row);
  }

  /**
   * Clear all three charts and reset all three table bodies to placeholder text.
   * Call this on a range error or when a new fluid is selected.
   */
  function clear() {
    _sweepTData   = null;
    _sweepPData   = null;
    _currentProps = null;
    _satRows      = null;
    _meta         = null;

    if (_chartT)       { _chartT.data       = { datasets: [] }; _chartT.update('none');       }
    if (_chartP)       { _chartP.data       = { datasets: [] }; _chartP.update('none');       }
    if (_chartPhase)   { _chartPhase.data   = { datasets: [] }; _chartPhase.update('none');   }
    if (_chartT_p)     { _chartT_p.data     = { datasets: [] }; _chartT_p.update('none');     }
    if (_chartP_p)     { _chartP_p.data     = { datasets: [] }; _chartP_p.update('none');     }
    if (_chartPhase_p) { _chartPhase_p.data = { datasets: [] }; _chartPhase_p.update('none'); }

    _resetTableBody('tblSatByTBody', 12,
      'Select a fluid and press Calculate to populate the saturation table');
    _resetTableBody('tblSatByPBody', 12,
      'Select a fluid and press Calculate to populate the saturation table');
    _resetTableBody('tblGridBody', 11,
      'Select a fluid and press Calculate to populate the property grid');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function _init() {
    _injectToolbar('graphContent1', 'chartTPropSelect');
    _injectToolbar('graphContent2', 'chartPPropSelect');

    _chartT     = _createChart('chartPropVsT',      'T [K]',  'Sp. Enthalpy h [J/kg]', false);
    _chartP     = _createChart('chartPropVsP',      'P [Pa]', 'Sp. Enthalpy h [J/kg]', true);
    _chartPhase = _createPhaseChart('chartPhaseDiagram');

    // Print-shadow charts: same configuration but on the always-rendered off-screen canvases
    _chartT_p     = _createChart('chartPropVsT_p',      'T [K]',  'Sp. Enthalpy h [J/kg]', false);
    _chartP_p     = _createChart('chartPropVsP_p',      'P [Pa]', 'Sp. Enthalpy h [J/kg]', true);
    _chartPhase_p = _createPhaseChart('chartPhaseDiagram_p');

    var selT = document.getElementById('chartTPropSelect');
    if (selT) selT.addEventListener('change', function() { _propKeyT = selT.value; _redrawT(); });

    var selP = document.getElementById('chartPPropSelect');
    if (selP) selP.addEventListener('change', function() { _propKeyP = selP.value; _redrawP(); });
  }

  document.addEventListener('DOMContentLoaded', _init);

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    update    : update,
    repopulate: repopulate,
    clear     : clear       // blank charts + reset table placeholders
  };

}());
