import CoolProp.CoolProp as CP

fluids = CP.FluidsList()

incomp_pure = CP.get_global_param_string("incompressible_list_pure").split(",")
incomp_mix  = CP.get_global_param_string("incompressible_list_solution").split(",")

print("=== Standard fluids ===")
for f in fluids:
    print(f)
print(f"Total standard fluids: {len(fluids)}")

print("\n=== Incompressible pure fluids ===")
for f in incomp_pure:
    print(f)
print(f"Total incompressible pure fluids: {len(incomp_pure)}")

print("\n=== Incompressible mass-based binary mixtures ===")
for f in incomp_mix:
    print(f)
print(f"Total incompressible binary mixtures: {len(incomp_mix)}")

print(f"\nGrand total: {len(fluids) + len(incomp_pure) + len(incomp_mix)}")

with open("CoolProp/fluid_list.txt", "w") as f:
    f.write("=== Standard fluids ===\n")
    f.write("\n".join(fluids))
    f.write(f"\n\nTotal: {len(fluids)}\n")

    f.write("\n=== Incompressible pure fluids ===\n")
    f.write("\n".join(incomp_pure))
    f.write(f"\n\nTotal: {len(incomp_pure)}\n")

    f.write("\n=== Incompressible mass-based binary mixtures ===\n")
    f.write("\n".join(incomp_mix))
    f.write(f"\n\nTotal: {len(incomp_mix)}\n")

    f.write(f"\nGrand total: {len(fluids) + len(incomp_pure) + len(incomp_mix)}\n")

print("Saved to CoolProp/fluid_list.txt")
