import json, glob

files = sorted(glob.glob('coolprop_data_v7.2.0/json/Nitrogen/grid/*.json'))
total_errors = 0
for fpath in files:
    with open(fpath) as f:
        rows = json.load(f)
    errors = [r for r in rows if r.get('phase') == 255]
    total_errors += len(errors)
    if errors:
        b = fpath.split('/')[-1]
        print(f"{b}  ({len(errors)} errors)")
        for r in errors[:3]:
            T = r.get('T', '?')
            P = r.get('P', '?')
            err = r.get('error', '')[:120]
            print(f"  T={T:.4g} K  P={P:.4g} Pa  -> {err}")

print(f"\nTotal error rows: {total_errors}")
