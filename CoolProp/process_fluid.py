"""
process_fluid.py — end-to-end pipeline for one fluid.

Steps:
  1  get_profile        Task 6
  2  build_saturation   Task 7
  3  build_axes         Task 8
  4  calculate_grid     Task 9
  5  save_saturation    Task 10
  6  define_bands       Task 11
  7  save_grid          Task 12
  8  save_meta          Task 13
  9  update_index       Task 14
"""

import json
import math
import re
import struct
import time
import datetime
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID     = "Water"
BAND_SIZE = 20
SAT_NPTS  = 500
NAN       = float('nan')

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

version   = CoolProp.__version__
root      = f"coolprop_data_v{version}"
safe_name = re.sub(r'[:\[\].]', '_', FLUID)

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

def json_safe(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    return v

def clean_row(row):
    out = {}
    for k, v in row.items():
        if k in ('liq', 'vap'):
            out[k] = {ik: json_safe(iv) for ik, iv in v.items()}
        else:
            out[k] = json_safe(v)
    return out

def band_stem(idx, p_min, p_max):
    return f"grid_band_{idx:03d}_{int(round(p_min))}Pa_{int(round(p_max))}Pa"

def step(n, label):
    print(f"\n[{n}] {label}")

def ok(msg):
    print(f"    OK  {msg}")

def warn(msg):
    print(f"    !!  {msg}")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1 — Fluid profile
# ═══════════════════════════════════════════════════════════════════════════════
step(1, "Fluid profile")

backend, fname, frac = parse_fluid(FLUID)

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
    except Exception as e:
        warn(f"critical point unavailable: {e}")
    try:
        Ttriple = PropsSI('Ttriple', '', 0, '', 0, FLUID)
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, FLUID)
    except Exception:
        warn("triple point unavailable")

ok(f"Tmin={Tmin:.4g} K  Tmax={Tmax:.4g} K  Pmax={Pmax:.4g} Pa")
if Tcrit:
    ok(f"Tcrit={Tcrit:.4g} K  Pcrit={Pcrit:.4g} Pa  rhocrit={rhocrit:.4g} kg/m3")
if Ptriple:
    ok(f"Ttriple={Ttriple:.4g} K  Ptriple={Ptriple:.4g} Pa")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 2 — Saturation curve
# ═══════════════════════════════════════════════════════════════════════════════
step(2, "Saturation curve")
t0 = time.time()

sat_rows = []
if backend == 'HEOS' and Ptriple is not None:
    T_arr = np.linspace(Tmin, Tcrit - 0.01, SAT_NPTS)
    AS_s  = CoolProp.AbstractState('HEOS', fname)
    for T in T_arr:
        row = {'T': T, 'phase_flag': 2}
        for Q, tag in [(0, 'liq'), (1, 'vap')]:
            try:
                AS_s.update(CoolProp.CoolProp.QT_INPUTS, Q, T)
                if Q == 0:
                    row['P'] = AS_s.p()
                row[f'{tag}_density']      = AS_s.rhomass()
                row[f'{tag}_cp']           = AS_s.cpmass()
                row[f'{tag}_enthalpy']     = AS_s.hmass()
                row[f'{tag}_entropy']      = AS_s.smass()
                row[f'{tag}_viscosity']    = AS_s.viscosity()
                row[f'{tag}_conductivity'] = AS_s.conductivity()
            except Exception as e:
                for k in ['density','cp','enthalpy','entropy','viscosity','conductivity']:
                    row.setdefault(f'{tag}_{k}', NAN)
        sat_rows.append(row)
    ok(f"{len(sat_rows)} points in {time.time()-t0:.1f}s")
else:
    ok("skipped (no saturation curve for this fluid)")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3 — Build T/P axes
# ═══════════════════════════════════════════════════════════════════════════════
step(3, "Build T/P axes")

P_low  = Ptriple if Ptriple is not None else 101325.0
P_main = np.logspace(math.log10(P_low), math.log10(Pmax), 200)
if Pcrit is not None:
    P_crit_band = np.linspace(max(Pcrit * 0.80, P_low), min(Pcrit * 1.20, Pmax), 50)
    P_axis = np.unique(np.concatenate([P_main, P_crit_band, [101325.0]]))
else:
    P_axis = np.unique(np.concatenate([P_main, [101325.0]]))

T_main = np.linspace(Tmin, Tmax, 500)
if Tcrit is not None:
    T_crit_band = np.linspace(max(Tcrit * 0.80, Tmin), min(Tcrit * 1.20, Tmax), 50)
    T_axis = np.unique(np.concatenate([T_main, T_crit_band]))
else:
    T_axis = np.unique(T_main)

n_T, n_P = len(T_axis), len(P_axis)
ok(f"{n_T} T points x {n_P} P points = {n_T*n_P:,} grid points")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 4 — Calculate grid properties
# ═══════════════════════════════════════════════════════════════════════════════
step(4, "Calculate grid properties")
t0 = time.time()

PROPS = ['rho','cp','cv','h','s','u','visc','cond','prandtl']

def extract(AS):
    getters = {
        'rho': AS.rhomass, 'cp': AS.cpmass,  'cv':   AS.cvmass,
        'h':   AS.hmass,   's':  AS.smass,   'u':    AS.umass,
        'visc':AS.viscosity,'cond':AS.conductivity,'prandtl':AS.Prandtl,
    }
    return {k: (fn() if not (r := _safe_call(fn)) else r) for k, fn in getters.items()}

def _safe_call(fn):
    try:
        fn(); return None
    except Exception:
        return None

def extract(AS):
    out = {}
    for k, fn in [('rho',AS.rhomass),('cp',AS.cpmass),('cv',AS.cvmass),
                  ('h',AS.hmass),('s',AS.smass),('u',AS.umass),
                  ('visc',AS.viscosity),('cond',AS.conductivity),('prandtl',AS.Prandtl)]:
        try:
            out[k] = fn()
        except Exception:
            out[k] = NAN
    return out

AS_g = CoolProp.AbstractState(backend, fname)
if frac is not None:
    AS_g.set_mass_fractions([frac])
if backend == 'HEOS':
    AS_sat_g = CoolProp.AbstractState('HEOS', fname)

PT = CoolProp.PT_INPUTS
QT = CoolProp.QT_INPUTS

band_buckets  = [[] for _ in range(math.ceil(n_P / BAND_SIZE))]
n_ok = n_two = n_fail = 0

for T in T_axis:
    for p_idx, P in enumerate(P_axis):
        row = {'T': T, 'P': P}
        bidx = p_idx // BAND_SIZE
        try:
            AS_g.update(PT, P, T)
            flag = PHASE_MAP.get(AS_g.phase(), 255)
            row['phase'] = flag
            if flag == 2:
                row.update({k: NAN for k in PROPS})
                liq = vap = {k: NAN for k in PROPS}
                try:
                    AS_sat_g.update(QT, 0.0, T); liq = extract(AS_sat_g)
                except Exception:
                    pass
                try:
                    AS_sat_g.update(QT, 1.0, T); vap = extract(AS_sat_g)
                except Exception:
                    pass
                row['liq'] = liq
                row['vap'] = vap
                n_two += 1
            else:
                row.update(extract(AS_g))
                n_ok += 1
        except Exception as e:
            row['phase'] = 255
            row.update({k: NAN for k in PROPS})
            row['error'] = str(e)
            n_fail += 1
        band_buckets[bidx].append(row)

elapsed = time.time() - t0
ok(f"{n_ok:,} normal  {n_two:,} two-phase  {n_fail:,} failed  ({elapsed:.1f}s)")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 5 — Save saturation files
# ═══════════════════════════════════════════════════════════════════════════════
step(5, "Save saturation files")

SAT_BIN_FIELDS = [
    'T','P',
    'liq_density','liq_cp','liq_enthalpy','liq_entropy','liq_viscosity','liq_conductivity',
    'vap_density','vap_cp','vap_enthalpy','vap_entropy','vap_viscosity','vap_conductivity',
]
SAT_FMT = '<14fB'

jpath = f"{root}/json/{safe_name}/saturation.json"
bpath = f"{root}/bin/{safe_name}/saturation.bin"

with open(jpath, 'w') as f:
    json.dump([{k: json_safe(v) for k, v in r.items()} for r in sat_rows], f)

with open(bpath, 'wb') as f:
    for r in sat_rows:
        floats = [r.get(k, NAN) for k in SAT_BIN_FIELDS]
        f.write(struct.pack(SAT_FMT, *floats, r.get('phase_flag', 255)))

ok(f"saturation.json  ({len(sat_rows)} rows)")
ok(f"saturation.bin   ({len(sat_rows) * struct.calcsize(SAT_FMT):,} bytes)")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 6 — Define pressure bands
# ═══════════════════════════════════════════════════════════════════════════════
step(6, "Define pressure bands")

bands = []
for i, start in enumerate(range(0, n_P, BAND_SIZE)):
    chunk = P_axis[start : start + BAND_SIZE]
    bands.append({
        'band_index':     i,
        'p_min':          float(chunk[0]),
        'p_max':          float(chunk[-1]),
        'n_pressure_pts': len(chunk),
    })

ok(f"{len(bands)} bands of up to {BAND_SIZE} pressure points each")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 7 — Save grid files by band
# ═══════════════════════════════════════════════════════════════════════════════
step(7, "Save grid files by pressure band")

GRID_BIN_FIELDS = ['T','P','rho','cp','cv','h','s','u','visc','cond','prandtl']
GRID_FMT        = '<11fB'
ROW_BYTES       = struct.calcsize(GRID_FMT)

for band, rows in zip(bands, band_buckets):
    stem  = band_stem(band['band_index'], band['p_min'], band['p_max'])
    jpath = f"{root}/json/{safe_name}/grid/{stem}.json"
    bpath = f"{root}/bin/{safe_name}/grid/{stem}.bin"

    with open(jpath, 'w') as f:
        json.dump([clean_row(r) for r in rows], f)

    with open(bpath, 'wb') as f:
        for r in rows:
            f.write(struct.pack(GRID_FMT,
                                *[r.get(k, NAN) for k in GRID_BIN_FIELDS],
                                r.get('phase', 255)))

    ok(f"{stem}  ({len(rows):,} rows, {len(rows)*ROW_BYTES:,} B)")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 8 — Save meta files
# ═══════════════════════════════════════════════════════════════════════════════
step(8, "Save meta files")

bands_meta = []
for b in bands:
    stem = band_stem(b['band_index'], b['p_min'], b['p_max'])
    bands_meta.append({
        'band_index':      b['band_index'],
        'p_min':           b['p_min'],
        'p_max':           b['p_max'],
        'n_pressure_pts':  b['n_pressure_pts'],
        'json_file':       f"{stem}.json",
        'bin_file':        f"{stem}.bin",
    })

meta = {
    'fluid':            FLUID,
    'coolprop_version': version,
    'units': {
        'temperature':     'Kelvin',  'pressure':        'Pascals',
        'density':         'kg/m3',   'cp':              'J/kg/K',
        'cv':              'J/kg/K',  'enthalpy':        'J/kg',
        'entropy':         'J/kg/K',  'internal_energy': 'J/kg',
        'viscosity':       'Pa*s',    'conductivity':    'W/m/K',
        'prandtl':         'dimensionless',
        'float_precision': 'Float32 for all grid and saturation data',
    },
    'critical_point': {'T_K': Tcrit, 'P_Pa': Pcrit, 'rho_kg_m3': rhocrit} if Tcrit else None,
    'triple_point':   {'T_K': Ttriple, 'P_Pa': Ptriple}                    if Ptriple else None,
    'valid_range':    {'T_min_K': Tmin, 'T_max_K': Tmax, 'P_max_Pa': Pmax},
    'phase_flags': {
        '0': 'Liquid',              '1': 'Gas / Supercritical',
        '2': 'Two-phase',           '3': 'Supercritical liquid',
        '4': 'Supercritical gas',   '255': 'Failed / invalid',
    },
    'grid': {
        'n_temperature_points': n_T,
        'n_pressure_points':    n_P,
        'total_grid_points':    n_T * n_P,
        'pressure_bands':       bands_meta,
    },
    'saturation_curve': {
        'n_points': len(sat_rows),
        'file_json': 'saturation.json' if sat_rows else None,
        'file_bin':  'saturation.bin'  if sat_rows else None,
    },
    'mass_fraction': frac,
}

json_str = json.dumps(meta, indent=2)
with open(f"{root}/json/{safe_name}/meta.json", 'w', encoding='utf-8') as f:
    f.write(json_str)
with open(f"{root}/bin/{safe_name}/meta.bin", 'wb') as f:
    f.write(json_str.encode('utf-8'))

ok(f"meta.json / meta.bin  ({len(json_str):,} chars)")

# ═══════════════════════════════════════════════════════════════════════════════
# Step 9 — Update general/fluid_index.json and general/progress.json
# ═══════════════════════════════════════════════════════════════════════════════
step(9, "Update index and progress")

# --- fluid_index.json ---
index_path = f"{root}/general/fluid_index.json"
with open(index_path) as f:
    fluid_index = json.load(f)

# Remove any stale entry for this fluid, then append fresh one
fluid_index = [e for e in fluid_index if e.get('fluid') != FLUID]
fluid_index.append({
    'fluid':         FLUID,
    'safe_name':     safe_name,
    'mass_fraction': frac,
    'json_meta':     f"json/{safe_name}/meta.json",
    'bin_meta':      f"bin/{safe_name}/meta.bin",
    'n_grid_points': n_T * n_P,
    'n_sat_points':  len(sat_rows),
    'n_bands':       len(bands),
})

with open(index_path, 'w') as f:
    json.dump(fluid_index, f, indent=2)

ok(f"fluid_index.json  ({len(fluid_index)} fluids total)")

# --- progress.json ---
progress_path = f"{root}/general/progress.json"
with open(progress_path) as f:
    progress = json.load(f)

progress[FLUID] = {
    'status':         'complete',
    'timestamp':      datetime.datetime.utcnow().isoformat() + 'Z',
    'n_grid_points':  n_T * n_P,
    'n_sat_points':   len(sat_rows),
    'n_bands':        len(bands),
    'n_failed_pts':   n_fail,
}

with open(progress_path, 'w') as f:
    json.dump(progress, f, indent=2)

ok(f"progress.json  status=complete  failed_pts={n_fail}")

# ═══════════════════════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════════════════════
print(f"\nDone: {FLUID}")
