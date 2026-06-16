(function () {
  const el = document.getElementById('site-footer');
  if (!el) return;

  el.innerHTML = `
    <div class="csscontainer mt-2">
      <div class="footerwrapper">

        <div class="footerRow">
          <a href="index.html">
            <div class="logoblock">
              <img class="logo" src="img/blueK.webp" alt="KasperCalcLogo" />
              <h4 class="footerlogo">KasperCalc</h4>
            </div>
          </a>
          <a class="kofi-link" href="https://ko-fi.com/kaspercalc" target="_blank">
            <img class="kofi" src="img/kofi5.webp" height="50px" width="198.63013px" alt="Buy Me a Coffee at ko-fi.com" />
          </a>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Fluids Calculators</span></h4>
          <div class="footerlink"><a href="fuelHead.html">Jet Fuel Head Calculator</a></div>
          <div class="footerlink"><a href="PPH.html">Jet Fuel PPH to GPM Calculator</a></div>
          <div class="footerlink"><a href="universalfuelHead.html">Universal Fluid Head Calculator</a></div>
          <div class="footerlink"><a href="universalPPH.html">Universal PPH to GPM Calculator</a></div>
          <div class="footerlink"><a href="CrazyUniversalfuelHead.html">Water Density Compensated Universal Fluid Head Calculator</a></div>
          <div class="footerlink"><a href="CrazyUniversalPPH.html">Water Density Compensated Universal PPH to GPM Calculator</a></div>
          <div class="footerlink"><a href="equivalentFlows.html">Density Dependent Flow Rate Calculator</a></div>
          <div class="footerlink"><a href="MassFlowConverter.html">Mass Flow Rate Calculator</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Jet Fuel</span></h4>
          <div class="footerlink"><a href="nominalDensity.html">Nominal Density</a></div>
          <div class="footerlink"><a href="minmaxDensity.html">Min/Max Density</a></div>
          <div class="footerlink"><a href="kinematicViscosity.html">Viscosity</a></div>
          <div class="footerlink"><a href="surfaceTension.html">Surface Tension</a></div>
          <div class="footerlink"><a href="vaporPressure.html">Vapor Pressure</a></div>
          <div class="footerlink"><a href="MultipleOfVolume.html">Multiple of Volume</a></div>
          <div class="footerlink"><a href="distillationCurves.html">Distillation Curves</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Propylene Glycol</span></h4>
          <div class="footerlink"><a href="PGPropertiesGeneral.html">General Properties</a></div>
          <div class="footerlink"><a href="PGFrostProtection.html">Frost Protection</a></div>
          <div class="footerlink"><a href="PGdensity.html">Density</a></div>
          <div class="footerlink"><a href="PGheatcapacity.html">Specific Heat Capacity</a></div>
          <div class="footerlink"><a href="PGthermalconductivity.html">Thermal Conductivity</a></div>
          <div class="footerlink"><a href="PGviscosity.html">Viscosity</a></div>
          <div class="footerlink"><a href="PGPrandltNumber.html">Prandtl Number</a></div>
          <div class="footerlink"><a href="PGThermalExpansionCoefficient.html">Thermal Expansion Coefficient</a></div>
          <div class="footerlink"><a href="PGBoilingPoint.html">Boiling Point</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Ethylene Glycol</span></h4>
          <div class="footerlink"><a href="EGPropertiesGeneral.html">General Properties</a></div>
          <div class="footerlink"><a href="EGFrostProtection.html">Frost Protection</a></div>
          <div class="footerlink"><a href="EGdensity.html">Density</a></div>
          <div class="footerlink"><a href="EGheatcapacity.html">Specific Heat Capacity</a></div>
          <div class="footerlink"><a href="EGthermalconductivity.html">Thermal Conductivity</a></div>
          <div class="footerlink"><a href="EGviscosity.html">Viscosity</a></div>
          <div class="footerlink"><a href="EGPrandltNumber.html">Prandtl Number</a></div>
          <div class="footerlink"><a href="EGThermalExpansionCoefficient.html">Thermal Expansion Coefficient</a></div>
          <div class="footerlink"><a href="EGBoilingPoint.html">Boiling Point</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">MIL-PRF-23699</span></h4>
          <div class="footerlink"><a href="MIL-PRF-23699PropertiesGeneral.html">General Properties</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699Density.html">Density</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699SpecificHeatCapacity.html">Specific Heat Capacity</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699thermalconductivity.html">Thermal Conductivity</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699viscosity.html">Viscosity</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699PrandltNumber.html">Prandtl Number</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699ThermalExpansionCoefficient.html">Thermal Expansion Coefficient</a></div>
          <div class="footerlink"><a href="MIL-PRF-23699ThermalDiffusivity.html">Thermal Diffusivity</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Water</span></h4>
          <div class="footerlink"><a href="WaterPropertiesGeneral.html">General Properties</a></div>
          <div class="footerlink"><a href="densityWater.html">Density</a></div>
          <div class="footerlink"><a href="WaterSpecificHeatCapacity.html">Specific Heat Capacity</a></div>
          <div class="footerlink"><a href="WaterBoilingHighPressure.html">Boiling Points at Pressures</a></div>
          <div class="footerlink"><a href="Waterthermalconductivity.html">Thermal Conductivity</a></div>
          <div class="footerlink"><a href="WaterViscosity.html">Viscosity</a></div>
          <div class="footerlink"><a href="WaterPrandltNumber.html">Prandtl Number</a></div>
          <div class="footerlink"><a href="WaterEnthalpyEntropy.html">Enthalpy and Entropy</a></div>
          <div class="footerlink"><a href="WaterIonizationConstant.html">Ionization Constant (pK<sub>w</sub>)</a></div>
          <div class="footerlink"><a href="WaterHeatVaporization.html">Heat of Vaporization</a></div>
          <div class="footerlink"><a href="WaterSaturationPressure.html">Saturation Pressure</a></div>
          <div class="footerlink"><a href="WaterLiquidGasEquilibrium.html">Liquid Gas Equilibrium</a></div>
          <div class="footerlink"><a href="WaterMeltingPointsHighPressure.html">Melting Points at High Pressure</a></div>
          <div class="footerlink"><a href="WaterThermalExpansionCoefficient.html">Thermal Expansion Coefficient</a></div>
          <div class="footerlink"><a href="WaterThermalDiffusivity.html">Thermal Diffusivity</a></div>
          <div class="footerlink"><a href="WaterDissolvedGasDiffusionCoefficients.html">Gasses Dissolved in Water - Diffusion Coefficients</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Thermodyanmics Land</span></h4>
          <div class="footerlink"><a href="ThermoDyanmicsLand.html">Thermodyanmics Land</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Spring Calculators</span></h4>
          <div class="footerlink"><a href="SpringCompressionRound.html">Compression Spring Calculator</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Electronics Calculators</span></h4>
          <div class="footerlink"><a href="ColorBandCalculator.html#resistor.html">Resistor Color Band</a></div>
          <div class="footerlink"><a href="ColorBandCalculator.html#capacitor.html">Capacitor Color Band</a></div>
          <div class="footerlink"><a href="ColorBandCalculator.html#inductor.html">Inductor Color Band</a></div>
          <div class="footerlink"><a href="12VAmperageAndWireLength.html">12V Amperage and Wire Length</a></div>
          <div class="footerlink"><a href="bitmapfileviewer.html">Bitmap File Viewer and Editor</a></div>
          <div class="footerlink"><a href="bitmapfileviewerscreensimulator.html">OLED Sketch Simulator</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">Misc</span></h4>
          <div class="footerlink"><a href="densityAirAltitude.html">Air Pressure from Altitude</a></div>
          <div class="footerlink"><a href="SpecificGravCalculator.html">Temperature Compensated Specific Gravity Calculator</a></div>
          <div class="footerlink"><a href="SpecificGravityExplanation.html">Specific Gravity Explanation</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">MIL-HDBK-5</span></h4>
          <div class="footerlink"><a href="Chapter1(general).html">Chapter 1 (General)</a></div>
          <div class="footerlink"><a href="Chapter2(steel).html">Chapter 2 (Steel)</a></div>
          <div class="footerlink"><a href="Chapter2.1(steel).html" class="ms-4">2.1 (General)</a></div>
          <div class="footerlink"><a href="Chapter2.2(steel).html" class="ms-4">2.2 (Carbon Steels)</a></div>
          <div class="footerlink"><a href="Chapter2.3(steel).html" class="ms-4">2.3 (Low Alloy Steels)</a></div>
          <div class="footerlink"><a href="Chapter2.4(steel).html" class="ms-4">2.4 (Intermediate Alloy Steels) (Steel)</a></div>
          <div class="footerlink"><a href="Chapter2.5(steel).html" class="ms-4">2.5 (High Alloy Steels)</a></div>
          <div class="footerlink"><a href="Chapter2.6(steel).html" class="ms-4">2.6 (Precipitation Hardening Stainless Steel)</a></div>
          <div class="footerlink"><a href="Chapter2.7(steel).html" class="ms-4">2.7 (Austenitic Stainless Steels)</a></div>
          <div class="footerlink"><a href="Chapter3(aluminum).html">Chapter 3 (Aluminum)</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">NSWC-11</span></h4>
          <div class="footerlink"><a href="NSWC-11StaticSeal.html">Static Seal &amp; Gasket Reliability</a></div>
          <div class="footerlink"><a href="NSWC-11Spring.html">Spring Failure Rate</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">O-Rings</span></h4>
          <div class="footerlink"><a href="ParkerORingGlandDimensions4-1.html">Parker Gland Dimensions (Design Table 4-1)</a></div>
          <div class="footerlink"><a href="ParkerORingGlandDimensions4-2.html">Parker Gland Dimensions (Design Table 4-2)</a></div>
          <div class="footerlink"><a href="ParkerORingGlandDimensions4-3.html">Parker Face Seal Glands (Design Chart 4-3)</a></div>
          <div class="footerlink"><a href="ORingSqueezeCalculator.html">Squeeze Calculator (AS4716 App. A)</a></div>
        </div>

        <div class="footerRow">
          <h4 class="FooterRowTitle"><span class="footerflexbox">About</span></h4>
          <div class="footerlink"><a href="about.html">About</a></div>
        </div>

        <div class="footerRow">
          <a href="index.html">
            <div class="logoblock">
              <img class="logo" src="img/blueK.webp" alt="KasperCalcLogo" />
              <h4 class="footerlogo">KasperCalc</h4>
            </div>
          </a>
          <a class="kofi-link" href="https://ko-fi.com/kaspercalc" target="_blank">
            <img class="kofi" src="img/kofi5.webp" height="50px" width="198.63013px" alt="Buy Me a Coffee at ko-fi.com" />
          </a>
        </div>

      </div>
    </div>

    <div class="copyrighttext mt-3">
      <div>Copyright &copy; <span id="kc-copyright-year"></span> KasperCalc</div>
      <div>All Rights Reserved. Powered by <a class="footerkoficoffelink" href="https://ko-fi.com/kaspercalc">Coffee.</a></div>
      <div>
        KasperCalc is not liable for any errors in the calculations or fluid properties. Please check your work.
        <a class="footerkoficoffelink" href="disclaimer.html" target="_blank">Disclaimer.</a>
      </div>
    </div>
  `;

  const yearEl = el.querySelector('#kc-copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
