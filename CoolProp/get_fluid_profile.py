import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = "Water"

def get_profile(fluid):
    AS = CoolProp.AbstractState('HEOS', fluid)
    Ttriple = PropsSI('Ttriple', '', 0, '', 0, fluid)

    try:
        Ptriple = PropsSI('P', 'T', Ttriple, 'Q', 0, fluid)
    except Exception:
        Ptriple = None

    return {
        "Tcrit":   PropsSI('Tcrit',   '', 0, '', 0, fluid),
        "Pcrit":   PropsSI('Pcrit',   '', 0, '', 0, fluid),
        "rhocrit": PropsSI('rhocrit', '', 0, '', 0, fluid),
        "Ttriple": Ttriple,
        "Ptriple": Ptriple,
        "Tmin":    PropsSI('Tmin',    '', 0, '', 0, fluid),
        "Tmax":    PropsSI('Tmax',    '', 0, '', 0, fluid),
        "Pmax":    AS.pmax(),
    }

LABELS = {
    "Tcrit":   ("Critical temperature",      "K"),
    "Pcrit":   ("Critical pressure",         "Pa"),
    "rhocrit": ("Critical density",          "kg/m³"),
    "Ttriple": ("Triple point temperature",  "K"),
    "Ptriple": ("Triple point pressure",     "Pa"),
    "Tmin":    ("Minimum valid temperature", "K"),
    "Tmax":    ("Maximum valid temperature", "K"),
    "Pmax":    ("Maximum valid pressure",    "Pa"),
}

profile = get_profile(FLUID)

print(f"Fluid profile: {FLUID}\n")
for key, (label, unit) in LABELS.items():
    val = profile[key]
    if val is None:
        print(f"  {key:<10}  {label:<30}  N/A")
    else:
        print(f"  {key:<10}  {label:<30}  {val:.6g} {unit}")
