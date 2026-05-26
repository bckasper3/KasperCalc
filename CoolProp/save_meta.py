import json
import math
import re
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID     = "Water"
BAND_SIZE = 20
SAT_POINTS = 500

# ── parse fluid ───────────────────────────────────────────────────────────────
def parse_fluid(fluid):
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

# ── paths ─────────────────────────────────────────────────────────────────────
version   = CoolProp.__version__
root      = f"coolprop_data_v{version}"
safe_name = re.sub(r'[:\[\].]', '_', FLUID)

json_path = f"{root}/json/{safe_name}/meta.json"
bin_path  = f"{root}/bin/{safe_name}/meta.bin"

# ── fluid limits ──────────────────────────────────────────────────────────────
AS_meta = CoolProp.AbstractState(backend, fname)
if frac is not None:
    AS_meta.set_mass_fractions([frac])

Tmin = PropsSI('Tmin', '', 0, '', 0, FLUID)
Tmax = PropsSI('Tmax', '', 0, '', 0, FLUID)
Pmax = AS_meta.pmax()

Tcrit = Pcrit = rhocrit = Ttriple = Ptriple = None
if backend == 'HEOS':
    try:
        Tcrit   = PropsSI('Tcrit',   '', 0, '', 0, FLUID)
        Pcrit   = PropsSI('Pcrit',   '', 0, '', 0, FLUID)
        rhocrit = PropsSI('rhocrit', '', 0, '', 0, FLUID)
    except Exception:
        pass
    try:
        Ttriple = PropsSI('Ttriple', '', 0, '', 0, FLUID)
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, FLUID)
    except Exception:
        pass

# ── build pressure axis ───────────────────────────────────────────────────────
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

n_T = len(T_axis)
n_P = len(P_axis)

# ── pressure bands ────────────────────────────────────────────────────────────
def band_filename(idx, p_min, p_max, ext):
    return f"grid_band_{idx:03d}_{int(round(p_min))}Pa_{int(round(p_max))}Pa.{ext}"

bands_meta = []
for i, start in enumerate(range(0, len(P_axis), BAND_SIZE)):
    chunk  = P_axis[start : start + BAND_SIZE]
    p_min  = float(chunk[0])
    p_max  = float(chunk[-1])
    n_pts  = len(chunk)
    bands_meta.append({
        'band_index':    i,
        'p_min':         p_min,
        'p_max':         p_max,
        'n_pressure_pts': n_pts,
        'json_file':     band_filename(i, p_min, p_max, 'json'),
        'bin_file':      band_filename(i, p_min, p_max, 'bin'),
    })

# ── saturation curve count ────────────────────────────────────────────────────
sat_points = SAT_POINTS if Ptriple is not None else 0

# ── assemble meta dict ────────────────────────────────────────────────────────
meta = {
    'fluid':           FLUID,
    'coolprop_version': version,
    'units': {
        'temperature':  'Kelvin',
        'pressure':     'Pascals',
        'density':      'kg/m3',
        'cp':           'J/kg/K',
        'cv':           'J/kg/K',
        'enthalpy':     'J/kg',
        'entropy':      'J/kg/K',
        'internal_energy': 'J/kg',
        'viscosity':    'Pa*s',
        'conductivity': 'W/m/K',
        'prandtl':      'dimensionless',
        'float_precision': 'Float32 for all grid and saturation data',
    },
    'critical_point': {
        'T_K':    Tcrit,
        'P_Pa':   Pcrit,
        'rho_kg_m3': rhocrit,
    } if Tcrit is not None else None,
    'triple_point': {
        'T_K':  Ttriple,
        'P_Pa': Ptriple,
    } if Ptriple is not None else None,
    'valid_range': {
        'T_min_K':  Tmin,
        'T_max_K':  Tmax,
        'P_max_Pa': Pmax,
    },
    'phase_flags': {
        '0':   'Liquid',
        '1':   'Gas / Supercritical',
        '2':   'Two-phase',
        '3':   'Supercritical liquid',
        '4':   'Supercritical gas',
        '255': 'Failed / invalid',
    },
    'grid': {
        'n_temperature_points': n_T,
        'n_pressure_points':    n_P,
        'total_grid_points':    n_T * n_P,
        'pressure_bands':       bands_meta,
    },
    'saturation_curve': {
        'n_points': sat_points,
        'file_json': 'saturation.json' if sat_points > 0 else None,
        'file_bin':  'saturation.bin'  if sat_points > 0 else None,
    },
    'mass_fraction': frac,
}

# ── save ──────────────────────────────────────────────────────────────────────
json_str = json.dumps(meta, indent=2)

with open(json_path, 'w', encoding='utf-8') as f:
    f.write(json_str)

with open(bin_path, 'wb') as f:
    f.write(json_str.encode('utf-8'))

# ── confirmation ──────────────────────────────────────────────────────────────
print(f"Fluid : {FLUID}")
print(f"Saved : {json_path}  ({len(json_str):,} chars)")
print(f"Saved : {bin_path}  ({len(json_str.encode('utf-8')):,} bytes UTF-8)")
print()
print(f"  Grid         : {n_T} T x {n_P} P = {n_T * n_P:,} points")
print(f"  Bands        : {len(bands_meta)}")
print(f"  Sat. curve   : {sat_points} points")
print(f"  Mass fraction: {frac}")
print()
print("  Pressure band filenames:")
for b in bands_meta:
    print(f"    [{b['band_index']:>2}]  {b['json_file']}")
