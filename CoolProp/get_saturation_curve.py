import numpy as np
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = "Water"

# ── profile ──────────────────────────────────────────────────────────────────
def get_profile(fluid):
    AS = CoolProp.AbstractState('HEOS', fluid)
    Ttriple = PropsSI('Ttriple', '', 0, '', 0, fluid)
    try:
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, fluid)
    except Exception:
        Ptriple = None
    return {
        'Tmin':    PropsSI('Tmin',    '', 0, '', 0, fluid),
        'Tcrit':   PropsSI('Tcrit',   '', 0, '', 0, fluid),
        'Ttriple': Ttriple,
        'Ptriple': Ptriple,
    }

# ── saturation check ─────────────────────────────────────────────────────────
if FLUID.startswith('INCOMP::'):
    print(f"{FLUID}: incompressible fluid — no saturation curve.")
    rows = []
else:
    try:
        profile = get_profile(FLUID)
    except Exception as e:
        print(f"{FLUID}: could not get profile ({e}) — skipping.")
        profile = None

    if profile is None or profile['Ptriple'] is None:
        print(f"{FLUID}: no saturation curve available.")
        rows = []
    else:
        Tmin  = profile['Tmin']
        Tcrit = profile['Tcrit']

        # Stop just short of Tcrit to avoid critical-point singularities
        T_arr = np.linspace(Tmin, Tcrit - 0.01, 500)

        AS = CoolProp.AbstractState('HEOS', FLUID)
        rows = []

        for T in T_arr:
            row = {'T': T}
            ok = True

            for Q, tag in [(0, 'liq'), (1, 'vap')]:
                try:
                    AS.update(CoolProp.CoolProp.QT_INPUTS, Q, T)
                    if Q == 0:
                        row['P'] = AS.p()          # saturation pressure (same for both phases)
                    row[f'rho_{tag}']  = AS.rhomass()
                    row[f'cp_{tag}']   = AS.cpmass()
                    row[f'h_{tag}']    = AS.hmass()
                    row[f's_{tag}']    = AS.smass()
                    row[f'visc_{tag}'] = AS.viscosity()
                    row[f'cond_{tag}'] = AS.conductivity()
                except Exception as e:
                    row[f'error_{tag}'] = str(e)
                    ok = False

            rows.append(row)

        errors = sum(1 for r in rows if 'error_liq' in r or 'error_vap' in r)
        print(f"{FLUID}: {len(rows)} points, {errors} errors\n")

        # ── preview first 3 rows ──────────────────────────────────────────────
        keys = ['T', 'P', 'rho_liq', 'cp_liq', 'h_liq', 's_liq', 'visc_liq', 'cond_liq',
                             'rho_vap', 'cp_vap', 'h_vap', 's_vap', 'visc_vap', 'cond_vap']
        units = {
            'T': 'K', 'P': 'Pa',
            'rho_liq': 'kg/m³', 'cp_liq': 'J/kg·K', 'h_liq': 'J/kg',
            's_liq': 'J/kg·K',  'visc_liq': 'Pa·s',  'cond_liq': 'W/m·K',
            'rho_vap': 'kg/m³', 'cp_vap': 'J/kg·K',  'h_vap': 'J/kg',
            's_vap': 'J/kg·K',  'visc_vap': 'Pa·s',  'cond_vap': 'W/m·K',
        }
        print(f"{'':>18s}", "  ".join(f"row {i}" for i in range(3)))
        for k in keys:
            vals = "  ".join(f"{rows[i].get(k, 'N/A'):>14.6g}" for i in range(3))
            print(f"  {k:<14s} ({units[k]:<10s})  {vals}")
