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
//   Stability criterion (Wahl/Stahl C₁–C₂ form, material-dependent):
//     λ  = α·Lf / D              [effective slenderness]
//     C₁ = E / [2·(E−G)],  C₂ = 2π²·(E−G) / (2G+E)
//     λ < √C₂  → unconditionally stable (spring too short to buckle)
//     λ ≥ √C₂  → can buckle; critical deflection:
//       δ_cr = C₁·Lf · [1 − √(1 − C₂/λ²)]
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

// Material fatigue comparison table — how many rows show before "Show all"
const FATIGUE_TABLE_COLLAPSED_COUNT = 5;
let _fatigueTableExpanded = false;

// Tracks which field IDs the user has typed into manually.
// The LM solver treats these as hard-pinned constraints.
// Serialised into the URL hash on every change and restored on load.
const ANGLE_DATUM_FIELDS = new Set(['angFree', 'betwFree']);

const userEnteredFieldIds = new Set();

// Suppresses hash writes during the initial restore pass.
let _suppressHashWrite = true;


// ============================================================
// VARIABLE SYSTEM
// ============================================================

const LM_VARIABLES = [
  'd',       // 0  wire diameter
  'D',       // 1  mean coil diameter (at free angle)
  'OD',      // 2  outside diameter  (at free angle)
  'ID',      // 3  inside diameter   (at free angle)
  'C',       // 4  spring index
  'Na',      // 5  equivalent active coils (body + arm contribution)
  'NtFree',  // 6  body coils at free angle
  'k',       // 7  spring rate  [lbf-in/deg]
  'pitch',   // 8  coil pitch
  'LbFree',  // 9  body length at free angle
  'arm1',    // 10 moment arm 1 length
  'arm2',    // 11 moment arm 2 length
  'M1',      // 12 torque, minimum-cycle position [lbf-in]
  'defl1',   // 13 angular deflection, minimum-cycle position [deg]
  'M2',      // 14 torque, maximum-cycle position [lbf-in]
  'defl2',   // 15 angular deflection, maximum-cycle position [deg]
];

const LM_DEFAULTS = {
  d: 0.072, D: 0.600, OD: 0.672, ID: 0.528, C: 8.33,
  Na: 5.9,  NtFree: 5.5, k: 0.0300,
  pitch: 0.080, LbFree: 0.468,
  arm1: 1.000, arm2: 1.000,
  M1: 3.0, defl1: 100.0, M2: 6.0, defl2: 200.0,
};

const LM_SCALES = {
  d: 0.1, D: 1.0, OD: 1.0, ID: 1.0, C: 10.0,
  Na: 10.0, NtFree: 10.0, k: 0.05,
  pitch: 0.1, LbFree: 1.0,
  arm1: 1.0, arm2: 1.0,
  M1: 5.0, defl1: 180.0, M2: 5.0, defl2: 180.0,
};

function buildVariableVector() {
  return LM_VARIABLES.map(id => {
    if (userEnteredFieldIds.has(id)) {
      const v = readFieldValue(id);
      return (v !== null && v > 0) ? v : (LM_DEFAULTS[id] || 1.0);
    }
    // For un-pinned fields, always start from defaults — not DOM
    return LM_DEFAULTS[id] || 1.0;
  });
}

/**
 * Better starting point for the LM solver and rank-analysis Jacobian.
 *
 * The plain `buildVariableVector()` uses LM_DEFAULTS for every un-pinned
 * variable, which puts un-pinned geometry variables (D, OD, Na, k, …)
 * far from the true values implied by the user's inputs.  Evaluating the
 * numerical Jacobian at that inconsistent point makes the `k` column norm
 * ~1 000× weaker than all other columns (because D=0.800 default instead
 * of the correct D=ID+d≈0.381), which fools the rank analyser into thinking
 * the spring-rate equation contributes no independent information.
 *
 * This function forward-propagates the algebraic consequences of user inputs
 * before handing off to the solver/Jacobian, so x0 is physically coherent.
 * User-pinned values are always kept as-is; derived values are only written
 * to un-pinned slots.
 */
function buildSeededVariableVector() {
  // ── Seed with user values + defaults ──────────────────────
  const v = {};
  LM_VARIABLES.forEach(id => {
    if (userEnteredFieldIds.has(id)) {
      const val = readFieldValue(id);
      v[id] = (val !== null && val > 0) ? val : (LM_DEFAULTS[id] || 1.0);
    } else {
      v[id] = LM_DEFAULTS[id] || 1.0;
    }
  });

  const E          = getElasticModulusPsi();
  const closeWound = isCloseWound();
  const equalArms  = isEqualArms();

  // Only overwrite un-pinned slots with valid, finite, positive values
  const set = (id, val) => {
    if (!userEnteredFieldIds.has(id) && val > 0 && isFinite(val)) v[id] = val;
  };

  // ── Pass 1: Diameter chain ────────────────────────────────
  // Whichever two of {d, D, OD, ID, C} the user entered, derive the rest.
  if (userEnteredFieldIds.has('d') && userEnteredFieldIds.has('ID')) {
    set('D',  v.ID + v.d);
    set('OD', v.ID + 2 * v.d);
    set('C',  (v.ID + v.d) / v.d);
  } else if (userEnteredFieldIds.has('d') && userEnteredFieldIds.has('OD')) {
    set('D',  v.OD - v.d);
    set('ID', v.OD - 2 * v.d);
    set('C',  (v.OD - v.d) / v.d);
  } else if (userEnteredFieldIds.has('d') && userEnteredFieldIds.has('D')) {
    set('OD', v.D + v.d);
    set('ID', v.D - v.d);
    set('C',  v.D / v.d);
  } else if (userEnteredFieldIds.has('d') && userEnteredFieldIds.has('C')) {
    set('D',  v.C * v.d);
    set('OD', (v.C + 1) * v.d);
    set('ID', (v.C - 1) * v.d);
  }

  // ── Pass 1c: Mirror the arms when they are declared equal ─
  // Done before anything reads arm1/arm2, so the equivalent-coil term
  // and the rate are seeded from the geometry the user actually meant.
  if (equalArms) {
    const a1Pinned = userEnteredFieldIds.has('arm1');
    const a2Pinned = userEnteredFieldIds.has('arm2');
    if (a1Pinned && !a2Pinned)      set('arm2', v.arm1);
    else if (a2Pinned && !a1Pinned) set('arm1', v.arm2);
  }

  // ── Pass 2: Deflection from moving-arm angles ─────────────
  // The user may specify positions either as a torque (M) or as an
  // absolute arm angle. When angles are given, convert to deflection
  // relative to the free angle before seeding.
  {
    const angFree = readFieldValue('angFree');
    if (angFree !== null) {
      if (userEnteredFieldIds.has('ang1')) {
        const a1 = readFieldValue('ang1');
        if (a1 !== null) set('defl1', Math.abs(a1 - angFree));
      }
      if (userEnteredFieldIds.has('ang2')) {
        const a2 = readFieldValue('ang2');
        if (a2 !== null) set('defl2', Math.abs(a2 - angFree));
      }
    }
  }

  // ── Pass 3: Spring rate k from torque / deflection pairs ──
  const hasM1 = userEnteredFieldIds.has('M1');
  const hasA1 = userEnteredFieldIds.has('defl1') || userEnteredFieldIds.has('ang1');
  const hasM2 = userEnteredFieldIds.has('M2');
  const hasA2 = userEnteredFieldIds.has('defl2') || userEnteredFieldIds.has('ang2');

  if (!userEnteredFieldIds.has('k')) {
    // Two complete torque points → rate from the slope
    if (hasM1 && hasA1 && hasM2 && hasA2) {
      const dTheta = v.defl2 - v.defl1;
      if (Math.abs(dTheta) > 1e-6) {
        const k_impl = (v.M2 - v.M1) / dTheta;
        if (k_impl > 0) set('k', k_impl);
      }
    // A single torque point measured from free → rate directly
    } else if (hasM1 && hasA1 && v.defl1 > 1e-6) {
      set('k', v.M1 / v.defl1);
    } else if (hasM2 && hasA2 && v.defl2 > 1e-6) {
      set('k', v.M2 / v.defl2);
    }
  }

  // ── Pass 4: Deflections implied by the rate ───────────────
  if (v.k > 0) {
    if (hasM1 && !hasA1) set('defl1', v.M1 / v.k);
    if (hasM2 && !hasA2) set('defl2', v.M2 / v.k);
    if (hasA1 && !hasM1) set('M1', v.k * v.defl1);
    if (hasA2 && !hasM2) set('M2', v.k * v.defl2);
  }

  // ── Pass 5: Equivalent active coils from the rate equation ─
  // k = E·d⁴ / (10.8 · 360 · D · Na)  →  Na = E·d⁴ / (3888 · D · k)
  if (!userEnteredFieldIds.has('Na') && v.k > 0 && v.d > 0 && v.D > 0 && E > 0) {
    const Na_calc = (E * Math.pow(v.d, 4)) / (TORSION_RATE_DENOM * v.D * v.k);
    if (Na_calc > 0 && isFinite(Na_calc)) set('Na', Na_calc);
  }

  // ── Pass 6: Body coils ↔ equivalent active coils ──────────
  // Na = Nb + (arm1 + arm2) / (3·π·D)   — straight arms bend too, and
  // contribute the equivalent of this many extra coils to the deflection.
  {
    const armCoils = armEquivalentCoils(v.arm1, v.arm2, v.D);
    if (!userEnteredFieldIds.has('NtFree')) {
      set('NtFree', Math.max(v.Na - armCoils, 0.5));
    }
    if (!userEnteredFieldIds.has('Na')) {
      set('Na', v.NtFree + armCoils);
    }
  }

  // ── Pass 7: Body length ──────────────────────────────────
  if (!userEnteredFieldIds.has('LbFree')) {
    set('LbFree', closeWound ? v.d * (v.NtFree + 1) : v.NtFree * v.pitch);
  }

  // ── Pass 8: Pitch ────────────────────────────────────────
  if (!userEnteredFieldIds.has('pitch')) {
    if (closeWound) {
      set('pitch', v.d);
    } else if (v.NtFree > 0 && v.LbFree > 0) {
      const p_calc = v.LbFree / v.NtFree;
      if (p_calc >= v.d) set('pitch', p_calc);
    }
  }

  // ── Safety clamp: all values must be strictly positive ────
  LM_VARIABLES.forEach(id => {
    if (!(v[id] > 0)) v[id] = LM_DEFAULTS[id] || 1e-3;
  });

  return LM_VARIABLES.map(id => v[id]);
}

function applyVariableVector(x) {
  const has1 = torqueColumnActive(1);
  const has2 = torqueColumnActive(2);

  LM_VARIABLES.forEach((id, i) => {
    if (userEnteredFieldIds.has(id)) return;
    if (!has1 && (id === 'M1' || id === 'defl1')) return;
    if (!has2 && (id === 'M2' || id === 'defl2')) return;

    const val = x[i];
    if (val !== null && isFinite(val) && val > 0) {
      // Spring rate for a torsion spring is a small number (lbf-in/deg)
      // and needs more decimals than the generic 3-place default.
      writeFieldValue(id, val, true, id === 'k' ? 5 : 3);
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

  const cbMap = { cn: 'condPeened', ea: 'equalArms', uw: 'useWahl' };
  Object.entries(cbMap).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el?.checked) p.set(key, '1');
  });

  const bodyCfg = document.querySelector('input[name=bodyConfig]:checked');
  p.set('cfg', bodyCfg?.value ?? 'close');

  const modeSel = document.querySelector('.it.sel');
  if (modeSel?.dataset.mode && modeSel.dataset.mode !== 'power') {
    p.set('mode', modeSel.dataset.mode);
  }

  const mat = document.getElementById('material')?.value;
  if (mat && mat !== 'Loading materials...') p.set('material', mat);

  const grade = document.getElementById('grade')?.value;
  if (grade && grade !== 'Commercial') p.set('grade', grade);

  const hand = document.getElementById('hand')?.value;
  if (hand && !/^Optional/.test(hand)) p.set('hand', hand);

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

  // ── STEP 2: Restore material dropdown & populate E ────────
  // E is a material property — write it from the database unless
  // the user explicitly saved a custom E value in the hash.
  const mat   = p.get('material');
  const matEl = document.getElementById('material');
  if (mat && matEl && loadedRoundMaterialsByName[mat]) {
    matEl.value            = mat;
    selectedMaterialRecord = loadedRoundMaterialsByName[mat];

    const E_db = getEFromRecord(selectedMaterialRecord)
                 || (() => {
                      const g  = getGFromRecord(selectedMaterialRecord);
                      const nu = parseFloat(selectedMaterialRecord['POISSONS RATIO']) || 0.30;
                      return g ? 2 * g * (1 + nu) : null;
                    })();
    const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;

    // Write E only if the hash doesn't contain a user-pinned E value
    if (E_db && !p.has('E')) {
      const eEl = document.getElementById('E');
      if (eEl) {
        eEl.value = Math.round(E_db).toString();
        eEl.classList.remove('user-entered');
        userEnteredFieldIds.delete('E');
      }
    }

    // Apply wire diameter max constraint from material
    const dEl = document.getElementById('d');
    if (dEl) {
      if (maxD !== null) dEl.setAttribute('max', maxD);
      else               dEl.removeAttribute('max');
    }
  }

  // ── STEP 3: Restore grade and coiling direction ───────────
  const gradeEl = document.getElementById('grade');
  if (gradeEl && p.has('grade')) gradeEl.value = p.get('grade');

  const handEl = document.getElementById('hand');
  if (handEl && p.has('hand')) handEl.value = p.get('hand');

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
  // 'equalArms' defaults to checked on a fresh page, so an absent key
  // must not silently clear it unless the hash actually carries state.
  const cbMap = { cn: 'condPeened', ea: 'equalArms', uw: 'useWahl' };
  Object.entries(cbMap).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el) el.checked = p.has(key) ? p.get(key) === '1' : (domId === 'equalArms');
  });

  // ── STEP 7: Restore body configuration radio ──────────────
  const cfgVal = p.get('cfg') ?? 'close';
  document.querySelectorAll('input[name=bodyConfig]').forEach(radio => {
    radio.checked = radio.value === cfgVal;
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

function buildResiduals(x, structural = false) {
  const v = {};
  LM_VARIABLES.forEach((id, i) => { v[id] = x[i]; });

  const closeWound = isCloseWound();
  const equalArms  = isEqualArms();
  const E          = getElasticModulusPsi();
  const r          = [];

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

  // Equivalent active coils — the straight arms deflect in bending too.
  // Na = Nb + (arm1 + arm2) / (3·π·D)   [SMI / Associated Spring]
  {
    const armCoils = armEquivalentCoils(v.arm1, v.arm2, Math.max(v.D, 1e-9));
    r.push(W_HARD * (v.Na - (v.NtFree + armCoils)) / 10.0);
  }

  // Body length at the free angle.
  // Close wound: coils touch, so the body is (Nb + 1) wire diameters.
  // Pitched:     the body is the coil count times the pitch.
  {
    const Lb_calc = closeWound ? v.d * (v.NtFree + 1) : v.NtFree * v.pitch;
    r.push(W_HARD * (v.LbFree - Lb_calc) / 1.0);
  }

  // A close-wound spring has pitch equal to the wire diameter by definition.
  if (closeWound) {
    r.push(W_HARD * (v.pitch - v.d) / 0.1);
  }

  // Equal arm lengths collapse two variables into one. Pushing this as a
  // structural residual also lets the rank analysis count the arms as a
  // single degree of freedom instead of two.
  if (equalArms) {
    r.push(W_HARD * (v.arm1 - v.arm2) / 1.0);
  }

  // ── TIER C: Physics ──────────────────────────────────────

  // Spring rate. A torsion spring loads its wire in BENDING, so the
  // elastic modulus E governs — not the shear modulus G used for
  // compression springs.
  //   k = E·d⁴ / (10.8 · D · Na)   [lbf-in per revolution]
  //   k = E·d⁴ / (3888 · D · Na)   [lbf-in per degree]
  {
    const k_calc = (E * Math.pow(Math.max(v.d, 1e-9), 4))
                 / (TORSION_RATE_DENOM * Math.max(v.D, 1e-9) * Math.max(v.Na, 1e-9));
    // W_HARD, not W_PHYS. This is an exact relationship, as certain as
    // OD = D + d, and when torques are given with the deflections left
    // free it is the ONLY equation fixing k — every other term involving
    // k can be satisfied by moving a deflection instead. At W_PHYS the
    // regularisation and numerical slack pulled k off by up to 2.4%.
    r.push(W_HARD * (v.k - k_calc) / Math.max(v.k, 1e-4));
  }

  // Torque–deflection for each active position:  M = k · θ
  if (torqueColumnActive(1)) {
    r.push(W_PHYS * (v.M1 - v.k * v.defl1) / Math.max(v.M1, 0.01));
  }
  if (torqueColumnActive(2)) {
    r.push(W_PHYS * (v.M2 - v.k * v.defl2) / Math.max(v.M2, 0.01));
  }

  // Absolute arm angles pin deflection relative to the free angle.
  {
    const angFree = readFieldValue('angFree');
    if (angFree !== null) {
      if (userEnteredFieldIds.has('ang1')) {
        const a1 = readFieldValue('ang1');
        if (a1 !== null) r.push(W_USER * (v.defl1 - Math.abs(a1 - angFree)) / 180.0);
      }
      if (userEnteredFieldIds.has('ang2')) {
        const a2 = readFieldValue('ang2');
        if (a2 !== null) r.push(W_USER * (v.defl2 - Math.abs(a2 - angFree)) / 180.0);
      }
    }
  }

  // Support shaft must clear the wound-down coil ID.
  if (userEnteredFieldIds.has('shaft')) {
    const userShaft = readFieldValue('shaft');
    if (userShaft) {
      const deflMax  = Math.max(v.defl1, v.defl2, 0);
      const wound    = windDownGeometry(v.D, v.NtFree, v.d, deflMax);
      const dTol     = readFieldValue('dTol') || computeWireDiameterTolerance(v.d) || 0;
      const dTolCoil = readFieldValue('dTolCoil') || 0;
      const shaft_calc = (wound.ID - dTolCoil) * 0.90;
      r.push(W_PHYS * (shaft_calc - userShaft) / Math.max(userShaft, 0.01));
    }
  }

  // ── TIER C2: One-sided physical penalties ────────────────
  // These rows are ALWAYS pushed (zero when satisfied) so that
  // buildResiduals() returns a constant residual count. The numerical
  // Jacobian assumes a fixed row count across every column perturbation;
  // a conditional push would produce NaN entries at the boundary.
  {
    // Spring index must stay above 1 or the coil ID collapses.
    const cSlack = v.C - 1.0;
    r.push(cSlack <= 0 ? W_HARD * (-cSlack + 1e-3) : 0);

    // Pitch can never be smaller than the wire — coils would interfere.
    const pSlack = v.pitch - v.d;
    r.push(pSlack < 0 ? W_HARD * (-pSlack + 1e-3) / Math.max(v.d, 1e-3) : 0);

    // The spring must not wind down past a closed coil stack.
    const deflMax = Math.max(v.defl1, v.defl2, 0);
    const idWound = windDownGeometry(v.D, v.NtFree, v.d, deflMax).ID;
    r.push(idWound <= 0 ? W_HARD * (-idWound + 1e-3) : 0);
  }

  if (!structural) {
    // ── TIER D: Soft preferred-range nudges ────────────────
    // Excluded from structural residuals so they cannot inflate
    // the Jacobian rank and hide an underdetermined system.
    r.push(W_SOFT * Math.max(0, 4.0  - v.C));
    r.push(W_SOFT * Math.max(0, v.C  - 16.0));
    r.push(W_SOFT * Math.max(0, 1.5  - v.NtFree));
    r.push(W_SOFT * Math.max(0, v.defl1 - v.defl2));

    // Regularisation — same reason: excluded from rank analysis
    LM_VARIABLES.forEach(id => {
      if (!userEnteredFieldIds.has(id)) {
        r.push(0.001 * (v[id] - (LM_DEFAULTS[id] || 1.0)) / (LM_SCALES[id] || 1.0));
      }
    });
  }

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

/**
 * Parameterised variant — evaluates the Jacobian of any
 * residual function, not just buildResiduals().
 * Used by analyzeSystemRank() to Jacobian of structural-only residuals.
 */
function numericalJacobianOf(residualFn, x, r0) {
  const m = r0.length, n = x.length;
  const J = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const eps = 1e-6 * Math.max(Math.abs(x[j]), 1e-3);
    const xp  = [...x];
    xp[j] += eps;
    const r1 = residualFn(xp);
    for (let i = 0; i < m; i++) J[i][j] = (r1[i] - r0[i]) / eps;
  }
  return J;
}


// ============================================================
// JACOBIAN RANK ANALYSIS
// ============================================================
//
// Standard approach used by CAD constraint solvers (SolidWorks,
// CATIA, etc.) to detect underdetermined systems without
// enumerating valid input combinations.
//
// Algorithm:
//   1. Evaluate the Jacobian of structural constraints only
//      (Tier A user pins + Tier B geometry + Tier C physics;
//       Tier D soft nudges and regularisation excluded because
//       they artificially inflate rank at every point).
//   2. Normalise columns so scale differences don't mislead the
//      pivot test.
//   3. Count pivots ≥ relTol via column-pivoted Gaussian
//      elimination — this is the effective rank.
//   4. If rank < n_variables, the system has
//      (n_variables - rank) free degrees of freedom and the
//      solver should not run.
//
// Why not just count user inputs?
//   Entering d, D, OD, ID, C looks like 5 constraints but they
//   satisfy OD=D+d, ID=D-d, C=D/d so only 2 are independent.
//   The Jacobian captures this algebraic redundancy automatically.
// ============================================================

/**
 * Estimate the effective rank of matrix A (m × n) using
 * column-normalised Gaussian elimination with COMPLETE pivoting
 * (full row + column pivoting).
 *
 * Why complete pivoting instead of partial (row-only) pivoting?
 *   With row-only pivoting the algorithm processes columns left-to-right
 *   and may greedily consume the *only* row that contains a later variable.
 *   Example: the free-length equation  Lf = Na·pitch  has entries in both
 *   Na (col 5) and pitch (col 10).  If the Na column is processed first,
 *   partial pivoting picks this row as the Na pivot (it has the larger Na
 *   entry), destroying the sole pitch equation.  When col 10 arrives there
 *   is no row left → max entry = 0 → column skipped → rank falsely low.
 *   Complete pivoting avoids this by always choosing the globally largest
 *   remaining entry, which naturally defers consuming multi-variable rows
 *   until single-variable rows are exhausted.
 *
 * @param {number[][]} A
 * @param {number}     relTol  Threshold for treating a pivot as zero (default 1e-4)
 * @returns {number}
 */
function computeMatrixRank(A, relTol = 1e-4) {
  if (!A.length || !A[0].length) return 0;
  const m = A.length, n = A[0].length;

  // Column-normalise: dividing each column by its Euclidean norm
  // makes the elimination threshold independent of physical units.
  const scale = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) scale[j] += A[i][j] * A[i][j];
    scale[j] = Math.sqrt(scale[j]) || 1;
  }
  // Work on a mutable copy with column-scaled values
  const M = A.map(row => row.map((v, j) => v / scale[j]));

  let rank = 0;
  for (let step = 0; step < Math.min(m, n); step++) {
    // Complete pivoting: scan the entire remaining sub-matrix for
    // the element with the largest absolute value.
    let maxVal = 0, maxRow = step, maxCol = step;
    for (let r = step; r < m; r++) {
      for (let c = step; c < n; c++) {
        const v = Math.abs(M[r][c]);
        if (v > maxVal) { maxVal = v; maxRow = r; maxCol = c; }
      }
    }
    if (maxVal < relTol) break;   // remaining sub-matrix is numerically zero

    // Swap the chosen row to position `step`
    if (maxRow !== step) [M[step], M[maxRow]] = [M[maxRow], M[step]];

    // Swap the chosen column to position `step`
    if (maxCol !== step) {
      for (let r = 0; r < m; r++) {
        const tmp = M[r][step]; M[r][step] = M[r][maxCol]; M[r][maxCol] = tmp;
      }
    }

    // Eliminate all rows below the pivot
    const pivot = M[step][step];
    for (let r = step + 1; r < m; r++) {
      const f = M[r][step] / pivot;
      if (f === 0) continue;
      for (let c = step; c < n; c++) M[r][c] -= f * M[step][c];
    }

    rank++;
  }
  return rank;
}

/**
 * Analyse whether the current set of user-pinned constraints,
 * together with the always-active structural constraints, is
 * sufficient to fully determine the 15-variable system.
 *
 * Returns { rank, nVars, freeDOF, determined }.
 * freeDOF > 0 means the solver should not run.
 *
 * Always logs a compact diagnostic to the browser console so you
 * can open DevTools → Console and see exactly what the rank
 * analyser sees without touching the UI:
 *
 *   [KasperCalc rank] 16r × 15v | rank=15 | freeDOF=0 ✓
 *   Pinned : d=0.031  ID=0.350  F1=2.000  L1=0.650  F2=2.200  L2=0.500  Nt=10
 *   Col norms (post-norm, pre-elim):
 *     d     1.000e+0   ID    1.000e+0   D     9.164e-1  ...
 *   Near-zero cols (norm < 1e-3): [none]
 */
function analyzeSystemRank() {
  // Use the seeded vector (geometry + rate propagated from user inputs) so
  // the Jacobian is evaluated near the solution manifold.  The plain
  // buildVariableVector() leaves D, Na, k at far-off defaults, which
  // collapses the k column norm ~1 000× and fools the rank test.
  const x0    = buildSeededVariableVector();
  const fn    = x => buildResiduals(x, true);   // structural residuals only
  const r0    = fn(x0);
  const J     = numericalJacobianOf(fn, x0, r0);
  const rank  = computeMatrixRank(J);
  const nVars = LM_VARIABLES.length;

  // ── Column norms of the RAW (un-normalised) Jacobian ────────
  // Variables that appear in NO active structural residual produce
  // a near-zero column (norm ≈ 0).  These are truly inactive — not
  // underdetermined — and must be excluded from the freeDOF count.
  //
  // Currently the only conditional structural equations are the
  // load-deflection constraints F1=k(Lf-L1) and F2=k(Lf-L2),
  // which are omitted when their load column carries no user input.
  // This means F1 & L1 (when !hasL1) or F2 & L2 (when !hasL2)
  // will have zero Jacobian columns even in a fully determined system.
  //
  // Using column norms rather than hardcoding variable names makes
  // this logic self-adapting: any future conditionally-constrained
  // variable will be handled automatically.
  const INACTIVE_NORM_THRESHOLD = 1e-3;
  const colNorms = LM_VARIABLES.map((id, j) =>
    Math.sqrt(J.reduce((s, row) => s + row[j] ** 2, 0))
  );
  const inactiveCount = colNorms.filter(n => n < INACTIVE_NORM_THRESHOLD).length;

  // freeDOF = variables that are neither inactive nor rank-constrained
  const freeDOF = Math.max(0, nVars - inactiveCount - rank);

  // ── Console diagnostic (always on — open DevTools to read) ──
  try {
    const m = J.length, n = J[0]?.length ?? 0;

    // Pinned fields and their values
    const pinnedStr = [...userEnteredFieldIds]
      .map(id => {
        const v = readFieldValue(id);
        return v !== null ? `${id}=${v}` : `${id}=?`;
      })
      .join('  ');

    const header = `[KasperCalc rank] ${m}r × ${n}v | rank=${rank} | inactive=${inactiveCount} | freeDOF=${freeDOF} ${freeDOF === 0 ? '✓' : '✗'}`;
    console.group(header);
    console.log('Pinned :', pinnedStr || '(none)');
    console.log('x0     :', LM_VARIABLES.map((id, i) => `${id}=${x0[i].toPrecision(4)}`).join('  '));

    // Column norm table — highlight near-zero and inactive columns
    const normLines = LM_VARIABLES.map((id, j) => {
      const n = colNorms[j];
      const flag = n < INACTIVE_NORM_THRESHOLD ? ' ⚠ INACTIVE (excluded from DOF count)' : '';
      return `  ${id.padEnd(6)} ${n.toExponential(3)}${flag}`;
    });
    console.log('Col norms (raw J):\n' + normLines.join('\n'));

    const inactiveVars = LM_VARIABLES.filter((_, j) => colNorms[j] < INACTIVE_NORM_THRESHOLD);
    if (inactiveVars.length) {
      console.log('Inactive vars (no active structural equation, excluded from DOF count):', inactiveVars.join(', '));
    } else {
      console.log('Inactive vars: [none — all variables appear in structural equations]');
    }

    console.groupEnd();
  } catch (e) {
    console.warn('[KasperCalc rank] diagnostic error:', e);
  }

  return { rank, nVars, inactiveCount, freeDOF, determined: freeDOF === 0 };
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

  const E_db   = getEFromRecord(selectedMaterialRecord)
                 || (() => {
                      const g  = getGFromRecord(selectedMaterialRecord);
                      const nu = parseFloat(selectedMaterialRecord['POISSONS RATIO']) || 0.30;
                      return g ? 2 * g * (1 + nu) : null;
                    })();
  const mts_db = computeMinTensileStrengthPsi(selectedMaterialRecord, readFieldValue('d'));
  const maxD   = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;

  // ── Always overwrite E and mts when material changes ──────
  // A torsion spring bends its wire, so the ELASTIC modulus governs the
  // rate. Most spring databases tabulate the torsion modulus G instead,
  // so fall back to E = 2G(1+ν) when E is absent.
  // E is a material property, not a geometry input: only keep a pinned
  // value when it is physically plausible for this material (±20%).
  if (E_db) {
    const currentE = readFieldValue('E');
    const userHasPinnedE = userEnteredFieldIds.has('E');
    const pinnedValueIsReasonable = currentE && Math.abs(currentE - E_db) / E_db < 0.20;

    if (!userHasPinnedE || !pinnedValueIsReasonable || !currentE) {
      const eEl = document.getElementById('E');
      if (eEl) {
        eEl.value = Math.round(E_db).toString();
        userEnteredFieldIds.delete('E');
        eEl.classList.remove('user-entered');
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
  const sigma_B = 0.78 * mts;           // bending proportional limit
  const kappa   = (1.7 * sigma_B) / (E * d);
  const D_prime = (-1 + Math.sqrt(1 + 4 * kappa * D)) / (2 * kappa);
  return D_prime > 0 ? D_prime : null;
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

// Fatigue life, driven by the stress RANGE rather than the peak.
//
// This distinction matters enormously. SMI Table S-7 quotes a MAXIMUM
// stress for a given life, and those figures implicitly describe a
// released cycle — one that returns to roughly zero stress every time.
// A spring that instead oscillates by a fraction of a percent about a
// high mean is a completely different duty. Judging it on peak stress
// alone condemns designs that will in fact run indefinitely.
//
// Converting the table to an endurance limit at zero mean: a released
// cycle peaking at S has sigma_a = sigma_m = S/2, so Goodman gives
//     (S/2)/S_e + (S/2)/S_ut = 1   ->   S_e = S / (2 - S/S_ut)
// Any other duty is then reduced to its equivalent fully-reversed
// amplitude and compared against those anchors:
//     sigma_ar = sigma_a / (1 - sigma_m/S_ut)
//
//        cycles      not peened    shot peened
//        1e5            53%            62%
//        1e6            50%            60%
//
// These are BENDING allowables and run far higher than the torsional
// values used for compression springs. The table is defined on
// K_B-corrected stress, so the caller must pass corrected values.
//
// Returns null ONLY when the mean stress alone reaches tensile strength —
// that is overload, not fatigue, and no cycle count applies. Everywhere
// else this returns an actual number, including past the 1e5 anchor: a
// design that cycles harder than the tested range still has a real life,
// and hiding that number (as "over allowable") throws away exactly the
// information a designer needs to judge how bad "over" is. Below the
// anchor, the same two-point log-log line is projected downward rather
// than cut off — an extrapolation, not a lookup, and the caller is
// expected to flag it as such when the result is short.
function estimateTorsionCycleLife(sigMin, sigMax, mts, peened) {
  if (!(sigMax > 0) || !(mts > 0)) return null;

  const hi = Math.max(sigMin || 0, sigMax);
  const lo = Math.max(0, Math.min(sigMin || 0, sigMax));
  const sa = (hi - lo) / 2;
  const sm = (hi + lo) / 2;

  if (sm >= mts) return null;        // mean stress alone is at tensile — overload, not fatigue
  if (!(sa > 0)) return Infinity;    // no alternating component at all

  const toSe = S => S / (2 - S / mts);
  const Se1  = toSe((peened ? 0.62 : 0.53) * mts);   // 1e5 cycles
  const Se2  = toSe((peened ? 0.60 : 0.50) * mts);   // 1e6 cycles

  const sar = sa / (1 - sm / mts);

  const b = Math.log10(Se1 / Se2) / Math.log10(1e6 / 1e5);
  if (!(b > 0)) return null;
  return 1e5 * Math.pow(Se1 / sar, 1 / b);
}

// Cycle-life display: always show the actual figure. formatCycleLife()
// collapses anything under 1000 to "<1,000", which is fine for the
// compression side but is exactly the hiding behaviour this function
// exists to avoid — 40 cycles and 900 cycles are both well short of a
// static-feeling design, and the difference matters. Only the very top
// end is still bucketed, since the published S-N data stops at 1e6 and
// a number above that is reporting precision the data doesn't have.
function formatTorsionCycleLife(N) {
  if (N === null || N === undefined || isNaN(N)) return '—';
  if (!isFinite(N) || N > 1e6) return '> 1E06';
  if (N < 1) return '<1';
  return Math.round(N).toLocaleString();
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

// Operating corrected torsional stress — depends only on solved geometry
// (d, D, loads, preset condition), never on material. Shared by the cycle
// life field and the cross-material fatigue comparison table so both stay
// in sync with a single implementation.
// Inner-fibre bending stress RANGE across the operating positions, as
// {min, max}. Fatigue depends on the range, not the peak, so both ends
// are needed — see estimateTorsionCycleLife().
//
// K_B is applied unconditionally. The "Use Wahl Factor" checkbox governs
// what gets DISPLAYED in the results table; the S-N data is defined on
// corrected stress either way, so leaving the correction out here would
// silently change every fatigue number when that box is unticked.
//
// The Set column is excluded: it is a design target, not an operating
// point the spring actually cycles through.
function computeOperatingStressRange(sv) {
  if (!sv) return null;

  const d = sv.d, D = sv.D;
  if (!d || !D) return null;

  const Ki = torsionStressFactorInner(D / d);
  if (!Ki) return null;

  const torques = [];
  if (torqueColumnActive(1) && sv.M1 > 0) torques.push(sv.M1);
  if (torqueColumnActive(2) && sv.M2 > 0) torques.push(sv.M2);
  const m3 = readFieldValue('M3');
  if (m3 && m3 > 0) torques.push(m3);
  if (!torques.length) return null;

  const stresses = torques.map(M => Ki * torsionNominalStress(M, d));
  return { min: Math.min(...stresses), max: Math.max(...stresses) };
}


// ============================================================
// MATERIAL FATIGUE COMPARISON TABLE
// ============================================================
// Ranks every loaded material (database + active custom material) by
// estimated fatigue life at the current wire diameter and operating
// stress. Geometry (sc_operating) is identical across materials — only
// MTS varies — so this is cheap to recompute on every solve.

function toggleFatigueTableExpand() {
  _fatigueTableExpanded = !_fatigueTableExpanded;
  const sv = _lastSolvedState?.sv || null;
  const peened = document.getElementById('condPeened')?.checked ?? false;
  const range = computeOperatingStressRange(sv);
  updateMaterialFatigueTable(range, sv?.d ?? null, peened);
}

function updateMaterialFatigueTable(stressRange, d, peened) {
  const emptyEl   = document.getElementById('fatigueTableEmpty');
  const bodyEl    = document.getElementById('fatigueTableBody');
  const expandBtn = document.getElementById('fatigueExpandBtn');
  if (!bodyEl) return; // section not present on this page

  if (!stressRange || !(stressRange.max > 0) || !d) {
    bodyEl.innerHTML = '';
    bodyEl.style.display = 'none';
    const basisEl = document.getElementById('fatigueBasis');
    if (basisEl) basisEl.style.display = 'none';
    if (emptyEl)   emptyEl.style.display = 'block';
    if (expandBtn) expandBtn.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  bodyEl.style.display = '';

  // State the stress being ranked on, so the figures can be checked
  // against the calculator rather than taken on trust.
  {
    const basisEl = document.getElementById('fatigueBasis');
    if (basisEl) {
      const lo = Math.round(stressRange.min).toLocaleString();
      const hi = Math.round(stressRange.max).toLocaleString();
      basisEl.textContent = (stressRange.max - stressRange.min > 1)
        ? `Ranked on a K\u1D2E-corrected inner-fibre stress cycling ${lo} \u2192 ${hi} psi.`
        : `Ranked on a K\u1D2E-corrected inner-fibre stress of ${hi} psi.`;
      basisEl.style.display = '';
    }
  }

  const currentName = document.getElementById('material')?.value || '';

  const rows = Object.values(loadedRoundMaterialsByName)
    .filter(rec => rec && rec['NAME'])
    .map(rec => {
      const mts  = computeMinTensileStrengthPsi(rec, d);
      // Same estimator the calculator above uses, so a material's row and
      // the Est. Cycle Life chip agree when that material is selected.
      const life = (mts && mts > 0)
        ? estimateTorsionCycleLife(stressRange.min, stressRange.max, mts, peened)
        : null;
      return { name: rec['NAME'], isCustom: !!rec['_custom'], mts, life };
    });

  // Highest fatigue life first; materials with no computable life sink to the bottom.
  rows.sort((a, b) => {
    const la = (a.life === null || isNaN(a.life)) ? -1 : a.life;
    const lb = (b.life === null || isNaN(b.life)) ? -1 : b.life;
    return lb - la;
  });

  const visibleCount = _fatigueTableExpanded ? rows.length : Math.min(FATIGUE_TABLE_COLLAPSED_COUNT, rows.length);

  bodyEl.innerHTML = rows.slice(0, visibleCount).map(r => {
    const isSelected = r.name === currentName;
    const mtsStr  = (r.mts !== null && !isNaN(r.mts)) ? Math.round(r.mts).toLocaleString() + ' psi' : '—';
    // Match the wording of the Est. Cycle Life chip above. A null here
    // means the mean stress alone reaches tensile -- overload, not a
    // fatigue number -- not that the material is unknown, so say so
    // rather than showing a dash. Every other case shows the actual
    // figure, matching the chip: no hiding numbers under 1e5 or 1000.
    const lifeStr = (r.life === null || isNaN(r.life))
      ? (r.mts ? 'Yields' : '—')
      : formatTorsionCycleLife(r.life);
    const lifeCls = (r.life === null || isNaN(r.life) || r.life < 1000)
      ? 'wire-chip unavail' : 'wire-chip';
    return `
      <div class="fatigue-row${isSelected ? ' fatigue-row-selected' : ''}">
        <div class="fatigue-row-name">${escapeHtml(r.name)}${r.isCustom ? ' <span class="fatigue-custom-tag">custom</span>' : ''}</div>
        <div class="fatigue-row-mts">${mtsStr}</div>
        <div class="fatigue-row-life"><span class="${lifeCls}">${lifeStr}</span></div>
      </div>`;
  }).join('');

  if (expandBtn) {
    if (rows.length > FATIGUE_TABLE_COLLAPSED_COUNT) {
      expandBtn.style.display = 'inline-flex';
      expandBtn.textContent = _fatigueTableExpanded ? 'Show fewer' : `Show all ${rows.length} materials`;
    } else {
      expandBtn.style.display = 'none';
    }
  }
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

// Travel field activates the opposite load column when one side is pinned.
// travelEnabledHasL1: travel + L2/F2 pinned → L1 is derivable
// travelEnabledHasL2: travel + L1/F1 pinned → L2 is derivable


// ============================================================
// USER INPUT HANDLER
// ============================================================

function onUserInput(id) {
  // Live-mirror while the box is ticked, so arm 2 tracks arm 1 as it is
  // typed rather than only after the value is committed.
  if (id === 'arm1' && isEqualArms()) {
    const a2 = document.getElementById('arm2');
    if (a2) a2.value = document.getElementById('arm1').value;
  }
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
// Wahl (1963) and Stahl (1974) — correct C₁/C₂ form
//
//   λ      = α·Lf / D                              [effective slenderness]
//   C₁     = E / [2·(E − G)]
//   C₂     = 2π²·(E − G) / (2G + E)
//   δ_cr   = C₁·Lf · [1 − √(1 − C₂/λ²)]          [critical deflection, in]
//   L_cr   = Lf − δ_cr                             [length at onset, in]
//   F_cr   = k · δ_cr                              [load at onset, lb]
//
// For steel (E ≈ 30 Mpsi, G ≈ 11.5 Mpsi, ν ≈ 0.3): C₁ ≈ 0.812, C₂ ≈ 6.87
//
// Stability boundary: λ < √C₂  →  Lf/D < √C₂/α  →  unconditionally stable
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
// Critical slenderness for steel (√C₂ ≈ 2.62):
//   Fixed–Fixed:    Lf/D > 2.62/0.5   = 5.24  → can buckle
//   Fixed–Hinged:   Lf/D > 2.62/0.707 = 3.71  → can buckle
//   Hinged–Hinged:  Lf/D > 2.62/1.0   = 2.62  → can buckle
//   Fixed–Free:     Lf/D > 2.62/2.0   = 1.31  → can buckle
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

/**
 * getBucklingEffectiveLengthFactor()
 * Shim that returns just the α value (or null).
 * Used by buildResiduals() — keeps the LM solver interface unchanged.
 */

/**
 * computeWahlStahlBuckling(Lf, D, k, alpha, E, G)
 * Applies the correct Wahl/Stahl C₁–C₂ stability equation.
 *
 * @param {number} Lf    Free length (in)
 * @param {number} D     Mean coil diameter (in)
 * @param {number} k     Spring rate (lb/in)
 * @param {number} alpha Effective-length factor for end condition
 * @param {number} E     Young's modulus (psi) — defaults to 30e6 (steel)
 * @param {number} G     Shear modulus (psi)   — defaults to 11.5e6 (steel)
 *
 * @returns {{
 *   stable:       boolean,      — true = spring cannot buckle at any deflection
 *   lambda:       number,       — effective slenderness λ = α·Lf/D
 *   C1:           number,       — E / [2·(E−G)]
 *   C2:           number,       — 2π²·(E−G) / (2G+E)
 *   delta_cr:     number|null,  — critical deflection (in)
 *   L_cr:         number|null,  — length at onset of buckling (in)
 *   F_cr:         number|null,  — load at onset of buckling (lb)
 *   Lf_D_ratio:   number,       — actual slenderness ratio Lf/D
 *   critical_LfD: number,       — critical Lf/D threshold = √C₂/α
 *   margin_pct:   number,       — (Lf_D / critical_LfD) × 100
 * } | null}
 */

// ============================================================
// TORSION SPRING PHYSICS HELPERS
// ============================================================
//
// A helical torsion spring loads its wire in BENDING, not torsion.
// Every formula below follows from that, and differs from the
// compression-spring equivalents accordingly:
//
//   • the elastic modulus E governs the rate, not the shear modulus G
//   • stress is a bending stress 32M/πd³, not a shear stress 8FD/πd³
//   • the Wahl correction splits into separate inner / outer fibre
//     factors, because a curved beam in bending is not symmetric
//   • the coil body winds DOWN as it deflects: diameter shrinks and
//     coil count rises
//
// Sources: SMI Handbook of Spring Design; Associated Spring / Barnes
// Design Handbook; Shigley, Mechanical Engineering Design, ch. 10.

// SMI rate constant. Pure-bending theory gives 32/π = 10.186; the
// industry-standard 10.8 adds the empirical allowance for friction
// between adjacent coils and between the arms and their supports.
const TORSION_RATE_CONST = 10.8;
const TORSION_RATE_DENOM = TORSION_RATE_CONST * 360;  // 3888 → rate per degree

function isCloseWound() {
  const pitched = document.getElementById('cfgPitched')?.checked ?? false;
  return !pitched;
}

// When the arms are declared equal they stop being two independent
// variables and become one. That has to reach the SOLVER, not just the
// display — otherwise the rate is computed from one arm2 and a different
// arm2 is shown.
function isEqualArms() {
  return document.getElementById('equalArms')?.checked ?? false;
}

// Equal Arm Lengths makes arm 1 the master: arm 2 takes its value and
// becomes a derived, read-only field. Run this whenever the checkbox is
// toggled and after every solve, so the DOM never shows two different
// arm lengths while the box is ticked.
function syncEqualArms() {
  const a1 = document.getElementById('arm1');
  const a2 = document.getElementById('arm2');
  if (!a1 || !a2) return;

  if (!isEqualArms()) {
    // Hand arm 2 back to the user, keeping whatever value it holds.
    a2.readOnly = false;
    a2.classList.remove('computed');
    return;
  }

  // If arm 1 is empty but arm 2 carries a value, promote it rather than
  // throwing away the only number the user actually typed.
  if (!a1.value.trim() && a2.value.trim()) {
    a1.value = a2.value;
    userEnteredFieldIds.add('arm1');
    a1.classList.add('user-entered');
  }

  a2.value = a1.value;
  userEnteredFieldIds.delete('arm2');
  a2.classList.remove('user-entered');
  a2.classList.add('computed');
  a2.readOnly = true;
}

function getElasticModulusPsi() {
  const fromField = readFieldValue('E');
  if (fromField && fromField > 0) return fromField;
  const fromRec = getEFromRecord(selectedMaterialRecord);
  if (fromRec) return fromRec;
  // Fall back to E = 2G(1+ν) when only the torsion modulus is tabulated.
  const G  = getGFromRecord(selectedMaterialRecord) || 11.5e6;
  const nu = parseFloat(selectedMaterialRecord?.['POISSONS RATIO']) || 0.30;
  return 2 * G * (1 + nu);
}

function getMaterialDensity() {
  return parseFloat(selectedMaterialRecord?.['DENSITY (LB/IN^3)']) || 0.284;
}

// Straight arms bend under load too. Their compliance is expressed as
// an equivalent number of extra coils added to the body count.
function armEquivalentCoils(arm1, arm2, D) {
  if (!(D > 0)) return 0;
  return ((arm1 || 0) + (arm2 || 0)) / (3 * Math.PI * D);
}

// Inner-fibre stress correction for a curved beam in bending.
//
//   K_BID = (4C - 1) / (4C - 4)
//
// This is the published design factor (SMI S-35 / S-36). Wahl's exact
// curved-beam solution is (4C² - C - 1) / (4C(C - 1)), which runs about
// 0.4% lower at C = 9; the simpler form above is what spring design
// tables and reference software are built on, so it is what is used here.
function torsionStressFactorInner(C) {
  if (!(C > 1)) return null;
  return (4 * C - 1) / (4 * C - 4);
}

// Outer-fibre stress correction (SMI S-37). Always smaller than the
// inner factor, which is why torsion springs crack from the inside.
//
//   K_BOD = (4C + 1) / (4C + 4)
function torsionStressFactorOuter(C) {
  if (!(C > 1)) return null;
  return (4 * C + 1) / (4 * C + 4);
}

// Nominal bending stress at the wire surface.
function torsionNominalStress(M, d) {
  if (!(d > 0)) return null;
  return (32 * M) / (Math.PI * Math.pow(d, 3));
}

// As a torsion spring deflects in the winding direction the body
// tightens: coil count rises, mean diameter and ID shrink, and the
// body lengthens. Wire length is conserved: D·N stays constant.
function windDownGeometry(D, Nb, d, deflDeg) {
  const NbPrime = Nb + (deflDeg || 0) / 360;
  const Dprime  = (NbPrime > 0) ? (D * Nb / NbPrime) : D;
  return {
    N:  NbPrime,
    D:  Dprime,
    ID: Dprime - d,
    OD: Dprime + d,
    Lb: d * (NbPrime + 1),
  };
}

function torsionWireLength(D, Nb, arm1, arm2, pitch) {
  // The body wire runs along a helix, so one coil is slightly longer than
  // its flat circumference once the pitch is accounted for. On a close
  // wound spring the pitch equals the wire diameter, so the correction is
  // small but real.
  const perCoil = (pitch > 0)
    ? Math.sqrt(Math.pow(Math.PI * D, 2) + pitch * pitch)
    : Math.PI * D;
  return perCoil * Nb + (arm1 || 0) + (arm2 || 0);
}

function torsionWireWeight(d, wireLength, density) {
  return (Math.PI / 4) * d * d * wireLength * density;
}

// Torsional natural frequency of a helical torsion spring:
//
//   one end fixed     n = ( d / (8 π D² N) ) · √(E g / ρ)
//   both ends fixed   n = ( d / (4 π D² N) ) · √(E g / ρ)
//
// Both-ends-fixed is exactly twice the one-end value. For steel the
// radical collapses to the familiar tabulated constants:
//   √(30e6 · 386.1 / 0.284) / 8π = 8035  (published as 8040)
//   √(30e6 · 386.1 / 0.284) / 4π = 16071 (published as 16080)
//
// COIL COUNT: N is the ACTIVE coil count, arms included — as the
// published equations are written. Validated against three reference
// cases, in which the arm contribution varies from negligible to large:
//
//   case              arm share   body coils   active coils   reference
//   d=.100 arms 0.75      4.0%        233.4        224.1          233
//   d=.030 arms 0.50      1.7%         96.9         95.2           95
//   d=.020 arms 10.0     34.4%        100.4         65.9           66
//
// The third case decides it: a 52% gap cannot be a rounding artefact.
// The first two barely discriminate — with the arms contributing only a
// few percent the two coil counts are nearly the same number, which is
// why the first case appeared to favour body coils.
function torsionNaturalFrequency(d, D, Na, E, density, bothEnds) {
  if (!(d > 0) || !(D > 0) || !(Na > 0) || !(E > 0) || !(density > 0)) return null;
  const g      = 386.1;                            // in/s²
  const root   = Math.sqrt(E * g / density);       // in/s
  const factor = bothEnds ? 4 : 8;
  return d / (factor * Math.PI * D * D * Na) * root;
}

// Some input sets are impossible in a way the solver cannot express,
// because every variable it carries is clamped positive. The clearest
// case: ask for a rate so stiff that the arms alone are more compliant
// than the whole spring, and the body coil count has to go negative.
//
// Catching that analytically — before the solver runs — is the
// difference between naming the actual problem and reporting a vague
// "underdefined" or, as some packages do, an exponentiation error.
//
// Returns a plain-English explanation, or null when nothing is wrong.
function diagnoseImpossibleGeometry() {
  const k = readFieldValue('k');
  const d = readFieldValue('d');
  const E = getElasticModulusPsi();
  if (!(k > 0) || !(d > 0) || !(E > 0)) return null;
  if (!userEnteredFieldIds.has('k') || !userEnteredFieldIds.has('d')) return null;

  // Mean diameter has to be recoverable from whichever diameter is pinned.
  let D = userEnteredFieldIds.has('D') ? readFieldValue('D') : null;
  if (!(D > 0)) {
    const ID = readFieldValue('ID'), OD = readFieldValue('OD'), C = readFieldValue('C');
    if      (userEnteredFieldIds.has('ID') && ID > 0) D = ID + d;
    else if (userEnteredFieldIds.has('OD') && OD > 0) D = OD - d;
    else if (userEnteredFieldIds.has('C')  && C  > 0) D = C * d;
  }
  if (!(D > 0)) return null;

  const a1 = readFieldValue('arm1') || 0;
  const a2 = isEqualArms() ? a1 : (readFieldValue('arm2') || 0);
  const armCoils = armEquivalentCoils(a1, a2, D);
  if (!(armCoils > 0)) return null;

  const NaReq = (E * Math.pow(d, 4)) / (TORSION_RATE_DENOM * D * k);
  const Nb    = NaReq - armCoils;
  if (Nb > 0) return null;

  // Zero body coils is the stiffest this wire, coil and arm combination
  // can physically reach.
  const kMax = (E * Math.pow(d, 4)) / (TORSION_RATE_DENOM * D * armCoils);

  return (
    `Impossible geometry — a rate of ${k} lbf-in/deg needs only ` +
    `${NaReq.toFixed(4)} equivalent active coils, but the arms already ` +
    `contribute ${armCoils.toFixed(4)} on their own. That leaves ` +
    `${Nb.toFixed(4)} body coils, and a spring cannot have fewer than none.\n` +
    `With this wire and coil diameter the stiffest achievable rate is about ` +
    `${kMax.toFixed(4)} lbf-in/deg. Raise the wire diameter (rate goes as d⁴, ` +
    `so it is much the strongest lever), reduce the coil diameter, or shorten the arms.`
  );
}

// A torque column participates in the solve when the user has pinned
// any of its cells, in either torque or angle form.
function torqueColumnActive(n) {
  return userEnteredFieldIds.has('M' + n) ||
         userEnteredFieldIds.has('defl' + n) ||
         userEnteredFieldIds.has('ang' + n);
}

function calculateWahlStressCorrectionFactor(C) {
  return torsionStressFactorInner(C);
}

function calculateWahlStressCorrectionFactorK2(C) {
  return torsionStressFactorOuter(C);
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
  std:   ['d', 'OD', 'M1', 'defl1', 'M2', 'defl2', 'arm1', 'arm2'],
  dim:   ['d', 'OD', 'NtFree', 'arm1', 'arm2'],
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
  'd', 'D', 'OD', 'ID', 'C',
  'Na', 'NtFree',
  'k', 'E',
  'pitch', 'LbFree',
  'arm1', 'arm2',
  'M1', 'M2', 'defl1', 'defl2', 'ang1', 'ang2',
  'shaft',
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

  runPreSolveOutputs();

  // ── Gate 0: Analytic impossibility ────────────────────────
  // Runs ahead of the rank test: the system here is fully determined,
  // so the rank test would pass it through to a solver that cannot
  // represent the answer. Name the real problem instead.
  {
    const impossible = diagnoseImpossibleGeometry();
    if (impossible) {
      const dot  = document.getElementById('bottomStatusDot');
      const text = document.getElementById('bottomStatusSummary');
      if (dot)  dot.className    = 'status-dot err';
      if (text) text.textContent = impossible;
      _lastSolvedState = null;
      blankAllComputedOutputs();
      updateAllCharts(null);
      return;
    }
  }

  // ── Gate 1: Rank analysis — detects underdetermined systems ─
  // Uses the Jacobian rank of the structural constraints only
  // (Tiers A+B+C). This naturally handles algebraically redundant
  // inputs — entering d, D, OD, ID and C looks like five inputs but
  // the Jacobian reveals only two are independent, because
  // OD = D+d, ID = D-d and C = D/d.
  if (userEnteredFieldIds.size === 0) {
    updateStatusUnderdefined(0, LM_VARIABLES.length);
    return;
  }
  {
    const rankInfo = analyzeSystemRank();
    if (!rankInfo.determined) {
      const dot  = document.getElementById('bottomStatusDot');
      const text = document.getElementById('bottomStatusSummary');
      if (dot)  dot.className    = 'status-dot';
      const plural = rankInfo.freeDOF !== 1;
      if (text) text.textContent =
        `Underdefined — ${rankInfo.freeDOF} free degree${plural ? 's' : ''} of freedom remaining.\n` +
        `Add ${rankInfo.freeDOF} more independent constraint${plural ? 's' : ''}. ` +
        `Suggested: ${getSuggestedNextInputs().join(', ')}`;
      _lastSolvedState = null;
      blankAllComputedOutputs();
      updateAllCharts(null);
      return;
    }
  }

  // ── Pre-solve: contradictory torque positions ─────────────
  // Two fully pinned positions imply a rate k = ΔM / Δθ. A negative
  // result means the spring would resist LESS the further it is wound,
  // which no helical torsion spring does.
  if (userEnteredFieldIds.has('M1') && userEnteredFieldIds.has('defl1') &&
      userEnteredFieldIds.has('M2') && userEnteredFieldIds.has('defl2')) {
    const M1v = readFieldValue('M1'), a1v = readFieldValue('defl1');
    const M2v = readFieldValue('M2'), a2v = readFieldValue('defl2');
    if (M1v !== null && a1v !== null && M2v !== null && a2v !== null) {
      const dTheta = a2v - a1v;
      if (Math.abs(dTheta) > 1e-6) {
        const k_implied = (M2v - M1v) / dTheta;
        if (k_implied <= 0) {
          const dot  = document.getElementById('bottomStatusDot');
          const text = document.getElementById('bottomStatusSummary');
          if (dot) dot.className = 'status-dot err';
          if (text) text.textContent =
            `Contradictory torque positions — winding from ${a1v.toFixed(1)}° to ` +
            `${a2v.toFixed(1)}° must increase the torque, but it goes from ` +
            `${M1v.toFixed(3)} to ${M2v.toFixed(3)} lbf-in. ` +
            `Swap the two positions, or raise the torque at the larger angle.`;
          _lastSolvedState = null;
          blankAllComputedOutputs();
          updateAllCharts(null);
          return;
        }
      }
    }
  }

  // ── Solve ─────────────────────────────────────────────────
  // Use the seeded vector so the solver starts near the solution
  // manifold instead of at far-off defaults.
  const x0 = buildSeededVariableVector();

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

  // ── Gate 2: Physical validity of the solution ─────────────
  const validity = isSolutionPhysicallyValid(sv);
  if (!validity.valid) {
    const dot  = document.getElementById('bottomStatusDot');
    const text = document.getElementById('bottomStatusSummary');
    if (dot)  dot.className    = 'status-dot err';
    if (text) text.textContent = validity.reasons.length === 1
      ? validity.reasons[0]
      : validity.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
    _lastSolvedState = null;
    blankAllComputedOutputs();
    updateAllCharts(null);
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
  // Geometry — includes all LM solver outputs that are never user-pinned
  'D', 'OD', 'ID', 'C', 'Na', 'NtFree', 'pitch', 'LbFree',
  'wl', 'sw', 'fn1', 'fn2', 'minIDwound', 'maxOD', 'shaft',
  // Spring rate
  'k',
  // Minimum-cycle torque column
  'M1', 'defl1', 'ang1', 'betw1', 'Fa1_1', 'Fa2_1', 'si1', 'so1', 'pMTS1',
  'Nt1', 'Lb1', 'minID_1',
  // Maximum-cycle torque column
  'M2', 'defl2', 'ang2', 'betw2', 'Fa1_2', 'Fa2_2', 'si2', 'so2', 'pMTS2',
  'Nt2', 'Lb2', 'minID_2',
  // Other-torque column
  'M3', 'defl3', 'ang3', 'betw3', 'Fa1_3', 'Fa2_3', 'si3', 'so3', 'pMTS3',
  'Nt3', 'Lb3', 'minID_3',
  // Set column
  'Mset', 'deflSet', 'angSet', 'betwSet', 'Fa1_set', 'Fa2_set',
  'siSet', 'soSet', 'NtSet', 'LbSet', 'minID_set',
  // Free column
  'minID_free',
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

  // Cycle life chips
  ['cycleLife', 'cycleLife_mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.className = 'prop-output'; }
  });

  // Material fatigue comparison table — no spring solved
  updateMaterialFatigueTable(null, null, false);
}

// Retained as no-ops: torsion springs have no column-buckling mode.
function setBuckleNoBuckle() { /* not applicable to torsion springs */ }

function clearBuckleOutputs() { /* not applicable to torsion springs */ }

function updateStatusUnderdefined(have, need) {
  const dot  = document.getElementById('bottomStatusDot');
  const text = document.getElementById('bottomStatusSummary');
  if (dot)  dot.className    = 'status-dot';
  if (text) text.textContent =
    `Underdefined — enter ${need - have} more independent value(s) to solve.\n` +
    `Suggested: ${getSuggestedNextInputs().join(', ')}`;

  // Always clear computed outputs when the system is underdefined.
  // Leaving stale values from a prior solve is confusing — the user
  // expects the outputs to go blank when they remove an input.
  _lastSolvedState = null;
  blankAllComputedOutputs();
  updateAllCharts(null);
}

function getSuggestedNextInputs() {
  const suggestions = [];
  const has = id => userEnteredFieldIds.has(id);
  if (!has('d'))                              suggestions.push('Wire diameter (d)');
  if (!has('D') && !has('OD') && !has('ID'))  suggestions.push('Coil diameter (OD, D, or ID)');
  if (!has('Na') && !has('NtFree'))           suggestions.push('Coil count (Active or Total)');
  if (!has('arm1') && !has('arm2'))           suggestions.push('Moment arm length');
  if (!has('k'))                              suggestions.push('Spring rate (lbf-in/deg)');
  if (!has('M1') && !has('M2'))               suggestions.push('A torque (Min or Max cycle)');
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

  // Largest standard wire size the selected material is drawn in.
  // Readout removed by request — the markup in SpringTorsionRound.html is
  // commented out to match. Restore both together if it is ever wanted.
  // {
  //   const maxRec = parseFloat(selectedMaterialRecord?.['MAX DIAMETER/WIDTH (in)']) || null;
  //   const maxStd = maxRec
  //     ? STANDARD_WIRE_DIAMETERS_IN.filter(s => s <= maxRec + 1e-9).pop()
  //     : STANDARD_WIRE_DIAMETERS_IN[STANDARD_WIRE_DIAMETERS_IN.length - 1];
  //   setDualOutput('wMaxStd', maxStd ? maxStd.toFixed(4) : '—');
  // }

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

  // Every computed write goes through this guard. writeFieldValue()
  // with isComputed=true deletes the id from userEnteredFieldIds, so
  // writing a solved value back into a field the user typed would
  // silently unpin it — and the next run would then blank the column.
  const out = (id, val, isComputed = true, dec = 3) => {
    if (userEnteredFieldIds.has(id)) return;
    writeFieldValue(id, val, isComputed, dec);
  };


  const peened     = document.getElementById('condPeened')?.checked ?? false;
  const equalArms  = document.getElementById('equalArms')?.checked ?? false;
  const useWahl    = document.getElementById('useWahl')?.checked ?? false;
  const closeWound = isCloseWound();

  // ── Unpack the solved state ──────────────────────────────
  const d   = sv.d,   D  = sv.D,   ID = sv.ID;
  const C   = sv.C,   Na = sv.Na,  Nb = sv.NtFree;
  const k   = sv.k,   Lb = sv.LbFree;
  let   arm1 = sv.arm1, arm2 = sv.arm2;

  const E       = getElasticModulusPsi();
  const density = getMaterialDensity();
  // Prefer the RAW computed strength over the field value. The field is
  // written rounded to whole psi for display, and letting that rounding
  // back into the maths made the cycle-life chip disagree with the
  // material comparison table, which computes its own unrounded figure.
  const mts     = userEnteredFieldIds.has('mts')
                  ? readFieldValue('mts')
                  : (computeMinTensileStrengthPsi(selectedMaterialRecord, d)
                     || readFieldValue('mts')
                     || null);

  // ── Equal arm lengths ────────────────────────────────────
  // Arm 1 is the master. The solver has already been told the two are
  // equal (see buildResiduals), so this just keeps the DOM in step.
  if (equalArms) {
    arm2 = arm1;
    syncEqualArms();
  }

  // ── Stress correction factors ────────────────────────────
  // Torsion springs fail from the INSIDE of the coil, because the
  // inner-fibre factor is always the larger of the two.
  const Ki   = torsionStressFactorInner(C);
  const Ko   = torsionStressFactorOuter(C);
  const kIn  = useWahl && Ki ? Ki : 1;
  const kOut = useWahl && Ko ? Ko : 1;

  // ── Wire length and weight ───────────────────────────────
  const wireLen = torsionWireLength(D, Nb, arm1, arm2, sv.pitch);
  out('wl', wireLen, true, 3);
  out('sw', torsionWireWeight(d, wireLen, density), true, 5);

  // ── Natural frequencies ──────────────────────────────────
  {
    const f1 = torsionNaturalFrequency(d, D, Na, E, density, false);
    const f2 = torsionNaturalFrequency(d, D, Na, E, density, true);
    if (f1) out('fn1', f1, true, 1);
    if (f2) out('fn2', f2, true, 1);
  }

  // ── Tolerances ───────────────────────────────────────────
  const dTol     = readFieldValue('dTol') || computeWireDiameterTolerance(d) || 0;
  const dTolCoil = readFieldValue('dTolCoil') || 0;

  // ── Free-position arm angles ─────────────────────────────
  // The two conventions are measured from opposite datums in opposite
  // directions: the moving arm angle sweeps counter-clockwise from the
  // 3 o'clock position, while the angle between arms sweeps clockwise
  // from the fixed arm at 9 o'clock. They are therefore one physical
  // fact expressed two ways:
  //
  //     beta = (180 - alpha) mod 360
  //
  // The mapping is its own inverse, so a single expression converts in
  // both directions. Whichever the user pins, the other is derived —
  // they cannot be set independently.
  const mirrorAngle = a => (((180 - a) % 360) + 360) % 360;

  let angFree  = readFieldValue('angFree');
  let betwFree = readFieldValue('betwFree');
  {
    const angPinned  = userEnteredFieldIds.has('angFree');
    const betwPinned = userEnteredFieldIds.has('betwFree');

    if (angPinned && !betwPinned && angFree !== null) {
      betwFree = mirrorAngle(angFree);
      out('betwFree', betwFree, true, 2);
    } else if (betwPinned && !angPinned && betwFree !== null) {
      angFree = mirrorAngle(betwFree);
      out('angFree', angFree, true, 2);
    } else if (!angPinned && !betwPinned && Nb > 0) {
      // Neither datum given: the free position is not arbitrary, it falls
      // out of the winding. Each quarter turn of wire swings the moving
      // arm through 90°, so the fractional part of the body coil count
      // fixes the free angle outright.
      angFree  = (((Nb % 1) + 1) % 1) * 360;
      betwFree = mirrorAngle(angFree);
      out('angFree',  angFree,  true, 4);
      out('betwFree', betwFree, true, 4);
    } else if (angPinned && betwPinned && angFree !== null && betwFree !== null) {
      const expected = mirrorAngle(angFree);
      const gap      = (((betwFree - expected) % 360) + 360) % 360;
      const apart    = Math.min(gap, 360 - gap);
      if (apart > 0.05) {
        warnings.push(
          `Free arm angle of ${angFree.toFixed(1)}° puts ${expected.toFixed(1)}° ` +
          `between the arms, but ${betwFree.toFixed(1)}° is entered. The two are ` +
          `measured from opposite datums and cannot be set independently — ` +
          `clear one and it will be derived from the other.`
        );
      }
    }
  }

  // ── Free-position outputs ────────────────────────────────
  out('minID_free', ID - dTolCoil, true, 4);
  out('maxOD', D + d + dTolCoil, true, 4);

  // ── Resolve every torque column ──────────────────────────
  // Columns 1 and 2 come from the solver. Column 3 is deterministic
  // from a user torque or angle. The Set column is driven backwards
  // from a target % of minimum tensile strength.
  const columns = [
    { n: '1',   label: 'minimum cycle torque' },
    { n: '2',   label: 'maximum cycle torque' },
    { n: '3',   label: 'other torque'         },
    { n: 'set', label: 'set'                  },
  ];

  const nominalToM = sigma => (sigma * Math.PI * Math.pow(d, 3)) / (32 * kIn);

  // Peak K_B-corrected inner-fibre stress across the operating positions.
  // The Set column is a design target rather than an operating point, so
  // it is excluded from the fatigue assessment.
  let peakCorrectedStress = 0;
  let minCorrectedStress = Infinity;

  columns.forEach(col => {
    const n   = col.n;
    const sfx = n === 'set' ? 'Set' : n;

    const idM     = n === 'set' ? 'Mset'    : 'M' + n;
    const idDefl  = n === 'set' ? 'deflSet' : 'defl' + n;
    const idAng   = n === 'set' ? 'angSet'  : 'ang' + n;
    const idBetw  = n === 'set' ? 'betwSet' : 'betw' + n;
    const idFa1   = 'Fa1_' + n;
    const idFa2   = 'Fa2_' + n;
    const idSi    = n === 'set' ? 'siSet'   : 'si' + n;
    const idSo    = n === 'set' ? 'soSet'   : 'so' + n;
    const idPmts  = n === 'set' ? 'pMTSset' : 'pMTS' + n;
    const idNt    = n === 'set' ? 'NtSet'   : 'Nt' + n;
    const idLb    = n === 'set' ? 'LbSet'   : 'Lb' + n;
    const idMinID = 'minID_' + n;

    // ── Establish this column's torque ─────────────────────
    let M = null;

    if (n === '1' || n === '2') {
      if (torqueColumnActive(n === '1' ? 1 : 2)) {
        M = n === '1' ? sv.M1 : sv.M2;
      }
    } else if (n === '3') {
      if (userEnteredFieldIds.has('M3')) {
        M = readFieldValue('M3');
      } else if (userEnteredFieldIds.has('defl3')) {
        M = k * readFieldValue('defl3');
      } else if (userEnteredFieldIds.has('ang3') && angFree !== null) {
        M = k * Math.abs(readFieldValue('ang3') - angFree);
      }
    } else {
      // Set column: the user specifies a target % of MTS and the
      // calculator reports the torque that produces it.
      if (userEnteredFieldIds.has('Mset')) {
        M = readFieldValue('Mset');
      } else {
        const pctTarget = readFieldValue('pMTSset');
        if (pctTarget && mts) M = nominalToM((pctTarget / 100) * mts);
      }
    }

    // ── Blank the column when it carries no torque ─────────
    if (M === null || !isFinite(M) || M <= 0) {
      [idM, idDefl, idAng, idBetw, idFa1, idFa2, idSi, idSo,
       idNt, idLb, idMinID].forEach(id => {
        if (userEnteredFieldIds.has(id)) return;
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('warn', 'err', 'ok'); }
      });
      if (n !== 'set' && !userEnteredFieldIds.has(idPmts)) {
        const el = document.getElementById(idPmts);
        if (el) { el.value = ''; el.classList.remove('warn', 'err', 'ok'); }
      }
      return;
    }

    // ── Deflection and angles ──────────────────────────────
    const defl = M / k;
    out(idM,    M,    true, 4);
    out(idDefl, defl, true, 2);

    // Winding the spring drives the moving arm further round and closes
    // the gap between the two arms. Once the moving arm passes its
    // partner the gap reads as a large positive angle rather than a
    // negative one — that is how the part gets dimensioned on a drawing.
    const wrap360 = a => ((a % 360) + 360) % 360;
    if (angFree  !== null) out(idAng,  wrap360(angFree + defl),  true, 2);
    if (betwFree !== null) out(idBetw, wrap360(betwFree - defl), true, 2);

    // ── Contact forces on the arms ─────────────────────────
    if (arm1 > 0) out(idFa1, M / arm1, true, 4);
    if (arm2 > 0) out(idFa2, M / arm2, true, 4);

    // ── Bending stress, inner and outer fibre ──────────────
    const sNom = torsionNominalStress(M, d);
    const sID  = sNom * kIn;
    const sOD  = sNom * kOut;

    if (n !== 'set') {
      const corrected = sNom * (Ki || 1);
      if (corrected > peakCorrectedStress) peakCorrectedStress = corrected;
      if (corrected < minCorrectedStress) minCorrectedStress = corrected;
    }
    out(idSi, sID, true, 0);
    out(idSo, sOD, true, 0);

    if (mts) {
      const pct = sID / mts * 100;
      // The Set column's % is a user input — never overwrite it.
      if (n !== 'set') out(idPmts, pct, true, 2);

      // Table S-6, static bending allowables as a percentage of tensile.
      // Patented and cold-drawn wire is good for 80% stress-relieved and
      // 100% where forming has left favourable residual stress; past
      // 100% the wire is simply yielding.
      //
      // Fatigue is deliberately NOT judged here. It depends on the stress
      // RANGE, not the peak, and is handled by the cycle-life estimate
      // below — warning on peak stress alone flagged designs that cycle
      // by a fraction of a percent and will never fail.
      const warnPct = 80;
      const errPct  = 100;
      const el = document.getElementById(idPmts);
      if (el && n !== 'set') {
        el.classList.remove('warn', 'err', 'ok');
        if      (pct > errPct)  el.classList.add('err');
        else if (pct > warnPct) el.classList.add('warn');
        else                    el.classList.add('ok');
      }
      // The Set column is a design TARGET the user dialled in, not an
      // operating condition, so it never raises a warning of its own.
      if (n !== 'set') {
        const pctCorr = sNom * (Ki || 1) / mts * 100;
        if (pctCorr > errPct) {
          warnings.push(
            `Stress at ${col.label} reaches ${pctCorr.toFixed(0)}% of tensile ` +
            `(K\u1D2E corrected) — the wire yields above 100%`
          );
        } else if (pctCorr > warnPct) {
          warnings.push(
            `Stress at ${col.label} is ${pctCorr.toFixed(0)}% of tensile ` +
            `(K\u1D2E corrected) — above the ${warnPct}% static allowable for ` +
            `stress-relieved patented and cold-drawn wire`
          );
        }
      }
    }

    // ── Wind-down geometry at this position ────────────────
    const wound = windDownGeometry(D, Nb, d, defl);
    out(idNt,    wound.N,  true, 3);
    out(idLb,    closeWound ? wound.Lb : Nb * sv.pitch, true, 4);
    out(idMinID, wound.ID - dTolCoil, true, 4);
  });

  // ── Estimated cycle life ─────────────────────────────────
  {
    const chipLabel = (txt, cls) => setDualOutput('cycleLife', txt, cls || 'prop-output');
    if (!(peakCorrectedStress > 0) || !mts) {
      chipLabel('—');
    } else {
      const sMin = isFinite(minCorrectedStress) ? minCorrectedStress : peakCorrectedStress;
      const pct  = peakCorrectedStress / mts * 100;
      const life = estimateTorsionCycleLife(sMin, peakCorrectedStress, mts, peened);
      if (life === null) {
        // Mean stress alone reaches tensile -- overload, not a fatigue
        // number, so no cycle count applies.
        chipLabel('Yields', 'prop-output unavail');
        warnings.push(
          `Mean stress reaches tensile strength (peak ${pct.toFixed(0)}% of ` +
          `tensile, K\u1D2E corrected) — this is overload, not a fatigue ` +
          `condition. Reduce stress before treating this as a cyclic design.`
        );
      } else {
        // Always shown as an actual number -- the anchor at 1e5 marks where
        // the published data ends, not where the number stops mattering.
        chipLabel(formatTorsionCycleLife(life));
        if (life < 1e5) {
          warnings.push(
            `Estimated fatigue life is about ${formatTorsionCycleLife(life)} cycles — ` +
            `extrapolated below the 10\u2075 anchor of the published data, so treat it ` +
            `as an order-of-magnitude guide rather than a firm number.`
          );
        }
        // Carried as a tooltip rather than a status warning: it applies to
        // every estimate, so raising it as a warning would flag otherwise
        // clean designs and train the user to ignore the status line.
        ['cycleLife', 'cycleLife_mobile'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.title =
            'Reference only. Interpolated from two tabulated S-N points, and ' +
            'extrapolated beyond them when the duty falls outside that range. ' +
            'An order-of-magnitude guide, not a prediction — confirm cyclic ' +
            'designs with your spring maker.';
        });
      }
    }
  }
  // ── Maximum wound-down ID across all active positions ────
  {
    let deflMax = 0;
    ['defl1', 'defl2', 'defl3', 'deflSet'].forEach(id => {
      const val = readFieldValue(id);
      if (val && val > deflMax) deflMax = val;
    });
    const wound = windDownGeometry(D, Nb, d, deflMax);

    // The panel field is the FREE-state minimum, pairing with Maximum
    // Coil OD directly above it — both are plain tolerance stack-ups on
    // the free geometry. The wound-down minimum at each torque position
    // is reported per column in the table below, where it belongs.
    out('minIDwound', ID - dTolCoil, true, 4);

    // Support shaft must stay clear of the tightest wound-down ID.
    const shaftUser = readFieldValue('shaft');
    if (!userEnteredFieldIds.has('shaft')) {
      out('shaft', (wound.ID - dTolCoil) * 0.90, true, 4);
    } else if (shaftUser && shaftUser >= wound.ID - dTolCoil) {
      errors.push(
        `Support shaft (${shaftUser.toFixed(3)}") is larger than the coil ID at ` +
        `${deflMax.toFixed(0)}° deflection (${(wound.ID - dTolCoil).toFixed(3)}") — ` +
        `the spring will clamp onto the shaft`
      );
    }

    // Body length check against the user's allowance.
    const LbAllow = readFieldValue('LbAllowable');
    const LbAtMax = closeWound ? wound.Lb : Nb * sv.pitch;
    if (LbAllow && LbAtMax > LbAllow) {
      warnings.push(
        `Body length at maximum deflection (${LbAtMax.toFixed(3)}") exceeds the ` +
        `allowable body length (${LbAllow.toFixed(3)}")`
      );
    }
  }

  // ── Spring index guidance ────────────────────────────────
  if (C < 4) {
    warnings.push(
      `Spring index ${C.toFixed(2)} is below 4 — hard to coil, and the ` +
      `inner-fibre stress correction climbs steeply below this point`
    );
  } else if (C > 15) {
    warnings.push(
      `Spring index ${C.toFixed(2)} is above 15 — coil diameter becomes ` +
      `unstable to hold, and the springs tangle in handling`
    );
  }

  // ── Arm compliance share ─────────────────────────────────
  // The one-third-of-arm-length rule is an approximation. It is a good
  // one while the body dominates, and progressively less trustworthy as
  // the arms take over. Worth saying out loud when the arms are doing
  // most of the bending, because the rate is then only as good as that
  // approximation.
  {
    const armCoils = armEquivalentCoils(arm1, arm2, D);
    const share    = (Na > 0) ? armCoils / Na : 0;
    if (share > 0.25) {
      warnings.push(
        `Moment arms supply ${(share * 100).toFixed(0)}% of the total compliance ` +
        `(${armCoils.toFixed(2)} of ${Na.toFixed(2)} equivalent coils). The rate is ` +
        `governed more by arm bending than by the coil body, where the one-third-arm ` +
        `approximation is least reliable — confirm against a sample before committing.`
      );
    }
  }

  // ── Material diameter range ──────────────────────────────
  if (selectedMaterialRecord && d) {
    const minD = parseFloat(selectedMaterialRecord['MIN DIAMETER/WIDTH (in)']) || null;
    const maxD = parseFloat(selectedMaterialRecord['MAX DIAMETER/WIDTH (in)']) || null;
    if (minD && d < minD)
      errors.push(`Wire diameter ${d.toFixed(4)}" is below the minimum of ${minD}" for ${selectedMaterialRecord.NAME}`);
    if (maxD && d > maxD)
      errors.push(`Wire diameter ${d.toFixed(4)}" exceeds the maximum of ${maxD}" for ${selectedMaterialRecord.NAME}`);
  }

  if (!result.converged) {
    const pinnedCount = countEffectiveConstraints();
    warnings.push(
      pinnedCount > 7
        ? `Solver did not converge — the system may be over-constrained or ` +
          `contain contradictory inputs (${pinnedCount} fields pinned). ` +
          `Try clearing some inputs.`
        : `Solver did not fully converge (err=${result.err.toFixed(4)}, ` +
          `${result.iter} iters) — check for conflicting inputs`
    );
  }

  // ── Material fatigue comparison table ────────────────────
  {
    // Reuse the values already tracked for the cycle-life chip, so the
    // chip and this table can never disagree.
    const lo = isFinite(minCorrectedStress) ? minCorrectedStress : peakCorrectedStress;
    updateMaterialFatigueTable(
      peakCorrectedStress > 0 ? { min: lo, max: peakCorrectedStress } : null,
      d, peened);
  }

  // ── Status bar — always last ─────────────────────────────
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
    if (dot)  dot.className    = 'status-dot ok';
    if (text) text.textContent = [
      `k = ${k.toFixed(5)} lbf-in/deg`,
      `C = ${C.toFixed(3)}`,
      `Ki = ${Ki ? Ki.toFixed(3) : '—'}`,
      `Ko = ${Ko ? Ko.toFixed(3) : '—'}`,
      `Nb = ${Nb.toFixed(2)}`,
      `Na = ${Na.toFixed(2)}`,
      `[LM: ${result.iter} iters]`,
    ].filter(Boolean).join('  |  ');
  } else {
    if (dot)  dot.className    = 'status-dot';
    if (text) text.textContent = 'Enter spring parameters to begin';
  }

  applyGradeTolerances();

  // ── Charts ───────────────────────────────────────────────
  // springTorsionCharts.js still plots the compression quantities it was
  // cloned with. Feeding it torsion data would draw confidently wrong
  // curves, so the canvases stay blank until the chart module is
  // reworked for torque-vs-angle.
  updateAllCharts(null);
}

// ── Grade tolerance helper (no side effects, no runCalc) ──────
function applyGradeTolerances() {
  const grade  = document.getElementById('grade')?.value;
  const isPrec = grade === 'Precision';

  const coilTol = document.getElementById('dTolCoil');
  const loadTol = document.getElementById('loadTol');

  if (coilTol && !userEnteredFieldIds.has('dTolCoil')) {
    coilTol.value = isPrec ? '0.005' : '0.010';
  }
  if (loadTol && !userEnteredFieldIds.has('loadTol')) {
    // Commercial torque tolerance runs about ±10%, precision about ±5%.
    const k = readFieldValue('k');
    const M = readFieldValue('M2') || readFieldValue('M1');
    if (M) loadTol.value = (M * (isPrec ? 0.05 : 0.10)).toFixed(4);
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
    // Strip every state class, not just user-entered — a stale computed
    // class would otherwise style a field the user later types into.
    el.classList.remove('user-entered', 'computed', 'warn', 'err', 'ok');
  });
  document.querySelectorAll('span.prop-output').forEach(el => el.textContent = '—');
  userEnteredFieldIds.clear();

  ['condPeened', 'useWahl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const eq = document.getElementById('equalArms');
  if (eq) eq.checked = true;

  const defaultCfg = document.getElementById('cfgCloseWound');
  if (defaultCfg) defaultCfg.checked = true;

  // ── Restore field defaults shown on a fresh page ──────────
  const addFeed = document.getElementById('addFeed');
  if (addFeed) addFeed.value = '0.0000';
  const pMTSset = document.getElementById('pMTSset');
  if (pMTSset) pMTSset.value = '80.0';

  const coilTol = document.getElementById('dTolCoil');
  if (coilTol) coilTol.value = '';

  setDualOutput('wireAvailabilityChip', 'Enter wire diameter to check', 'wire-chip');
  setDualOutput('cycleLife', '—');

  _lastSolvedState = null;
  updateMaterialFatigueTable(null, null, false);

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

// ============================================================
// FIELD MAP — single source of truth for JSON key ↔ DOM id
// ============================================================
//
// Export and import both read this map, so a renamed field can never
// round-trip incorrectly: whatever the exporter writes, the importer
// reads back through the same table.

function torsionFieldMap() {
  const map = {
    // ── Spring properties ──────────────────────────────────
    WireDiameter:             'd',
    WireDiameterTolerance:    'dTol',
    WireLength:               'wl',
    WireWeight:               'sw',
    MinTensileStrength:       'mts',
    SpringRate:               'k',
    SpringIndex:              'C',
    NaturalFrequencyOneEnd:   'fn1',
    NaturalFrequencyBothEnds: 'fn2',
    ElasticModulusE:          'E',

    // ── Coil dimensions & moment arms ──────────────────────
    CoilInsideDiameter:       'ID',
    CoilMeanDiameter:         'D',
    CoilOutsideDiameter:      'OD',
    CoilDiameterTolerance:    'dTolCoil',
    MinimumCoilID:            'minIDwound',
    MaximumCoilOD:            'maxOD',
    MomentArm1Length:         'arm1',
    MomentArm2Length:         'arm2',

    // ── Coil count & geometry ──────────────────────────────
    ActiveCoils:              'Na',
    CoilPitch:                'pitch',
    AdditionalFeed:           'addFeed',
    AllowableBodyLength:      'LbAllowable',
    SupportShaftDiameter:     'shaft',
    LoadTolerance:            'loadTol',

    // ── Free position ──────────────────────────────────────
    FreeMovingArmAngle:       'angFree',
    FreeAngleBetweenArms:     'betwFree',
    FreeTotalCoils:           'NtFree',
    FreeBodyLength:           'LbFree',
    FreeMinCoilID:            'minID_free',

    // ── Custom material modal ──────────────────────────────
    CustomMaterialName:            'cm_name',
    CustomMaterialSpecification:   'cm_spec',
    CustomMaterialComment:         'cm_comment',
    CustomMaterialDensity:         'cm_density',
    CustomMaterialBendingModulus:  'cm_E',
    CustomMaterialTorsionModulus:  'cm_G',
    CustomMaterialPoissonsRatio:   'cm_nu',
    CustomMaterialAllowablePctMTS: 'cm_allowTensile',
    CustomMaterialPctTensileToSet: 'cm_tensileSet',
    CustomMaterialMinDiameter:     'cm_minD',
    CustomMaterialMaxDiameter:     'cm_maxD',
    CustomMaterialUSF:             'cm_usf',
    CustomMaterialP0:              'cm_p0',
    CustomMaterialP1:              'cm_p1',
    CustomMaterialP2:              'cm_p2',
    CustomMaterialP3:              'cm_p3',
    CustomMaterialP4:              'cm_p4',
  };

  // ── Torque columns ───────────────────────────────────────
  // Four columns share eleven identical rows. Generated in a loop so the
  // key names stay locked to the table instead of drifting apart.
  const COLUMNS = [
    ['MinCycleTorque', '1'],
    ['MaxCycleTorque', '2'],
    ['OtherTorque',    '3'],
    ['Set',            'set'],
  ];

  COLUMNS.forEach(([suffix, n]) => {
    const s = (n === 'set');
    const rows = {
      TorsionalMoment:  s ? 'Mset'    : 'M'    + n,
      Deflection:       s ? 'deflSet' : 'defl' + n,
      MovingArmAngle:   s ? 'angSet'  : 'ang'  + n,
      AngleBetweenArms: s ? 'betwSet' : 'betw' + n,
      ContactForceArm1: 'Fa1_' + n,
      ContactForceArm2: 'Fa2_' + n,
      IDStress:         s ? 'siSet'   : 'si'   + n,
      ODStress:         s ? 'soSet'   : 'so'   + n,
      PctMinTensile:    s ? 'pMTSset' : 'pMTS' + n,
      TotalCoils:       s ? 'NtSet'   : 'Nt'   + n,
      BodyLength:       s ? 'LbSet'   : 'Lb'   + n,
      MinCoilID:        'minID_' + n,
    };
    Object.entries(rows).forEach(([row, domId]) => {
      map[row + 'At' + suffix] = domId;
    });
  });

  return map;
}

// Checkbox and radio state, shared by export and import for the same
// reason as the field map above.
const TORSION_EXPORT_CHECKBOXES = ['condPeened', 'equalArms', 'useWahl'];

function gatherAllFieldValuesForExport() {
  const read = id => {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : null;
  };

  const snap = {
    _meta: { exported: new Date().toISOString(), tool: 'Torsion Spring Calculator (LM)' },
    _userEnteredIds: [...userEnteredFieldIds],

    // ── Configuration ──────────────────────────────────────
    material:   read('material'),
    hand:       read('hand'),
    grade:      read('grade'),
    bodyConfig: document.querySelector('input[name=bodyConfig]:checked')?.value ?? 'close',
    inputMode:  document.querySelector('.it.sel')?.dataset.mode ?? 'power',
  };

  TORSION_EXPORT_CHECKBOXES.forEach(id => {
    snap[id] = document.getElementById(id)?.checked ?? false;
  });

  snap.CustomMaterialEquationType =
    document.getElementById('cm_eqType')?.value ?? null;

  Object.entries(torsionFieldMap()).forEach(([key, domId]) => {
    snap[key] = read(domId);
  });

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

      // ── Restore equation type FIRST so the P fields exist ──
      if (cfg.CustomMaterialEquationType) {
        const el = document.getElementById('cm_eqType');
        if (el) {
          el.value = cfg.CustomMaterialEquationType;
          cmUpdateEquation();
        }
      }

      // ── Restore named fields through the shared map ────
      Object.entries(torsionFieldMap()).forEach(([key, domId]) => {
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
      TORSION_EXPORT_CHECKBOXES.forEach(id => {
        const el = document.getElementById(id);
        if (el && cfg[id] !== undefined) el.checked = cfg[id];
      });

      // ── Restore body configuration radio ───────────────
      {
        const val = cfg.bodyConfig ?? 'close';
        const r = document.querySelector(`input[name=bodyConfig][value="${val}"]`);
        if (r) r.checked = true;
      }

      // ── Restore input mode selector ────────────────────
      {
        const mode = cfg.inputMode ?? 'power';
        document.querySelectorAll('.it').forEach(label => {
          const matches = label.dataset.mode === mode;
          label.classList.toggle('sel', matches);
          const radio = label.querySelector('input[type=radio]');
          if (radio) radio.checked = matches;
        });
        applyInputModeHighlights();
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

      // The material handler overwrites E from the database, so only
      // call it when the import did not carry a pinned E of its own.
      if (!userEnteredFieldIds.has('E')) {
        selectedMaterialRecord =
          loadedRoundMaterialsByName[document.getElementById('material')?.value] || null;
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
      // Angular datums are measured FROM the free position, so zero is a
      // real, meaningful value there — unlike a diameter or a load.
      const zeroOk = ANGLE_DATUM_FIELDS.has(el.id);
      if (!isNaN(v) && (v > 0 || (zeroOk && v === 0))) {
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

  // Coiling direction affects no calculation, but it is part of the part
  // definition, so a change still has to reach the shareable URL.
  {
    const handEl = document.getElementById('hand');
    if (handEl) handEl.addEventListener('change', () => saveStateToHash());
  }

  // Body configuration radios — close wound vs pitched changes the
  // body-length identity, so the geometry has to be re-solved.
  document.querySelectorAll('input[type=radio][name=bodyConfig]').forEach(el => {
    el.addEventListener('change', () => {
      saveStateToHash();
      runCalc();
    });
  });

  // Checkboxes — split by which need a full solve
  document.querySelectorAll('input[type=checkbox]').forEach(el => {
    el.addEventListener('change', () => {
      // Mirror arm 1 into arm 2 BEFORE anything re-solves, so the solver
      // and the hash both see the updated pinned set.
      if (el.id === 'equalArms') syncEqualArms();
      saveStateToHash();
      // Peening and the Wahl toggle only affect reported stress, not
      // the solved geometry — re-run the output pass alone.
      if (el.id === 'condPeened' || el.id === 'useWahl') {
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

  syncEqualArms();
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
  'k', 'Na', 'NtFree', 'M1', 'M2', 'defl1', 'defl2', 'ang1', 'ang2'
]);

const GEOMETRY_FIELDS = new Set([
  'd', 'D', 'OD', 'ID', 'C', 'LbFree', 'pitch', 'arm1', 'arm2', 'shaft'
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

  // Spring index must exceed 1 or the coil ID is zero / negative
  if (sv.C < 1) {
    reasons.push(
      `Spring index (${sv.C.toFixed(3)}) is less than 1 — geometry is impossible`
    );
  }

  // Body coils must be at least half a turn to form a spring
  if (sv.NtFree < 0.5) {
    reasons.push(
      `Body coils (${sv.NtFree.toFixed(3)}) is less than 0.5 — spring cannot function`
    );
  }

  // Pitch can never be tighter than the wire itself
  if (sv.pitch < sv.d - 1e-6) {
    reasons.push(
      `Pitch (${sv.pitch.toFixed(3)}") is less than wire diameter ` +
      `(${sv.d.toFixed(3)}") — coils would interfere`
    );
  }

  // Wind-down must not close the coil onto itself
  {
    const deflMax = Math.max(sv.defl1 || 0, sv.defl2 || 0);
    const wound   = windDownGeometry(sv.D, sv.NtFree, sv.d, deflMax);
    if (wound.ID <= 0) {
      reasons.push(
        `At ${deflMax.toFixed(0)}° deflection the coil winds down to a ` +
        `negative inside diameter — reduce deflection or increase coil diameter`
      );
    }
  }

  // Wire diameter must be positive
  if (sv.d <= 0) {
    reasons.push('Wire diameter is zero or negative — invalid geometry');
  }

  // Rate must be positive
  if (!(sv.k > 0)) {
    reasons.push('Spring rate solved to zero or negative — check inputs');
  }

  return { valid: reasons.length === 0, reasons };
}