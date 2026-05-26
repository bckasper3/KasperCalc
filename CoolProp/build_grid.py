import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = "Water"

# ── fluid limits ─────────────────────────────────────────────────────────────
def get_limits(fluid):
    is_incomp = fluid.startswith('INCOMP::')
    backend   = 'INCOMP' if is_incomp else 'HEOS'
    fname     = fluid.replace('INCOMP::', '').split('[')[0]

    Tmin = PropsSI('Tmin', '', 0, '', 0, fluid)
    Tmax = PropsSI('Tmax', '', 0, '', 0, fluid)
    AS   = CoolProp.AbstractState(backend, fname)
    Pmax = AS.pmax()

    Tcrit = Pcrit = Ptriple = None
    if not is_incomp:
        try:
            Tcrit   = PropsSI('Tcrit',   '', 0, '', 0, fluid)
            Pcrit   = PropsSI('Pcrit',   '', 0, '', 0, fluid)
            Ttriple = PropsSI('Ttriple', '', 0, '', 0, fluid)
            Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, fluid)
        except Exception:
            pass

    return Tmin, Tmax, Tcrit, Pmax, Pcrit, Ptriple

Tmin, Tmax, Tcrit, Pmax, Pcrit, Ptriple = get_limits(FLUID)

# ── pressure axis ─────────────────────────────────────────────────────────────
P_low = Ptriple if Ptriple is not None else 101325.0

P_main  = np.logspace(np.log10(P_low), np.log10(Pmax), 200)

if Pcrit is not None:
    P_lo = max(Pcrit * 0.80, P_low)
    P_hi = min(Pcrit * 1.20, Pmax)
    P_crit_band = np.linspace(P_lo, P_hi, 50)
    P_axis = np.unique(np.concatenate([P_main, P_crit_band, [101325.0]]))
else:
    P_axis = np.unique(np.concatenate([P_main, [101325.0]]))

# ── temperature axis ──────────────────────────────────────────────────────────
T_main = np.linspace(Tmin, Tmax, 500)

if Tcrit is not None:
    T_lo = max(Tcrit * 0.80, Tmin)
    T_hi = min(Tcrit * 1.20, Tmax)
    T_crit_band = np.linspace(T_lo, T_hi, 50)
    T_axis = np.unique(np.concatenate([T_main, T_crit_band]))
else:
    T_axis = np.unique(T_main)

# ── report ────────────────────────────────────────────────────────────────────
n_P   = len(P_axis)
n_T   = len(T_axis)
total = n_P * n_T

print(f"Fluid: {FLUID}")
print(f"  P range : {P_low:.4g} Pa  to  {Pmax:.4g} Pa")
print(f"  T range : {Tmin:.4g} K   to  {Tmax:.4g} K")
if Pcrit:
    print(f"  Pcrit   : {Pcrit:.4g} Pa  (band {Pcrit*0.80:.4g} – {Pcrit*1.20:.4g} Pa)")
if Tcrit:
    print(f"  Tcrit   : {Tcrit:.4g} K   (band {Tcrit*0.80:.4g} – {Tcrit*1.20:.4g} K)")
print(f"\n  Pressure points    : {n_P}")
print(f"  Temperature points : {n_T}")
print(f"  Total grid points  : {total:,}")
