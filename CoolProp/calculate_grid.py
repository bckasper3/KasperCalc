import math
import numpy as np
import CoolProp

FLUID = "Water"

# ── CoolProp phase integer -> user flag ───────────────────────────────────────
PHASE_MAP = {
    CoolProp.iphase_liquid:              0,
    CoolProp.iphase_gas:                 1,
    CoolProp.iphase_supercritical:       1,
    CoolProp.iphase_critical_point:      1,
    CoolProp.iphase_twophase:            2,
    CoolProp.iphase_supercritical_liquid: 3,
    CoolProp.iphase_supercritical_gas:   4,
    CoolProp.iphase_unknown:             255,
    CoolProp.iphase_not_imposed:         255,
}

# ── parse fluid name for AbstractState ───────────────────────────────────────
def parse_fluid(fluid):
    """Return (backend, fname, mass_fraction_or_None)."""
    if fluid.startswith('INCOMP::'):
        inner = fluid[8:]
        if '[' in inner:
            fname, rest = inner.split('[', 1)
            frac = float(rest.rstrip(']'))
        else:
            fname, frac = inner, None
        return 'INCOMP', fname, frac
    return 'HEOS', fluid, None

backend, fname, frac = parse_fluid(FLUID)

# ── fluid limits ──────────────────────────────────────────────────────────────
from CoolProp.CoolProp import PropsSI

AS_meta = CoolProp.AbstractState(backend, fname)
if frac is not None:
    AS_meta.set_mass_fractions([frac])

Tmin = PropsSI('Tmin', '', 0, '', 0, FLUID)
Tmax = PropsSI('Tmax', '', 0, '', 0, FLUID)
Pmax = AS_meta.pmax()

Tcrit = Pcrit = Ptriple = None
if backend == 'HEOS':
    try:
        Tcrit   = PropsSI('Tcrit',   '', 0, '', 0, FLUID)
        Pcrit   = PropsSI('Pcrit',   '', 0, '', 0, FLUID)
        Ttriple = PropsSI('Ttriple', '', 0, '', 0, FLUID)
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, FLUID)
    except Exception:
        pass

# ── build axes (same logic as Task 8) ────────────────────────────────────────
P_low  = Ptriple if Ptriple is not None else 101325.0
P_main = np.logspace(math.log10(P_low), math.log10(Pmax), 200)
if Pcrit is not None:
    P_band = np.linspace(max(Pcrit * 0.80, P_low), min(Pcrit * 1.20, Pmax), 50)
    P_axis = np.unique(np.concatenate([P_main, P_band, [101325.0]]))
else:
    P_axis = np.unique(np.concatenate([P_main, [101325.0]]))

T_main = np.linspace(Tmin, Tmax, 500)
if Tcrit is not None:
    T_band = np.linspace(max(Tcrit * 0.80, Tmin), min(Tcrit * 1.20, Tmax), 50)
    T_axis = np.unique(np.concatenate([T_main, T_band]))
else:
    T_axis = np.unique(T_main)

n_P, n_T = len(P_axis), len(T_axis)
total    = n_P * n_T
print(f"Fluid: {FLUID}  |  grid: {n_T} T x {n_P} P = {total:,} points")

# ── property extractor ────────────────────────────────────────────────────────
PROPS = ['rho', 'cp', 'cv', 'h', 's', 'u', 'visc', 'cond', 'prandtl']

def extract(AS):
    """Pull all properties from a primed AbstractState. Returns dict."""
    getters = {
        'rho':     AS.rhomass,
        'cp':      AS.cpmass,
        'cv':      AS.cvmass,
        'h':       AS.hmass,
        's':       AS.smass,
        'u':       AS.umass,
        'visc':    AS.viscosity,
        'cond':    AS.conductivity,
        'prandtl': AS.Prandtl,
    }
    result = {}
    for key, fn in getters.items():
        try:
            result[key] = fn()
        except Exception:
            result[key] = float('nan')
    return result

# ── main loop ─────────────────────────────────────────────────────────────────
AS = CoolProp.AbstractState(backend, fname)
if frac is not None:
    AS.set_mass_fractions([frac])

# Separate AbstractState for two-phase re-evaluation (avoids state contamination)
if backend == 'HEOS':
    AS_sat = CoolProp.AbstractState('HEOS', fname)

PT_INPUTS = CoolProp.PT_INPUTS
QT_INPUTS = CoolProp.QT_INPUTS

rows       = []
n_ok       = 0
n_twophase = 0
n_fail     = 0

for T in T_axis:
    for P in P_axis:
        row = {'T': T, 'P': P}

        try:
            AS.update(PT_INPUTS, P, T)
            cp_phase  = AS.phase()
            user_flag = PHASE_MAP.get(cp_phase, 255)
            row['phase'] = user_flag

            if user_flag == 2:
                # Two-phase: store NaN for bulk, evaluate sat liquid and vapor
                row.update({k: float('nan') for k in PROPS})
                n_twophase += 1

                liq_props = vap_props = {}
                try:
                    AS_sat.update(QT_INPUTS, 0.0, T)
                    liq_props = extract(AS_sat)
                except Exception:
                    liq_props = {k: float('nan') for k in PROPS}

                try:
                    AS_sat.update(QT_INPUTS, 1.0, T)
                    vap_props = extract(AS_sat)
                except Exception:
                    vap_props = {k: float('nan') for k in PROPS}

                row['liq'] = liq_props
                row['vap'] = vap_props

            else:
                row.update(extract(AS))
                n_ok += 1

        except Exception as e:
            row['phase'] = 255
            row.update({k: float('nan') for k in PROPS})
            row['error'] = str(e)
            n_fail += 1

        rows.append(row)

# ── summary ───────────────────────────────────────────────────────────────────
print(f"  Normal points  : {n_ok:,}")
print(f"  Two-phase pts  : {n_twophase:,}")
print(f"  Failed pts     : {n_fail:,}")
print(f"  Total stored   : {len(rows):,}")

# ── preview first 3 non-failed rows ───────────────────────────────────────────
print("\nSample rows (first 3 non-failed, non-two-phase):")
shown = 0
for r in rows:
    if r.get('phase', 255) not in (2, 255):
        print(f"  T={r['T']:.4g} K  P={r['P']:.4g} Pa  phase={r['phase']}"
              f"  rho={r['rho']:.5g}  cp={r['cp']:.5g}  visc={r['visc']:.4g}")
        shown += 1
        if shown == 3:
            break
