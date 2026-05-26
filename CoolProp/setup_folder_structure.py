import os
import json
import re
import CoolProp

version = CoolProp.__version__
root = f"coolprop_data_v{version}"

print(f"CoolProp version: {version}")
print(f"Root folder: {root}")

with open("CoolProp/fluid_list_callable.txt") as f:
    fluids = [line.strip() for line in f if line.strip()]

print(f"Fluids to process: {len(fluids)}")

def safe_name(fluid):
    return re.sub(r'[::\[\].]', '_', fluid)

# Top-level fixed folders
for folder in [root, f"{root}/general", f"{root}/json", f"{root}/bin"]:
    os.makedirs(folder, exist_ok=True)

# Per-fluid folders
for fluid in fluids:
    name = safe_name(fluid)
    os.makedirs(f"{root}/json/{name}/grid", exist_ok=True)
    os.makedirs(f"{root}/bin/{name}/grid",  exist_ok=True)

# Seed files in general/
with open(f"{root}/general/fluid_index.json", "w") as f:
    json.dump([], f)

with open(f"{root}/general/progress.json", "w") as f:
    json.dump({}, f)

with open(f"{root}/general/errors.json", "w") as f:
    json.dump([], f)

print(f"\nFolder structure created under {root}/")
print(f"  general/  — fluid_index.json, progress.json, errors.json")
print(f"  json/     — {len(fluids)} fluid folders (each with grid/)")
print(f"  bin/      — {len(fluids)} fluid folders (each with grid/)")
print("\nDone.")
