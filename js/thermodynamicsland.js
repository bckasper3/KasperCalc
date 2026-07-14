/**
 * thermodynamicsland.js  —  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-side thermodynamic property lookup backed by pre-computed CoolProp
 * 7.2.0 binary data (gzip-compressed).  Exposes window.ThermoCalc.
 *
 * Binary record layouts
 * ─────────────────────
 *  Grid band   : 11 × Float32 LE (44 B) + 1 × Uint8 (phase)  = 45 B / record
 *                Fields: T, P, rho, cp, cv, h, s, u, visc, cond, prandtl
 *  Saturation  : 14 × Float32 LE (56 B) + 1 × Uint8 (phase)  = 57 B / record
 *                Fields: T, P, liq_density, liq_cp, liq_enthalpy, liq_entropy,
 *                        liq_viscosity, liq_conductivity, vap_density, vap_cp,
 *                        vap_enthalpy, vap_entropy, vap_viscosity, vap_conductivity
 *  Meta        : JSON text (UTF-8), gzip-compressed
 *
 * All SI inputs/outputs use:
 *   T [K], P [Pa], rho [kg/m³], h/u [J/kg], s/cp/cv [J/(kg·K)],
 *   visc [Pa·s], cond [W/(m·K)], Prandtl [—]
 *
 * Usage
 * ─────
 *  // Point lookup (returns SI, also populates DOM outputs):
 *  const props = await ThermoCalc.lookupPoint('Water', 373.15, 101325);
 *  ThermoCalc.populateOutputs(props);
 *
 *  // Convert T/P inputs from current display unit to SI before lookup:
 *  const T_K  = ThermoCalc.inputToSI_T(value);   // reads current unit from DOM
 *  const P_Pa = ThermoCalc.inputToSI_P(value);
 *
 *  // Full-band series data (for graphs / tables):
 *  const meta  = await ThermoCalc.getFluidMeta('Water');
 *  const band0 = await ThermoCalc.getBandData('Water', 0);
 *  const sat   = await ThermoCalc.getSaturationCurve('Water');
 *
 *  // Raw converters (for external calculators):
 *  const K  = ThermoCalc.toSI_T(25,    '°C');   // → 298.15
 *  const Pa = ThermoCalc.toSI_P(14.70, 'psia');  // → 101352.9
 */

'use strict';

window.ThermoCalc = (function () {

  // ── Constants ────────────────────────────────────────────────────────────────

  var GZ_ROOT           = 'https://data.kaspercalc.com/gz/';
  var GRID_RECORD_BYTES = 45;
  var SAT_RECORD_BYTES  = 57;

  var GRID_FIELDS = ['T','P','rho','cp','cv','h','s','u','visc','cond','prandtl'];
  var SAT_FIELDS  = [
    'T','P',
    'liq_density','liq_cp','liq_enthalpy','liq_entropy',
    'liq_viscosity','liq_conductivity',
    'vap_density','vap_cp','vap_enthalpy','vap_entropy',
    'vap_viscosity','vap_conductivity'
  ];

  var PHASE_NAMES = {
    0  : 'Liquid (subcooled)',
    1  : 'Gas / Supercritical vapor',
    2  : 'Two-phase',
    3  : 'Supercritical liquid',
    4  : 'Supercritical gas',
    255: 'Failed / out-of-range'
  };

  // Background / foreground colors for the outPhase badge.
  // Bootstrap-derived palette so it harmonises with most themes.
  var _PHASE_COLORS = {
    0  : { bg: '#cce5ff', color: '#004085', border: '#b8daff' },  // blue   — subcooled liquid
    1  : { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },  // green  — gas / supercritical vapor
    2  : { bg: '#fff3cd', color: '#856404', border: '#ffeeba' },  // amber  — two-phase (vapour dome)
    3  : { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },  // teal   — supercritical liquid
    4  : { bg: '#e2d9f3', color: '#4a235a', border: '#d6bcfa' },  // violet — supercritical gas
    255: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' }   // red    — failed / out-of-range
  };

  // ── Unit conversion tables FROM SI ──────────────────────────────────────────
  // Keys cover BOTH UNIT_PRESETS display strings ('°C', 'kJ/kg', …)
  // AND cu-* select value codes ('C', 'kJ_kg', …) so one lookup handles both.

  var _T_FROM_SI = {
    'K'  : function(k){ return k; },
    // display string aliases
    '°C' : function(k){ return k - 273.15; },
    '°F' : function(k){ return (k - 273.15) * 1.8 + 32; },
    '°R' : function(k){ return k * 1.8; },
    // cu-temp select codes
    'C'  : function(k){ return k - 273.15; },
    'F'  : function(k){ return (k - 273.15) * 1.8 + 32; },
    'R'  : function(k){ return k * 1.8; }
  };

  var _P_FROM_SI = {
    'Pa'    : function(p){ return p; },
    'kPa'   : function(p){ return p * 1e-3; },
    'MPa'   : function(p){ return p * 1e-6; },
    'bar'   : function(p){ return p * 1e-5; },
    'mbar'  : function(p){ return p * 0.01; },
    'psia'  : function(p){ return p / 6894.757293168; },
    'psig'  : function(p){ return p / 6894.757293168 - 14.6959488; },
    'atm'   : function(p){ return p / 101325; },
    'mmHg'  : function(p){ return p / 133.32239; },
    'inHg'  : function(p){ return p / 3386.389; },
    'inH₂O' : function(p){ return p / 249.089; },   // UNIT_PRESETS display
    'inH2O' : function(p){ return p / 249.089; }    // cu-pressure code
  };

  var _RHO_FROM_SI = {
    'kg/m³'       : function(r){ return r; },
    'kg_m3'       : function(r){ return r; },
    'g/cm³'       : function(r){ return r / 1000; },
    'g_cm3'       : function(r){ return r / 1000; },
    'g/L'         : function(r){ return r; },         // 1 kg/m³ = 1 g/L
    'g_L'         : function(r){ return r; },
    'kg/L'        : function(r){ return r / 1000; },
    'kg_L'        : function(r){ return r / 1000; },
    'lbm/ft³'     : function(r){ return r * 0.062427961; },
    'lbm_ft3'     : function(r){ return r * 0.062427961; },
    'lbm/gal'     : function(r){ return r * 0.0083454044; },
    'lbm_galUS'   : function(r){ return r * 0.0083454044; },
    'lbm/gal(UK)' : function(r){ return r * 0.010022414; },
    'lbm_galUK'   : function(r){ return r * 0.010022414; }
  };

  // Specific volume from m³/kg.  Keys share codes with _RHO_FROM_SI for easy lookup.
  var _V_FROM_SI = {
    'm³/kg'      : function(v){ return v; },
    'kg_m3'      : function(v){ return v; },
    'cm³/g'      : function(v){ return v * 1000; },
    'g_cm3'      : function(v){ return v * 1000; },
    'L/g'        : function(v){ return v; },           // 1 m³/kg = 1 L/g
    'g_L'        : function(v){ return v; },
    'L/kg'       : function(v){ return v * 1000; },
    'kg_L'       : function(v){ return v * 1000; },
    'ft³/lbm'    : function(v){ return v * 16.018463; },
    'lbm_ft3'    : function(v){ return v * 16.018463; },
    'gal/lbm'    : function(v){ return v * 119.82643; },
    'lbm_galUS'  : function(v){ return v * 119.82643; },
    'gal/lbm(UK)': function(v){ return v * 99.77633; },
    'lbm_galUK'  : function(v){ return v * 99.77633; }
  };

  // Specific enthalpy / internal energy from J/kg
  var _E_FROM_SI = {
    'J/kg'    : function(e){ return e; },
    'J_kg'    : function(e){ return e; },
    'kJ/kg'   : function(e){ return e * 1e-3; },
    'kJ_kg'   : function(e){ return e * 1e-3; },
    'BTU/lbm' : function(e){ return e / 2326.0; },
    'BTU_lbm' : function(e){ return e / 2326.0; },
    'cal/g'   : function(e){ return e / 4186.8; },
    'cal_g'   : function(e){ return e / 4186.8; },
    'kcal/kg' : function(e){ return e / 4186.8; },
    'kcal_kg' : function(e){ return e / 4186.8; },
    'Wh/kg'   : function(e){ return e / 3600; },
    'Wh_kg'   : function(e){ return e / 3600; },
    'kWh/kg'  : function(e){ return e / 3.6e6; },
    'kWh_kg'  : function(e){ return e / 3.6e6; }
  };

  // Entropy / cp / cv from J/(kg·K)
  var _S_FROM_SI = {
    'J/(kg·K)'     : function(s){ return s; },
    'J_kgK'        : function(s){ return s; },
    'kJ/(kg·K)'    : function(s){ return s * 1e-3; },
    'kJ_kgK'       : function(s){ return s * 1e-3; },
    'BTU/(lbm·°R)' : function(s){ return s / 4186.8; },
    'BTU_lbmR'     : function(s){ return s / 4186.8; },
    'BTU/(lbm·°F)' : function(s){ return s / 4186.8; }, // same scale as °R
    'BTU_lbmF'     : function(s){ return s / 4186.8; },
    'cal/(g·°C)'   : function(s){ return s / 4186.8; },
    'cal_gC'       : function(s){ return s / 4186.8; },
    'kcal/(kg·K)'  : function(s){ return s / 4186.8; },
    'kcal_kgK'     : function(s){ return s / 4186.8; }
  };

  // Thermal conductivity from W/(m·K)
  var _LAM_FROM_SI = {
    'W/(m·K)'            : function(k){ return k; },
    'W_mK'               : function(k){ return k; },
    'W/(m·°C)'           : function(k){ return k; },     // same magnitude
    'W_mC'               : function(k){ return k; },
    'mW/(m·K)'           : function(k){ return k * 1000; },
    'mW_mK'              : function(k){ return k * 1000; },
    'BTU/(hr·ft·°F)'     : function(k){ return k / 1.730735; },
    'BTU_hrftF'          : function(k){ return k / 1.730735; },
    'BTU·in/(hr·ft²·°F)' : function(k){ return k / 0.144228; },
    'BTUin_hrft2F'       : function(k){ return k / 0.144228; },
    'cal/(s·cm·°C)'      : function(k){ return k / 418.68; },
    'cal_scmC'           : function(k){ return k / 418.68; }
  };

  // Dynamic viscosity from Pa·s
  var _MU_FROM_SI = {
    'Pa·s'       : function(m){ return m; },
    'Pas'        : function(m){ return m; },
    'mPa·s'      : function(m){ return m * 1000; },
    'mPas'       : function(m){ return m * 1000; },
    'cP'         : function(m){ return m * 1000; },     // 1 cP = 1 mPa·s
    'µPa·s'      : function(m){ return m * 1e6; },
    'uPas'       : function(m){ return m * 1e6; },
    'Poise'      : function(m){ return m * 10; },
    'P'          : function(m){ return m * 10; },       // cu-dyn-visc code
    'lbm/(ft·s)' : function(m){ return m / 1.4881639; },
    'lbm_fts'    : function(m){ return m / 1.4881639; },
    'lbm/(ft·hr)': function(m){ return m * 2419.0884; },
    'lbm_fthr'   : function(m){ return m * 2419.0884; },
    'lbf·s/ft²'  : function(m){ return m / 47.88026; },
    'lbfs_ft2'   : function(m){ return m / 47.88026; },
    'kg/(m·h)'   : function(m){ return m * 3600; },
    'kg_mh'      : function(m){ return m * 3600; }
  };

  // Kinematic viscosity / thermal diffusivity from m²/s
  var _NU_FROM_SI = {
    'm²/s'  : function(n){ return n; },
    'm2_s'  : function(n){ return n; },
    'mm²/s' : function(n){ return n * 1e6; },
    'mm2_s' : function(n){ return n * 1e6; },
    'cSt'   : function(n){ return n * 1e6; },     // 1 cSt = 1 mm²/s
    'St'    : function(n){ return n * 1e4; },     // 1 St  = 1 cm²/s
    'ft²/s' : function(n){ return n * 10.76391; },
    'ft2_s' : function(n){ return n * 10.76391; },
    'ft²/hr': function(n){ return n * 38750.077; },
    'ft2_hr': function(n){ return n * 38750.077; },
    'in²/s' : function(n){ return n * 1550.003; },
    'in2_s' : function(n){ return n * 1550.003; }
  };

  // ── Inverse conversions TO SI (for converting user inputs back to K / Pa) ────

  var _T_TO_SI = {
    'K'  : function(t){ return t; },
    '°C' : function(t){ return t + 273.15; },
    'C'  : function(t){ return t + 273.15; },
    '°F' : function(t){ return (t - 32) / 1.8 + 273.15; },
    'F'  : function(t){ return (t - 32) / 1.8 + 273.15; },
    '°R' : function(t){ return t / 1.8; },
    'R'  : function(t){ return t / 1.8; }
  };

  var _P_TO_SI = {
    'Pa'    : function(p){ return p; },
    'kPa'   : function(p){ return p * 1e3; },
    'MPa'   : function(p){ return p * 1e6; },
    'bar'   : function(p){ return p * 1e5; },
    'mbar'  : function(p){ return p * 100; },
    'psia'  : function(p){ return p * 6894.757293168; },
    'psig'  : function(p){ return (p + 14.6959488) * 6894.757293168; },
    'atm'   : function(p){ return p * 101325; },
    'mmHg'  : function(p){ return p * 133.32239; },
    'inHg'  : function(p){ return p * 3386.389; },
    'inH₂O' : function(p){ return p * 249.089; },
    'inH2O' : function(p){ return p * 249.089; }
  };

  // ── Single-fluid cache ────────────────────────────────────────────────────────
  // Only one fluid is held in memory at a time.  Switching fluids purges all data.

  var _cache = {
    fluid      : null,
    meta       : null,
    bands      : {},      // { [bandIdx]: Array of grid records }
    saturation : null
  };

  // Last successful calculation result (SI).  Kept so unit changes can
  // re-display without a network round-trip.
  var _lastProps    = null;
  var _lastSatProps = null;

  // Debounce timer for T / P input events
  var _autoCalcTimer = null;

  function _purgeIfChanged(fluid) {
    if (_cache.fluid !== fluid) {
      _cache.fluid      = fluid;
      _cache.meta       = null;
      _cache.bands      = {};
      _cache.saturation = null;
    }
  }

  // ── Binary fetch / decompress ────────────────────────────────────────────────

  /**
   * Fetch a gzip-compressed file and return its raw ArrayBuffer.
   * Uses DecompressionStream (Chromium 80+, Firefox 113+, Safari 16.4+).
   */
  function fetchBinGz(url) {
    return fetch(url).then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' — ' + url);
      var ds          = new DecompressionStream('gzip');
      var decompressed = resp.body.pipeThrough(ds);
      return new Response(decompressed).arrayBuffer();
    });
  }

  // ── Binary parsers ────────────────────────────────────────────────────────────

  function _parseMetaGz(buf) {
    return JSON.parse(new TextDecoder('utf-8').decode(buf));
  }

  function _parseGridBand(buf) {
    var nRec = Math.floor(buf.byteLength / GRID_RECORD_BYTES);
    var view = new DataView(buf);
    var rows = new Array(nRec);
    for (var i = 0; i < nRec; i++) {
      var base = i * GRID_RECORD_BYTES;
      var row  = {};
      for (var j = 0; j < GRID_FIELDS.length; j++) {
        row[GRID_FIELDS[j]] = view.getFloat32(base + j * 4, true);
      }
      row.phase = view.getUint8(base + 44);
      rows[i] = row;
    }
    return rows;
  }

  function _parseSaturation(buf) {
    var nRec = Math.floor(buf.byteLength / SAT_RECORD_BYTES);
    var view = new DataView(buf);
    var rows = new Array(nRec);
    for (var i = 0; i < nRec; i++) {
      var base = i * SAT_RECORD_BYTES;
      var row  = {};
      for (var j = 0; j < SAT_FIELDS.length; j++) {
        row[SAT_FIELDS[j]] = view.getFloat32(base + j * 4, true);
      }
      row.phase = view.getUint8(base + 56);
      rows[i] = row;
    }
    return rows;
  }

  // ── Safe fluid name (matches Python compress_bins.py logic) ──────────────────

  function safeFluidName(fluid) {
    return fluid.replace(/[:\[\].]/g, '_');
  }

  // ── Cache loaders ─────────────────────────────────────────────────────────────

  function _ensureMeta(fluid) {
    _purgeIfChanged(fluid);
    if (_cache.meta) return Promise.resolve(_cache.meta);
    var safe = safeFluidName(fluid);
    var url  = GZ_ROOT + safe + '/meta.bin.gz';
    return fetchBinGz(url).then(function(buf) {
      _cache.meta = _parseMetaGz(buf);
      return _cache.meta;
    });
  }

  function _ensureBand(fluid, bandIdx) {
    return _ensureMeta(fluid).then(function(meta) {
      if (_cache.bands[bandIdx]) return _cache.bands[bandIdx];
      var bandInfo = meta.grid.pressure_bands[bandIdx];
      if (!bandInfo) throw new Error('Band ' + bandIdx + ' not found for ' + fluid);
      var safe    = safeFluidName(fluid);
      // bin_file in meta is a bare filename (no subdirectory).
      // Grid band files live in a grid/ subfolder under the fluid directory.
      var binFile = bandInfo.bin_file;
      if (binFile.indexOf('/') === -1 && binFile.indexOf('\\') === -1) {
        binFile = 'grid/' + binFile;
      }
      var url  = GZ_ROOT + safe + '/' + binFile + '.gz';
      return fetchBinGz(url).then(function(buf) {
        var rows = _parseGridBand(buf);
        _cache.bands[bandIdx] = rows;
        return rows;
      });
    });
  }

  function _ensureSaturation(fluid) {
    return _ensureMeta(fluid).then(function(meta) {
      if (_cache.saturation) return _cache.saturation;
      var safe    = safeFluidName(fluid);
      var satFile = meta.saturation_curve ? meta.saturation_curve.file_bin : 'saturation.bin';
      var url     = GZ_ROOT + safe + '/' + satFile + '.gz';
      return fetchBinGz(url).then(function(buf) {
        _cache.saturation = _parseSaturation(buf);
        return _cache.saturation;
      });
    });
  }

  // ── Interpolation helpers ─────────────────────────────────────────────────────

  /**
   * Binary search: returns index i ∈ [0, len-2] such that
   * getVal(i) ≤ val ≤ getVal(i+1).  Clamped to edges if out of range.
   */
  function _bracketIdx(getVal, len, val) {
    if (len < 2) return 0;
    if (val <= getVal(0)) return 0;
    if (val >= getVal(len - 1)) return len - 2;
    var lo = 0, hi = len - 2;
    while (lo < hi) {
      var mid = (lo + hi + 1) >>> 1;
      if (getVal(mid) <= val) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /**
   * Find the band index whose pressure range best covers P_Pa.
   * Returns the first matching band; if none spans P exactly, returns
   * the band whose midpoint is closest.
   */
  function _findBandForP(meta, P_Pa) {
    var bands = meta.grid.pressure_bands;
    for (var i = 0; i < bands.length; i++) {
      if (P_Pa >= bands[i].p_min && P_Pa <= bands[i].p_max) return i;
    }
    // Out of range — clamp to nearest band
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < bands.length; i++) {
      var mid  = (bands[i].p_min + bands[i].p_max) * 0.5;
      var dist = Math.abs(P_Pa - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  /**
   * Bilinear interpolation inside a grid band.
   * Rows are row-major: (T0,P0),(T0,P1),...,(T0,Pn-1),(T1,P0),...
   *
   * @param {Array}  rows  - parsed band records
   * @param {number} T_K   - desired temperature [K]
   * @param {number} P_Pa  - desired pressure [Pa]
   * @param {number} nP    - number of pressure points in this band
   * @returns {Object} interpolated properties, or null on failure
   */
  function _bilinearInterp(rows, T_K, P_Pa, nP) {
    var nT   = Math.floor(rows.length / nP);
    if (nT < 1 || nP < 1) return null;

    // T axis: rows[ti * nP].T  (outer index)
    // P axis: rows[pi].P       (inner index, same for every T row)
    var getT = function(ti) { return rows[ti * nP].T; };
    var getP = function(pi) { return rows[pi].P; };

    var ti = _bracketIdx(getT, nT, T_K);
    var pi = _bracketIdx(getP, nP, P_Pa);

    var T0 = getT(ti),  T1 = getT(ti + 1);
    var P0 = getP(pi),  P1 = getP(pi + 1);
    var wT = (T1 > T0) ? (T_K  - T0) / (T1 - T0) : 0;
    var wP = (P1 > P0) ? (P_Pa - P0) / (P1 - P0) : 0;

    var r00 = rows[ ti      * nP + pi    ];
    var r01 = rows[ ti      * nP + pi + 1];
    var r10 = rows[(ti + 1) * nP + pi    ];
    var r11 = rows[(ti + 1) * nP + pi + 1];

    if (!r00 || !r01 || !r10 || !r11) return r00 || r01 || r10 || r11 || null;

    var result = { T: T_K, P: P_Pa, phase: r00.phase };
    var propFields = ['rho','cp','cv','h','s','u','visc','cond','prandtl'];
    for (var k = 0; k < propFields.length; k++) {
      var f = propFields[k];
      result[f] = (1 - wT) * (1 - wP) * r00[f]
                + (1 - wT) *      wP  * r01[f]
                +      wT  * (1 - wP) * r10[f]
                +      wT  *      wP  * r11[f];
    }
    return result;
  }

  /**
   * Lookup saturation properties at a given pressure by interpolating the
   * saturation curve (which is sorted by increasing T, hence increasing Psat).
   *
   * @param {Array}  satRows - saturation records
   * @param {number} P_Pa    - pressure [Pa]
   * @returns {Object} { Tsat, Psat, hf, hg, hfg, sf, sg }
   */
  function _satAtP(satRows, P_Pa) {
    var getP = function(i) { return satRows[i].P; };
    var idx  = _bracketIdx(getP, satRows.length, P_Pa);
    var r0   = satRows[idx];
    var r1   = satRows[idx + 1] || r0;
    var wP   = (r1.P > r0.P) ? (P_Pa - r0.P) / (r1.P - r0.P) : 0;

    function lerp(a, b) { return a + wP * (b - a); }
    return {
      Tsat : lerp(r0.T,             r1.T),
      Psat : P_Pa,
      hf   : lerp(r0.liq_enthalpy,  r1.liq_enthalpy),
      hg   : lerp(r0.vap_enthalpy,  r1.vap_enthalpy),
      hfg  : lerp(r0.vap_enthalpy - r0.liq_enthalpy,
                  r1.vap_enthalpy - r1.liq_enthalpy),
      sf   : lerp(r0.liq_entropy,   r1.liq_entropy),
      sg   : lerp(r0.vap_entropy,   r1.vap_entropy)
    };
  }

  // ── Unit-system helpers ────────────────────────────────────────────────────────

  /** Read a DOM select's current value (returns '' if element absent). */
  function _cuVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  /**
   * Returns { T, P, rho, v, energy, entropy, mu, nu, alp, lam } — each value
   * is a key into the _*_FROM_SI tables above.
   */
  function _getUnitKeys(preset) {
    if (preset === 'custom') {
      var rhoCode = _cuVal('cu-density');
      var nuCode  = _cuVal('cu-kin-visc');
      return {
        T       : _cuVal('cu-temp'),
        P       : _cuVal('cu-pressure'),
        rho     : rhoCode,
        v       : rhoCode,          // v uses same code key as rho in _V_FROM_SI
        energy  : _cuVal('cu-energy'),
        entropy : _cuVal('cu-entropy'),
        mu      : _cuVal('cu-dyn-visc'),
        nu      : nuCode,
        alp     : nuCode,           // thermal diffusivity shares kin-visc select
        lam     : _cuVal('cu-conductivity')
      };
    }
    // Read from UNIT_PRESETS global (defined in ThermoDynamicsLand.html)
    var UP = window.UNIT_PRESETS;
    var p  = (UP && UP[preset]) || (UP && UP['si-strict']) || null;
    if (!p) {
      // Hard fallback: SI strict
      return { T:'K', P:'Pa', rho:'kg/m³', v:'m³/kg',
               energy:'J/kg', entropy:'J/(kg·K)',
               mu:'Pa·s', nu:'m²/s', alp:'m²/s', lam:'W/(m·K)' };
    }
    return {
      T       : p.T.u,
      P       : p.P.u,
      rho     : p.rho,
      v       : p.v,
      energy  : p.h,
      entropy : p.s,
      mu      : p.mu,
      nu      : p.nu,
      alp     : p.alp,
      lam     : p.lam
    };
  }

  /** Convert a value using the given lookup table; returns val unchanged on miss. */
  function _cvt(table, key, val) {
    return (table[key]) ? table[key](val) : val;
  }

  // ── Output formatting ─────────────────────────────────────────────────────────

  function _fmt(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a < 1e-5 || a >= 1e8) return v.toPrecision(5);
    if (a < 1)    return v.toFixed(6);
    if (a < 100)  return v.toFixed(4);
    if (a < 1e4)  return v.toFixed(2);
    if (a < 1e6)  return v.toFixed(1);
    return v.toFixed(0);
  }

  function _setOut(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = (val !== null && val !== undefined && isFinite(val)) ? _fmt(val) : '';
  }

  /**
   * Update the #outPhase span with the correct phase name and a color badge.
   *
   * Phase codes (CoolProp 7.2.0):
   *   0  → Liquid (subcooled)
   *   1  → Gas / Supercritical vapor
   *   2  → Two-phase  — bulk grid values are NaN; sat. liq/vap stored separately
   *   3  → Supercritical liquid
   *   4  → Supercritical gas
   *   255 → Failed / out-of-range
   *
   * @param {number} code  - phase flag byte from the binary record
   */
  function _setPhase(code) {
    var phEl = document.getElementById('outPhase');
    if (!phEl) return;
    var name = (PHASE_NAMES[code] !== undefined) ? PHASE_NAMES[code] : ('Phase ' + code);
    var c    = _PHASE_COLORS[code] || { bg: '#e9ecef', color: '#495057', border: '#ced4da' };
    phEl.textContent        = name;
    phEl.style.background   = c.bg;
    phEl.style.color        = c.color;
    phEl.style.border       = '1px solid ' + c.border;
    phEl.style.borderRadius = '4px';
    phEl.style.padding      = '1px 8px';
    phEl.style.fontWeight   = '600';
    phEl.style.display      = 'inline-block';
  }

  /**
   * Reset the #outPhase span to its idle state (no calculation yet).
   */
  function _clearPhase() {
    var phEl = document.getElementById('outPhase');
    if (!phEl) return;
    phEl.textContent        = '—';   // em-dash
    phEl.style.background   = '';
    phEl.style.color        = '';
    phEl.style.border       = '';
    phEl.style.borderRadius = '';
    phEl.style.padding      = '';
    phEl.style.fontWeight   = '';
    phEl.style.display      = '';
  }

  // ── DOM population ─────────────────────────────────────────────────────────────

  /**
   * Populate all output fields in ThermoDynamicsLand.html.
   *
   * @param {Object|null} props    - result of lookupPoint() (SI units)
   * @param {Object|null} satProps - optional; if null, saturation is auto-loaded
   *                                 from cache if available at props.P
   */
  function populateOutputs(props, satProps) {
    var presetEl = typeof document !== 'undefined'
                 ? document.querySelector('input[name="calcUnits"]:checked')
                 : null;
    var preset   = presetEl ? presetEl.value : 'si-strict';
    var u        = _getUnitKeys(preset);

    // ── Bulk thermodynamic properties ──────────────────────────────────────────
    if (props) {
      // Phase badge — color-coded, labelled with exact CoolProp description
      _setPhase(props.phase);

      // T and P are always valid regardless of phase
      _setOut('outT', _cvt(_T_FROM_SI, u.T, props.T));
      _setOut('outP', _cvt(_P_FROM_SI, u.P, props.P));

      // Phase 2 (two-phase): CoolProp stores NaN for bulk properties because
      // quality x is not determined by T and P alone.  _setOut() already
      // blanks non-finite values, but we also skip the derived quantities
      // (nu, alpha, spVol) so we don't propagate NaN arithmetic warnings.
      if (props.phase === 2) {
        // Bulk fields — leave blank; saturation section below provides hf/hg/etc.
        _setOut('outRho',    NaN);
        _setOut('outV',      NaN);
        _setOut('outH',      NaN);
        _setOut('outU',      NaN);
        _setOut('outS',      NaN);
        _setOut('outCp',     NaN);
        _setOut('outCv',     NaN);
        _setOut('outMu',     NaN);
        _setOut('outNu',     NaN);
        _setOut('outLambda', NaN);
        _setOut('outAlpha',  NaN);
        _setOut('outPr',     NaN);
      } else {
        var nu    = (props.rho > 0) ? props.visc / props.rho : NaN;         // m²/s
        var alpha = (props.rho > 0 && props.cp > 0)                         // m²/s
                    ? props.cond / (props.rho * props.cp)
                    : NaN;
        var spVol = (props.rho > 0) ? 1.0 / props.rho : NaN;               // m³/kg

        _setOut('outRho',    _cvt(_RHO_FROM_SI, u.rho,     props.rho));
        _setOut('outV',      _cvt(_V_FROM_SI,   u.v,       spVol));
        _setOut('outH',      _cvt(_E_FROM_SI,   u.energy,  props.h));
        _setOut('outU',      _cvt(_E_FROM_SI,   u.energy,  props.u));
        _setOut('outS',      _cvt(_S_FROM_SI,   u.entropy, props.s));
        _setOut('outCp',     _cvt(_S_FROM_SI,   u.entropy, props.cp));
        _setOut('outCv',     _cvt(_S_FROM_SI,   u.entropy, props.cv));
        _setOut('outMu',     _cvt(_MU_FROM_SI,  u.mu,      props.visc));
        _setOut('outNu',     _cvt(_NU_FROM_SI,  u.nu,      nu));
        _setOut('outLambda', _cvt(_LAM_FROM_SI, u.lam,     props.cond));
        _setOut('outAlpha',  _cvt(_NU_FROM_SI,  u.alp,     alpha));
        _setOut('outPr',     props.prandtl);   // dimensionless
      }

      // Quality x — only defined inside the two-phase dome and requires a
      // known bulk enthalpy: x = (h − hf) / hfg.  We do not have bulk h
      // when phase = 2 (grid stores NaN), so outX is always blanked here.
      // Future enhancement: accept user-supplied h to compute x directly.
      _setOut('outX', NaN);
    }

    // ── Saturation properties ──────────────────────────────────────────────────
    // If satProps not supplied but saturation data is already cached, derive it.
    if (!satProps && props && _cache.saturation && _cache.saturation.length > 0) {
      satProps = _satAtP(_cache.saturation, props.P);
    }

    if (satProps) {
      _setOut('outTsat', _cvt(_T_FROM_SI, u.T,       satProps.Tsat));
      _setOut('outPsat', _cvt(_P_FROM_SI, u.P,       satProps.Psat));
      _setOut('outHf',   _cvt(_E_FROM_SI, u.energy,  satProps.hf));
      _setOut('outHg',   _cvt(_E_FROM_SI, u.energy,  satProps.hg));
      _setOut('outHfg',  _cvt(_E_FROM_SI, u.energy,  satProps.hfg));
      _setOut('outSf',   _cvt(_S_FROM_SI, u.entropy, satProps.sf));
      _setOut('outSg',   _cvt(_S_FROM_SI, u.entropy, satProps.sg));
    }
  }

  // ── Input normalisation (display unit → SI) ───────────────────────────────────

  /**
   * Convert a temperature from its current display unit to Kelvin.
   * Unit string can be a UNIT_PRESETS display string ('°C') or a
   * cu-temp select code ('C').
   */
  function toSI_T(value, unitStr) {
    var fn = _T_TO_SI[unitStr];
    return fn ? fn(+value) : +value;
  }

  /**
   * Convert a pressure from its current display unit to Pa.
   */
  function toSI_P(value, unitStr) {
    var fn = _P_TO_SI[unitStr];
    return fn ? fn(+value) : +value;
  }

  /**
   * Read T input from the DOM (#calcTInput / #calcTUnit) and return K.
   */
  function inputToSI_T(value) {
    var unitEl = document.getElementById('calcTUnit');
    var unit   = unitEl ? unitEl.textContent.trim() : 'K';
    // Also accept the cu-temp select code directly
    return toSI_T(value, unit);
  }

  /**
   * Read P input from the DOM (#calcPInput / #calcPUnit) and return Pa.
   */
  function inputToSI_P(value) {
    var unitEl = document.getElementById('calcPUnit');
    var unit   = unitEl ? unitEl.textContent.trim() : 'Pa';
    return toSI_P(value, unit);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Fetch and cache the metadata for a fluid.
   * @returns {Promise<Object>} meta JSON
   */
  function getFluidMeta(fluid) {
    return _ensureMeta(fluid);
  }

  /**
   * Load (and cache) a specific pressure band.
   * Useful for building T-scan graphs at fixed P ranges.
   * @returns {Promise<Array>} array of grid records { T,P,rho,cp,cv,h,s,u,visc,cond,prandtl,phase }
   */
  function getBandData(fluid, bandIdx) {
    return _ensureBand(fluid, bandIdx);
  }

  /**
   * Load (and cache) the full saturation curve.
   * Useful for phase-envelope graphs.
   * @returns {Promise<Array>} array of saturation records
   */
  function getSaturationCurve(fluid) {
    return _ensureSaturation(fluid);
  }

  /**
   * Look up all thermodynamic properties at a given (T, P) point by
   * bilinear interpolation in the pre-computed grid.  All values are in SI.
   *
   * The saturation curve is also loaded so that populateOutputs() can
   * display saturation properties without a separate call.
   *
   * @param {string} fluid  - CoolProp fluid name (e.g. 'Water', 'INCOMP::MEG[0.3]')
   * @param {number} T_K    - temperature [K]
   * @param {number} P_Pa   - pressure [Pa]
   * @returns {Promise<Object>} { T, P, rho, cp, cv, h, s, u, visc, cond, prandtl, phase }
   */
  function lookupPoint(fluid, T_K, P_Pa) {
    // Load meta + saturation in parallel, then find the right band
    return Promise.all([
      _ensureMeta(fluid),
      _ensureSaturation(fluid).catch(function(){ return null; })  // sat optional
    ]).then(function(results) {
      var meta = results[0];

      var bandIdx = _findBandForP(meta, P_Pa);
      return _ensureBand(fluid, bandIdx).then(function(rows) {
        var bandInfo = meta.grid.pressure_bands[bandIdx];
        var nP       = bandInfo.n_pressure_pts;
        return _bilinearInterp(rows, T_K, P_Pa, nP);
      });
    });
  }

  /**
   * Return every temperature row in the grid band that covers P_Pa, with all
   * properties linearly interpolated to exactly P_Pa between the two bracketing
   * pressure columns.
   *
   * This is far more efficient than calling lookupPoint() hundreds of times for
   * a T-sweep chart: it loads ONE band file and walks every T row in a single
   * pass, yielding ~450–550 real pre-computed data points.
   *
   * The returned array is sorted ascending by T (matches the row-major storage
   * order: T is the outer loop in the binary file).
   *
   * @param {string} fluid  - CoolProp fluid name
   * @param {number} P_Pa   - fixed pressure [Pa]
   * @returns {Promise<Array>}  Array of prop objects (same shape as lookupPoint)
   */
  function getTColumn(fluid, P_Pa) {
    return _ensureMeta(fluid).then(function(meta) {
      var bandIdx  = _findBandForP(meta, P_Pa);
      var bandInfo = meta.grid.pressure_bands[bandIdx];
      return _ensureBand(fluid, bandIdx).then(function(rows) {
        var nP     = bandInfo.n_pressure_pts;
        var nT     = Math.floor(rows.length / nP);
        var getP   = function(pi) { return rows[pi].P; };
        var pi     = _bracketIdx(getP, nP, P_Pa);
        var P0     = getP(pi);
        var P1     = getP(pi + 1);          // always valid: _bracketIdx returns [0, nP-2]
        var wP     = (P1 > P0) ? (P_Pa - P0) / (P1 - P0) : 0;
        var FIELDS = ['rho','cp','cv','h','s','u','visc','cond','prandtl'];
        var out    = new Array(nT);
        for (var ti = 0; ti < nT; ti++) {
          var r0    = rows[ti * nP + pi    ];
          var r1    = rows[ti * nP + pi + 1];
          var props = { T: r0.T, P: P_Pa, phase: r0.phase };
          for (var k = 0; k < FIELDS.length; k++) {
            var f    = FIELDS[k];
            props[f] = (1 - wP) * r0[f] + wP * r1[f];
          }
          out[ti] = props;
        }
        return out;
      });
    });
  }

  /**
   * Convenience: look up a point AND immediately populate the DOM outputs.
   * Saturation properties are derived from the cached saturation curve.
   *
   * @param {string} fluid
   * @param {number} T_K
   * @param {number} P_Pa
   * @returns {Promise<Object>}   resolved props (SI) for further use
   */
  function calcAndDisplay(fluid, T_K, P_Pa) {
    return lookupPoint(fluid, T_K, P_Pa).then(function(props) {
      // Derive saturation props from cache (if available) for storage
      var satProps = null;
      if (_cache.saturation && _cache.saturation.length > 0) {
        satProps = _satAtP(_cache.saturation, props.P);
      }
      // Save for unit-change re-display
      _lastProps    = props;
      _lastSatProps = satProps;
      populateOutputs(props, satProps);
      return props;
    });
  }

  /**
   * Re-display the last successful result using the current unit system.
   * No network request is made — ideal for unit-preset changes.
   * Called by the HTML when the unit radios or Apply Custom Units button fire.
   */
  function repopulate() {
    if (_lastProps) {
      populateOutputs(_lastProps, _lastSatProps);
    }
  }

  /**
   * Read T and P from the DOM, convert to SI, and call window.runCalc().
   * Only fires if both inputs hold valid finite numbers.
   * Called by setFluid() and by the debounced T/P listeners.
   */
  function triggerAutoCalc() {
    var tEl  = document.getElementById('calcTInput');
    var pEl  = document.getElementById('calcPInput');
    var tVal = tEl ? parseFloat(tEl.value) : NaN;
    var pVal = pEl ? parseFloat(pEl.value) : NaN;
    if (isNaN(tVal) || isNaN(pVal)) return;          // inputs incomplete
    if (typeof window.runCalc === 'function') window.runCalc();
  }

  /**
   * Wire up automatic recalculation event listeners.
   * Called once on DOMContentLoaded.
   *  • T input  → debounced 450 ms → triggerAutoCalc
   *  • P input  → debounced 450 ms → triggerAutoCalc
   * (Fluid-change and unit-change hooks live in the HTML to avoid ordering
   *  issues between the inline script and this module.)
   */
  function _initListeners() {
    var DEBOUNCE_MS = 450;

    function _debounced() {
      clearTimeout(_autoCalcTimer);
      _autoCalcTimer = setTimeout(triggerAutoCalc, DEBOUNCE_MS);
    }

    var tInput = document.getElementById('calcTInput');
    var pInput = document.getElementById('calcPInput');
    if (tInput) tInput.addEventListener('input', _debounced);
    if (pInput) pInput.addEventListener('input', _debounced);
  }

  document.addEventListener('DOMContentLoaded', _initListeners);

  /**
   * Clear all output fields in the DOM and reset the phase badge.
   * Also nulls the last-result cache so repopulate() becomes a no-op.
   * Call this when a range error occurs or a new fluid is selected.
   */
  function clearOutputs() {
    var ids = [
      'outT','outP','outRho','outV','outH','outU','outS',
      'outCp','outCv','outMu','outNu','outLambda','outAlpha','outPr',
      'outX','outTsat','outPsat','outHf','outHg','outHfg','outSf','outSg'
    ];
    for (var i = 0; i < ids.length; i++) { _setOut(ids[i], NaN); }
    _clearPhase();
    _lastProps    = null;
    _lastSatProps = null;
  }

  /**
   * Clear cached data for the current fluid (or a specific fluid).
   * Call this if the underlying .gz files are updated between page loads.
   */
  function purgeCache(fluid) {
    if (fluid === undefined || fluid === _cache.fluid) {
      _cache.fluid      = null;
      _cache.meta       = null;
      _cache.bands      = {};
      _cache.saturation = null;
      _lastProps        = null;
      _lastSatProps     = null;
      _clearPhase();   // reset badge to '—' while new fluid loads
    }
  }

  // ── Module export ─────────────────────────────────────────────────────────────

  return {
    // Core data access
    getFluidMeta        : getFluidMeta,
    getBandData         : getBandData,
    getSaturationCurve  : getSaturationCurve,
    lookupPoint         : lookupPoint,
    getTColumn          : getTColumn,       // all T rows at fixed P (dense T-sweep)

    // Convenience
    calcAndDisplay      : calcAndDisplay,
    populateOutputs     : populateOutputs,
    repopulate          : repopulate,
    triggerAutoCalc     : triggerAutoCalc,
    purgeCache          : purgeCache,
    clearOutputs        : clearOutputs,  // blank all output fields + reset phase badge
    clearPhase          : _clearPhase,   // reset outPhase badge to idle '—'

    // Input helpers
    inputToSI_T         : inputToSI_T,
    inputToSI_P         : inputToSI_P,
    toSI_T              : toSI_T,
    toSI_P              : toSI_P,

    // Utilities for external calculators
    safeFluidName       : safeFluidName,
    fetchBinGz          : fetchBinGz,
    formatValue         : _fmt,

    // Low-level parsers (useful if you fetch your own binary data)
    parseGridBand       : _parseGridBand,
    parseSaturation     : _parseSaturation,

    // Constants (read-only)
    GZ_ROOT             : GZ_ROOT,
    GRID_RECORD_BYTES   : GRID_RECORD_BYTES,
    SAT_RECORD_BYTES    : SAT_RECORD_BYTES,
    PHASE_NAMES         : PHASE_NAMES
  };

}());
