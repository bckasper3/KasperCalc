"""
fluid_pipeline.py — callable pipeline for one fluid.

Used by run_all.py for multiprocessing.
process_fluid.py remains for single-fluid debugging.

run_fluid(fluid) returns:
  {
    'fluid':          str,
    'status':         'complete' | 'error',
    'error':          None | str,
    'index_entry':    dict | None,
    'progress_entry': dict | None,
  }
"""

import datetime
import json
import math
import re
import struct
import time
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

COOLPROP_VERSION = CoolProp.__version__
BAND_SIZE        = 20
SAT_NPTS         = 500
NAN              = float('nan')

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

SAT_BIN_FIELDS = [
    'T', 'P',
    'liq_density', 'liq_cp', 'liq_enthalpy', 'liq_entropy',
    'liq_viscosity', 'liq_conductivity',
    'vap_density', 'vap_cp', 'vap_enthalpy', 'vap_entropy',
    'vap_viscosity', 'vap_conductivity',
]
SAT_FMT = '<14fB'

GRID_BIN_FIELDS = ['T', 'P', 'rho', 'cp', 'cv', 'h', 's', 'u', 'visc', 'cond', 'prandtl']
GRID_FMT        = '<11fB'
GRID_ROW_BYTES  = struct.calcsize(GRID_FMT)

# ── helpers ───────────────────────────────────────────────────────────────────

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

def extract_props(AS):
    out = {}
    for k, fn in [
        ('rho',     AS.rhomass),
        ('cp',      AS.cpmass),
        ('cv',      AS.cvmass),
        ('h',       AS.hmass),
        ('s',       AS.smass),
        ('u',       AS.umass),
        ('visc',    AS.viscosity),
        ('cond',    AS.conductivity),
        ('prandtl', AS.Prandtl),
    ]:
        try:
            out[k] = fn()
        except Exception:
            out[k] = NAN
    return out

# ── main pipeline function ────────────────────────────────────────────────────

def run_fluid(fluid):
    try:
        root      = f"coolprop_data_v{COOLPROP_VERSION}"
        safe_name = re.sub(r'[:\[\].]', '_', fluid)
        backend, fname, frac = parse_fluid(fluid)

        # ── profile ───────────────────────────────────────────────────────────
        AS_meta = CoolProp.AbstractState(backend, fname)

        Tmin = PropsSI('Tmin', '', 0, '', 0, fluid)
        Tmax = PropsSI('Tmax', '', 0, '', 0, fluid)
        try:
            Pmax = AS_meta.pmax()
        except Exception:
            Pmax = 20e6  # INCOMP backend does not implement pmax; 20 MPa default

        Tcrit = Pcrit = rhocrit = Ttriple = Ptriple = None
        if backend == 'HEOS':
            try:
                Tcrit   = PropsSI('Tcrit',   '', 0, '', 0, fluid)
                Pcrit   = PropsSI('Pcrit',   '', 0, '', 0, fluid)
                rhocrit = PropsSI('rhocrit', '', 0, '', 0, fluid)
            except Exception:
                pass
            try:
                Ttriple = PropsSI('Ttriple', '', 0, '', 0, fluid)
                Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, fluid)
            except Exception:
                pass

        # ── saturation curve ──────────────────────────────────────────────────
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
                    except Exception:
                        for k in ['density','cp','enthalpy','entropy','viscosity','conductivity']:
                            row.setdefault(f'{tag}_{k}', NAN)
                sat_rows.append(row)

        # ── T/P axes ──────────────────────────────────────────────────────────
        P_low  = Ptriple if Ptriple is not None else 101325.0
        P_main = np.logspace(math.log10(P_low), math.log10(Pmax), 200)
        if Pcrit is not None:
            P_cb = np.linspace(max(Pcrit * 0.80, P_low), min(Pcrit * 1.20, Pmax), 50)
            P_axis = np.unique(np.concatenate([P_main, P_cb, [101325.0]]))
        else:
            P_axis = np.unique(np.concatenate([P_main, [101325.0]]))

        T_main = np.linspace(Tmin, Tmax, 500)
        if Tcrit is not None:
            T_cb = np.linspace(max(Tcrit * 0.80, Tmin), min(Tcrit * 1.20, Tmax), 50)
            T_axis = np.unique(np.concatenate([T_main, T_cb]))
        else:
            T_axis = np.unique(T_main)

        n_T, n_P = len(T_axis), len(P_axis)

        # ── band definitions ──────────────────────────────────────────────────
        bands = []
        for i, start in enumerate(range(0, n_P, BAND_SIZE)):
            chunk = P_axis[start : start + BAND_SIZE]
            bands.append({
                'band_index':     i,
                'p_min':          float(chunk[0]),
                'p_max':          float(chunk[-1]),
                'n_pressure_pts': len(chunk),
            })

        # ── grid calculation ──────────────────────────────────────────────────
        band_buckets = [[] for _ in bands]
        PROPS = ['rho','cp','cv','h','s','u','visc','cond','prandtl']
        n_ok = n_two = n_fail = 0

        if backend == 'INCOMP':
            # INCOMP fluids are always liquid; PropsSI handles fraction in the
            # fluid string directly — avoids set_mass_fractions/pmax limitations
            INCOMP_PROP_MAP = [
                ('rho', 'D'), ('cp', 'C'), ('h', 'H'), ('s', 'S'),
                ('u',   'U'), ('visc', 'V'), ('cond', 'L'), ('prandtl', 'Prandtl'),
            ]
            for T in T_axis:
                for p_idx, P in enumerate(P_axis):
                    row  = {'T': T, 'P': P, 'phase': 0, 'cv': NAN}
                    bidx = p_idx // BAND_SIZE
                    for key, param in INCOMP_PROP_MAP:
                        try:
                            row[key] = PropsSI(param, 'T', T, 'P', P, fluid)
                        except Exception:
                            row[key] = NAN
                    if math.isnan(row.get('rho', NAN)):
                        row['phase'] = 255
                        n_fail += 1
                    else:
                        n_ok += 1
                    band_buckets[bidx].append(row)
        else:
            AS_g     = CoolProp.AbstractState('HEOS', fname)
            AS_sat_g = CoolProp.AbstractState('HEOS', fname)
            PT = CoolProp.PT_INPUTS
            QT = CoolProp.QT_INPUTS

            for T in T_axis:
                for p_idx, P in enumerate(P_axis):
                    row  = {'T': T, 'P': P}
                    bidx = p_idx // BAND_SIZE
                    try:
                        AS_g.update(PT, P, T)
                        flag = PHASE_MAP.get(AS_g.phase(), 255)
                        row['phase'] = flag
                        if flag == 2:
                            row.update({k: NAN for k in PROPS})
                            liq = vap = {k: NAN for k in PROPS}
                            try:
                                AS_sat_g.update(QT, 0.0, T)
                                liq = extract_props(AS_sat_g)
                            except Exception:
                                pass
                            try:
                                AS_sat_g.update(QT, 1.0, T)
                                vap = extract_props(AS_sat_g)
                            except Exception:
                                pass
                            row['liq'] = liq
                            row['vap'] = vap
                            n_two += 1
                        else:
                            row.update(extract_props(AS_g))
                            n_ok += 1
                    except Exception as e:
                        row['phase'] = 255
                        row.update({k: NAN for k in PROPS})
                        row['error'] = str(e)
                        n_fail += 1
                    band_buckets[bidx].append(row)

        # ── save saturation ───────────────────────────────────────────────────
        with open(f"{root}/json/{safe_name}/saturation.json", 'w') as f:
            json.dump([{k: json_safe(v) for k, v in r.items()} for r in sat_rows], f)
        with open(f"{root}/bin/{safe_name}/saturation.bin", 'wb') as f:
            for r in sat_rows:
                f.write(struct.pack(SAT_FMT,
                                    *[r.get(k, NAN) for k in SAT_BIN_FIELDS],
                                    r.get('phase_flag', 255)))

        # ── save grid bands ───────────────────────────────────────────────────
        for band, rows in zip(bands, band_buckets):
            stem  = band_stem(band['band_index'], band['p_min'], band['p_max'])
            with open(f"{root}/json/{safe_name}/grid/{stem}.json", 'w') as f:
                json.dump([clean_row(r) for r in rows], f)
            with open(f"{root}/bin/{safe_name}/grid/{stem}.bin", 'wb') as f:
                for r in rows:
                    f.write(struct.pack(GRID_FMT,
                                        *[r.get(k, NAN) for k in GRID_BIN_FIELDS],
                                        r.get('phase', 255)))

        # ── save meta ─────────────────────────────────────────────────────────
        bands_meta = []
        for b in bands:
            stem = band_stem(b['band_index'], b['p_min'], b['p_max'])
            bands_meta.append({
                'band_index':     b['band_index'],
                'p_min':          b['p_min'],
                'p_max':          b['p_max'],
                'n_pressure_pts': b['n_pressure_pts'],
                'json_file':      f"{stem}.json",
                'bin_file':       f"{stem}.bin",
            })

        meta = {
            'fluid':            fluid,
            'coolprop_version': COOLPROP_VERSION,
            'units': {
                'temperature':     'Kelvin',  'pressure':        'Pascals',
                'density':         'kg/m3',   'cp':              'J/kg/K',
                'cv':              'J/kg/K',  'enthalpy':        'J/kg',
                'entropy':         'J/kg/K',  'internal_energy': 'J/kg',
                'viscosity':       'Pa*s',    'conductivity':    'W/m/K',
                'prandtl':         'dimensionless',
                'float_precision': 'Float32 for all grid and saturation data',
            },
            'critical_point': {
                'T_K': Tcrit, 'P_Pa': Pcrit, 'rho_kg_m3': rhocrit
            } if Tcrit else None,
            'triple_point': {
                'T_K': Ttriple, 'P_Pa': Ptriple
            } if Ptriple else None,
            'valid_range': {'T_min_K': Tmin, 'T_max_K': Tmax, 'P_max_Pa': Pmax},
            'phase_flags': {
                '0': 'Liquid',             '1': 'Gas / Supercritical',
                '2': 'Two-phase',          '3': 'Supercritical liquid',
                '4': 'Supercritical gas',  '255': 'Failed / invalid',
            },
            'grid': {
                'n_temperature_points': n_T,
                'n_pressure_points':    n_P,
                'total_grid_points':    n_T * n_P,
                'pressure_bands':       bands_meta,
            },
            'saturation_curve': {
                'n_points':  len(sat_rows),
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

        # ── return result (caller updates general/ files) ─────────────────────
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return {
            'fluid':  fluid,
            'status': 'complete',
            'error':  None,
            'index_entry': {
                'fluid':         fluid,
                'safe_name':     safe_name,
                'mass_fraction': frac,
                'json_meta':     f"json/{safe_name}/meta.json",
                'bin_meta':      f"bin/{safe_name}/meta.bin",
                'n_grid_points': n_T * n_P,
                'n_sat_points':  len(sat_rows),
                'n_bands':       len(bands),
            },
            'progress_entry': {
                'status':        'complete',
                'timestamp':     ts,
                'n_grid_points': n_T * n_P,
                'n_sat_points':  len(sat_rows),
                'n_bands':       len(bands),
                'n_failed_pts':  n_fail,
            },
        }

    except Exception as e:
        import traceback
        return {
            'fluid':          fluid,
            'status':         'error',
            'error':          traceback.format_exc(),
            'index_entry':    None,
            'progress_entry': None,
        }
