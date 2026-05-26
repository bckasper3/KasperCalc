import CoolProp.CoolProp as CP

T_FALLBACKS = [300, 240, 250, 260, 273, 350, 400, 500, 600]
P_FALLBACKS = [101325, 500000, 1000000]

def try_call(name):
    """Return (ok, note) — tries 300K/101325 first, then broader conditions."""
    for P in P_FALLBACKS:
        for T in T_FALLBACKS:
            try:
                CP.PropsSI('D', 'T', T, 'P', P, name)
                if T == 300 and P == 101325:
                    return True, "ok"
                return True, f"ok at T={T}K P={P}Pa"
            except:
                pass
    return False, "FAILED all conditions"

with open("CoolProp/fluid_list_callable.txt") as f:
    fluids = [line.strip() for line in f if line.strip()]

ok_list = []
flagged = []

for fluid in fluids:
    ok, note = try_call(fluid)
    if ok:
        ok_list.append((fluid, note))
    else:
        flagged.append(fluid)
    status = "OK " if ok else "!!!"
    marker = "" if note == "ok" else f"  <- {note}"
    print(f"  {status}  {fluid}{marker}")

print(f"\n--- Summary ---")
print(f"Passed:  {len(ok_list)}")
print(f"FLAGGED: {len(flagged)}")
if flagged:
    print("\nFlagged fluids:")
    for f in flagged:
        print(f"  {f}")
