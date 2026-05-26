# Binary row format (per grid point):
# T              (float32)
# P              (float32)
# density        (float32)
# cp             (float32)
# cv             (float32)
# enthalpy       (float32)
# entropy        (float32)
# internal_energy(float32)
# viscosity      (float32)
# conductivity   (float32)
# prandtl        (float32)
# phase_flag     (uint8)
#
# Struct: '<11fB'  (little-endian, 11 x float32, 1 x uint8)
# Bytes per row: 45
# Two-phase points: float fields are NaN; liq/vap data is JSON-only.

import json
import math
import re
import struct
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID     = "Water"
BAND_SIZE = 20

NAN = float('nan')

# ── paths ─────────────────────────────────────────────────────────────────────
version   = CoolProp.__version__
root      = f"coolprop_data_v{version}"
safe_name = re.sub(r'[:\[\].]', '_', FLUID)

json_dir  = f"{root}/json/{safe_name}/grid"
bin_dir   = f"{root}/bin/{safe_name}/grid"

# ── parse fluid ───────────────────────────────────────────────────────────────
def parse_fluid(fluid):
    if fluid.startswith('INCOMP::'):
        inner = fluid[8:]
        fname, frac = (inner.split('[', 1)[0], float(inner.split('[')[1].rstrip(']'))
                       ) if '[' in inner else (inner, None)
        return 'INCOMP', fname, frac
    return 'HEOS', fluid, None

backend, fname, frac = parse_fluid(FLUID)

# ── fluid limits ──────────────────────────────────────────────────────────────
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

# ── build axes ────────────────────────────────────────────────────────────────
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

# ── build pressure bands ──────────────────────────────────────────────────────
bands = []
for i, start in enumerate(range(0, len(P_axis), BAND_SIZE)):
    chunk = P_axis[start : start + BAND_SIZE]
    bands.append({
        'band_index': i,
        'p_min':      float(chunk[0]),
        'p_max':      float(chunk[-1]),
        'n_points':   len(chunk),
        'p_start':    start,
    })

# ── CoolProp phase -> user flag ───────────────────────────────────────────────
PHASE_MAP = {
    CoolProp.iphase_liquid:               0,
    CoolProp.iphase_gas:                  1,
    CoolProp.iphase_supercritical:        1,
    CoolProp.iphase_critical_point:       1,
    CoolProp.iphase_twophase:             2,
    CoolProp.iphase_supercritical_liquid: 3,
    CoolProp.iphase_supercritical_gas:    4,
    CoolProp.iphase_unknown:              255,
    CoolProp.iphase_not_imposed:          255,
}

PROPS = ['rho', 'cp', 'cv', 'h', 's', 'u', 'visc', 'cond', 'prandtl']

def extract(AS):
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
            result[key] = NAN
    return result

# ── calculate grid ────────────────────────────────────────────────────────────
total = len(T_axis) * len(P_axis)
print(f"Fluid: {FLUID}  |  grid: {len(T_axis)} T x {len(P_axis)} P = {total:,} points")
print("Calculating grid...", end='', flush=True)

AS = CoolProp.AbstractState(backend, fname)
if frac is not None:
    AS.set_mass_fractions([frac])
if backend == 'HEOS':
    AS_sat = CoolProp.AbstractState('HEOS', fname)

PT_INPUTS = CoolProp.PT_INPUTS
QT_INPUTS = CoolProp.QT_INPUTS

# bucket rows by band index up front using searchsorted
band_buckets = [[] for _ in bands]

n_done = 0
for T in T_axis:
    for p_idx, P in enumerate(P_axis):
        row = {'T': T, 'P': P}
        band_idx = p_idx // BAND_SIZE

        try:
            AS.update(PT_INPUTS, P, T)
            user_flag = PHASE_MAP.get(AS.phase(), 255)
            row['phase'] = user_flag

            if user_flag == 2:
                row.update({k: NAN for k in PROPS})
                liq = vap = {k: NAN for k in PROPS}
                try:
                    AS_sat.update(QT_INPUTS, 0.0, T)
                    liq = extract(AS_sat)
                except Exception:
                    pass
                try:
                    AS_sat.update(QT_INPUTS, 1.0, T)
                    vap = extract(AS_sat)
                except Exception:
                    pass
                row['liq'] = liq
                row['vap'] = vap
            else:
                row.update(extract(AS))

        except Exception as e:
            row['phase'] = 255
            row.update({k: NAN for k in PROPS})
            row['error'] = str(e)

        band_buckets[band_idx].append(row)
        n_done += 1

print(f" done ({n_done:,} points)")

# ── binary / JSON helpers ─────────────────────────────────────────────────────
BIN_FIELDS = ['T', 'P', 'rho', 'cp', 'cv', 'h', 's', 'u', 'visc', 'cond', 'prandtl']
BIN_FMT    = '<11fB'
ROW_BYTES  = struct.calcsize(BIN_FMT)

def json_safe(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    return v

def clean_for_json(row):
    out = {}
    for k, v in row.items():
        if k in ('liq', 'vap'):
            out[k] = {ik: json_safe(iv) for ik, iv in v.items()}
        else:
            out[k] = json_safe(v)
    return out

# ── write bands ───────────────────────────────────────────────────────────────
print()
for band, rows in zip(bands, band_buckets):
    idx    = band['band_index']
    p_lo   = int(round(band['p_min']))
    p_hi   = int(round(band['p_max']))
    stem   = f"grid_band_{idx:03d}_{p_lo}Pa_{p_hi}Pa"

    # JSON
    jpath = f"{json_dir}/{stem}.json"
    with open(jpath, 'w') as f:
        json.dump([clean_for_json(r) for r in rows], f)

    # Binary
    bpath = f"{bin_dir}/{stem}.bin"
    with open(bpath, 'wb') as f:
        for r in rows:
            floats = [r.get(k, NAN) for k in BIN_FIELDS]
            flag   = r.get('phase', 255)
            f.write(struct.pack(BIN_FMT, *floats, flag))

    bin_bytes = len(rows) * ROW_BYTES
    print(f"  Band {idx:>2}  {p_lo:>12,} Pa - {p_hi:>12,} Pa"
          f"  |  {len(rows):>7,} rows  |  {stem}.json / .bin  ({bin_bytes:,} B)")

total_rows = sum(len(b) for b in band_buckets)
print(f"\nTotal rows written: {total_rows:,}  across {len(bands)} bands")
