# Binary row format (per temperature point):
# T, P,
# liq_density, liq_cp, liq_enthalpy, liq_entropy, liq_viscosity, liq_conductivity,
# vap_density, vap_cp, vap_enthalpy, vap_entropy, vap_viscosity, vap_conductivity
# phase_flag (uint8)
#
# Struct: '<14fB'  (little-endian, 14 x float32, 1 x uint8)
# Bytes per row: 57

import json
import math
import re
import struct
import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = "Water"

# ── paths ─────────────────────────────────────────────────────────────────────
version   = CoolProp.__version__
root      = f"coolprop_data_v{version}"
safe_name = re.sub(r'[:\[\].]', '_', FLUID)

json_path = f"{root}/json/{safe_name}/saturation.json"
bin_path  = f"{root}/bin/{safe_name}/saturation.bin"

# ── saturation curve (from Task 7 logic) ─────────────────────────────────────
def build_saturation(fluid):
    if fluid.startswith('INCOMP::'):
        return []

    try:
        Tmin    = PropsSI('Tmin',    '', 0, '', 0, fluid)
        Tcrit   = PropsSI('Tcrit',   '', 0, '', 0, fluid)
        Ttriple = PropsSI('Ttriple', '', 0, '', 0, fluid)
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, fluid)
    except Exception:
        return []

    T_arr = np.linspace(Tmin, Tcrit - 0.01, 500)
    AS    = CoolProp.AbstractState('HEOS', fluid)
    rows  = []

    for T in T_arr:
        row = {'T': T, 'phase_flag': 2}
        for Q, tag in [(0, 'liq'), (1, 'vap')]:
            try:
                AS.update(CoolProp.CoolProp.QT_INPUTS, Q, T)
                if Q == 0:
                    row['P'] = AS.p()
                row[f'{tag}_density']     = AS.rhomass()
                row[f'{tag}_cp']          = AS.cpmass()
                row[f'{tag}_enthalpy']    = AS.hmass()
                row[f'{tag}_entropy']     = AS.smass()
                row[f'{tag}_viscosity']   = AS.viscosity()
                row[f'{tag}_conductivity']= AS.conductivity()
            except Exception as e:
                row[f'{tag}_error'] = str(e)
                for k in ['density','cp','enthalpy','entropy','viscosity','conductivity']:
                    row.setdefault(f'{tag}_{k}', float('nan'))
        rows.append(row)

    return rows

# ── binary column order ───────────────────────────────────────────────────────
BIN_FIELDS = [
    'T', 'P',
    'liq_density', 'liq_cp', 'liq_enthalpy', 'liq_entropy',
    'liq_viscosity', 'liq_conductivity',
    'vap_density', 'vap_cp', 'vap_enthalpy', 'vap_entropy',
    'vap_viscosity', 'vap_conductivity',
]
BIN_FMT = '<14fB'   # 14 x float32 + 1 x uint8 = 57 bytes/row

# ── helper: NaN-safe float for JSON ──────────────────────────────────────────
def json_safe(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    return v

# ── build data ────────────────────────────────────────────────────────────────
rows = build_saturation(FLUID)
print(f"Fluid: {FLUID}  |  saturation rows: {len(rows)}")

# ── save JSON ─────────────────────────────────────────────────────────────────
json_rows = []
for r in rows:
    json_rows.append({k: json_safe(v) for k, v in r.items()})

with open(json_path, 'w') as f:
    json.dump(json_rows, f)

print(f"JSON saved : {json_path}  ({len(json_rows)} rows)")

# ── save binary ───────────────────────────────────────────────────────────────
with open(bin_path, 'wb') as f:
    for r in rows:
        floats = [r.get(k, float('nan')) for k in BIN_FIELDS]
        flag   = r.get('phase_flag', 255)
        f.write(struct.pack(BIN_FMT, *floats, flag))

bin_size = len(rows) * struct.calcsize(BIN_FMT)
print(f"Binary saved: {bin_path}  ({len(rows)} rows x {struct.calcsize(BIN_FMT)} bytes = {bin_size:,} bytes)")

# ── round-trip spot check ─────────────────────────────────────────────────────
print("\nRound-trip check (row 0 from binary):")
with open(bin_path, 'rb') as f:
    raw = f.read(struct.calcsize(BIN_FMT))
vals = struct.unpack(BIN_FMT, raw)
labels = BIN_FIELDS + ['phase_flag']
for label, val in zip(labels, vals):
    print(f"  {label:<22s} {val}")
