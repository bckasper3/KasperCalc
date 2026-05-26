import CoolProp
from CoolProp.CoolProp import PropsSI

print(f"CoolProp version: {CoolProp.__version__}")

density = PropsSI('D', 'T', 300, 'P', 101325, 'Water')
print(f"Density of Water at 300K, 101325 Pa: {density:.4f} kg/m³")
