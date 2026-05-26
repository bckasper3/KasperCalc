import os, json

root = 'coolprop_data_v7.2.0'

# ── Check 1: folders ─────────────────────────────────────────────────────────
print("=== Check 1: Folders ===")
folders = [
    f'{root}/general',
    f'{root}/json/Water',
    f'{root}/json/Water/grid',
    f'{root}/bin/Water',
    f'{root}/bin/Water/grid',
]
for path in folders:
    status = "OK     " if os.path.isdir(path) else "MISSING"
    print(f"  {status}  {path}")

# ── Check 2: meta.json band definitions + file existence ─────────────────────
print("\n=== Check 2: meta.json band/file integrity ===")
with open(f'{root}/json/Water/meta.json') as f:
    meta = json.load(f)
bands = meta['grid']['pressure_bands']
all_files_ok = True
for b in bands:
    jpath = f'{root}/json/Water/grid/{b["json_file"]}'
    bpath = f'{root}/bin/Water/grid/{b["bin_file"]}'
    j_ok  = os.path.exists(jpath)
    b_ok  = os.path.exists(bpath)
    flag  = "OK" if (j_ok and b_ok) else "MISSING"
    if not (j_ok and b_ok):
        all_files_ok = False
    print(f"  {flag}  band {b['band_index']:>2}  {b['json_file']}")
print(f"  All files present: {all_files_ok}")

# ── Check 3: pressure range integrity on band 4 ───────────────────────────────
print("\n=== Check 3: Pressure range integrity (band 4) ===")
b4 = bands[4]
with open(f'{root}/json/Water/grid/{b4["json_file"]}') as f:
    rows4 = json.load(f)
Ps = [r['P'] for r in rows4]
out_of_range = [p for p in Ps if p < b4['p_min'] - 1 or p > b4['p_max'] + 1]
print(f"  Band 4 defined range : {b4['p_min']:.4g} Pa  to  {b4['p_max']:.4g} Pa")
print(f"  Row P range          : {min(Ps):.4g} Pa  to  {max(Ps):.4g} Pa")
print(f"  Row count            : {len(rows4)}")
print(f"  Out-of-range P values: {len(out_of_range)}")

# ── Check 4: progress.json ────────────────────────────────────────────────────
print("\n=== Check 4: progress.json ===")
with open(f'{root}/general/progress.json') as f:
    prog = json.load(f)
print(json.dumps(prog, indent=2))

# ── Check 5: fluid_index.json ─────────────────────────────────────────────────
print("\n=== Check 5: fluid_index.json ===")
with open(f'{root}/general/fluid_index.json') as f:
    idx = json.load(f)
print(json.dumps(idx, indent=2))

# ── Check 6: physical sanity ──────────────────────────────────────────────────
print("\n=== Check 6: Physical sanity (band 5, rows near 300 K) ===")
b5 = bands[5]
with open(f'{root}/json/Water/grid/{b5["json_file"]}') as f:
    rows5 = json.load(f)
near300 = [r for r in rows5 if abs(r['T'] - 300) < 5][:3]
print(f"  {'T (K)':<10} {'P (Pa)':<14} {'phase':<7} {'rho kg/m3':<12} {'cp J/kgK':<12} {'visc Pa.s':<12}")
for r in near300:
    print(f"  {r['T']:<10.2f} {r['P']:<14.4g} {r['phase']:<7} {r['rho']:<12.4g} {r['cp']:<12.4g} {r['visc']:<12.4g}")
