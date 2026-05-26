import math
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = "Water"

BAND_SIZE = 20   # pressure points per band

# ── fluid limits (same as Task 8) ────────────────────────────────────────────
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

# ── build pressure axis (same as Task 8) ─────────────────────────────────────
P_low  = Ptriple if Ptriple is not None else 101325.0
P_main = np.logspace(math.log10(P_low), math.log10(Pmax), 200)

if Pcrit is not None:
    P_band = np.linspace(max(Pcrit * 0.80, P_low), min(Pcrit * 1.20, Pmax), 50)
    P_axis = np.unique(np.concatenate([P_main, P_band, [101325.0]]))
else:
    P_axis = np.unique(np.concatenate([P_main, [101325.0]]))

# ── divide into bands ─────────────────────────────────────────────────────────
bands = []
for i, start in enumerate(range(0, len(P_axis), BAND_SIZE)):
    chunk = P_axis[start : start + BAND_SIZE]
    bands.append({
        'band_index': i,
        'p_min':      float(chunk[0]),
        'p_max':      float(chunk[-1]),
        'n_points':   len(chunk),
    })

# ── print ─────────────────────────────────────────────────────────────────────
print(f"Fluid    : {FLUID}")
print(f"P axis   : {len(P_axis)} points  ({P_low:.4g} Pa to {Pmax:.4g} Pa)")
print(f"Band size: {BAND_SIZE} points/band")
print(f"Bands    : {len(bands)}\n")

print(f"  {'Idx':>4}  {'P_min (Pa)':>16}  {'P_max (Pa)':>16}  {'N':>4}")
print(f"  {'-'*4}  {'-'*16}  {'-'*16}  {'-'*4}")
for b in bands:
    print(f"  {b['band_index']:>4}  {b['p_min']:>16.6g}  {b['p_max']:>16.6g}  {b['n_points']:>4}")

print(f"\nTotal pressure points covered: {sum(b['n_points'] for b in bands)}")
