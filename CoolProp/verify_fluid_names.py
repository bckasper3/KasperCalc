import CoolProp.CoolProp as CP

SKIP_EXAMPLES = {"ExamplePure", "ExampleDigitalPure", "ExampleDigital",
                 "ExampleMelinder", "ExampleSecCool", "ExampleSolution"}

T_RANGE = [240, 250, 260, 273, 300, 350, 400, 500, 600]
X_STEPS = [round(x * 0.1, 1) for x in range(1, 10)]  # 0.1 to 0.9

def works_pure(name):
    for T in T_RANGE:
        try:
            CP.PropsSI('D', 'T', T, 'P', 101325, name)
            return True
        except:
            pass
    return False

def works_mix(name_with_x):
    for T in T_RANGE:
        try:
            CP.PropsSI('D', 'T', T, 'P', 101325, name_with_x)
            return True
        except:
            pass
    return False

callable_names = []

# Standard fluids — bare name
for f in CP.FluidsList():
    if works_pure(f):
        callable_names.append(f)

# Incompressible pure — INCOMP:: prefix
for f in CP.get_global_param_string("incompressible_list_pure").split(","):
    if f in SKIP_EXAMPLES:
        continue
    if works_pure(f"INCOMP::{f}"):
        callable_names.append(f"INCOMP::{f}")

# Incompressible binary mixtures — one entry per valid 0.1 step
mix_results = {}
for f in CP.get_global_param_string("incompressible_list_solution").split(","):
    if f in SKIP_EXAMPLES:
        continue
    valid_steps = []
    for x in X_STEPS:
        if works_mix(f"INCOMP::{f}[{x}]"):
            valid_steps.append(x)
    mix_results[f] = valid_steps
    for x in valid_steps:
        callable_names.append(f"INCOMP::{f}[{x}]")

# Report mixture coverage
print("Binary mixture fraction coverage:")
for f, steps in mix_results.items():
    if steps:
        print(f"  INCOMP::{f}: {steps}")
    else:
        print(f"  INCOMP::{f}: NO VALID STEPS")

print(f"\nTotal callable entries: {len(callable_names)}")

with open("CoolProp/fluid_list_callable.txt", "w") as out:
    out.write("\n".join(callable_names) + "\n")

print("Saved to CoolProp/fluid_list_callable.txt")
