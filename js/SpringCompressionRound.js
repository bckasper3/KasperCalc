// ============================================================
// SPRING CALCULATOR — LEVENBERG–MARQUARDT CONSTRAINT SOLVER
// ============================================================
// Architecture:
//   1. Variable System   — maps DOM field IDs ↔ solver vector
//   2. Residual Builder  — four weighted constraint tiers
//   3. LM Solver         — full Levenberg–Marquardt optimizer
//   4. Matrix Utilities  — transpose, multiply, linear solve
//   5. URL Hash State    — encode/restore full design in URL
//   6. Integration       — runCalc() → LM → deterministic post-pass
//
// URL Hash State:
//   Every user input is encoded into the URL fragment in real time.
//   The hash is never sent to the server — purely client-side.
//   Reloading, bookmarking, or sharing the URL fully restores
//   the design including which fields are user-pinned.
//
// Decimal place rules:
//   G, mts                   → integer  (writeFieldValueInteger)
//   dTol                     → 4 places
//   su*, sc*, pMTS*          → 0 places
//   everything else          → 3 places (default)
//
// Buckling — Wahl / Stahl stability equations (1963/1974):
//   Four end conditions are supported, each with its effective-
//   length factor α:
//     Fixed–Fixed    (both ends flat, parallel plates):  α = 0.5
//     Fixed–Hinged   (one flat end, one pivoting end):   α = 1/√2 ≈ 0.7071
//     Hinged–Hinged  (both ends pivoting):               α = 1.0
//     Fixed–Free     (one fixed, one laterally free):    α = 2.0
//
//   Stability criterion (exact Wahl/Stahl):
//     ξ  = π·D / (α·Lf)          [buckle ratio]
//     ξ > 1  → unconditionally stable (spring too short to buckle)
//     ξ ≤ 1  → can buckle; critical deflection:
//       δ_cr = Lf · [1 − √(1 − ξ²)]
//       L_cr = Lf − δ_cr
//       F_cr = k · δ_cr
// ============================================================


// ============================================================
// STANDARD WIRE DIAMETERS (ASTM / music wire gauge table)
// ============================================================
const STANDARD_WIRE_DIAMETERS_IN = [
  0.005,0.006,0.007,0.008,0.009,0.010,0.011,0.012,0.013,0.014,0.015,0.016,0.017,0.018,0.019,0.020,
  0.021,0.022,0.023,0.024,0.025,0.026,0.027,0.028,0.029,0.030,0.031,0.032,0.033,0.034,0.035,0.036,
  0.037,0.038,0.039,0.040,0.041,0.042,0.043,0.044,0.045,0.046,0.047,0.048,0.049,0.050,0.051,0.052,
  0.053,0.054,0.055,0.056,0.057,0.058,0.059,0.060,0.061,0.0625,0.063,0.064,0.065,0.066,0.067,0.068,
  0.070,0.071,0.072,0.073,0.074,0.075,0.076,0.078,0.079,0.080,0.081,0.082,0.083,0.084,0.085,0.086,
  0.087,0.088,0.089,0.090,0.091,0.092,0.093,0.094,0.095,0.097,0.098,0.099,0.100,0.101,0.102,0.103,
  0.105,0.106,0.109,0.110,0.112,0.113,0.114,0.115,0.116,0.117,0.118,0.119,0.120,0.121,0.122,0.123,
  0.124,0.125,0.126,0.127,0.128,0.130,0.132,0.133,0.134,0.135,0.136,0.140,0.141,0.142,0.145,0.146,
  0.147,0.148,0.149,0.150,0.152,0.156,0.159,0.160,0.162,0.163,0.165,0.167,0.170,0.172,0.177,0.180,
  0.182,0.186,0.187,0.188,0.190,0.191,0.192,0.193,0.196,0.206,0.207,0.217,0.218,0.220,0.225,0.234,
  0.235,0.245,0.247,0.250,0.262,0.264,0.281,0.282,0.283,0.312,0.343,0.362,0.375,0.394,0.437,0.453,
  0.468,0.500,0.562,0.625
];


// ============================================================
// STATE
// ============================================================

let loadedRoundMaterialsByName = {};
let selectedMaterialRecord = null;
let _lastSolvedState = null;

// Tracks which field IDs the user has typed into manually.
// The LM solver treats these as hard-pinned constraints.
// Serialised into the URL hash on every change and restored on load.
const userEnteredFieldIds = new Set();

// Suppresses hash writes during the initial restore pass.
let _suppressHashWrite = true;


// ============================================================
// VARIABLE SYSTEM
// ============================================================

const LM_VARIABLES = [
  'd',      // 0  wire diameter
  'D',      // 1  mean coil diameter
  'OD',     // 2  outside diameter
  'ID',     // 3  inside diameter
  'C',      // 4  spring index
  'Na',     // 5  active coils
  'Nt',     // 6  total coils
  // 'Nd' removed — it is deterministic from end type, not a solver variable
  'k',      // 7  spring rate
  'Lf',     // 8  free length
  'Ls',     // 9  solid length
  'pitch',  // 10 coil pitch
  'F1',     // 11 load at position 1
  'L1',     // 12 length at position 1
  'F2',     // 13 load at position 2
  'L2',     // 14 length at position 2
];

const LM_DEFAULTS = {
  d: 0.080, D: 0.800, OD: 0.880, ID: 0.720, C: 10.0,
  Na: 8.0,  Nt: 10.0, k: 50.0,
  Lf: 2.00, Ls: 0.80, pitch: 0.22,
  F1: 40.0, L1: 1.70, F2: 65.0,  L2: 1.40,
};

const LM_SCALES = {
  d: 0.1, D: 1.0, OD: 1.0, ID: 1.0, C: 10.0,
  Na: 10.0, Nt: 10.0, k: 100.0,
  Lf: 2.0, Ls: 1.0, pitch: 0.2,
  F1: 50.0, L1: 2.0, F2: 50.0, L2: 2.0,
};

function buildVariableVector() {
  return LM_VARIABLES.map(id => {
    const v = readFieldValue(id);
    return (v !== null && v > 0) ? v : (LM_DEFAULTS[id] || 1.0);
  });
}

function applyVariableVector(x) {
  const hasL1 = userEnteredFieldIds.has('F1') || userEnteredFieldIds.has('L1');
  const hasL2 = userEnteredFieldIds.has('F2') || userEnteredFieldIds.has('L2');

  LM_VARIABLES.forEach((id, i) => {
    if (userEnteredFieldIds.has(id)) return;
    if (!hasL1 && (id === 'F1' || id === 'L1')) return;
    if (!hasL2 && (id === 'F2' || id === 'L2')) return;

    const val = x[i];
    if (val !== null && isFinite(val) && val > 0) {
      writeFieldValue(id, val, true);
    }
  });
}

function lmIdx(id) { return LM_VARIABLES.indexOf(id); }


// ============================================================
// URL HASH STATE
// ============================================================

function saveStateToHash() {
  if (_suppressHashWrite) return;

  const p = new URLSearchParams();

  if (userEnteredFieldIds.size > 0) {
    p.set('_u', [...userEnteredFieldIds].join(','));
  }

  userEnteredFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value.trim() !== '') {
      p.set(id, el.value.trim());
    }
  });

  const cbMap = { ec: 'endClosed', eg: 'endGround', cp: 'condPreset', cn: 'condPeened' };
  Object.entries(cbMap).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el?.checked) p.set(key, '1');
  });

  const buckle = document.querySelector('input[name=buckle]:checked');
  p.set('buckle', buckle?.value ?? 'unk');

  const modeSel = document.querySelector('.it.sel');
  if (modeSel?.dataset.mode && modeSel.dataset.mode !== 'power') {
    p.set('mode', modeSel.dataset.mode);
  }

  const mat = document.getElementById('material')?.value;
  if (mat && mat !== 'Loading materials...') p.set('material', mat);

  const grade = document.getElementById('grade')?.value;
  if (grade && grade !== 'Commercial') p.set('grade', grade);

  // Custom material — serialize full record BEFORE history.replaceState
  if (mat && loadedRoundMaterialsByName[mat]?.['_custom']) {
    try {
      p.set('_cm', JSON.stringify(loadedRoundMaterialsByName[mat]));
    } catch(e) {}
  }

  // Write fully-built params to URL
  const hashStr = p.toString();
  history.replaceState(null, '', hashStr ? '#' + hashStr : '#');
}

function restoreStateFromHash() {
  const raw = window.location.hash.slice(1);
  if (!raw) return false;

  let p;
  try { p = new URLSearchParams(raw); } catch { return false; }

  _suppressHashWrite = true;

  // ── STEP 1: Restore custom material record first ──────────
  // Must happen before dropdown population so the option exists.
  const cmRaw = p.get('_cm');
  if (cmRaw) {
    try {
      const rec = JSON.parse(cmRaw);
      if (rec && rec['NAME']) {
        loadedRoundMaterialsByName[rec['NAME']] = rec;
        const sel = document.getElementById('material');
        if (sel && ![...sel.options].some(o => o.value === rec['NAME'])) {
          const opt       = document.createElement('option');
          opt.value       = rec['NAME'];
          opt.textContent = '★ ' + rec['NAME'] + ' (custom)';
          opt.dataset.custom = rec['NAME'];
          sel.insertBefore(opt, sel.firstChild);
        }
      }
    } catch(e) {
      console.warn('Could not restore custom material from hash:', e);
    }
  }

  // ── STEP 2: Restore material dropdown & populate G ────────
  // G is a material property — write it from the database unless
  // the user explicitly saved a custom G value in the hash.
  const mat   = p.get('material');
  const matEl = document.getElementById('material');
  if (mat && matEl && loadedRoundMaterialsByName[mat]) {
    matEl.value            = mat;
    selectedMaterialRecord = loadedRoundMaterialsByName[mat];

    const G_db = getGFromRecord(selectedMaterialRecord);
    const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;

    // Write G only if the hash doesn't contain a user-pinned G value
    if (G_db && !p.has('G')) {
      const gEl = document.getElementById('G');
      if (gEl) {
        gEl.value = Math.round(G_db).toString();
        gEl.classList.remove('user-entered');
        userEnteredFieldIds.delete('G');
      }
    }

    // Apply wire diameter max constraint from material
    const dEl = document.getElementById('d');
    if (dEl) {
      if (maxD !== null) dEl.setAttribute('max', maxD);
      else               dEl.removeAttribute('max');
    }
  }

  // ── STEP 3: Restore grade dropdown ────────────────────────
  const gradeEl = document.getElementById('grade');
  if (gradeEl && p.has('grade')) gradeEl.value = p.get('grade');

  // ── STEP 4: Rebuild pinned field set ──────────────────────
  userEnteredFieldIds.clear();
  const pinnedStr = p.get('_u');
  if (pinnedStr) {
    pinnedStr.split(',').forEach(id => {
      if (id.trim()) userEnteredFieldIds.add(id.trim());
    });
  }

  // ── STEP 5: Restore pinned field values into DOM ──────────
  userEnteredFieldIds.forEach(id => {
    if (!p.has(id)) return;
    const el = document.getElementById(id);
    if (!el || el.type !== 'number') return;
    el.value = p.get(id);
    el.classList.add('user-entered');
  });

  // ── STEP 6: Restore checkboxes ────────────────────────────
  const cbMap = { ec: 'endClosed', eg: 'endGround', cp: 'condPreset', cn: 'condPeened' };
  Object.entries(cbMap).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el) el.checked = p.get(key) === '1';
  });

  // ── STEP 7: Restore buckling radio ────────────────────────
  const buckleVal = p.get('buckle') ?? 'unk';
  document.querySelectorAll('input[name=buckle]').forEach(radio => {
    radio.checked = radio.value === buckleVal;
  });

  // ── STEP 8: Restore input mode selector ───────────────────
  const mode = p.get('mode') ?? 'power';
  document.querySelectorAll('.it').forEach(label => {
    const matches = label.dataset.mode === mode;
    label.classList.toggle('sel', matches);
    const radio = label.querySelector('input[type=radio]');
    if (radio) radio.checked = matches;
  });

  // ── STEP 9: Apply grade tolerances from restored grade ────
  applyGradeTolerances();

  _suppressHashWrite = false;
  return true;
}

function copyHashLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1800);
  }).catch(() => {
    prompt('Copy this link:', window.location.href);
  });
}


// ============================================================
// RESIDUAL BUILDER
// ============================================================

const W_USER = 1e6;
const W_HARD = 1e3;
const W_PHYS = 1.0;
const W_SOFT = 0.05;

function buildResiduals(x) {
  const v = {};
  LM_VARIABLES.forEach((id, i) => { v[id] = x[i]; });

  // Nd and end type are deterministic — never solver variables
  const closed  = document.getElementById('endClosed')?.checked ?? false;
  const ground  = document.getElementById('endGround')?.checked ?? false;
  const Nd      = getDeadCoilCountFromEndType();
  const G       = readFieldValue('G') || 11500000;
  const r       = [];

  // ── TIER A: User input pins ──────────────────────────────
  LM_VARIABLES.forEach(id => {
    if (userEnteredFieldIds.has(id)) {
      const userVal = readFieldValue(id);
      if (userVal !== null && userVal > 0) {
        const scale = LM_SCALES[id] || 1.0;
        r.push(W_USER * (v[id] - userVal) / scale);
      }
    }
  });

  // ── TIER B: Hard geometric identities ───────────────────

  // Diameter relationships — always true
  r.push(W_HARD * (v.OD - (v.D + v.d))               / 1.0);
  r.push(W_HARD * (v.ID - (v.D - v.d))               / 1.0);
  r.push(W_HARD * (v.C  - v.D / Math.max(v.d, 1e-9)) / 10.0);

  // Total coil count
  r.push(W_HARD * (v.Nt - (v.Na + Nd)) / 10.0);

  // Solid length — depends on whether ends are ground
  // Ground ends are flat: Ls = Nt × d
  // Unground ends have wire tips: Ls = (Nt + 1) × d
  {
    const Ls_calc = ground ? v.Nt * v.d : (v.Nt + 1) * v.d;
    r.push(W_HARD * (v.Ls - Ls_calc) / 1.0);
  }

  // Free length — depends on end type combination
  // Squared+ground:  Lf = Na·p + 2d
  // Squared only:    Lf = Na·p + 3d
  // Plain ground:    Lf = Na·p + d
  // Plain open:      Lf = Na·p
  {
    let Lf_calc;
    if      ( closed &&  ground) Lf_calc = v.Na * v.pitch + 2 * v.d;
    else if ( closed && !ground) Lf_calc = v.Na * v.pitch + 3 * v.d;
    else if (!closed &&  ground) Lf_calc = v.Na * v.pitch + v.d;
    else                         Lf_calc = v.Na * v.pitch;
    r.push(W_HARD * (v.Lf - Lf_calc) / 2.0);
  }

  // ── TIER C: Physics ──────────────────────────────────────

  // Spring rate
  {
    const k_calc = (G * Math.pow(Math.max(v.d, 1e-9), 4))
                 / (8.0 * Math.pow(Math.max(v.D, 1e-9), 3) * Math.max(v.Na, 1e-9));
    r.push(W_PHYS * (v.k - k_calc) / Math.max(v.k, 1.0));
  }

  // Natural frequency — only when user pins fn
  if (userEnteredFieldIds.has('fn')) {
    const userFn  = readFieldValue('fn');
    const density = parseFloat(selectedMaterialRecord?.['DENSITY (LB/IN^3)']) || 0.284;
    const g_accel = 386.1;
    if (userFn && density) {
      const turnLength = Math.sqrt(
        Math.pow(Math.PI * Math.max(v.D, 1e-9), 2) + Math.pow(v.pitch, 2)
      );
      const wireLength = turnLength * Math.max(v.Nt, 1e-9);
      const W_s = (Math.PI / 4) * Math.pow(Math.max(v.d, 1e-9), 2) * wireLength * density;
      if (W_s > 0) {
        const fn_calc = 0.5 * Math.sqrt((v.k * g_accel) / W_s);
        r.push(W_PHYS * (fn_calc - userFn) / Math.max(userFn, 1.0));
      }
    }
  }

  // Load-deflection — only when column has user input
  if (userEnteredFieldIds.has('F1') || userEnteredFieldIds.has('L1')) {
    r.push(W_PHYS * (v.F1 - v.k * (v.Lf - v.L1)) / Math.max(v.F1, 1.0));
  }
  if (userEnteredFieldIds.has('F2') || userEnteredFieldIds.has('L2')) {
    r.push(W_PHYS * (v.F2 - v.k * (v.Lf - v.L2)) / Math.max(v.F2, 1.0));
  }

  // Buckling — only when user pins Lbuckle or Fbuckle
  {
    const alpha = getBucklingEffectiveLengthFactor();
    if (alpha && (userEnteredFieldIds.has('Lbuckle') || userEnteredFieldIds.has('Fbuckle'))) {
      const xi = (Math.PI * v.D) / (alpha * Math.max(v.Lf, 1e-9));
      if (xi <= 1.0) {
        const delta_cr = v.Lf * (1 - Math.sqrt(1 - xi * xi));
        const L_cr     = v.Lf - delta_cr;
        const F_cr     = v.k  * delta_cr;

        if (userEnteredFieldIds.has('Lbuckle')) {
          const userLbuckle = readFieldValue('Lbuckle');
          if (userLbuckle) {
            r.push(W_PHYS * (L_cr - userLbuckle) / Math.max(userLbuckle, 0.1));
          }
        }
        if (userEnteredFieldIds.has('Fbuckle')) {
          const userFbuckle = readFieldValue('Fbuckle');
          if (userFbuckle) {
            r.push(W_PHYS * (F_cr - userFbuckle) / Math.max(userFbuckle, 1.0));
          }
        }
      }
    }
  }

  // Shaft, hole, and minID constraints
  {
    const dTol        = readFieldValue('dTol') || computeWireDiameterTolerance(v.d) || 0;
    const dTolCoil    = readFieldValue('dTolCoil') || 0;
    const ID_nom      = v.D - v.d;
    const clearanceFactor = ID_nom < 0.512 ? 0.10 : 0.05;

    if (userEnteredFieldIds.has('minID')) {
      const userMinID = readFieldValue('minID');
      if (userMinID) {
        const minID_calc = ID_nom - dTol - dTolCoil;
        r.push(W_PHYS * (minID_calc - userMinID) / Math.max(userMinID, 0.01));
      }
    }

    if (userEnteredFieldIds.has('shaft')) {
      const userShaft = readFieldValue('shaft');
      if (userShaft) {
        const shaft_calc = (ID_nom - dTol - dTolCoil) - clearanceFactor * v.D;
        r.push(W_PHYS * (shaft_calc - userShaft) / Math.max(userShaft, 0.01));
      }
    }

    if (userEnteredFieldIds.has('hole')) {
      const userHole = readFieldValue('hole');
      if (userHole) {
        const OD_solid_sq = v.OD * v.OD +
          (v.pitch * v.pitch - v.d * v.d) * v.Nt / (Math.PI * Math.PI);
        const OD_solid = OD_solid_sq > v.OD * v.OD ? Math.sqrt(OD_solid_sq) : v.OD;
        const hole_calc = OD_solid + dTolCoil + clearanceFactor * v.D;
        r.push(W_PHYS * (hole_calc - userHole) / Math.max(userHole, 0.01));
      }
    }
  }

  // ── TIER C2: Lf must exceed Ls — one-sided hard penalty ──
  // Uses same ground-aware Ls formula as Tier B to stay consistent.
  {
    const Ls_check = ground ? v.Nt * v.d : (v.Nt + 1) * v.d;
    const slack    = v.Lf - Ls_check;
    if (slack <= 0) {
      r.push(W_HARD * (-slack + 1e-3) / Math.max(v.Lf, 0.1));
    }
  }

  // ── TIER D: Soft preferred-range nudges ──────────────────
  r.push(W_SOFT * Math.max(0, 4.0  - v.C));
  r.push(W_SOFT * Math.max(0, v.C  - 16.0));
  r.push(W_SOFT * Math.max(0, 2.0  - v.Na));
  r.push(W_SOFT * Math.max(0, v.L2 - v.L1));

  // Regularisation
  LM_VARIABLES.forEach(id => {
    if (!userEnteredFieldIds.has(id)) {
      r.push(0.001 * (v[id] - (LM_DEFAULTS[id] || 1.0)) / (LM_SCALES[id] || 1.0));
    }
  });

  return r;
}


// ============================================================
// MATRIX UTILITIES
// ============================================================

function matTranspose(A) {
  const rows = A.length, cols = A[0].length;
  const T = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      T[j][i] = A[i][j];
  return T;
}

function matMultiply(A, B) {
  const m = A.length, k = B.length, n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let p = 0; p < k; p++)
        C[i][j] += A[i][p] * B[p][j];
  return C;
}

function matVecMultiply(A, v) {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-14) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    const denom = M[i][i];
    x[i] /= (Math.abs(denom) < 1e-14 ? 1e-14 : denom);
  }
  return x;
}

function vecNorm(v)   { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }
function vecAdd(a, b) { return a.map((v, i) => v + b[i]); }
function vecNeg(v)    { return v.map(x => -x); }


// ============================================================
// NUMERICAL JACOBIAN
// ============================================================

function numericalJacobian(x, r0) {
  const m = r0.length, n = x.length;
  const J = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const eps = 1e-6 * Math.max(Math.abs(x[j]), 1e-3);
    const xp  = [...x];
    xp[j] += eps;
    const r1 = buildResiduals(xp);
    for (let i = 0; i < m; i++) J[i][j] = (r1[i] - r0[i]) / eps;
  }
  return J;
}


// ============================================================
// LEVENBERG–MARQUARDT SOLVER
// ============================================================

function solveLM(x0, options = {}) {
  const maxIter    = options.maxIter    ?? 10000;
  const minIter    = options.minIter    ?? 150;
  const tol        = options.tol        ?? 1e-8;
  const lambdaInit = options.lambdaInit ?? 1e-2;

  let x      = x0.map(v => Math.max(v, 1e-9));
  let lambda = lambdaInit;
  let iter   = 0;
  let err    = Infinity;

  for (; iter < maxIter; iter++) {
    const r = buildResiduals(x);
    err = vecNorm(r);
    if (iter >= minIter && err < tol) break;

    const J   = numericalJacobian(x, r);
    const JT  = matTranspose(J);
    const JTJ = matMultiply(JT, J);
    const JTr = matVecMultiply(JT, r);
    const n   = x.length;

    const A = JTJ.map((row, i) =>
      row.map((val, j) => {
        const diag_ii = Math.max(Math.abs(JTJ[i][i]), 1e-10);
        return val + (i === j ? lambda * diag_ii : 0);
      })
    );

    let dx;
    try { dx = solveLinear(A, vecNeg(JTr)); }
    catch (e) { lambda *= 10; continue; }

    const xNew   = vecAdd(x, dx).map((v, i) =>
      Math.max(v, LM_VARIABLES[i] === 'G' ? 1e5 : 1e-6)
    );
    const errNew = vecNorm(buildResiduals(xNew));

    if (errNew < err) {
      x      = xNew;
      lambda = Math.max(lambda * 0.3, 1e-12);
      err    = errNew;
    } else {
      lambda = Math.min(lambda * 3.0, 1e10);
    }

    if (lambda > 1e9) break;
  }

  return { x, iter, err, converged: err < 1.0 };
}


// ============================================================
// MATERIAL DATABASE LOADER
// ============================================================

async function loadMaterialDatabase() {
  try {
    const fetchResponse = await fetch('./SpringMaterialsDatabase.json');
    if (!fetchResponse.ok) throw new Error(`HTTP ${fetchResponse.status}`);

    const allMaterialRecords = await fetchResponse.json();
    const roundMaterialRecords = allMaterialRecords.filter(r => r['CATEGORY'] === 'Round');

    if (roundMaterialRecords.length === 0) {
      console.warn('No Round category materials found.');
      loadFallbackMaterials();
      return;
    }

    loadedRoundMaterialsByName = {};
    roundMaterialRecords.forEach(rec => {
      loadedRoundMaterialsByName[rec['NAME']] = rec;
    });

    const sel = document.getElementById('material');
    sel.innerHTML = '';
    roundMaterialRecords.forEach(rec => {
      const opt = document.createElement('option');
      opt.value = rec['NAME'];
      opt.textContent = rec['NAME'];
      sel.appendChild(opt);
    });

    sel.value = '17-7 Stainless';
    if (!sel.value) sel.selectedIndex = 0;

    restoreStateFromHash();
    _suppressHashWrite = false;
    onMaterialSelectionChange();

  } catch (err) {
    console.error('Failed to load SpringMaterialsDatabase.json:', err);
    loadFallbackMaterials();
  }
}

function loadFallbackMaterials() {
  const fallback = [
    { NAME: 'ASTM A313-631 Stainless 17-7', CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '11000000', 'DENSITY (LB/IN^3)': '0.282', 'ALLOWABLE % TENSILE': '45', P0: '170000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.005', 'MAX DIAMETER/WIDTH (in)': '0.625', 'POISSONS RATIO': '0.30' },
    { NAME: 'Music Wire (ASTM A228)',        CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '11500000', 'DENSITY (LB/IN^3)': '0.284', 'ALLOWABLE % TENSILE': '45', P0: '190000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.004', 'MAX DIAMETER/WIDTH (in)': '0.250', 'POISSONS RATIO': '0.30' },
    { NAME: 'Hard Drawn (ASTM A227)',        CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '11500000', 'DENSITY (LB/IN^3)': '0.284', 'ALLOWABLE % TENSILE': '45', P0: '140000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.028', 'MAX DIAMETER/WIDTH (in)': '0.500', 'POISSONS RATIO': '0.30' },
    { NAME: 'Chrome-Vanadium (A232)',        CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '11200000', 'DENSITY (LB/IN^3)': '0.284', 'ALLOWABLE % TENSILE': '45', P0: '170000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.020', 'MAX DIAMETER/WIDTH (in)': '0.500', 'POISSONS RATIO': '0.30' },
    { NAME: 'Chrome-Silicon (A401)',         CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '11200000', 'DENSITY (LB/IN^3)': '0.284', 'ALLOWABLE % TENSILE': '45', P0: '200000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.020', 'MAX DIAMETER/WIDTH (in)': '0.500', 'POISSONS RATIO': '0.30' },
    { NAME: 'Stainless 302/304 (A313)',      CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '10000000', 'DENSITY (LB/IN^3)': '0.286', 'ALLOWABLE % TENSILE': '35', P0: '120000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.004', 'MAX DIAMETER/WIDTH (in)': '0.375', 'POISSONS RATIO': '0.30' },
    { NAME: 'Stainless 316 (A313)',          CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '10000000', 'DENSITY (LB/IN^3)': '0.286', 'ALLOWABLE % TENSILE': '35', P0: '110000', 'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.004', 'MAX DIAMETER/WIDTH (in)': '0.375', 'POISSONS RATIO': '0.30' },
    { NAME: 'Phosphor Bronze',               CATEGORY: 'Round', 'TORSION MODULUS (PSI)': '6000000',  'DENSITY (LB/IN^3)': '0.320', 'ALLOWABLE % TENSILE': '35', P0: '80000',  'EQUATION TYPE': 'Constant', 'MIN DIAMETER/WIDTH (in)': '0.004', 'MAX DIAMETER/WIDTH (in)': '0.250', 'POISSONS RATIO': '0.34' },
  ];

  loadedRoundMaterialsByName = {};
  fallback.forEach(rec => { loadedRoundMaterialsByName[rec.NAME] = rec; });

  const sel = document.getElementById('material');
  sel.innerHTML = '';
  fallback.forEach(rec => {
    const opt = document.createElement('option');
    opt.value = rec.NAME;
    opt.textContent = rec.NAME;
    sel.appendChild(opt);
  });

  restoreStateFromHash();
  _suppressHashWrite = false;
  onMaterialSelectionChange();
}


// ============================================================
// MATERIAL SELECTION HANDLER
// ============================================================

function onMaterialSelectionChange() {
  const name = document.getElementById('material').value;

  Object.keys(loadedRoundMaterialsByName).forEach(key => {
    if (loadedRoundMaterialsByName[key]['_custom'] && key !== name) {
      delete loadedRoundMaterialsByName[key];
      const sel = document.getElementById('material');
      [...sel.options].forEach(opt => {
        if (opt.dataset.custom === key) sel.removeChild(opt);
      });
    }
  });

  selectedMaterialRecord = loadedRoundMaterialsByName[name] || null;

  if (!selectedMaterialRecord) { runCalc(); return; }

  const G_db   = getGFromRecord(selectedMaterialRecord);
  const mts_db = computeMinTensileStrengthPsi(selectedMaterialRecord, readFieldValue('d'));
  const maxD   = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;

  // ── Always overwrite G and mts when material changes ──────
  // G is a material property, not a spring geometry input.
  // If the user previously had a different material selected,
  // or restored a stale hash with the wrong G, this corrects it.
  // We only skip the overwrite if the user has BOTH pinned G AND
  // the pinned value is physically reasonable for this material
  // (within ±20% of the database value).
  if (G_db) {
    const currentG = readFieldValue('G');
    const userHasPinnedG = userEnteredFieldIds.has('G');
    const pinnedValueIsReasonable = currentG && Math.abs(currentG - G_db) / G_db < 0.20;

    if (!userHasPinnedG || !pinnedValueIsReasonable || !currentG) {
      const gEl = document.getElementById('G');
      if (gEl) {
        gEl.value = Math.round(G_db).toString();
        userEnteredFieldIds.delete('G');
        gEl.classList.remove('user-entered');
      }
    }
  }

  if (!userEnteredFieldIds.has('mts') && mts_db) {
    writeFieldValueInteger('mts', mts_db, false);
  }

  const dEl = document.getElementById('d');
  if (dEl) {
    dEl.setAttribute('min', '0');
    if (maxD !== null) dEl.setAttribute('max', maxD);
    else dEl.removeAttribute('max');
  }

  saveStateToHash();
  runCalc();
}

function onCfgChange() { onMaterialSelectionChange(); }

function getGFromRecord(rec) {
  if (!rec) return null;
  return parseFloat(
    rec['TORSION MODULUS (PSI)']    ??
    rec['TORSIONAL MODULUS (PSI)']  ??
    rec['TORSION MODULOUS (PSI)']   ??
    rec['TORSIONAL MODULOUS (PSI)']
  ) || null;
}

function getEFromRecord(rec) {
  if (!rec) return null;
  return parseFloat(
    rec['YOUNGS MODULUS (PSI)']   ??
    rec['YOUNGS MODULOUS (PSI)']  ??
    rec["YOUNG'S MODULUS (PSI)"]
  ) || null;
}


// ============================================================
// MINIMUM TENSILE STRENGTH CALCULATOR
// ============================================================

function computeMinTensileStrengthPsi(rec, d) {
  if (!rec) return null;
  const type = (rec['EQUATION TYPE'] || 'Constant').trim().toLowerCase();
  const P0 = parseFloat(rec['P0']) || 0;
  const P1 = parseFloat(rec['P1']) || 0;
  const P2 = parseFloat(rec['P2']) || 0;
  const P3 = parseFloat(rec['P3']) || 0;
  const P4 = parseFloat(rec['P4']) || 1;

  if (!d || d <= 0) return P0 || null;

  switch (type) {
    case 'constant':   return P0;
    case 'linear':     return P0 + P1 * d;
    case 'binomial':   return (P0 * Math.pow(d, P4) + P1) / (P2 * Math.pow(d, P4) + P3);
    case 'polynomial': return P0 + P1*d + P2*d*d + P3*d*d*d + P4*d*d*d*d;
    case 'power':      return P0 * Math.pow(d, P1);
    default:           return P0;
  }
}


// ============================================================
// ARBOR DIAMETER — GARDINER-CARLSON (1958)
// ============================================================

function computeArborDiameter(D, d, mts, E) {
  if (!D || !d || !mts || !E) return null;
  const D_arbor = 1 / (1 / D + (1.7 * mts) / (E * d));
  return D_arbor > 0 ? D_arbor : null;
}


// ============================================================
// CYCLE LIFE ESTIMATOR
// ============================================================

function formatCycleLife(N) {
  if (N === null || N === undefined || isNaN(N)) return '—';
  if (N < 1000) return '<1,000';
  if (N < 1e6)  return Math.round(N).toLocaleString();
  if (N < 1e7)  return '> 1E06';
  if (N < 1e8)  return '> 1E07';
  if (N < 1e9)  return '> 1E08';
  return '> 1E09';
}

function estimateCycleLife(sc_operating, mts, peened) {
  if (!sc_operating || !mts || sc_operating <= 0 || mts <= 0) return null;

  const allowableFraction = peened ? 0.36 : 0.30;
  const S_ref = allowableFraction * mts;
  const N_ref = 1e7;
  const b     = 0.1;

  if (sc_operating >= S_ref) {
    const S_at_1e5 = (peened ? 0.42 : 0.36) * mts;
    const b_low = Math.log10(S_at_1e5 / S_ref) / Math.log10(1e7 / 1e5);
    const N = N_ref * Math.pow(S_ref / sc_operating, 1 / Math.max(b_low, b));
    return Math.max(N, 1);
  }

  const N = N_ref * Math.pow(S_ref / sc_operating, 1 / b);
  return N;
}


// ============================================================
// DOM HELPERS
// ============================================================

function readFieldValue(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const raw = el.tagName === 'SPAN' ? el.textContent : el.value;
  const v = parseFloat(raw);
  return isNaN(v) ? null : v;
}

function writeFieldValue(id, val, isComputed = true, decimals = 3) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = (val === null || val === undefined || isNaN(val))
    ? '' : Number(val).toFixed(decimals);
  if (el.tagName === 'SPAN') {
    el.textContent = text;
  } else {
    el.value = text;
    el.classList.toggle('computed', isComputed);
    if (isComputed) {
      el.classList.remove('user-entered');
      userEnteredFieldIds.delete(id);
    }
  }
}

function writeFieldValueInteger(id, val, isComputed = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = (val === null || val === undefined || isNaN(val))
    ? '' : Math.round(val).toString();
  if (el.tagName === 'SPAN') {
    el.textContent = text;
  } else {
    el.value = text;
    el.classList.toggle('computed', isComputed);
    if (isComputed) {
      el.classList.remove('user-entered');
      userEnteredFieldIds.delete(id);
    }
  }
}

function applyFieldHighlightClass(id, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('warn', 'err', 'ok');
  if (cls) el.classList.add(cls);
}

function setDualOutput(baseId, value, className = null) {
  [baseId, baseId + '_mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (className !== null) el.className = className;
  });
}


// ============================================================
// USER INPUT HANDLER
// ============================================================

function onUserInput(id) {
  if (id === 'd' && selectedMaterialRecord) {
    const d = readFieldValue('d');
    if (d && !userEnteredFieldIds.has('mts')) {
      const mts = computeMinTensileStrengthPsi(selectedMaterialRecord, d);
      if (mts) writeFieldValueInteger('mts', mts, false);
    }
  }
  runPreSolveOutputs();
}

function sanitizePositiveInput(el) {
  const v = parseFloat(el.value);
  if (!isNaN(v) && v < 0) el.value = Math.abs(v);
}


// ============================================================
// TOLERANCE / GRADE HANDLER
// ============================================================

function ODandLengthToleranceChange() {
  const grade   = document.getElementById('grade').value;
  const coilTol = document.getElementById('dTolCoil');
  const lfTol   = document.getElementById('LfTol');
  if (coilTol) coilTol.value = grade === 'Commercial' ? '0.010' : '0.005';
  if (lfTol)   lfTol.value   = grade === 'Commercial' ? '0.010' : '0.005';
  saveStateToHash();
  runCalc();
}

function computeWireDiameterTolerance(d) {
  if (!d || d <= 0) return null;
  if (d <  0.010) return 0.0002;
  if (d <= 0.028) return 0.0003;
  if (d <= 0.080) return 0.0004;
  if (d <= 0.250) return 0.0005;
  return 0.001;
}


// ============================================================
// SPRING GEOMETRY HELPERS
// ============================================================

function getSelectedInputMode() {
  const sel = document.querySelector('.it.sel');
  return sel ? sel.dataset.mode : 'power';
}

// ============================================================
// BUCKLING — WAHL / STAHL STABILITY EQUATIONS
// ============================================================
//
// Wahl (1963) and Stahl (1974) express the critical buckling
// deflection of a helical compression spring as:
//
//   ξ      = π·D / (α·Lf)          [dimensionless buckle ratio]
//   δ_cr   = Lf · [1 − √(1 − ξ²)] [critical deflection, in]
//   L_cr   = Lf − δ_cr             [length at onset of buckling, in]
//   F_cr   = k · δ_cr              [load at onset of buckling, lb]
//
// ξ > 1  → spring is STABLE (cannot buckle at any load)
// ξ ≤ 1  → spring CAN buckle; δ_cr marks the instability point
//
// The four supported end conditions and their α factors:
// ─────────────────────────────────────────────────────────
//   Mode           Description                          α
// ─────────────────────────────────────────────────────────
//   Fixed–Fixed    Both ends flat on parallel plates    0.5
//   Fixed–Hinged   One flat end, one pivoting end       1/√2 ≈ 0.7071
//   Hinged–Hinged  Both ends free to pivot              1.0
//   Fixed–Free     One end clamped, one laterally free  2.0
// ─────────────────────────────────────────────────────────
//
// Critical slenderness ratio for each mode (ξ = 1 boundary):
//   Lf/D_crit = π/α
//   Fixed–Fixed:    Lf/D > π/0.5  = 6.283  → can buckle
//   Fixed–Hinged:   Lf/D > π/0.707 = 4.443 → can buckle
//   Hinged–Hinged:  Lf/D > π/1.0  = 3.142  → can buckle
//   Fixed–Free:     Lf/D > π/2.0  = 1.571  → can buckle
// ============================================================

/**
 * getBucklingEndCondition()
 * Returns the Wahl/Stahl end-condition object for the selected radio.
 *
 * HTML radio button values expected:
 *   value="ff"    → Fixed–Fixed   (α = 0.5)
 *   value="fh"    → Fixed–Hinged  (α = 1/√2)
 *   value="hh"    → Hinged–Hinged (α = 1.0)
 *   value="ffree" → Fixed–Free    (α = 2.0)
 *   value="unk"   → Not selected
 *
 * @returns {{ alpha: number, label: string, mode: string } | null}
 */
function getBucklingEndCondition() {
  const val = document.querySelector('input[name=buckle]:checked')?.value;
  // console.log('[buckle] radio checked value:', val);
  switch (val) {
    case 'ff':    return { alpha: 0.5,            label: 'Fixed–Fixed',   mode: 'ff'    };
    case 'fh':    return { alpha: 0.707145,        label: 'Fixed–Hinged',  mode: 'fh'    };
    case 'hh':    return { alpha: 1.0,            label: 'Hinged–Hinged', mode: 'hh'    };
    case 'ffree': return { alpha: 2.0,            label: 'Fixed–Free',    mode: 'ffree' };
    default:      return null;
  }
}

/**
 * getBucklingEffectiveLengthFactor()
 * Shim that returns just the α value (or null).
 * Used by buildResiduals() — keeps the LM solver interface unchanged.
 */
function getBucklingEffectiveLengthFactor() {
  return getBucklingEndCondition()?.alpha ?? null;
}

/**
 * computeWahlStahlBuckling(Lf, D, k, alpha)
 * Applies the exact Wahl/Stahl stability equation.
 *
 * @param {number} Lf    Free length (in)
 * @param {number} D     Mean coil diameter (in)
 * @param {number} k     Spring rate (lb/in)
 * @param {number} alpha Effective-length factor for end condition
 *
 * @returns {{
 *   stable:       boolean,  — true = spring cannot buckle (ξ > 1)
 *   xi:           number,   — buckle ratio ξ = π·D / (α·Lf)
 *   delta_cr:     number|null,  — critical deflection (in)
 *   L_cr:         number|null,  — length at onset of buckling (in)
 *   F_cr:         number|null,  — load at onset of buckling (lb)
 *   Lf_D_ratio:   number,   — actual slenderness ratio Lf/D
 *   critical_LfD: number,   — critical Lf/D threshold = π/α
 *   margin_pct:   number,   — how close to limit: (Lf_D / critical_LfD) × 100
 * } | null}
 */
function computeWahlStahlBuckling(Lf, D, k, alpha) {
  if (!Lf || !D || !k || !alpha || Lf <= 0 || D <= 0 || k <= 0 || alpha <= 0) {
    console.warn('[buckle] computeWahlStahlBuckling: invalid inputs', { Lf, D, k, alpha });
    return null;
  }

  // inner = πD/(α·Lf) — term inside the sqrt of the Wahl/Stahl formula.
  // inner > 1  →  Lf/D < π/α  →  spring is too short/stubby to buckle (stable).
  // inner ≤ 1  →  Lf/D ≥ π/α  →  spring can buckle; compute δ_cr.
  const inner        = (Math.PI * D) / (alpha * Lf);
  const critical_LfD = Math.PI / alpha;
  const Lf_D_ratio   = Lf / D;
  const margin_pct   = (Lf_D_ratio / critical_LfD) * 100;

  // console.log('[buckle] WahlStahl | alpha:', alpha, '| inner(πD/αLf):', inner.toFixed(4),
  //   '| Lf/D:', Lf_D_ratio.toFixed(3), '| crit Lf/D (π/α):', critical_LfD.toFixed(3),
  //   '| margin%:', margin_pct.toFixed(1), '| stable:', inner > 1.0);

  if (inner > 1.0) {
    return {
      stable:       true,
      xi:           inner,
      delta_cr:     null,
      L_cr:         null,
      F_cr:         null,
      Lf_D_ratio,
      critical_LfD,
      margin_pct,
    };
  }

  // inner ≤ 1 → spring exceeds critical slenderness — apply Wahl/Stahl:
  const delta_cr = Lf * (1 - Math.sqrt(1 - inner * inner));
  const L_cr     = Lf - delta_cr;
  const F_cr     = k  * delta_cr;

  return {
    stable: false,
    xi: inner,
    delta_cr,
    L_cr,
    F_cr,
    Lf_D_ratio,
    critical_LfD,
    margin_pct,
  };
}

function getDeadCoilCountFromEndType() {
  const closed = document.getElementById('endClosed')?.checked;
  const ground = document.getElementById('endGround')?.checked;

  if (closed && ground)  return 2;  // Squared & ground
  if (closed && !ground) return 2;  // Squared only
  if (!closed && ground) return 1;  // Plain ground
  return 0;                         // Plain / open
}

function calculateWahlStressCorrectionFactor(C) {
  return (4 * C - 1) / (4 * C - 4) + 0.615 / C;
}

function calculateWahlStressCorrectionFactorK2(C) {
  return (4 * C + 2) / (4 * C - 3);
}

function findNearestStandardWireDiameters(d) {
  let smaller = null, larger = null;
  const sizes = STANDARD_WIRE_DIAMETERS_IN;
  if (d <= sizes[0])                return { nextSmallerDiameterIn: null, nextLargerDiameterIn: sizes[0] };
  if (d >= sizes[sizes.length - 1]) return { nextSmallerDiameterIn: sizes[sizes.length - 1], nextLargerDiameterIn: null };
  for (let i = 0; i < sizes.length; i++) {
    if      (sizes[i] < d) smaller = sizes[i];
    else if (sizes[i] > d) { larger = sizes[i]; break; }
  }
  return { nextSmallerDiameterIn: smaller, nextLargerDiameterIn: larger };
}


// ============================================================
// INPUT MODE SELECTOR
// ============================================================

const INPUT_MODE_FIELDS = {
  power: [],
  two:   ['d', 'OD', 'L1', 'L2', 'F1', 'F2'],
  one:   ['d', 'OD', 'Lf', 'L2', 'F2'],
  rate:  ['d', 'k', 'OD', 'Lf'],
  dim:   ['OD', 'd', 'Nt', 'Lf'],
  wt:    ['OD', 'F1', 'F2', 'L2'],
};

function applyInputModeHighlights() {
  const sel = document.querySelector('.it.sel');
  if (!sel) return;
  document.querySelectorAll('input[type=number]').forEach(el => el.classList.remove('input-highlight'));
  (INPUT_MODE_FIELDS[sel.dataset.mode] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('input-highlight');
  });
}


// ============================================================
// DEGREES OF FREEDOM GATE
// ============================================================

const MIN_USER_INPUTS_TO_SOLVE = 5;

const INDEPENDENT_FIELDS = new Set([
  'd', 'D', 'OD', 'ID',
  'Na', 'Nt',
  'k', 'G',
  'Lf', 'Ls', 'pitch',
  'F1', 'F2',
  'L1', 'L2',
  'Lbuckle', 'Fbuckle',
  'minID', 'shaft', 'hole',
  'fn',
]);

function countEffectiveConstraints() {
  let count = 0;
  for (const id of userEnteredFieldIds) {
    if (INDEPENDENT_FIELDS.has(id)) count++;
  }
  return count;
}

function isSystemSufficientlyDetermined() {
  return countEffectiveConstraints() >= MIN_USER_INPUTS_TO_SOLVE;
}


// ============================================================
// MAIN CALCULATION ENGINE
// ============================================================

function runCalc() {
  if (!document.getElementById('d')) return;

  const Nd = getDeadCoilCountFromEndType();
  writeFieldValue('Nd', Nd, true, 3);

  runPreSolveOutputs();

  // ── Gate 1: Minimum constraint count ─────────────────────
  const constraintCount = countEffectiveConstraints();
  if (constraintCount < MIN_USER_INPUTS_TO_SOLVE) {
    updateStatusUnderdefined(constraintCount, MIN_USER_INPUTS_TO_SOLVE);
    return;
  }

  // ── Gate 2: Physical determinacy check ───────────────────
  // Geometry-only inputs (diameters, lengths) give the solver
  // no information about spring stiffness.  At least one
  // stiffness-related field must be pinned or the solver will
  // produce a physically meaningless result.
  const physCheck = isSystemPhysicallyDetermined();
  if (!physCheck.ok) {
    const dot  = document.getElementById('bottomStatusDot');
    const text = document.getElementById('bottomStatusSummary');
    if (dot)  dot.className    = 'status-dot warn';
    if (text) text.textContent = physCheck.reason === 'stiffness'
      ? 'Underdefined — no stiffness constraint.\n' +
        'Add one of: Spring Rate (k), Active Coils (Na), Total Coils (Nt), ' +
        'a Load (F1 or F2), Pitch, or Solid Length (Ls).'
      : 'Underdefined — no geometry constraint.\n' +
        'Add Wire Diameter, a Coil Diameter, or a Length.';
    if (!_lastSolvedState) {
      blankAllComputedOutputs();
      updateAllCharts(null);
    }
    return;
  }

  // ── Solve ─────────────────────────────────────────────────
  const x0 = buildVariableVector();

  const MAX_ATTEMPTS = 5;
  const PERTURBATION = 0.15;

  let bestResult = null;
  let bestErr    = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let x_init;

    if (attempt === 0) {
      x_init = x0;
    } else {
      const base = bestResult?.x ?? x0;
      x_init = base.map(v => {
        const perturbation = 1 + (Math.random() * 2 - 1) * PERTURBATION;
        return Math.max(v * perturbation, 1e-9);
      });
    }

    const result = solveLM(x_init, { maxIter: 300, tol: 1e-8, lambdaInit: 1e-2 });

    if (result.err < bestErr) {
      bestErr    = result.err;
      bestResult = result;
    }

    if (result.converged) break;
  }

  applyVariableVector(bestResult.x);

  const sv = {};
  LM_VARIABLES.forEach((id, i) => { sv[id] = bestResult.x[i]; });

  // ── Gate 3: Physical validity of solution ─────────────────
  // If the solver landed on an impossible geometry, blank all
  // computed outputs and report the specific violation rather
  // than displaying nonsense values.
  const validity = isSolutionPhysicallyValid(sv);
  if (!validity.valid) {
    const dot  = document.getElementById('bottomStatusDot');
    const text = document.getElementById('bottomStatusSummary');
    if (dot)  dot.className    = 'status-dot err';
    if (text) text.textContent = validity.reasons.length === 1
      ? validity.reasons[0]
      : validity.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
    if (!_lastSolvedState) {
      blankAllComputedOutputs();
      updateAllCharts(null);
    }
    return;
  }

  _lastSolvedState = { sv, result: bestResult };

  runDeterministicPostPass(sv, bestResult);
}
// ============================================================
// BLANKING HELPER — clears every computed output field
// Called when the system is underdefined OR a column loses its
// last user-entered value.  Never clears user-pinned fields.
// ============================================================

const ALL_COMPUTED_OUTPUT_IDS = [
  // Geometry
  'OD', 'ID', 'C', 'Nt', 'Nd', 'Ls', 'pitch', 'pitchAng',
  'arbor', 'wl', 'sw', 'fn',
  'minID', 'shaft', 'hole',
  // Spring rate / stiffness
  'k',
  // Load 1 column
  'F1', 'L1', 'def1', 'pct1', 'sc1', 'su1', 'pMTS1', 'pUS1', 'OD1', 'F1tol',
  // Load 2 column
  'F2', 'L2', 'def2', 'pct2', 'sc2', 'su2', 'pMTS2', 'pUS2', 'OD2', 'F2tol',
  // At solid
  'Fs', 'defS', 'scS', 'suS', 'pMTSs', 'pUSs',
  // Buckling
  'Lbuckle', 'Fbuckle', 'defBuckle', 'pctBuckle',
  'scBuckle', 'suBuckle', 'pMTSbuckle', 'pUSbuckle', 'ODbuckle',
  // Travel / misc
  'travelL1L2',
];

function blankAllComputedOutputs() {
  ALL_COMPUTED_OUTPUT_IDS.forEach(id => {
    if (userEnteredFieldIds.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'INPUT') el.value = '';
    else if (el.tagName === 'SPAN') el.textContent = '—';
    el.classList.remove('warn', 'err', 'ok', 'computed');
  });

  // Buckling outputs
  clearBuckleOutputs();

  // Cycle life chips
  ['cycleLife', 'cycleLife_mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.className = 'prop-output'; }
  });
}

function setBuckleNoBuckle() {
  const buckleOutputIds = [
    'Lbuckle', 'Fbuckle', 'defBuckle', 'pctBuckle',
    'scBuckle', 'suBuckle', 'pMTSbuckle', 'pUSbuckle', 'ODbuckle',
  ];
  buckleOutputIds.forEach(id => {
    if (userEnteredFieldIds.has(id)) return;
    const el = document.getElementById(id);
    if (!el) { console.warn('[buckle] setBuckleNoBuckle: element not found:', id); return; }
    // Both <input> and <span> get the "No Buckle" label
    if (el.tagName === 'SPAN') {
      el.textContent = 'No Buckle';
    } else {
      // Inputs can't hold text — use a placeholder-style approach:
      // clear value and set a data attribute the CSS can show,
      // or simply leave blank (field is not applicable).
      el.value = '';
      el.setAttribute('placeholder', 'No Buckle');
    }
    el.classList.remove('warn', 'err');
    el.classList.add('ok');
  });
}

function clearBuckleOutputs() {
  const buckleOutputIds = [
    'Lbuckle', 'Fbuckle', 'defBuckle', 'pctBuckle',
    'scBuckle', 'suBuckle', 'pMTSbuckle', 'pUSbuckle', 'ODbuckle',
  ];
  buckleOutputIds.forEach(id => {
    if (userEnteredFieldIds.has(id)) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SPAN') el.textContent = '';
    else { el.value = ''; el.removeAttribute('placeholder'); }
    el.classList.remove('warn', 'err', 'ok');
  });
}

function updateStatusUnderdefined(have, need) {
  const dot  = document.getElementById('bottomStatusDot');
  const text = document.getElementById('bottomStatusSummary');
  if (dot)  dot.className    = 'status-dot';
  if (text) text.textContent =
    `Underdefined — enter ${need - have} more independent value(s) to solve.\n` +
    `Suggested: ${getSuggestedNextInputs().join(', ')}`;

  // Blank every computed field and blank the charts, but only
  // when there is no previous valid solution to fall back on.
  // If a prior solve succeeded, leave those values visible so
  // the user can see context while they correct the inputs.
  if (!_lastSolvedState) {
    blankAllComputedOutputs();
    updateAllCharts(null);
  }
}

function getSuggestedNextInputs() {
  const suggestions = [];
  const has = id => userEnteredFieldIds.has(id);
  if (!has('d'))                             suggestions.push('Wire diameter (d)');
  if (!has('D') && !has('OD') && !has('ID')) suggestions.push('Coil diameter (OD, D, or ID)');
  if (!has('Na') && !has('Nt'))              suggestions.push('Coil count (Na or Nt)');
  if (!has('k'))                             suggestions.push('Spring rate (k)');
  if (!has('Lf') && !has('Ls'))             suggestions.push('Free length (Lf)');
  if (!has('F1') && !has('F2'))             suggestions.push('A load (F1 or F2)');
  return suggestions.slice(0, 3);
}


// ============================================================
// PRE-SOLVE OUTPUTS
// ============================================================

function runPreSolveOutputs() {
  const d = readFieldValue('d');

  if (d && !userEnteredFieldIds.has('dTol')) {
    const tol = computeWireDiameterTolerance(d);
    if (tol) writeFieldValue('dTol', tol, true, 4);
  }

  if (d) {
    const isStd = STANDARD_WIRE_DIAMETERS_IN.some(s => Math.abs(s - d) < 0.0005);
    const { nextSmallerDiameterIn: ns, nextLargerDiameterIn: nl } =
      findNearestStandardWireDiameters(d);
    setDualOutput('wSmaller', ns ? ns.toFixed(3) : '—');
    setDualOutput('wLarger',  nl ? nl.toFixed(3) : '—');
    setDualOutput('wireAvailabilityChip',
      isStd
        ? `${d.toFixed(3)}" Standard Wire Size`
        : `${d.toFixed(3)}" Non-Standard Wire Size`,
      isStd ? 'wire-chip avail' : 'wire-chip unavail');
  } else {
    setDualOutput('wireAvailabilityChip', 'Enter wire diameter to check', 'wire-chip');
    setDualOutput('wSmaller', '—');
    setDualOutput('wLarger',  '—');
  }

  if (d && selectedMaterialRecord) {
    const minD = parseFloat(selectedMaterialRecord['MIN DIAMETER/WIDTH (in)']) || null;
    const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;
    const dEl  = document.getElementById('d');
    if (dEl) {
      dEl.classList.remove('warn', 'err', 'ok');
      if      (minD && d < minD) dEl.classList.add('err');
      else if (maxD && d > maxD) dEl.classList.add('err');
    }
  }
}


// ============================================================
// DETERMINISTIC POST-PASS
// ============================================================

function runDeterministicPostPass(sv, result) {
  const warnings = [];
  const errors   = [];

  const hasL1  = userEnteredFieldIds.has('F1') || userEnteredFieldIds.has('L1');
  const hasL2  = userEnteredFieldIds.has('F2') || userEnteredFieldIds.has('L2');
  const peened = document.getElementById('condPeened')?.checked ?? false;
  const preset = document.getElementById('condPreset')?.checked ?? false;

  // ── 1. Clear inactive columns (includes tolerances and travel) ──
  if (!hasL1) {
    ['F1', 'L1', 'def1', 'pct1', 'sc1', 'su1', 'pMTS1', 'pUS1', 'OD1', 'F1tol'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !userEnteredFieldIds.has(id)) {
        el.value = '';
        el.classList.remove('warn', 'err', 'ok');
      }
    });
  }
  if (!hasL2) {
    ['F2', 'L2', 'def2', 'pct2', 'sc2', 'su2', 'pMTS2', 'pUS2', 'OD2', 'F2tol'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !userEnteredFieldIds.has(id)) {
        el.value = '';
        el.classList.remove('warn', 'err', 'ok');
      }
    });
  }
  // Travel only meaningful when both load columns are active
  if (!hasL1 || !hasL2) {
    const tEl = document.getElementById('travelL1L2');
    if (tEl && !userEnteredFieldIds.has('travelL1L2')) tEl.value = '';
  }

  // Unpack solved values
  const G     = readFieldValue('G') || 11500000;
  const d     = sv.d,   D  = sv.D,  OD = sv.OD;
  const Na    = sv.Na,  Nt = sv.Nt;
  const k     = sv.k,   Lf = sv.Lf, Ls = sv.Ls;
  const F1    = sv.F1,  L1 = sv.L1;
  const F2    = sv.F2,  L2 = sv.L2;
  const pitch = sv.pitch;



  const mts = readFieldValue('mts')
              || computeMinTensileStrengthPsi(selectedMaterialRecord, d)
              || null;

  const Nd = getDeadCoilCountFromEndType();

  // ── 8. Wahl factor — defined early for use in step 6b ────
  const C  = (d && D) ? D / d : null;
  const Kw = C
    ? (preset
        ? calculateWahlStressCorrectionFactorK2(C)
        : calculateWahlStressCorrectionFactor(C))
    : null;

  function applyStress(F, scId, suId, pMTSId, pUSId) {
    if (!Kw || !F || !d || !D) return;
    const su = (8 * F * D) / (Math.PI * Math.pow(d, 3));
    const sc = Kw * su;
    writeFieldValue(suId, su, true, 0);
    writeFieldValue(scId, sc, true, 0);

    if (mts && pUSId) {
      const pUS = su / mts * 100;
      writeFieldValue(pUSId, pUS, true, 2);
    }

    if (mts) {
      const pct = sc / mts * 100;
      writeFieldValue(pMTSId, pct, true, 2);

      let warnPct, errPct;
      if (preset) {
        warnPct = peened ? 50 : 45;
        errPct  = peened ? 72 : 67;
      } else {
        warnPct = peened ? 36 : 30;
        errPct  = peened ? 45 : 45;
      }

      const cls = pct > errPct  ? 'err'
                : pct > warnPct ? 'warn'
                : 'ok';
      applyFieldHighlightClass(pMTSId, cls);
      applyFieldHighlightClass(scId,   cls);
    }
  }

  // ── 2. Arbor diameter ─────────────────────────────────────
  if (!userEnteredFieldIds.has('arbor') && d && D && mts) {
    const E_db    = parseFloat(selectedMaterialRecord?.["YOUNGS MODULUS (PSI)"]) || (2 * G * (1 + (parseFloat(selectedMaterialRecord?.['POISSONS RATIO']) || 0.30)));
    const D_arbor = computeArborDiameter(D, d, mts, E_db);
    writeFieldValue('arbor', D_arbor, true, 3);
    if (D_arbor !== null && D_arbor >= (D - d)) {
      warnings.push(
        `Computed arbor diameter (${D_arbor.toFixed(3)}") ≥ coil ID — ` +
        `verify MTS and material G are correct`
      );
    }
  } else if (!userEnteredFieldIds.has('arbor') && !(d && D && mts)) {
    const e = document.getElementById('arbor'); if (e) e.value = '';
  }

  // ── 3. Pitch angle ────────────────────────────────────────
  if (pitch && D) {
    const ang = Math.atan(pitch / (Math.PI * D)) * 180 / Math.PI;
    writeFieldValue('pitchAng', ang, true, 3);
  } else if (!userEnteredFieldIds.has('pitchAng')) {
    const e = document.getElementById('pitchAng'); if (e) e.value = '';
  }

  // ── 4. Solid length ───────────────────────────────────────
  if (Nt && d && !userEnteredFieldIds.has('Ls')) {
    const ground = document.getElementById('endGround')?.checked;
    // Ground ends are flat — Ls = Nt × d
    // Unground ends have wire tips — Ls = (Nt + 1) × d
    const Ls_geom = ground ? Nt * d : (Nt + 1) * d;
    writeFieldValue('Ls', Ls_geom, true, 3);

    const LsAllowable = readFieldValue('LsAllowable');
    if (LsAllowable && Ls_geom > LsAllowable) {
      errors.push(
        `Solid length ${Ls_geom.toFixed(3)}" exceeds allowable ` +
        `solid length of ${LsAllowable.toFixed(3)}"`
      );
    }
  }

  // ── 4c. Recalculate defS from finalized Ls ────────────────
  const Ls_final = readFieldValue('Ls') ?? Ls;
  const defS     = (Lf && Ls_final && Ls_final > 0) ? Lf - Ls_final : null;

  // ── 4d. Guard: Ls must be less than Lf ───────────────────
  if (Lf && Ls_final && Ls_final >= Lf) {
    errors.push(
      `Solid length (${Ls_final.toFixed(3)}") equals or exceeds free length (${Lf.toFixed(3)}") — ` +
      `spring cannot function. Reduce coil count or wire diameter.`
    );
    // Blank the entire solid column — values are nonsensical
    ['Fs', 'defS', 'scS', 'suS', 'pMTSs', 'pUSs', 'pct1', 'pct2'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !userEnteredFieldIds.has(id)) {
        el.value = '';
        el.classList.remove('warn', 'err', 'ok');
      }
    });
  }

  // ── 4b. Shaft, hole, minID ────────────────────────────────
  if (d && D) {
    const dTol     = readFieldValue('dTol')     || computeWireDiameterTolerance(d) || 0;
    const dTolCoil = readFieldValue('dTolCoil') || 0;
    const ID_nom   = D - d;
    const clearanceFactor = ID_nom < 0.512 ? 0.10 : 0.05;

    if (!userEnteredFieldIds.has('minID')) {
      const minID_val = ID_nom - dTol - dTolCoil;
      writeFieldValue('minID', minID_val > 0 ? minID_val : null, true, 3);
    }
    if (!userEnteredFieldIds.has('shaft')) {
      const shaft_val = (ID_nom - dTol - dTolCoil) - clearanceFactor * D;
      writeFieldValue('shaft', shaft_val > 0 ? shaft_val : null, true, 3);
    }
    if (!userEnteredFieldIds.has('hole') && Nt && pitch) {
      const OD_solid_sq = OD * OD + (pitch * pitch - d * d) * Nt / (Math.PI * Math.PI);
      const OD_solid    = OD_solid_sq > OD * OD ? Math.sqrt(OD_solid_sq) : OD;
      const hole_val    = OD_solid + dTolCoil + clearanceFactor * D;
      writeFieldValue('hole', hole_val, true, 3);
    }

    const shaftVal = readFieldValue('shaft');
    if (shaftVal && shaftVal >= ID_nom)
      warnings.push(`Shaft diameter (${shaftVal.toFixed(3)}") ≥ coil ID — check tolerances`);
    const holeVal = readFieldValue('hole');
    if (holeVal && holeVal <= OD)
      warnings.push(`Hole diameter (${holeVal.toFixed(3)}") ≤ coil OD — spring will not fit in bore`);
  }

  // ── 5. Deflections ────────────────────────────────────────
  const def1 = (Lf && L1) ? Lf - L1 : null;
  const def2 = (Lf && L2) ? Lf - L2 : null;

  if (hasL1) writeFieldValue('def1', def1, true, 3);
  if (hasL2) writeFieldValue('def2', def2, true, 3);
  // defS is written conditionally in step 6 alongside Fs

  if (defS && def1 !== null && hasL1) {
    const pct1 = def1 / defS * 100;
    writeFieldValue('pct1', pct1, true, 3);
    applyFieldHighlightClass('pct1', pct1 > 100 ? 'err' : pct1 > 80 ? 'warn' : 'ok');
  }
  if (defS && def2 !== null && hasL2) {
    const pct2 = def2 / defS * 100;
    writeFieldValue('pct2', pct2, true, 3);
    applyFieldHighlightClass('pct2', pct2 > 100 ? 'err' : pct2 > 80 ? 'warn' : 'ok');
  }

  // ── 6. Load at solid ──────────────────────────────────────
  // Only write solid column when defS is physically valid (positive)
  const Fs = (k && defS && defS > 0) ? k * defS : null;
  if (k && Lf && Ls_final && defS > 0) {
    writeFieldValue('Fs',   Fs,   true, 3);
    writeFieldValue('defS', defS, true, 3);
  } else if (!(Lf && Ls_final && Ls_final >= Lf)) {
    // Only blank here if the Lf>=Ls error hasn't already done it above
    ['Fs', 'defS', 'scS', 'suS', 'pMTSs', 'pUSs'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !userEnteredFieldIds.has(id)) {
        el.value = '';
        el.classList.remove('warn', 'err', 'ok');
      }
    });
  }

  // ── 6b. Buckling — Wahl/Stahl stability equations ─────────
  //
  // Applies the exact Wahl/Stahl formula for the user-selected
  // end condition.  Four modes are evaluated independently;
  // only the one matching the radio selection is written to DOM.
  //
  // End condition radio values → α:
  //   ff    Fixed–Fixed    α = 0.5
  //   fh    Fixed–Hinged   α = 1/√2 ≈ 0.7071
  //   hh    Hinged–Hinged  α = 1.0
  //   ffree Fixed–Free     α = 2.0
  {
    const endCond = getBucklingEndCondition();
    // console.log('[buckle] endCond:', endCond, '| Lf:', Lf, 'D:', D, 'k:', k);

    if (!endCond) {
      clearBuckleOutputs();

    } else {
      const { alpha, label } = endCond;
      const bk = computeWahlStahlBuckling(Lf, D, k, alpha);
      console.log('[buckle] mode:', label, '| alpha:', alpha, '| bk:', bk);

      if (!bk) {
        // console.warn('[buckle] computeWahlStahlBuckling returned null — missing geometry');
        clearBuckleOutputs();

      } else if (bk.stable) {
        // Spring is too short/stubby to buckle under this end condition — no critical values exist
        setBuckleNoBuckle();

      } else {
        const { delta_cr, L_cr, F_cr, Lf_D_ratio, critical_LfD, margin_pct } = bk;
        const Ls_current = readFieldValue('Ls') || Ls;
        const buckleIsBeyondSolid = Ls_current != null && L_cr != null && L_cr <= Ls_current;
        // console.log('[buckle] CAN BUCKLE | delta_cr:', delta_cr?.toFixed(4), 'L_cr:', L_cr?.toFixed(4), 'F_cr:', F_cr?.toFixed(3), '| Ls_current:', Ls_current, '| beyondSolid:', buckleIsBeyondSolid);

        // Always write buckling numbers regardless of whether the buckle point is beyond solid
        if (!userEnteredFieldIds.has('Lbuckle')) writeFieldValue('Lbuckle', L_cr,     true, 3);
        if (!userEnteredFieldIds.has('Fbuckle')) writeFieldValue('Fbuckle', F_cr,     true, 3);
        writeFieldValue('defBuckle', delta_cr, true, 3);

        const defS_total = (Lf && Ls_current && Ls_current > 0) ? Lf - Ls_current : defS;
        // console.log('[buckle] defS_total:', defS_total);
        if (defS_total && defS_total > 0) {
          const pctBuckle = (delta_cr / defS_total) * 100;
          writeFieldValue('pctBuckle', pctBuckle, true, 3);
          applyFieldHighlightClass('pctBuckle',
            pctBuckle > 100 ? 'err' : pctBuckle > 80 ? 'warn' : 'ok');
        }

        applyStress(F_cr, 'scBuckle', 'suBuckle', 'pMTSbuckle', 'pUSbuckle');

        if (D && d) writeFieldValue('ODbuckle', D + d, true, 3);

        if (buckleIsBeyondSolid) {
          // Buckle point is beyond solid — spring physically coil-binds before it could buckle
          // Numbers are still shown but no service warning is needed
        } else {
          if (margin_pct > 90) {
            warnings.push(
              `Slenderness ratio Lf/D = ${Lf_D_ratio.toFixed(3)} is ` +
              `${margin_pct.toFixed(0)}% of the ${label} critical limit ` +
              `(${critical_LfD.toFixed(3)}) — spring is approaching unconditional buckling`
            );
          }

          if (delta_cr < 0.001 * Lf) {
            errors.push(
              `Spring buckles at essentially zero deflection under ${label} ` +
              `end condition (Lf/D = ${Lf_D_ratio.toFixed(3)}, ` +
              `limit = ${critical_LfD.toFixed(3)}) — ` +
              `reduce free length or increase coil diameter`
            );
          }

          if (hasL1 && F1 && F_cr && F1 > F_cr) {
            warnings.push(
              `Load 1 (${F1.toFixed(3)} lb) exceeds ${label} buckling load ` +
              `(${F_cr.toFixed(3)} lb) — spring will buckle in service`
            );
          }
          if (hasL2 && F2 && F_cr && F2 > F_cr) {
            warnings.push(
              `Load 2 (${F2.toFixed(3)} lb) exceeds ${label} buckling load ` +
              `(${F_cr.toFixed(3)} lb) — spring will buckle in service`
            );
          }
        }
      }
    }
  }

    // ── 10. Expanded OD ───────────────────────────────────────
    // Coils expand radially as pitch decreases under compression.
    // Wire length is conserved, so reduced pitch forces larger diameter.
    // Formula: OD_comp = √(OD_free² + (p_free² - p_comp²) · Na / π²)
    // where p_comp = (L - Nd·d) / Na
    //
    // NOTE: Must run AFTER step 6b (buckling) so Lbuckle is populated.
    if (D && d && pitch && Na && Lf) {

      function expandedOD(L_compressed) {
        if (L_compressed <= 0) return OD;
        const p_comp = (L_compressed - Nd * d) / Math.max(Na, 1e-9);
        if (p_comp <= 0) return OD;
        const OD_sq = OD * OD + (pitch * pitch - p_comp * p_comp) * Na / (Math.PI * Math.PI);
        return OD_sq > OD * OD ? Math.sqrt(OD_sq) : OD;
      }

      if (hasL1 && L1 && L1 > 0)
        writeFieldValue('OD1', expandedOD(L1), true, 3);

      if (hasL2 && L2 && L2 > 0)
        writeFieldValue('OD2', expandedOD(L2), true, 3);

      // At buckle — read the value just written by step 6b
      const L_bk = readFieldValue('Lbuckle');
      if (L_bk && L_bk > 0)
        writeFieldValue('ODbuckle', expandedOD(L_bk), true, 3);
    }

  // ── 7. Travel ─────────────────────────────────────────────
  if (hasL1 && hasL2 && L1 !== null && L2 !== null && !userEnteredFieldIds.has('travelL1L2')) {
    writeFieldValue('travelL1L2', Math.abs(L1 - L2), true, 3);
  } else if (!userEnteredFieldIds.has('travelL1L2')) {
    const tEl = document.getElementById('travelL1L2');
    if (tEl) tEl.value = '';
  }

  // ── 7b. Load tolerances ───────────────────────────────────
  if (k) {
    const LfTol = readFieldValue('LfTol');
    if (LfTol && LfTol > 0) {
      const F_tol = k * LfTol;
      if (hasL1 && !userEnteredFieldIds.has('F1tol')) writeFieldValue('F1tol', F_tol, true, 3);
      if (hasL2 && !userEnteredFieldIds.has('F2tol')) writeFieldValue('F2tol', F_tol, true, 3);
    }
  } else {
    // No spring rate — blank load tolerances
    if (!userEnteredFieldIds.has('F1tol')) { const e = document.getElementById('F1tol'); if (e) e.value = ''; }
    if (!userEnteredFieldIds.has('F2tol')) { const e = document.getElementById('F2tol'); if (e) e.value = ''; }
  }

  // ── 9. Stress — active columns only ──────────────────────
  if (hasL1) applyStress(F1, 'sc1', 'su1', 'pMTS1', 'pUS1');
  if (hasL2) applyStress(F2, 'sc2', 'su2', 'pMTS2', 'pUS2');
  applyStress(Fs, 'scS', 'suS', 'pMTSs', 'pUSs');

  // ── 11. Wire length and weight ────────────────────────────
  if (d && D && Nt && pitch) {
    const turnLength = Math.sqrt(Math.pow(Math.PI * D, 2) + Math.pow(pitch, 2));
    const wireLength = turnLength * Nt;
    const density    = parseFloat(selectedMaterialRecord?.['DENSITY (LB/IN^3)']) || null;
    const wireWeight = density
      ? (Math.PI / 4) * Math.pow(d, 2) * wireLength * density
      : null;
    writeFieldValue('wl', wireLength, true, 3);
    writeFieldValue('sw', wireWeight, true, 4);
  } else {
    // Prerequisites missing — blank wire length / weight
    if (!userEnteredFieldIds.has('wl')) { const e = document.getElementById('wl'); if (e) e.value = ''; }
    if (!userEnteredFieldIds.has('sw')) { const e = document.getElementById('sw'); if (e) e.value = ''; }
  }

  // ── 11b. Natural frequency — Wahl eq 17.5 ────────────────────
  // fn = (1/2) × √(k·g / W_s)
  // This correctly accounts for actual wire geometry and weight.
  if (k && !userEnteredFieldIds.has('fn')) {
    const density = parseFloat(selectedMaterialRecord?.['DENSITY (LB/IN^3)']) || null;
    if (density && d && D && Nt && pitch) {
      const g_accel    = 386.1; // in/s²
      const turnLength = Math.sqrt(Math.pow(Math.PI * D, 2) + Math.pow(pitch, 2));
      const wireLength = turnLength * Nt;
      const W_s        = (Math.PI / 4) * Math.pow(d, 2) * wireLength * density;
      if (W_s > 0) {
        const fn_calc = 0.5 * Math.sqrt((k * g_accel) / W_s);
        writeFieldValue('fn', fn_calc, true, 3);
        if (fn_calc < 10) {
          warnings.push(
            `Natural frequency is only ${fn_calc.toFixed(3)} Hz — ` +
            `verify spring will not resonate in service`
          );
        }
      } else {
        const e = document.getElementById('fn'); if (e) e.value = '';
      }
    } else {
      const e = document.getElementById('fn'); if (e) e.value = '';
    }
  } else if (!userEnteredFieldIds.has('fn')) {
    const e = document.getElementById('fn'); if (e) e.value = '';
  }

  // ── 12. Cycle life ────────────────────────────────────────
  {
    const cycleEl    = document.getElementById('cycleLife');
    const cycleMobEl = document.getElementById('cycleLife_mobile');

    let sc_op = null;

    if (hasL1 && hasL2 && Kw && d && D) {
      const su2_val = (8 * (F2 || 0) * D) / (Math.PI * Math.pow(d, 3));
      const su1_val = (8 * (F1 || 0) * D) / (Math.PI * Math.pow(d, 3));
      sc_op = Kw * Math.max(su2_val, su1_val);
    } else if (hasL2 && Kw && d && D && F2) {
      sc_op = Kw * (8 * F2 * D) / (Math.PI * Math.pow(d, 3));
    } else if (hasL1 && Kw && d && D && F1) {
      sc_op = Kw * (8 * F1 * D) / (Math.PI * Math.pow(d, 3));
    }

    if (sc_op && mts) {
      const N         = estimateCycleLife(sc_op, mts, peened);
      const lifeStr   = formatCycleLife(N);
      const lifeClass = N !== null && N < 1000
        ? 'prop-output wire-chip unavail'
        : 'prop-output';

      if (cycleEl)    { cycleEl.textContent    = lifeStr; cycleEl.className    = lifeClass; }
      if (cycleMobEl) { cycleMobEl.textContent  = lifeStr; cycleMobEl.className = lifeClass; }

      if (N !== null && N < 1000)
        errors.push(`Estimated cycle life < 1,000 — check stress levels and design inputs`);
    } else {
      if (cycleEl)    cycleEl.textContent    = '—';
      if (cycleMobEl) cycleMobEl.textContent  = '—';
    }
  }

  // ── 13. Geometry warnings ─────────────────────────────────
  if (C) {
    applyFieldHighlightClass('C', C < 4 ? 'warn' : C > 16 ? 'warn' : 'ok');
    if (C < 4)  warnings.push(`Spring index C = ${C.toFixed(3)} is below 4 — difficult to coil`);
    if (C > 16) warnings.push(`Spring index C = ${C.toFixed(3)} exceeds 16 — prone to tangling`);
  }

  if (pitch && D) {
    const ang = Math.atan(pitch / (Math.PI * D)) * 180 / Math.PI;
    if (ang > 12) warnings.push(`Excessive pitch angle: ${ang.toFixed(3)}° — recommended max is 12°`);
  }

  if (pitch && d && pitch < d)
    warnings.push(`Pitch (${pitch.toFixed(3)}") is less than wire diameter (${d.toFixed(3)}") — coils will clash`);

  if (Na !== null && Na < 1)
    warnings.push(`Less than one active coil (Na = ${Na.toFixed(3)}) — spring will not function correctly`);

  if (d && selectedMaterialRecord) {
    const minD = parseFloat(selectedMaterialRecord['MIN DIAMETER/WIDTH (in)']) || null;
    const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;
    if (minD && d < minD)
      errors.push(`Wire diameter ${d.toFixed(4)}" is below minimum of ${minD}" for ${selectedMaterialRecord.NAME}`);
    else if (maxD && d > maxD)
      errors.push(`Wire diameter ${d.toFixed(4)}" exceeds maximum of ${maxD}" for ${selectedMaterialRecord.NAME}`);
  }

  // ── 14. Load and stress warnings ─────────────────────────
  if (hasL1 && hasL2 && F1 !== null && F2 !== null && F1 > F2)
    warnings.push(`Load 1 (${F1.toFixed(3)} lb) exceeds Load 2 (${F2.toFixed(3)} lb) — expected L1 < L2`);

  if (hasL1 && defS && def1 !== null) {
    const pct1 = def1 / defS * 100;
    if (pct1 < 15) warnings.push(`Deflection at Load 1 is only ${pct1.toFixed(3)}% of max — recommended minimum is 15%`);
  }

  function stressWarn(F, label, active) {
    if (!active || !mts || !F || !Kw || !d || !D) return;
    const pct     = Kw * (8 * F * D) / (Math.PI * Math.pow(d, 3)) / mts * 100;
    const warnPct = preset
      ? (peened ? 50 : 45)
      : (peened ? 36 : 30);
    if (pct > warnPct) {
      warnings.push(
        `Stress at ${label} is ${pct.toFixed(0)}% MTS — exceeds ` +
        `${warnPct}% ${preset ? 'static' : 'cyclic'} allowable`
      );
    }
  }
  stressWarn(F1, 'Load 1', hasL1);
  stressWarn(F2, 'Load 2', hasL2);
  stressWarn(Fs, 'solid',  true);

  if (!result.converged) {
    const pinnedCount = countEffectiveConstraints();
    warnings.push(
      pinnedCount > 7
        ? `Solver did not converge — system may be over-constrained or ` +
          `contain contradictory inputs (${pinnedCount} fields pinned). ` +
          `Try clearing some inputs.`
        : `Solver did not fully converge (err=${result.err.toFixed(4)}, ` +
          `${result.iter} iters) — check for conflicting inputs`
    );
  }

  // ── 15. Status bar — always last ─────────────────────────
  const dot     = document.getElementById('bottomStatusDot');
  const text    = document.getElementById('bottomStatusSummary');
  const hasData = d && D && k;

  if (errors.length) {
    if (dot)  dot.className    = 'status-dot err';
    if (text) text.textContent = errors[0];
  } else if (warnings.length) {
    if (dot)  dot.className    = 'status-dot warn';
    if (text) text.textContent = warnings.length === 1
      ? warnings[0]
      : warnings.map((w, i) => `${i + 1}. ${w}`).join('\n');
  } else if (hasData) {
    const endCond = getBucklingEndCondition();
    const bkLabel = endCond
      ? (() => {
          const bk = computeWahlStahlBuckling(Lf, D, k, endCond.alpha);
          if (!bk) return '';
          if (bk.stable) return `Buckle: Stable (${endCond.label})`;
          return `Buckle: F_cr=${bk.F_cr.toFixed(1)} lb (${endCond.label})`;
        })()
      : '';

    if (dot)  dot.className    = 'status-dot ok';
    if (text) text.textContent = [
      `k = ${k.toFixed(3)} lb/in`,
      `C = ${C ? C.toFixed(3) : '—'}`,
      `Kw = ${Kw ? Kw.toFixed(3) : '—'}`,
      `Lf = ${Lf ? Lf.toFixed(3) : '—'} in`,
      `Ls = ${Ls_final ? Ls_final.toFixed(3) : '—'} in`,
      bkLabel,
      `[LM: ${result.iter} iters]`,
    ].filter(Boolean).join('  |  ');
  } else {
    if (dot)  dot.className    = 'status-dot';
    if (text) text.textContent = 'Enter spring parameters to begin';
  }

    // ── 17. Grade tolerances ──────────────────────────────────
    applyGradeTolerances();


  // ── 16. Update charts ─────────────────────────────────────
  // Only pass chart data when the minimum geometry is available.
  // Passing null signals updateAllCharts to blank all chart canvases.
  const chartData = (k && Lf && d && D) ? {
    k, Lf, Ls_final, defS,
    d, D,
    F1:    hasL1 ? F1    : null,
    L1:    hasL1 ? L1    : null,
    F2:    hasL2 ? F2    : null,
    L2:    hasL2 ? L2    : null,
    Fs,
    F1tol: hasL1 ? readFieldValue('F1tol') : null,
    F2tol: hasL2 ? readFieldValue('F2tol') : null,
    def1:  hasL1 ? def1  : null,
    def2:  hasL2 ? def2  : null,
    mts, Kw, peened, preset, hasL1, hasL2,
  } : null;
  updateAllCharts(chartData);
}

// ── Grade tolerance helper (no side effects, no runCalc) ──────
function applyGradeTolerances() {
  const grade  = document.getElementById('grade')?.value;
  const isPrec = grade === 'Precision';

  const coilTol = document.getElementById('dTolCoil');
  const lfTol   = document.getElementById('LfTol');

  if (coilTol && !userEnteredFieldIds.has('dTolCoil')) {
    coilTol.value = isPrec ? '0.005' : '0.010';
  }
  if (lfTol && !userEnteredFieldIds.has('LfTol')) {
    lfTol.value = isPrec ? '0.005' : '0.010';
  }
}

function ODandLengthToleranceChange() {
  applyGradeTolerances();
  saveStateToHash();
  runCalc();
}


// ============================================================
// CLEAR ALL FIELDS
// ============================================================

function clearAll() {
  document.querySelectorAll('input[type=number]').forEach(el => {
    el.value = '';
    el.classList.remove('user-entered');
  });
  document.querySelectorAll('span.prop-output').forEach(el => el.textContent = '—');
  userEnteredFieldIds.clear();

  ['endClosed', 'endGround', 'condPreset', 'condPeened'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

  const defaultBuckle = document.querySelector('input[name=buckle][value="unk"]');
  if (defaultBuckle) defaultBuckle.checked = true;

  // ── Clear tolerance fields explicitly ─────────────────────
  const coilTol = document.getElementById('dTolCoil');
  const lfTol   = document.getElementById('LfTol');
  if (coilTol) coilTol.value = '';
  if (lfTol)   lfTol.value   = '';

  setDualOutput('wireAvailabilityChip', 'Enter wire diameter to check', 'wire-chip');
  setDualOutput('cycleLife', '—');

  const dot  = document.getElementById('bottomStatusDot');
  const text = document.getElementById('bottomStatusSummary');
  if (dot)  dot.className    = 'status-dot';
  if (text) text.textContent = 'Cleared — enter parameters to begin';

  history.replaceState(null, '', '#');
  applyGradeTolerances();
}


// ============================================================
// IMPORT / EXPORT
// ============================================================

function gatherAllFieldValuesForExport() {
  const read = id => {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : null;
  };

  const snap = {
    _meta: { exported: new Date().toISOString(), tool: 'Spring Calculator (LM)' },
    _userEnteredIds: [...userEnteredFieldIds],

    // ── Configuration ──────────────────────────────────────
    material:   read('material'),
    hand:       read('hand'),
    grade:      read('grade'),
    endClosed:  document.getElementById('endClosed')?.checked  ?? false,
    endGround:  document.getElementById('endGround')?.checked  ?? false,
    condPreset: document.getElementById('condPreset')?.checked ?? false,
    condPeened: document.getElementById('condPeened')?.checked ?? false,
    buckle:     document.querySelector('input[name=buckle]:checked')?.value ?? 'unk',

    // ── Spring Properties ──────────────────────────────────────
    WireDiameter:              read('d'),
    WireDiameterTolerance:     read('dTol'),
    WireLength:                read('wl'),
    WireWeight:                read('sw'),
    MinTensileStrength:        read('mts'),
    SpringRate:                read('k'),
    SpringIndex:               read('C'),
    NaturalFrequency:          read('fn'),
    ShearModulusG:             read('G'),

    // ── Coil & bore ────────────────────────────────────────────
    ArborDiameter:             read('arbor'),
    CoilInsideDiameter:        read('ID'),
    CoilMeanDiameter:          read('D'),
    CoilOutsideDiameter:       read('OD'),
    CoilDiameterTolerance:     read('dTolCoil'),
    MinCoilIDFree:             read('minID'),
    MaxShaftDiameter:          read('shaft'),
    MinHoleDiameter:           read('hole'),

    // ── Coil count & geometry ──────────────────────────────────
    NumberOfActiveCoils:       read('Na'),
    NumberOfTotalCoils:        read('Nt'),
    NumberOfDeadCoils:         read('Nd'),
    CoilPitch:                 read('pitch'),
    PitchAngle:                read('pitchAng'),
    FreeLengthTolerance:       read('LfTol'),
    AllowableSolidLength:      read('LsAllowable'),
    TravelL1toL2:              read('travelL1L2'),

    // ── Lengths ────────────────────────────────────────────────
    FreeLength:                read('Lf'),
    SolidLength:               read('Ls'),

    // ── Load 1 ─────────────────────────────────────────────────
    LoadAtL1:                  read('F1'),
    LoadToleranceAtL1:         read('F1tol'),
    LengthAtL1:                read('L1'),
    DeflectionAtL1:            read('def1'),
    PctMaxDeflectionAtL1:      read('pct1'),
    CorrectedStressAtL1:       read('sc1'),
    CorrectedPctMTSAtL1:       read('pMTS1'),
    UncorrectedStressAtL1:     read('su1'),
    UncorrectedPctMTSAtL1:     read('pUS1'),
    ExpandedODAtL1:            read('OD1'),

    // ── Load 2 ─────────────────────────────────────────────────
    LoadAtL2:                  read('F2'),
    LoadToleranceAtL2:         read('F2tol'),
    LengthAtL2:                read('L2'),
    DeflectionAtL2:            read('def2'),
    PctMaxDeflectionAtL2:      read('pct2'),
    CorrectedStressAtL2:       read('sc2'),
    CorrectedPctMTSAtL2:       read('pMTS2'),
    UncorrectedStressAtL2:     read('su2'),
    UncorrectedPctMTSAtL2:     read('pUS2'),
    ExpandedODAtL2:            read('OD2'),

    // ── At Solid ───────────────────────────────────────────────
    LoadAtSolid:               read('Fs'),
    DeflectionAtSolid:         read('defS'),
    CorrectedStressAtSolid:    read('scS'),
    CorrectedPctMTSAtSolid:    read('pMTSs'),
    UncorrectedStressAtSolid:  read('suS'),
    UncorrectedPctMTSAtSolid:  read('pUSs'),

    // ── At Buckle ──────────────────────────────────────────────
    BucklingLength:            read('Lbuckle'),
    LoadAtBuckle:              read('Fbuckle'),
    DeflectionAtBuckle:        read('defBuckle'),
    PctMaxDeflectionAtBuckle:  read('pctBuckle'),
    CorrectedStressAtBuckle:   read('scBuckle'),
    CorrectedPctMTSAtBuckle:   read('pMTSbuckle'),
    UncorrectedStressAtBuckle: read('suBuckle'),
    UncorrectedPctMTSAtBuckle: read('pUSbuckle'),
    ExpandedODAtBuckle:        read('ODbuckle'),

    // ── Custom Material ────────────────────────────────────────
    CustomMaterialName:             read('cm_name'),
    CustomMaterialSpecification:    read('cm_spec'),
    CustomMaterialComment:          read('cm_comment'),
    CustomMaterialEquationType:     document.getElementById('cm_eqType')?.value ?? null,
    CustomMaterialDensity:          read('cm_density'),
    CustomMaterialBendingModulus:   read('cm_E'),
    CustomMaterialTorsionModulus:   read('cm_G'),
    CustomMaterialPoissonsRatio:    read('cm_nu'),
    CustomMaterialAllowablePctMTS:  read('cm_allowTensile'),
    CustomMaterialPctTensileToSet:  read('cm_tensileSet'),
    CustomMaterialMinDiameter:      read('cm_minD'),
    CustomMaterialMaxDiameter:      read('cm_maxD'),
    CustomMaterialUSF:              read('cm_usf'),
    CustomMaterialP0:               read('cm_p0'),
    CustomMaterialP1:               read('cm_p1'),
    CustomMaterialP2:               read('cm_p2'),
    CustomMaterialP3:               read('cm_p3'),
    CustomMaterialP4:               read('cm_p4'),
  };

  // ── Custom material record (if active) ─────────────────
  const activeMat = read('material');
  if (activeMat && loadedRoundMaterialsByName[activeMat]?.['_custom']) {
    snap._customMaterial = loadedRoundMaterialsByName[activeMat];
  }

  return snap;
}

function exportCfg() {
  const data = gatherAllFieldValuesForExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'spring-config-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function importCfg() {
  document.getElementById('fileIn').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const cfg = JSON.parse(ev.target.result);
      clearAll();

      // ── Restore custom material first ──────────────────
      if (cfg._customMaterial?.NAME) {
        const rec = cfg._customMaterial;
        loadedRoundMaterialsByName[rec.NAME] = rec;
        const sel = document.getElementById('material');
        if (sel && ![...sel.options].some(o => o.value === rec.NAME)) {
          const opt = document.createElement('option');
          opt.value          = rec.NAME;
          opt.textContent    = '★ ' + rec.NAME + ' (custom)';
          opt.dataset.custom = rec.NAME;
          sel.insertBefore(opt, sel.firstChild);
        }
      }

        // ── Restore equation type FIRST so P fields exist ──
        if (cfg.CustomMaterialEquationType) {
          const el = document.getElementById('cm_eqType');
          if (el) {
            el.value = cfg.CustomMaterialEquationType;
            cmUpdateEquation();
          }
        }

      // ── Restore named fields ───────────────────────────
      const fieldMap = {
      WireDiameter:              'd',
      WireDiameterTolerance:     'dTol',
      WireLength:                'wl',
      WireWeight:                'sw',
      MinTensileStrength:        'mts',
      SpringRate:                'k',
      SpringIndex:               'C',
      NaturalFrequency:          'fn',
      ShearModulusG:             'G',
      ArborDiameter:             'arbor',
      CoilInsideDiameter:        'ID',
      CoilMeanDiameter:          'D',
      CoilOutsideDiameter:       'OD',
      CoilDiameterTolerance:     'dTolCoil',
      MinCoilIDFree:             'minID',
      MaxShaftDiameter:          'shaft',
      MinHoleDiameter:           'hole',
      NumberOfActiveCoils:       'Na',
      NumberOfTotalCoils:        'Nt',
      NumberOfDeadCoils:         'Nd',
      CoilPitch:                 'pitch',
      PitchAngle:                'pitchAng',
      FreeLengthTolerance:       'LfTol',
      AllowableSolidLength:      'LsAllowable',
      TravelL1toL2:              'travelL1L2',
      FreeLength:                'Lf',
      SolidLength:               'Ls',
      LoadAtL1:                  'F1',
      LoadToleranceAtL1:         'F1tol',
      LengthAtL1:                'L1',
      DeflectionAtL1:            'def1',
      PctMaxDeflectionAtL1:      'pct1',
      CorrectedStressAtL1:       'sc1',
      CorrectedPctMTSAtL1:       'pMTS1',
      UncorrectedStressAtL1:     'su1',
      UncorrectedPctMTSAtL1:     'pUS1',
      ExpandedODAtL1:            'OD1',
      LoadAtL2:                  'F2',
      LoadToleranceAtL2:         'F2tol',
      LengthAtL2:                'L2',
      DeflectionAtL2:            'def2',
      PctMaxDeflectionAtL2:      'pct2',
      CorrectedStressAtL2:       'sc2',
      CorrectedPctMTSAtL2:       'pMTS2',
      UncorrectedStressAtL2:     'su2',
      UncorrectedPctMTSAtL2:     'pUS2',
      ExpandedODAtL2:            'OD2',
      LoadAtSolid:               'Fs',
      DeflectionAtSolid:         'defS',
      CorrectedStressAtSolid:    'scS',
      CorrectedPctMTSAtSolid:    'pMTSs',
      UncorrectedStressAtSolid:  'suS',
      UncorrectedPctMTSAtSolid:  'pUSs',
      BucklingLength:            'Lbuckle',
      LoadAtBuckle:              'Fbuckle',
      DeflectionAtBuckle:        'defBuckle',
      PctMaxDeflectionAtBuckle:  'pctBuckle',
      CorrectedStressAtBuckle:   'scBuckle',
      CorrectedPctMTSAtBuckle:   'pMTSbuckle',
      UncorrectedStressAtBuckle: 'suBuckle',
      UncorrectedPctMTSAtBuckle: 'pUSbuckle',
      ExpandedODAtBuckle:        'ODbuckle',
      CustomMaterialName:             'cm_name',
      CustomMaterialSpecification:    'cm_spec',
      CustomMaterialComment:          'cm_comment',
      CustomMaterialDensity:          'cm_density',
      CustomMaterialBendingModulus:   'cm_E',
      CustomMaterialTorsionModulus:   'cm_G',
      CustomMaterialPoissonsRatio:    'cm_nu',
      CustomMaterialAllowablePctMTS:  'cm_allowTensile',
      CustomMaterialPctTensileToSet:  'cm_tensileSet',
      CustomMaterialMinDiameter:      'cm_minD',
      CustomMaterialMaxDiameter:      'cm_maxD',
      CustomMaterialUSF:              'cm_usf',
      CustomMaterialP0:               'cm_p0',
      CustomMaterialP1:               'cm_p1',
      CustomMaterialP2:               'cm_p2',
      CustomMaterialP3:               'cm_p3',
      CustomMaterialP4:               'cm_p4',
    };

      Object.entries(fieldMap).forEach(([key, domId]) => {
        if (cfg[key] == null) return;
        const el = document.getElementById(domId);
        if (el) el.value = cfg[key];
      });


        // ── Restore selects — ONE time only ────────────────
        ['material', 'hand', 'grade'].forEach(id => {
          if (cfg[id] == null) return;
          const el = document.getElementById(id);
          if (el) el.value = cfg[id];
        });

      // ── Restore checkboxes ─────────────────────────────
      ['endClosed', 'endGround', 'condPreset', 'condPeened'].forEach(id => {
        const el = document.getElementById(id);
        if (el && cfg[id] !== undefined) el.checked = cfg[id];
      });

      // ── Restore buckle radio ───────────────────────────
      if (cfg.buckle) {
        const r = document.querySelector(`input[name=buckle][value="${cfg.buckle}"]`);
        if (r) r.checked = true;
      }

      // ── Restore pinned field set ───────────────────────
      userEnteredFieldIds.clear();
      if (Array.isArray(cfg._userEnteredIds)) {
        cfg._userEnteredIds.forEach(id => {
          // Skip modal fields that got captured accidentally
          if (id.startsWith('cm_')) return;
          userEnteredFieldIds.add(id);
          document.getElementById(id)?.classList.add('user-entered');
        });
      }

      saveStateToHash();
      runCalc();
    } catch {
      alert('Import failed — invalid JSON file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}


// ============================================================
// GRAPH TAB SWITCHER
// ============================================================

function switchGraphTab(n, btn) {
  // 1. Hide all panels and deactivate all tabs
  document.querySelectorAll('.graph-content').forEach(p => p.classList.remove('visible'));
  document.querySelectorAll('.graph-tab').forEach(t => t.classList.remove('active'));

  // 2. Show the selected panel FIRST — canvas must be visible before Chart.js renders
  document.getElementById('graphContent' + n).classList.add('visible');
  btn.classList.add('active');

  // 3. Now render — canvas has non-zero dimensions
  // _lastChartParams is null when the system is underdefined; charts blank.
  const chartFns = [
    null,
    window._chartLoadVsDeflection,
    window._chartLoadVsLength,
    window._chartPctMTSvsDeflection,
    window._chartStressVsLength,
    window._chartFatigueStrength,
    window._chartStressVsLoad,
  ];
  const fn = chartFns[n];
  if (fn) fn(window._lastChartParams ?? null);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  _suppressHashWrite = true;

  const INTEGER_FIELDS = new Set(['G', 'mts']);
  const FOUR_DP_FIELDS = new Set(['dTol']);
  const ZERO_DP_FIELDS = new Set([
    'su1', 'su2', 'suS', 'suBuckle',
    'sc1', 'sc2', 'scS', 'scBuckle',
  ]);

    //   'pMTS1', 'pMTS2', 'pMTSs', 'pMTSbuckle',
    // 'pUS1',  'pUS2',  'pUSs',  'pUSbuckle',

    const TWO_DP_FIELDS = new Set([
      'pMTS1', 'pMTS2', 'pMTSs', 'pMTSbuckle',
      'pUS1',  'pUS2',  'pUSs',  'pUSbuckle',
    ]);

  document.querySelectorAll('input[type=number]').forEach(el => {
    // Skip inputs inside the custom material modal
    if (el.closest('#customMaterialOverlay')) return;
    // Skip purely computed read-only fields that can never be solver inputs
    if (el.readOnly) return;

    el.setAttribute('min', '0');

    el.addEventListener('input', () => {
      sanitizePositiveInput(el);
      onUserInput(el.id);
    });

    el.addEventListener('keydown', ev => {
      if (ev.key === '-' || ev.key === 'e') ev.preventDefault();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        el.blur();
      }
    });

    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      if (!isNaN(v) && v > 0) {
        userEnteredFieldIds.add(el.id);
        el.classList.add('user-entered');
      } else {
        // Value was cleared or zeroed — unpin it
        userEnteredFieldIds.delete(el.id);
        el.classList.remove('user-entered');
      }
      saveStateToHash();
      runCalc();
    });

    el.addEventListener('blur', () => {
      // Blur is formatting-only. All pinning and recalculation is
      // handled by the 'change' event, which only fires when the
      // value actually changed. This prevents phantom-pinning
      // computed fields that the user merely clicked through.
      const v = parseFloat(el.value);
      if (!isNaN(v) && v > 0) {
        if (INTEGER_FIELDS.has(el.id)) {
          el.value = Math.round(v).toString();
        } else if (FOUR_DP_FIELDS.has(el.id)) {
          el.value = v.toFixed(4);
        } else if (ZERO_DP_FIELDS.has(el.id)) {
          el.value = v.toFixed(0);
        } else if (TWO_DP_FIELDS.has(el.id)) {
          el.value = v.toFixed(2);
        } else {
          el.value = v.toFixed(3);
        }
      }

      if (el.id === 'd' && selectedMaterialRecord) {
        const d    = readFieldValue('d');
        const minD = parseFloat(selectedMaterialRecord['MIN DIAMETER/WIDTH (in)']) || null;
        const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;
        el.classList.remove('warn', 'err', 'ok');
        if (d !== null) {
          if ((minD && d < minD) || (maxD && d > maxD)) el.classList.add('err');
        }
      }
    });
  });

  document.querySelectorAll('.it').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.it').forEach(l => l.classList.remove('sel'));
      label.classList.add('sel');
      applyInputModeHighlights();
      saveStateToHash();
      runCalc();
    });
  });

  const checkedRadio = document.querySelector('.it input[type=radio]:checked');
  if (checkedRadio) {
    document.querySelectorAll('.it').forEach(l => l.classList.remove('sel'));
    checkedRadio.closest('.it').classList.add('sel');
  }

  // Buckling radios — post-pass only, never re-solve geometry
  document.querySelectorAll('input[type=radio][name=buckle]').forEach(el => {
    el.addEventListener('change', () => {
      saveStateToHash();
      if (_lastSolvedState) {
        runDeterministicPostPass(_lastSolvedState.sv, _lastSolvedState.result);
      } else {
        runCalc();
      }
    });
  });

  // Checkboxes — split by which need a full solve
  document.querySelectorAll('input[type=checkbox]').forEach(el => {
    el.addEventListener('change', () => {
      saveStateToHash();
      if (el.id === 'condPreset' || el.id === 'condPeened') {
        if (_lastSolvedState) {
          runDeterministicPostPass(_lastSolvedState.sv, _lastSolvedState.result);
        } else {
          runCalc();
        }
      } else {
        runCalc();
      }
    });
  });

  loadMaterialDatabase();
  ODandLengthToleranceChange();
  applyInputModeHighlights();
});

function rerunPostPassOnly() {
  if (_lastSolvedState) {
    runDeterministicPostPass(_lastSolvedState.sv, _lastSolvedState.result);
  }
}

function showMaterial() {
  const name = document.getElementById('material')?.value;
  const rec  = name ? loadedRoundMaterialsByName[name] : null;
  if (!rec) return;

  const overlay = document.getElementById('customMaterialOverlay');
  overlay.style.display = 'flex';

  // Switch modal into read-only view mode
  overlay.dataset.mode = 'view';

  // Update header title
  const header = overlay.querySelector('span[style*="font-size:13px"]');
  if (header) header.textContent = 'Material Properties — ' + name;

  // Populate all fields from the record
  cmPopulateFromRecord(rec);

  // Make all inputs and selects read-only
  overlay.querySelectorAll('input, select, textarea').forEach(el => {
    el.setAttribute('disabled', 'true');
    el.style.opacity = '0.8';
    el.style.cursor  = 'not-allowed';
  });

  // Hide Apply button, show Close only
  const footer = overlay.querySelector('[style*="justify-content:flex-end"]');
  if (footer) {
    footer.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim() === 'Apply Material') btn.style.display = 'none';
      if (btn.textContent.trim() === 'Cancel') btn.textContent = 'Close';
    });
  }

  // Hide the + Add Row button in S/N section
  overlay.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.trim() === '+ Add Row') btn.style.display = 'none';
  });

  // Hide the × delete buttons on S/N rows
  overlay.querySelectorAll('#cm_snRows button').forEach(btn => {
    btn.style.display = 'none';
  });
}

function ComingSoon() {
  showInfoModal(
    'KasperCalc SolidWorks Smart Spring',
    `Coming Soon!`
  );
}

function UseAMcMasterCarrSpring() {
  showInfoModal(
    'KasperCalc SolidWorks Smart Spring',
    `For compression springs, McMaster-Carr provides free SolidWorks Smart Parts (.SLDPRT) 
with fully parametric geometry. Simply search your spring specifications on 
mcmaster.com, select a matching spring, and download the CAD model directly from the product page, and edit as desired.`
  );
}

function SpringMacroPopup() {
  const code = `' ============================================================
' KasperCalc SolidWorks Spring Macro
' Paste this into SolidWorks Tools > Macros > New
' Fill in the parameters from your KasperCalc results
' ============================================================

Dim swApp As Object
Dim Part As Object
Dim boolstatus As Boolean

Sub main()
    swApp = Application.SldWorks
    Part = swApp.ActiveDoc

    ' ── Spring Parameters — paste from KasperCalc ──────────
    Dim wireDiameter    As Double : wireDiameter    = 0.003  ' meters (d)
    Dim meanDiameter    As Double : meanDiameter    = 0.025  ' meters (D)
    Dim freeLength      As Double : freeLength      = 0.075  ' meters (Lf)
    Dim activeCoils     As Integer : activeCoils    = 8
    Dim totalCoils      As Integer : totalCoils     = 10

    ' ── Create helix ───────────────────────────────────────
    Dim pitch As Double
    pitch = freeLength / activeCoils

    Dim sketchMgr As Object
    sketchMgr = Part.SketchManager

    ' Draw base circle for helix
    Part.ClearSelection2 True
    Dim mySketch As Object
    sketchMgr.InsertSketch True
    sketchMgr.CreateCircle 0, 0, 0, meanDiameter / 2, 0, 0
    sketchMgr.InsertSketch False

    ' Insert helix
    Part.InsertHelix2 False, True, 1, 0, pitch, freeLength, _
                      0, False, 0, True, totalCoils, 0, 0

    MsgBox "Spring helix created. Sweep a " & _
           Format(wireDiameter * 1000, "0.000") & _
           "mm diameter circle along the path to complete the spring."
End Sub`;

  //const GITHUB_URL  = '/KasperCalc - SpringMacro.zip';
  const DOWNLOAD_URL = '/KasperCalc - SpringMacro.zip';

  // Remove any existing modal
  const existing = document.getElementById('infoModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'infoModalOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:rgba(0,0,0,0.55);
    z-index:99998;
    display:flex;align-items:center;justify-content:center;
    padding:16px;
  `;

        //   <!-- ── Option 1: GitHub ─────────────────────────── -->
        // <div style="
        //   border:1.5px solid rgb(67,67,67);border-radius:8px;overflow:hidden;
        // ">
        //   <div style="
        //     background:#d9d9d9;padding:5px 10px;
        //     font-size:12px;font-weight:700;color:#61828A;
        //     text-transform:uppercase;letter-spacing:0.06em;
        //     border-bottom:1px solid #c0c0c0;
        //     display:flex;align-items:center;gap:8px;
        //   ">
        //     <span style="
        //       background:#61828A;color:#fff;border-radius:50%;
        //       width:18px;height:18px;display:inline-flex;
        //       align-items:center;justify-content:center;
        //       font-size:10px;font-weight:700;flex-shrink:0;
        //     ">1</span>
        //     Full Macro Package — GitHub
        //   </div>
        //   <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
        //     <p style="font-size:12px;color:#333;margin:0;line-height:1.6;">
        //       The full macro package includes the <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">.swp</code>
        //       macro file, <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">UserForm1.frm</code>,
        //       <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">UserForm1.frx</code>,
        //       and a reference diagram. The form-based version lets you enter all parameters in a
        //       GUI without touching VBA code.
        //     </p>
        //     <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" style="
        //       display:inline-flex;align-items:center;gap:6px;
        //       font-size:12px;padding:5px 14px;border-radius:6px;
        //       border:1.5px solid rgb(67,67,67);background:#333;
        //       color:#fff;text-decoration:none;font-family:'Roboto',Arial,sans-serif;
        //       font-weight:600;align-self:flex-start;
        //     ">
        //       <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        //         <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
        //           0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
        //           -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
        //           .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
        //           -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
        //           .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
        //           .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
        //           0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        //       </svg>
        //       View on GitHub
        //     </a>
        //   </div>
        // </div>

  overlay.innerHTML = `
    <div style="
      background:#eee;
      border:2px solid rgb(67,67,67);
      border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.45);
      width:100%;max-width:660px;
      max-height:90vh;overflow-y:auto;
      font-family:'Roboto',Arial,sans-serif;
    ">
      <!-- Header -->
      <div style="
        background:#6a746a;border-radius:11px 11px 0 0;
        padding:8px 14px;
        display:flex;align-items:center;justify-content:space-between;
      ">
        <span style="font-size:13px;font-weight:700;color:#eee;
          text-transform:uppercase;letter-spacing:0.07em;">
          KasperCalc SolidWorks Spring Macro
        </span>
        <button onclick="closeInfoModal()" style="
          background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.35);
          color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;
          font-size:14px;display:flex;align-items:center;justify-content:center;
        ">&#x2715;</button>
      </div>

      <!-- Body -->
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;">

        <!-- ── Option 2: ZIP Download ───────────────────── -->
        <div style="
          border:1.5px solid rgb(67,67,67);border-radius:8px;overflow:hidden;
        ">
          <div style="
            background:#d9d9d9;padding:5px 10px;
            font-size:12px;font-weight:700;color:#61828A;
            text-transform:uppercase;letter-spacing:0.06em;
            border-bottom:1px solid #c0c0c0;
            display:flex;align-items:center;gap:8px;
          ">
            <span style="
              background:#61828A;color:#fff;border-radius:50%;
              width:18px;height:18px;display:inline-flex;
              align-items:center;justify-content:center;
              font-size:10px;font-weight:700;flex-shrink:0;
            ">1</span>
            Direct ZIP Download
          </div>
          <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
            <ol style="font-size:12px;color:#333;margin:0;padding-left:18px;line-height:1.8;">
              <li>Click the button below to download <strong>KasperCalc_Spring_Macro.zip</strong>.</li>
              <li>Extract all files into the <strong>same folder</strong> — the <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">.frm</code> and <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">.frx</code> files must stay alongside the <code style="background:#d9d9d9;padding:1px 4px;border-radius:3px;">.swp</code>.</li>
              <li>In SolidWorks go to <strong>Tools → Macros → Run</strong>, browse to <em>Compression Spring Generator.swp</em> and click Run.</li>
              <li>Enter your KasperCalc parameters into the form and click Generate.</li>
            </ol>
            <a href="${DOWNLOAD_URL}" download style="
              display:inline-flex;align-items:center;gap:6px;
              font-size:12px;padding:5px 14px;border-radius:6px;
              border:1.5px solid rgb(67,67,67);background:#699dad;
              color:#fff;text-decoration:none;font-family:'Roboto',Arial,sans-serif;
              font-weight:600;align-self:flex-start;
            ">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2v8M4 7l4 4 4-4M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Download ZIP
            </a>
          </div>
        </div>

      </div>
    </div>
  `;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeInfoModal();
  });

  document.body.appendChild(overlay);
}

// ============================================================
// SHARED INFO MODAL
// ============================================================

function showInfoModal(title, message, steps, code) {
  // Remove any existing modal
  const existing = document.getElementById('infoModalOverlay');
  if (existing) existing.remove();

  // Build steps HTML
  let stepsHtml = '';
  if (steps && steps.length) {
    stepsHtml = `<ol style="
      margin:10px 0 0;padding-left:20px;
      font-size:12px;color:#333;line-height:1.8;
    ">` + steps.map(s => `<li style="margin-bottom:4px;">${s}</li>`).join('') + '</ol>';
  }

  // Build message HTML
  let messageHtml = '';
  if (message) {
    messageHtml = `<p style="font-size:13px;color:#333;line-height:1.65;margin:0;">${message}</p>`;
  }

  // Build code block HTML
  let codeHtml = '';
  if (code) {
    codeHtml = `
      <div style="margin-top:12px;">
        <div style="
          display:flex;align-items:center;justify-content:space-between;
          margin-bottom:4px;
        ">
          <span style="font-size:11px;font-weight:700;color:#61828A;
            text-transform:uppercase;letter-spacing:0.06em;">
            Macro Code
          </span>
          <button onclick="copyMacroCode()" id="copyMacroBtn" style="
            font-size:11px;padding:2px 10px;border-radius:4px;
            border:1.5px solid rgb(67,67,67);background:#d9d9d9;
            color:#000;cursor:pointer;font-family:'Roboto',Arial,sans-serif;
          ">Copy Code</button>
        </div>
        <pre id="macroCodeBlock" style="
          background:#1a3a40;color:#a8d8c8;
          font-size:11px;line-height:1.55;
          padding:12px;border-radius:6px;
          overflow-x:auto;white-space:pre;
          max-height:280px;overflow-y:auto;
          border:1.5px solid rgb(67,67,67);
          font-family:'Courier New',monospace;
          margin:0;
        ">${escapeHtml(code)}</pre>
      </div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'infoModalOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:rgba(0,0,0,0.55);
    z-index:99998;
    display:flex;align-items:center;justify-content:center;
    padding:16px;
  `;

  overlay.innerHTML = `
    <div style="
      background:#eee;
      border:2px solid rgb(67,67,67);
      border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.45);
      width:100%;max-width:600px;
      max-height:90vh;overflow-y:auto;
      font-family:'Roboto',Arial,sans-serif;
    ">
      <!-- Header -->
      <div style="
        background:#6a746a;border-radius:11px 11px 0 0;
        padding:8px 14px;
        display:flex;align-items:center;justify-content:space-between;
      ">
        <span style="font-size:13px;font-weight:700;color:#eee;
          text-transform:uppercase;letter-spacing:0.07em;">
          ${escapeHtml(title)}
        </span>
        <button onclick="closeInfoModal()" style="
          background:rgba(255,255,255,0.15);
          border:2px solid rgba(255,255,255,0.35);
          color:#fff;width:26px;height:26px;border-radius:50%;
          cursor:pointer;font-size:14px;
          display:flex;align-items:center;justify-content:center;
        ">&#x2715;</button>
      </div>

      <!-- Body -->
      <div style="padding:16px;">
        ${messageHtml}
        ${stepsHtml}
        ${codeHtml}

        <!-- Footer -->
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button onclick="closeInfoModal()" style="
            font-size:13px;padding:5px 18px;border-radius:6px;
            border:1.5px solid rgb(67,67,67);background:#699dad;
            color:#fff;cursor:pointer;
            font-family:'Roboto',Arial,sans-serif;font-weight:600;
          ">Close</button>
        </div>
      </div>
    </div>
  `;

  // Close on background click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeInfoModal();
  });

  document.body.appendChild(overlay);
}

function closeInfoModal() {
  document.getElementById('infoModalOverlay')?.remove();
}

function copyMacroCode() {
  const code = document.getElementById('macroCodeBlock')?.textContent ?? '';
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copyMacroBtn');
    if (!btn) return;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
  }).catch(() => {
    prompt('Copy this macro:', code);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeInfoModal();
});

const STIFFNESS_FIELDS = new Set([
  'k', 'Na', 'Nt', 'F1', 'F2', 'Ls', 'pitch'
]);

const GEOMETRY_FIELDS = new Set([
  'd', 'D', 'OD', 'ID', 'Lf', 'L1', 'L2',
  'Lbuckle', 'minID', 'shaft', 'hole'
]);

function isSystemPhysicallyDetermined() {
  let stiffnessCount = 0;
  let geometryCount  = 0;

  for (const id of userEnteredFieldIds) {
    if (!INDEPENDENT_FIELDS.has(id)) continue;
    if (STIFFNESS_FIELDS.has(id))  stiffnessCount++;
    if (GEOMETRY_FIELDS.has(id))   geometryCount++;
  }

  // Must have at least one stiffness constraint — otherwise
  // the solver has no information about spring rate and will
  // produce a physically meaningless result.
  if (stiffnessCount === 0) return { ok: false, reason: 'stiffness' };

  // Must have at least one geometry constraint
  if (geometryCount === 0) return { ok: false, reason: 'geometry' };

  return { ok: true };
}

function isSolutionPhysicallyValid(sv) {
  const reasons = [];

  // Ls must be less than Lf
  const Ls_check = sv.Nt * sv.d;
  if (Ls_check >= sv.Lf) {
    reasons.push(
      `Solid length (${Ls_check.toFixed(3)}") equals or exceeds free length ` +
      `(${sv.Lf.toFixed(3)}") — reduce coil count or wire diameter`
    );
  }

  // Na must be at least 1
  if (sv.Na < 1) {
    reasons.push(
      `Active coils (${sv.Na.toFixed(3)}) is less than 1 — spring cannot function`
    );
  }

  // Pitch must be greater than wire diameter (coils would clash)
  if (sv.pitch <= sv.d) {
    reasons.push(
      `Pitch (${sv.pitch.toFixed(3)}") is less than or equal to wire diameter ` +
      `(${sv.d.toFixed(3)}") — coils will clash at free length`
    );
  }

  // Spring index must be at least 1 (coil ID would be zero or negative)
  if (sv.C < 1) {
    reasons.push(
      `Spring index (${sv.C.toFixed(3)}) is less than 1 — geometry is impossible`
    );
  }

  // Wire diameter must be positive
  if (sv.d <= 0) {
    reasons.push('Wire diameter is zero or negative — invalid geometry');
  }

  return { valid: reasons.length === 0, reasons };
}