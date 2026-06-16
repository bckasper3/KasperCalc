/**
 * NSWC-11 Static Seal / Gasket Reliability Calculator — calculation engine
 * =========================================================================
 * Implements the failure-rate model for gaskets and static seals from the
 * "Handbook of Reliability Prediction Procedures for Mechanical Equipment",
 * Naval Surface Warfare Center, Carderock Division, NSWC-11 (May 2011),
 * Chapter 3, Section 3.2.3, Equation (3-7):
 *
 *     lambda_SE = lambda_SE,B * CP * CQ * CDL * CH * CF * Cv * CT * CN
 *
 * where lambda_SE,B = 2.4 failures per million hours.
 *
 * This module is pure logic — no DOM access. Wire it to any frontend.
 *
 * DIFFERENCES FROM THE SOURCE SPREADSHEET (intentional fixes):
 *   1. The spreadsheet's high-pressure CP cell was `=(P1-P2/3000)^2`, an
 *      operator-precedence bug. Correct form is ((P)/3000)^2. Fixed here.
 *   2. CQ at Qf = 0 produced #DIV/0! in an unused helper cell. Handled here
 *      (Qf <= 0.03 uses the linear branch, so Qf = 0 gives CQ = 4.2).
 *   3. Durometer lookup used a stepwise VLOOKUP (2.5-point steps). This
 *      module linearly interpolates the same NSWC Figure 3.4 data.
 *
 * Usage:
 *   const result = NSWCSeal.calculate({
 *     leakageRate: 0,        // Qf, allowable leakage, in^3/min
 *     sealInnerDia: 0.778,   // in
 *     sealOuterDia: 0.886,   // in
 *     pressureHigh: 180,     // P1, lbf/in^2
 *     pressureLow: 0,        // P2, lbf/in^2
 *     surfaceFinish: 32,     // f, micro-inch
 *     dynamicViscosity: 4.461e-9, // nu, lbf-min/in^2
 *     operatingTemp: 150,    // To, deg F
 *     ratedTemp: 300,        // Tr, deg F
 *     durometer: 70,         // Shore A, 30–90
 *   });
 *   result.lambda          -> failures / 10^6 hours (calculated CH)
 *   result.lambdaUnityCH   -> failures / 10^6 hours with CH forced to 1
 *   result.factors         -> each multiplying factor
 *   result.intermediates   -> M, Fc, contact pressure, etc.
 *   result.warnings        -> applicability / parameter-limit notices
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();          // Node / CommonJS (tests)
  } else {
    root.NSWCSeal = factory();           // Browser global
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -------------------------------------------------------------------
  // Constants (NSWC-11 Chapter 3)
  // -------------------------------------------------------------------

  /** Base failure rate for static seals & gaskets, failures / 10^6 hours. */
  const BASE_FAILURE_RATE = 2.4;

  /** Reference dynamic viscosity nu_0 for Cv, lbf-min/in^2 (MIL-H-83282 datum). */
  const REFERENCE_VISCOSITY = 2e-8;

  /** CP transition pressure, psi: below this CP is flat at 0.25. */
  const CP_THRESHOLD_PSI = 1500;

  /** CQ transition leakage, in^3/min: branches meet at Qf = 0.03. */
  const CQ_THRESHOLD = 0.03;

  /** CT transition: (Tr - To) > 40 F gives the constant 0.21. */
  const CT_DELTA_LIMIT_F = 40;

  /**
   * Durometer (Shore A) -> Young's modulus / Meyer hardness, lbf/in^2.
   * Digitized from NSWC-11 Figure 3.4 (identical to the workbook's
   * "Youngs Modulus" sheet). For elastomers, Young's modulus and Meyer
   * hardness are treated as equivalent (NSWC-11 §3.2.3.4).
   */
  const DUROMETER_TABLE = [
    [30, 205], [32.5, 225], [35, 245], [37.5, 255], [40, 280],
    [42.5, 315], [45, 350], [47.5, 385], [50, 420], [52.5, 460],
    [55, 505], [57.5, 555], [60, 600], [62.5, 670], [65, 745],
    [67.5, 825], [70, 925], [72.5, 1030], [75, 1145], [77.5, 1300],
    [80, 1505], [82.5, 1740], [85, 2065], [87.5, 2545], [90, 3070],
  ];

  /**
   * N10 particle-generation factors — NSWC-11 Table 3-4.
   * "Number of particles under 10 micron per hour per rated GPM" produced
   * by the hydraulic component upstream of the seal. Used in the CN
   * formula given with Table 3-4:
   *
   *   CN = (C0 / C10)^3 * FR * N10
   *
   * where C0 = system filter size (microns), C10 = standard filter size
   * (10 microns), FR = rated flow rate (GPM).
   */
  const N10_TABLE = [
    { id: 'piston_pump',         label: 'Piston pump (steel particles)',         n10: 0.017 },
    { id: 'gear_pump',           label: 'Gear pump (steel particles)',           n10: 0.019 },
    { id: 'vane_pump',           label: 'Vane pump (steel particles)',           n10: 0.006 },
    { id: 'cylinder',            label: 'Cylinder (steel particles)',            n10: 0.008 },
    { id: 'sliding_action_valve', label: 'Sliding action valve (steel particles)', n10: 0.0004 },
    { id: 'hose',                label: 'Hose (rubber particles)',               n10: 0.0013 },
  ];

  /** Standard system filter size for the CN formula, microns. */
  const STANDARD_FILTER_MICRONS = 10;

  /**
   * Maximum rated temperatures TR for typical seal materials, deg F —
   * NSWC-11 Table 3-5. Convenience presets for the CT factor.
   */
  const SEAL_MATERIAL_RATED_TEMPS = {
    'Natural rubber': 160,
    'Ethylene propylene': 250,
    'Neoprene': 250,
    'Nitrile': 250,
    'Polyacrylate': 300,
    'Fluorosilicon': 450,
    'Fluorocarbon': 475,
    'Silicon rubbers': 450,
    'Butyl rubber': 250,
    'Urethane': 210,
    'Fluoroelastomers': 500,
    'Fluoroplastics': 500,
    'Leather': 200,
    'Impregnated poromeric material': 250,
  };

  /**
   * Cv multiplying factors for typical fluids vs temperature (deg F) —
   * NSWC-11 Table 3-3. null = handbook marks the value unreliable at that
   * temperature. Note: the published MIL-H-83282 values at 300/350 F
   * (0.6114 / 0.7766) break the rising trend and appear to be typos in
   * the source; they are reproduced as published.
   */
  const CV_TABLE_TEMPS = [-50, 0, 50, 100, 150, 200, 250, 300, 350];
  const CV_FLUID_TABLE = {
    'Air':            [554.0, 503.4, 462.9, 430.1, 402.6, 379.4, 359.5, null, null],
    'Oxygen':         [504.6, 457.8, 420.6, 390.2, 365.9, 343.6, 325.3, null, null],
    'Nitrogen':       [580.0, 528.0, 486.5, 452.6, 424.3, 400.0, 379.6, null, null],
    'Carbon Dioxide': [null, 599.9, 510.7, 449.7, 395.9, 352.1, null, null, null],
    'Water':          [null, null, 6.309, 12.15, 19.43, 27.30, null, null, null],
    'SAE 10 Oil':     [null, null, 0.060, 0.250, 0.750, 1.690, 2.650, null, null],
    'SAE 20 Oil':     [null, null, 0.0314, 0.167, 0.492, 1.183, 2.213, 2.861, 5.204],
    'SAE 30 Oil':     [null, null, 0.0297, 0.1129, 0.3519, 0.8511, 1.768, 2.861, 4.309],
    'SAE 40 Oil':     [null, null, 0.0122, 0.0534, 0.2462, 0.6718, 1.325, 2.221, 3.387],
    'SAE 50 Oil':     [null, null, 0.0037, 0.0326, 0.1251, 0.3986, 0.8509, 1.657, 2.654],
    'SAE 90 Oil':     [null, null, 0.0012, 0.0189, 0.0973, 0.3322, 0.7855, 1.515, 2.591],
    'Diesel Fuel':    [0.1617, 0.7492, 2.089, 3.847, 6.228, 9.169, 12.78, 16.31, null],
    'MIL-H-83282':    [0.0031, 0.0432, 0.2137, 0.6643, 1.421, 2.585, 4.063, 0.6114, 0.7766],
    'MIL-H-5606':     [0.0188, 0.0951, 0.2829, 0.6228, 1.108, 1.783, 2.719, 3.628, 4.880],
  };

  /**
   * Specific gravity vs temperature for two reference fluids, carried over
   * from the source workbook's "Specific Gravity" sheet. Used to convert
   * kinematic viscosity to dynamic viscosity:
   *   nu_dynamic = nu_kinematic * specific gravity (NSWC-11 §3.2.3.5).
   * Temperatures in deg F.
   */
  const SPECIFIC_GRAVITY_TABLE = {
    'Jet A': [
      [-60, 0.8575], [-40, 0.85], [-20, 0.843], [0, 0.836], [20, 0.829],
      [40, 0.822], [60, 0.815], [80, 0.808], [100, 0.8], [120, 0.793],
      [140, 0.786], [160, 0.779], [180, 0.771], [200, 0.764], [220, 0.756],
      [240, 0.75], [260, 0.742], [280, 0.735], [300, 0.727],
    ],
    'MIL-PRF-7808': [
      [-80, 0.975], [-60, 0.97], [-40, 0.961], [-20, 0.952], [0, 0.945],
      [20, 0.9375], [40, 0.929], [60, 0.921], [80, 0.912], [100, 0.904],
      [120, 0.896], [140, 0.888], [160, 0.88], [180, 0.872], [200, 0.864],
      [220, 0.855], [240, 0.847], [260, 0.839], [280, 0.831], [300, 0.823],
      [320, 0.814],
    ],
  };

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * 1 centipoise (= 1 mPa·s) expressed in lbf·min/in².
   * Derivation: 1 Pa·s = 1 N·s/m²; 1 N = 0.22480894 lbf; 1 s = 1/60 min;
   * 1 m² = 1550.0031 in² → 1 Pa·s = 2.41737e-6 lbf·min/in².
   * (The source workbook used the same chain with a rounded 0.02089
   * lbf·s/ft² per Pa·s, giving 2.4178e-9 per cP — within 0.02%.)
   */
  const CENTIPOISE_TO_LBF_MIN_IN2 = 2.41737e-9;

  function interpolateTable(table, x) {
    if (x <= table[0][0]) return table[0][1];
    const last = table[table.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [x0, y0] = table[i - 1];
        const [x1, y1] = table[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return last[1]; // unreachable
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /**
   * Convert kinematic viscosity to dynamic viscosity in NSWC units.
   *   dynamic [cP] = kinematic [cSt] × specific gravity
   *   dynamic [lbf·min/in²] = dynamic [cP] × 2.41737e-9
   * @param {number} cSt              kinematic viscosity, centistokes
   * @param {number} specificGravity  dimensionless (= density kg/m³ ÷ 1000)
   * @returns {number} dynamic viscosity, lbf·min/in²
   */
  function dynamicFromKinematicCst(cSt, specificGravity) {
    return cSt * specificGravity * CENTIPOISE_TO_LBF_MIN_IN2;
  }

  // -------------------------------------------------------------------
  // Fluid registry — drives the calculator's fluid/temperature dropdown.
  //
  // Three entry types:
  //
  //  type 'cv'        — Cv tabulated directly vs temperature (NSWC-11
  //                     Table 3-3 fluids). points: [[temp, Cv], ...]
  //
  //  type 'kinematic' — kinematic viscosity tabulated vs temperature,
  //                     converted to dynamic viscosity via density, then
  //                     Cv = nu0 / nu. (KasperCalc jet fuels per CRC 530,
  //                     MIL-PRF-23699 per NIST IR 8263 density.)
  //                     points:  [[temp, cSt], ...]
  //                     density: [[temp, kg/m^3], ...]   (or)
  //                     sg:      [[temp, specificGravity], ...]
  //
  //  type 'dynamic'   — dynamic (absolute) viscosity tabulated directly
  //                     vs temperature in mPa·s (= cP); no density needed.
  //                     (KasperCalc propylene/ethylene glycol mixtures per
  //                     Carpemar 2016.)
  //                     points: [[temp, cP], ...]
  //
  // All temperatures default to deg F; pass tempUnit: 'C' if the table is
  // in Celsius and it will be converted on registration. Lookups always
  // take deg F. Entries interpolate linearly between tabulated
  // temperatures and refuse temperatures outside the tabulated range.
  //
  // Use registerFluid(id, def) to add fluids. Examples:
  //
  //   // Jet fuel — kinematic cSt + density (CRC 530)
  //   NSWCSeal.registerFluid('jet-a', {
  //     label: 'Jet A / Jet A-1 / JP-5 / JP-8 (CRC 530)',
  //     source: 'CRC Report 530',
  //     type: 'kinematic',
  //     points:  [[-40, 11.0], [0, 4.6], [100, 1.45]],   // degF, cSt
  //     density: [[-40, 840], [0, 827], [100, 796]],      // degF, kg/m^3
  //   });
  //
  //   // Glycol mixture — dynamic viscosity directly (Carpemar 2016)
  //   NSWCSeal.registerFluid('pg-50', {
  //     label: 'Propylene glycol 50% (Carpemar 2016)',
  //     source: 'Carpemar 2016',
  //     type: 'dynamic',
  //     tempUnit: 'C',
  //     points: [[-30, 220], [0, 18.5], [20, 6.4], [80, 1.3]], // degC, mPa·s
  //   });
  //
  // TODO (site owner): register the KasperCalc data sets —
  //   - Jet fuels (kinematicViscosity.html, CRC 530): one entry per grade
  //     (JP-5/Jet A/Jet A-1/JP-8, JP-4/Jet B, JP-7, TS, RJ-4/5/6,
  //     JP-9/JP-10, Av. Gas) with the matching nominalDensity.html data
  //   - Propylene glycol (PGviscosity.html, dynamic mPa·s): one entry per
  //     mixture percentage (25–50%)
  //   - Ethylene glycol (EGviscosity.html, dynamic mPa·s): same
  //   - MIL-PRF-23699 (MIL-PRF-23699viscosity.html kinematic cSt +
  //     NIST IR 8263 Table 23 density, degC)
  // -------------------------------------------------------------------

  const FLUID_REGISTRY = {};

  function cToF(c) { return c * 9 / 5 + 32; }

  function registerFluid(id, def) {
    if (!id || typeof id !== 'string') throw new Error('Fluid id must be a string.');
    const types = ['cv', 'kinematic', 'dynamic'];
    if (!def || types.indexOf(def.type) === -1) {
      throw new Error("Fluid def.type must be 'cv', 'kinematic', or 'dynamic'.");
    }
    if (!Array.isArray(def.points) || def.points.length < 2) {
      throw new Error('Fluid def.points needs at least two [temp, value] pairs.');
    }
    if (def.type === 'kinematic' && !Array.isArray(def.density) && !Array.isArray(def.sg)) {
      throw new Error("Kinematic fluids need a density ([[temp, kg/m^3],...]) " +
        "or sg ([[temp, SG],...]) table.");
    }
    const toF = def.tempUnit === 'C'
      ? (arr) => arr.map(([t, v]) => [cToF(t), v])
      : (arr) => arr;
    const sorted = (arr) => toF(arr).slice().sort((a, b) => a[0] - b[0]);
    FLUID_REGISTRY[id] = {
      label: def.label || id,
      source: def.source || '',
      type: def.type,
      points: sorted(def.points),
      density: def.density ? sorted(def.density) : null,
      sg: def.sg ? sorted(def.sg) : null,
    };
    return FLUID_REGISTRY[id];
  }

  /** List registered fluids for building the dropdown. */
  function listFluids() {
    return Object.keys(FLUID_REGISTRY).map((id) => ({
      id,
      label: FLUID_REGISTRY[id].label,
      type: FLUID_REGISTRY[id].type,
      source: FLUID_REGISTRY[id].source,
    }));
  }

  function fluidTempRange(id) {
    const f = FLUID_REGISTRY[id];
    if (!f) throw new Error('Unknown fluid: ' + id);
    return [f.points[0][0], f.points[f.points.length - 1][0]];
  }

  /**
   * Resolve Cv (and the implied dynamic viscosity) for a registered fluid
   * at a temperature. Throws outside the tabulated range.
   * @returns {{CV: number, dynamicViscosity: number, source: string}}
   */
  function resolveFluidCv(id, tempF) {
    const f = FLUID_REGISTRY[id];
    if (!f) throw new Error('Unknown fluid: ' + id);
    const [t0, t1] = fluidTempRange(id);
    if (tempF < t0 || tempF > t1) {
      throw new Error(`${f.label}: ${tempF} F is outside the tabulated ` +
        `range (${t0} to ${t1} F).`);
    }
    if (f.type === 'cv') {
      const CV = interpolateTable(f.points, tempF);
      return { CV, dynamicViscosity: REFERENCE_VISCOSITY / CV, source: 'fluid-cv-table' };
    }
    if (f.type === 'dynamic') {
      const cP = interpolateTable(f.points, tempF);
      const nu = cP * CENTIPOISE_TO_LBF_MIN_IN2;
      return { CV: REFERENCE_VISCOSITY / nu, dynamicViscosity: nu, source: 'fluid-dynamic-table' };
    }
    const cSt = interpolateTable(f.points, tempF);
    let sg;
    if (f.sg) {
      sg = interpolateTable(f.sg, tempF);
    } else {
      sg = interpolateTable(f.density, tempF) / 1000;
    }
    const nu = dynamicFromKinematicCst(cSt, sg);
    return { CV: REFERENCE_VISCOSITY / nu, dynamicViscosity: nu, source: 'fluid-kinematic-table' };
  }

  // Seed the registry with the NSWC-11 Table 3-3 fluids (direct Cv).
  (function seedTable33() {
    for (const fluid of Object.keys(CV_FLUID_TABLE)) {
      const points = [];
      const row = CV_FLUID_TABLE[fluid];
      for (let i = 0; i < CV_TABLE_TEMPS.length; i++) {
        if (row[i] != null) points.push([CV_TABLE_TEMPS[i], row[i]]);
      }
      registerFluid(fluid, {
        label: fluid + ' (NSWC-11 Table 3-3)',
        source: 'NSWC-11 Table 3-3',
        type: 'cv',
        points,
      });
    }
  })();

  // -------------------------------------------------------------------
  // Individual multiplying factors (each is exported for charting too)
  // -------------------------------------------------------------------

  /**
   * CP — fluid pressure factor (NSWC-11 Figure 3.10).
   *   CP = 0.25                 for Ps <= 1500 psi
   *   CP = (Ps / 3000)^2        for Ps  > 1500 psi
   * Figure 3.10 defines Ps = P1 - P2 (upstream minus downstream pressure),
   * so the differential is the handbook convention and the default here.
   * mode 'system' (Ps = P1 alone) is retained as an option; with P2 at or
   * near atmospheric the two are effectively identical.
   */
  function factorCP(P1, P2, mode) {
    const P = mode === 'system' ? P1 : P1 - P2;
    return P > CP_THRESHOLD_PSI ? Math.pow(P / 3000, 2) : 0.25;
  }

  /**
   * CQ — allowable leakage factor (NSWC-11 Figure 3.11).
   *   CQ = 0.055 / Qf           for Qf >  0.03 in^3/min
   *   CQ = 4.2 - 79 * Qf        for Qf <= 0.03 in^3/min
   * Branches are continuous at Qf = 0.03 (both ~1.83). Qf = 0 is the
   * zero-leakage requirement and gives the maximum CQ = 4.2.
   */
  function factorCQ(Qf) {
    return Qf > CQ_THRESHOLD ? 0.055 / Qf : 4.2 - 79 * Qf;
  }

  /**
   * CDL — seal size factor (NSWC-11 Figure 3.12).
   *   CDL = 0.32 + 1.1 * Dsl
   * Dsl = inner diameter of the seal, inches (used by the handbook as a
   * close approximation of seal size).
   */
  function factorCDL(Dsl) {
    return 0.32 + 1.1 * Dsl;
  }

  /**
   * CDL — gasket size variant (NSWC-11 Figure 3.13), for flat,
   * non-circular gaskets:
   *   CDL = 0.45 * (L / w) + 0.32
   * L = total linear length of the gasket, in; w = minimum gasket width, in.
   */
  function factorCDLGasket(L, w) {
    return 0.45 * (L / w) + 0.32;
  }

  /**
   * Meyer hardness M (= Young's modulus for elastomers), lbf/in^2,
   * from Shore A durometer via NSWC-11 Figure 3.4. Linearly interpolated.
   */
  function meyerHardness(durometer) {
    return interpolateTable(DUROMETER_TABLE, durometer);
  }

  /**
   * Contact pressure C, lbf/in^2 — NSWC-11 Equations (3-9)/(3-10):
   *
   *   C = [ Fc - P1*pi*ri^2 - (P1 - P2) * ((ro + ri)/2) * (ro - ri) ]
   *       / ( pi * (ro^2 - ri^2) )
   *
   * Fc is the force compressing the seal. NSWC-11 §3.2.3.4(3): "For most
   * seals, the force compressing the seal Fc is normally two and one-half
   * times the Young's modulus for the material" — i.e. Fc = 2.5 * M by
   * default, or pass an explicit measured/designed Fc (lbf).
   */
  function contactPressure(P1, P2, ri, ro, M, FcOverride) {
    const Fc = isFiniteNumber(FcOverride) ? FcOverride : 2.5 * M;
    const pressureLoad = P1 * Math.PI * ri * ri;
    const gradientLoad = (P1 - P2) * ((ro + ri) / 2) * (ro - ri);
    const area = Math.PI * (ro * ro - ri * ri);
    return {
      Fc,
      netForce: Fc - pressureLoad - gradientLoad,
      contactArea: area,
      C: (Fc - pressureLoad - gradientLoad) / area,
    };
  }

  /**
   * CH — contact stress / hardness factor (NSWC-11 Figure 3.14):
   *   CH = ( (M / C) / 0.55 )^4.3
   * M/C = 0.55 is the design ideal (CH = 1). Softer seals relative to the
   * applied contact stress (lower M/C) reduce CH; harder seals raise it.
   */
  function factorCH(M, C) {
    return Math.pow((M / C) / 0.55, 4.3);
  }

  /**
   * CF — surface finish factor (NSWC-11 Figure 3.15):
   *   CF = 0.25                 for f <  15 micro-inch
   *   CF = f^1.65 / 353         for f >= 15 micro-inch
   * Continuous at f = 15 (~0.25). f is the finish of the harder
   * (gland/flange) surface.
   */
  function factorCF(f) {
    return f < 15 ? 0.25 : Math.pow(f, 1.65) / 353;
  }

  /**
   * Cv — fluid viscosity factor (NSWC-11 Table 3-3):
   *   Cv = nu_0 / nu,  nu_0 = 2e-8 lbf-min/in^2
   * nu is the DYNAMIC (absolute) viscosity of the sealed fluid at the
   * operating temperature. Thinner fluids leak more readily, so Cv rises
   * as viscosity falls.
   */
  function factorCV(nu) {
    return REFERENCE_VISCOSITY / nu;
  }

  /**
   * Cv from kinematic viscosity + specific gravity (NSWC-11 §3.2.3.5):
   * dynamic = kinematic * specific gravity.
   * `kinematic` must already be in lbf-min/in^2-compatible units.
   */
  function dynamicFromKinematic(kinematic, specificGravity) {
    return kinematic * specificGravity;
  }

  function specificGravity(fluid, tempF) {
    const table = SPECIFIC_GRAVITY_TABLE[fluid];
    if (!table) throw new Error('Unknown fluid: ' + fluid);
    return interpolateTable(table, tempF);
  }

  /**
   * CT — temperature factor (NSWC-11 Equation 3-11):
   *   t  = (Tr - To) / 18
   *   CT = 1 / 2^t              for (Tr - To) <= 40 F
   *   CT = 0.21                 for (Tr - To)  > 40 F
   * Tr = maximum rated temperature of the seal material; To = operating
   * temperature. Operating close to the material's rating accelerates
   * aging (CT -> 1 as To -> Tr). The two branches meet at delta = 40 F.
   */
  function factorCT(Tr, To) {
    const delta = Tr - To;
    return delta > CT_DELTA_LIMIT_F ? 0.21 : 1 / Math.pow(2, delta / 18);
  }

  /**
   * Cv lookup for typical fluids — NSWC-11 Table 3-3. Linearly interpolates
   * between tabulated temperatures. Throws if the fluid is unknown or the
   * temperature falls in a range the handbook marks unreliable.
   * @param {string} fluid  key of CV_FLUID_TABLE
   * @param {number} tempF  fluid temperature, deg F
   */
  function cvForFluid(fluid, tempF) {
    const row = CV_FLUID_TABLE[fluid];
    if (!row) throw new Error('Unknown fluid: ' + fluid);
    const pts = [];
    for (let i = 0; i < CV_TABLE_TEMPS.length; i++) {
      if (row[i] != null) pts.push([CV_TABLE_TEMPS[i], row[i]]);
    }
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    if (tempF < t0 || tempF > t1) {
      throw new Error(`No reliable Cv data for ${fluid} at ${tempF} F ` +
        `(table covers ${t0} to ${t1} F)`);
    }
    return interpolateTable(pts, tempF);
  }

  /**
   * CN — fluid contaminant factor (NSWC-11 Table 3-4):
   *
   *   CN = (C0 / C10)^3 * FR * N10
   *
   *   C0  = system filter size, microns
   *   C10 = standard system filter size = 10 microns
   *   FR  = rated flow rate, GPM
   *   N10 = particles under 10 micron per hour per rated GPM produced by
   *         the upstream component (Table 3-4 / N10_TABLE)
   *
   * Accepted inputs:
   *   - nothing/null  -> 1.0 (the source analysis used CN = 1, "based on
   *                      other analyses" — i.e. a clean, filtered system)
   *   - a number      -> used directly as CN
   *   - an object     -> { filterMicrons, flowRateGPM, component } where
   *                      component is an id from N10_TABLE, or pass an
   *                      explicit n10 value instead of component.
   */
  function factorCN(input) {
    if (input == null) return 1.0;
    if (isFiniteNumber(input)) return input;
    if (typeof input === 'object') {
      const { filterMicrons, flowRateGPM, component, n10 } = input;
      let n = n10;
      if (!isFiniteNumber(n)) {
        const row = N10_TABLE.find((o) => o.id === component);
        if (!row) throw new Error('Unknown upstream component: ' + component);
        n = row.n10;
      }
      if (!isFiniteNumber(filterMicrons) || filterMicrons <= 0) {
        throw new Error('CN requires a positive filterMicrons (system filter size).');
      }
      if (!isFiniteNumber(flowRateGPM) || flowRateGPM < 0) {
        throw new Error('CN requires a non-negative flowRateGPM (rated flow).');
      }
      return Math.pow(filterMicrons / STANDARD_FILTER_MICRONS, 3) * flowRateGPM * n;
    }
    return 1.0;
  }

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------

  function validate(inp) {
    const errors = [];
    const req = [
      'leakageRate', 'sealInnerDia', 'sealOuterDia', 'pressureHigh',
      'pressureLow', 'surfaceFinish', 'operatingTemp', 'ratedTemp',
      'durometer',
    ];
    for (const k of req) {
      if (!isFiniteNumber(inp[k])) errors.push(`Missing or non-numeric input: ${k}`);
    }

    // Viscosity: exactly one of three input paths must be usable.
    const hasDyn = inp.dynamicViscosity != null;
    const hasKin = inp.kinematicViscosity != null;
    const hasFluid = typeof inp.fluid === 'string' && inp.fluid.length > 0;
    if (!hasDyn && !hasKin && !hasFluid) {
      errors.push('Provide a viscosity: dynamicViscosity (lbf-min/in^2), ' +
        'kinematicViscosity (cSt) with specificGravity or density, ' +
        'or a fluid id from listFluids().');
    }
    if (hasDyn && (!isFiniteNumber(inp.dynamicViscosity) || inp.dynamicViscosity <= 0)) {
      errors.push('dynamicViscosity must be a positive number (lbf-min/in^2).');
    }
    if (hasKin) {
      if (!isFiniteNumber(inp.kinematicViscosity) || inp.kinematicViscosity <= 0) {
        errors.push('kinematicViscosity must be a positive number (centistokes).');
      }
      const hasSG = isFiniteNumber(inp.specificGravity) && inp.specificGravity > 0;
      const hasRho = isFiniteNumber(inp.density) && inp.density > 0;
      if (!hasSG && !hasRho) {
        errors.push('kinematicViscosity requires specificGravity ' +
          '(dimensionless) or density (kg/m^3) to convert to dynamic viscosity.');
      }
    }

    if (errors.length) return errors;

    if (inp.leakageRate < 0) errors.push('Allowable leakage rate cannot be negative.');
    if (inp.sealInnerDia <= 0) errors.push('Seal inner diameter must be positive.');
    if (inp.sealOuterDia <= inp.sealInnerDia) {
      errors.push('Seal outer diameter must exceed the inner diameter.');
    }
    if (inp.pressureHigh < inp.pressureLow) {
      errors.push('Higher pressure (P1) must be at least the lower pressure (P2).');
    }
    if (inp.surfaceFinish <= 0) errors.push('Surface finish must be positive.');
    return errors;
  }

  // -------------------------------------------------------------------
  // Main entry point
  // -------------------------------------------------------------------

  /**
   * Calculate the static seal failure rate.
   *
   * @param {Object} inp
   * @param {number} inp.leakageRate       Qf, allowable leakage, in^3/min
   * @param {number} inp.sealInnerDia      seal inner diameter, in
   * @param {number} inp.sealOuterDia      seal outer diameter, in
   * @param {number} inp.pressureHigh      P1, lbf/in^2
   * @param {number} inp.pressureLow       P2, lbf/in^2
   * @param {number} inp.surfaceFinish     f, micro-inch (harder surface)
   * @param {number} inp.operatingTemp     To, deg F
   * @param {number} inp.ratedTemp         Tr, deg F (seal material rating)
   * @param {number} inp.durometer         Shore A hardness, 30–90
   *
   * Viscosity — provide exactly ONE of these three paths:
   * @param {number} [inp.dynamicViscosity]   nu, lbf-min/in^2 (direct)
   * @param {number} [inp.kinematicViscosity] custom kinematic viscosity,
   *        centistokes — requires one of:
   * @param {number} [inp.specificGravity]    dimensionless, or
   * @param {number} [inp.density]            kg/m^3
   * @param {string} [inp.fluid]           fluid id from listFluids() —
   *        interpolates the registered table at fluidTemp
   * @param {number} [inp.fluidTemp]       deg F (defaults to operatingTemp)
   * @param {number} [inp.compressionForce]   explicit Fc, lbf (default 2.5*M)
   * @param {number|Object} [inp.contaminant]  CN value, or
   *        { filterMicrons, flowRateGPM, component|n10 } per Table 3-4
   *        (default 1.0)
   * @param {string} [inp.cpMode]          'differential' (default, Ps = P1-P2
   *                                       per Figure 3.10) or 'system' (Ps = P1)
   * @param {number} [inp.chOverride]      force CH to a value (e.g. 1)
   *
   * @returns {{ok: boolean, errors?: string[], lambda?: number, ...}}
   */
  function calculate(inp) {
    const errors = validate(inp);
    if (errors.length) return { ok: false, errors };

    const warnings = [];

    // --- Hardness / contact pressure chain -------------------------
    if (inp.durometer < 30 || inp.durometer > 90) {
      warnings.push('Durometer outside the 30–90 Shore A range of NSWC-11 ' +
        'Figure 3.4; value clamped to the nearest table endpoint.');
    }
    const M = meyerHardness(inp.durometer);

    const ri = inp.sealInnerDia / 2;
    const ro = inp.sealOuterDia / 2;
    const cp = contactPressure(
      inp.pressureHigh, inp.pressureLow, ri, ro, M, inp.compressionForce
    );

    let CH;
    let chMode = 'calculated';
    if (isFiniteNumber(inp.chOverride)) {
      CH = inp.chOverride;
      chMode = 'override';
    } else if (cp.C <= 0) {
      // Fluid pressure exceeds the compressive force: the model's contact
      // pressure goes non-physical. Fall back to CH = 1 and flag it.
      CH = 1.0;
      chMode = 'fallback-unity';
      warnings.push('Computed contact pressure is zero or negative (fluid ' +
        'load exceeds seal compression force). CH set to 1.0; review the ' +
        'compression force assumption (default Fc = 2.5 × M).');
    } else {
      CH = factorCH(M, cp.C);
    }

    const ratio = cp.C > 0 ? M / cp.C : NaN;
    if (chMode === 'calculated' && (ratio < 0.1 || ratio > 5)) {
      warnings.push(`M/C ratio is ${ratio.toPrecision(3)} — far from the ` +
        'design ideal of 0.55. CH dominates the result here (it varies as ' +
        '(M/C)^4.3); verify the actual seal compression force before ' +
        'relying on the calculated CH. The result with CH = 1 is also ' +
        'reported for comparison.');
    }

    // --- Remaining factors ------------------------------------------
    const CP = factorCP(inp.pressureHigh, inp.pressureLow, inp.cpMode || 'differential');
    const CQ = factorCQ(inp.leakageRate);
    const CDL = factorCDL(inp.sealInnerDia);
    const CF = factorCF(inp.surfaceFinish);

    // Viscosity resolution — direct dynamic, custom kinematic, or
    // registered fluid/temperature (priority in that order).
    let CV;
    let viscosity = { source: null, dynamicViscosity: null, kinematicViscosity: null, specificGravity: null };
    if (inp.dynamicViscosity != null) {
      CV = factorCV(inp.dynamicViscosity);
      viscosity = {
        source: 'dynamic',
        dynamicViscosity: inp.dynamicViscosity,
        kinematicViscosity: null,
        specificGravity: null,
      };
    } else if (inp.kinematicViscosity != null) {
      const sg = isFiniteNumber(inp.specificGravity)
        ? inp.specificGravity
        : inp.density / 1000;
      const nu = dynamicFromKinematicCst(inp.kinematicViscosity, sg);
      CV = factorCV(nu);
      viscosity = {
        source: 'kinematic',
        dynamicViscosity: nu,
        kinematicViscosity: inp.kinematicViscosity,
        specificGravity: sg,
      };
    } else {
      const tempF = isFiniteNumber(inp.fluidTemp) ? inp.fluidTemp : inp.operatingTemp;
      let resolved;
      try {
        resolved = resolveFluidCv(inp.fluid, tempF);
      } catch (e) {
        return { ok: false, errors: [e.message] };
      }
      CV = resolved.CV;
      viscosity = {
        source: resolved.source,
        fluid: inp.fluid,
        fluidTemp: tempF,
        dynamicViscosity: resolved.dynamicViscosity,
        kinematicViscosity: null,
        specificGravity: null,
      };
    }

    const CT = factorCT(inp.ratedTemp, inp.operatingTemp);
    const CN = factorCN(inp.contaminant);

    if (inp.ratedTemp < inp.operatingTemp) {
      warnings.push('Operating temperature exceeds the seal material rating ' +
        '(Tr < To). The CT model is defined for To <= Tr; the result is an ' +
        'extrapolation and the seal material should be reconsidered.');
    }
    if (inp.surfaceFinish > 250) {
      warnings.push('Surface finish beyond ~250 micro-inch is outside the ' +
        'range of NSWC-11 Figure 3.15; CF is an extrapolation.');
    }

    const product = CP * CQ * CDL * CH * CF * CV * CT * CN;
    const productUnity = CP * CQ * CDL * 1.0 * CF * CV * CT * CN;

    return {
      ok: true,
      warnings,
      baseFailureRate: BASE_FAILURE_RATE,
      factors: { CP, CQ, CDL, CH, CF, CV, CT, CN },
      intermediates: {
        meyerHardness: M,
        compressionForce: cp.Fc,
        netSealForce: cp.netForce,
        contactArea: cp.contactArea,
        contactPressure: cp.C,
        hardnessRatio: ratio,
        chMode,
        innerRadius: ri,
        outerRadius: ro,
        viscosity,
      },
      /** failures per 10^6 hours, calculated CH */
      lambda: BASE_FAILURE_RATE * product,
      /** failures per 10^6 hours, CH forced to 1 ("based on other analyses") */
      lambdaUnityCH: BASE_FAILURE_RATE * productUnity,
      /** mean time between failures, hours (calculated CH) */
      mtbfHours: product > 0 ? 1e6 / (BASE_FAILURE_RATE * product) : Infinity,
    };
  }

  // -------------------------------------------------------------------
  // Chart helpers — series generators for the Chart.js placeholders.
  // Each returns {x: [...], y: [...]} ready to map into a Chart.js dataset.
  // -------------------------------------------------------------------

  function series(fn, from, to, steps) {
    const x = [];
    const y = [];
    for (let i = 0; i <= steps; i++) {
      const xi = from + ((to - from) * i) / steps;
      x.push(xi);
      y.push(fn(xi));
    }
    return { x, y };
  }

  const chartSeries = {
    /** CP vs pressure differential, 0–6000 psi (NSWC-11 Fig. 3.10 analog). */
    cp: () => series((p) => factorCP(p, 0, 'differential'), 0, 6000, 120),
    /** CQ vs allowable leakage, 0–0.5 in^3/min (Fig. 3.11 analog). */
    cq: () => series(factorCQ, 0, 0.5, 200),
    /** CDL vs seal inner diameter, 0–6 in (Fig. 3.12 analog). */
    cdl: () => series(factorCDL, 0, 6, 60),
    /** CDL (gasket) vs L/w ratio, 1–26 (Fig. 3.13 analog). */
    cdlGasket: () => series((r) => 0.45 * r + 0.32, 1, 26, 100),
    /** CH vs M/C ratio, 0.1–2 (Fig. 3.14 analog). */
    ch: () => series((r) => Math.pow(r / 0.55, 4.3), 0.1, 2, 190),
    /** CF vs surface finish, 1–120 micro-inch (Fig. 3.15 analog). */
    cf: () => series(factorCF, 1, 120, 238),
    /** CT vs (Tr - To), 0–100 F (Fig. 3.16 analog). */
    ct: () => series((d) => (d > CT_DELTA_LIMIT_F ? 0.21 : 1 / Math.pow(2, d / 18)), 0, 100, 200),
    /** Durometer vs Young's modulus (Fig. 3.4 analog). */
    youngs: () => ({
      x: DUROMETER_TABLE.map((r) => r[0]),
      y: DUROMETER_TABLE.map((r) => r[1]),
    }),
    /**
     * CN vs system filter size, 3–40 microns, for a given rated flow (GPM)
     * and upstream component id or n10 value (Table 3-4 analog).
     */
    cn: (flowRateGPM, componentOrN10) => {
      const n10 = isFiniteNumber(componentOrN10)
        ? componentOrN10
        : (N10_TABLE.find((o) => o.id === componentOrN10) || { n10: NaN }).n10;
      return series(
        (c0) => Math.pow(c0 / STANDARD_FILTER_MICRONS, 3) * flowRateGPM * n10,
        3, 40, 74
      );
    },
  };

  // -------------------------------------------------------------------
  return {
    BASE_FAILURE_RATE,
    REFERENCE_VISCOSITY,
    CENTIPOISE_TO_LBF_MIN_IN2,
    STANDARD_FILTER_MICRONS,
    DUROMETER_TABLE,
    N10_TABLE,
    SEAL_MATERIAL_RATED_TEMPS,
    CV_TABLE_TEMPS,
    CV_FLUID_TABLE,
    SPECIFIC_GRAVITY_TABLE,
    meyerHardness,
    contactPressure,
    dynamicFromKinematic,
    dynamicFromKinematicCst,
    specificGravity,
    cvForFluid,
    registerFluid,
    listFluids,
    fluidTempRange,
    resolveFluidCv,
    factorCP,
    factorCQ,
    factorCDL,
    factorCDLGasket,
    factorCH,
    factorCF,
    factorCV,
    factorCT,
    factorCN,
    calculate,
    chartSeries,
  };
});
