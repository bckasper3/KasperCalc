
let denseWater = 998; //kg per m^3, for water at 70°F
let result_SG;
let result_Density;
let result_lbin;
let result_kgm;

function calculate() {
  let operation = document.getElementById("operation").value;
  let input1 = parseFloat(document.getElementById("input1").value) || 0;
  let input2 = parseFloat(document.getElementById("input2").value) || 0;

  const fuelHeadCalcCheckbox = document.getElementById('fuelheadcalctoggle');
  const varfuelHeadCalcOption1 = document.getElementById('fuelHeadCalcOption1');
  const varfuelHeadCalcOption2 = document.getElementById('fuelHeadCalcOption2');
  const varfuelHeadCalcOption3 = document.getElementById('fuelHeadCalcOption3');
  const varfuelHeadCalcOption4 = document.getElementById('fuelHeadCalcOption4');
  const varfuelHeadCalcOption5 = document.getElementById('fuelHeadCalcOption5');
  const varfuelHeadCalcOption6 = document.getElementById('fuelHeadCalcOption6');

  const varfuelHeadCalcResult1 = document.getElementById('fuelHeadCalcResult1');
  const varfuelHeadCalcResult2 = document.getElementById('fuelHeadCalcResult2');

  if (input1 == null) { input1 = 0; }
  if (input2 == null) { input2 = 0; }

  if (operation == 'S.G.') {
    result_SG = input2;
  } else if (operation == 'LB / Gal') {
    result_Density = input2;
    result_SG = result_Density*27679.90471*(1/denseWater)*(1/231);
  } else if (operation == 'lbin') {
    result_lbin = input2;
    result_SG = result_lbin*27679.90471*(1/denseWater);
  } else if (operation == 'kgm') {
    result_kgm = input2;
    result_SG = result_kgm/denseWater;
  } else {
    result_SG = 0;
  }

  result_Density = (result_SG*denseWater*(1/27679.90471)*231);
  result_lbin = (result_SG*denseWater*(1/27679.90471));
  result_kgm = (result_SG*denseWater);
  result_SG = result_SG;

  if (fuelHeadCalcCheckbox.checked) {
      //PSI INPUT → Inches of Liquid result
      switch (operation) {
        case "S.G.":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));
          result_InH2O = (result_PSI*result_SG).toFixed(4);
          result_kPa = (input1 * 6.89476).toFixed(4);
          result_inHg = (input1 * 2.03602).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'inline';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
          break;
        case "LB / Gal":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));
          result_InH2O = (result_PSI*result_SG).toFixed(4);
          result_kPa = (input1 * 6.89476).toFixed(4);
          result_inHg = (input1 * 2.03602).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'inline';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
          break;
        case "lbin":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));
          result_InH2O = (result_PSI*result_SG).toFixed(4);
          result_kPa = (input1 * 6.89476).toFixed(4);
          result_inHg = (input1 * 2.03602).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'inline';
          varfuelHeadCalcOption6.style.display = 'none';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
          break;
        case "kgm":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));
          result_InH2O = (result_PSI*result_SG).toFixed(4);
          result_kPa = (input1 * 6.89476).toFixed(4);
          result_inHg = (input1 * 2.03602).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'inline';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
          break;
        case "In. of H20":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));
          result_InH2O = (result_PSI*result_SG).toFixed(4);
          result_kPa = (input1 * 6.89476).toFixed(4);
          result_inHg = (input1 * 2.03602).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
          break;
        default:
          result_SG = "0";
          result_Density = "";
          result_lbin = "";
          result_kgm = "";
          result_InH2O = "";
          result_kPa = "";
          result_inHg = "";
          result_PSI = "";
          varfuelHeadCalcOption1.style.display = 'none';
          varfuelHeadCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'inline';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          varfuelHeadCalcResult1.style.display = 'none';
          varfuelHeadCalcResult2.style.display = 'inline';
        }
    } else {
      //INCHES OF LIQUID INPUT → PSI result
        switch (operation) {
          case "S.G.":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);
            result_kPa = (result_PSI * 6.89476).toFixed(4);
            result_inHg = (result_PSI * 2.03602).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'inline';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
            break;
          case "LB / Gal":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);
            result_kPa = (result_PSI * 6.89476).toFixed(4);
            result_inHg = (result_PSI * 2.03602).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'inline';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
            break;
          case "lbin":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);
            result_kPa = (result_PSI * 6.89476).toFixed(4);
            result_inHg = (result_PSI * 2.03602).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'inline';
            varfuelHeadCalcOption6.style.display = 'none';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
            break;
          case "kgm":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);
            result_kPa = (result_PSI * 6.89476).toFixed(4);
            result_inHg = (result_PSI * 2.03602).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'inline';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
            break;
          case "In. of H20":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);
            result_kPa = (result_PSI * 6.89476).toFixed(4);
            result_inHg = (result_PSI * 2.03602).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
            break;
          default:
            result_SG = "0";
            result_Density = "";
            result_lbin = "";
            result_kgm = "";
            result_InH2O = "";
            result_kPa = "";
            result_inHg = "";
            result_PSI = "";
            varfuelHeadCalcOption1.style.display = 'inline';
            varfuelHeadCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'inline';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            varfuelHeadCalcResult1.style.display = 'inline';
            varfuelHeadCalcResult2.style.display = 'none';
        }
    }
  document.getElementById("result_SG").innerText = result_SG;
  document.getElementById("result_Density").innerText = result_Density;
  document.getElementById("result_lbin").innerText = result_lbin;
  document.getElementById("result_kgm").innerText = result_kgm;
  document.getElementById("result_InH2O").innerText = result_InH2O;
  document.getElementById("result_kPa").innerText = result_kPa;
  document.getElementById("result_inHg").innerText = result_inHg;
  document.getElementById("result_PSI").innerText = result_PSI;
  document.getElementById("result_Densitylbft").innerText = (result_Density*7.48052).toFixed(4);
}

const textElement1 = document.getElementById("text-to-toggle1");
const textElement2 = document.getElementById("text-to-toggle2");
const clickableWord = document.getElementById("clickable-word");

clickableWord.addEventListener("click", function() {
  if (textElement1.style.display === "none") {
    textElement1.style.display = "block";
    textElement2.style.display = "none";
    clickableWord.innerHTML = "<p>*<u>Click here to use density of 999kg/m³</u>*</p>";
    denseWater = 998;
    console.log(denseWater);
    calculate();
  } else {
    textElement1.style.display = "none";
    textElement2.style.display = "block";
    clickableWord.innerHTML = "<p>*<u>Click here to use density of 998kg/m³</u>*</p>";
    denseWater = 999;
    console.log(denseWater);
    calculate();
  }
});

// THE TOGGLE SLIDER FOR THE FUEL HEAD CALCULATOR
const fuelHeadCalcCheckbox = document.getElementById('fuelheadcalctoggle');
// Add an event listener to the checkbox to monitor changes
fuelHeadCalcCheckbox.addEventListener('change', function() {
    calculate();
});

calculate(); //run once when the page loads (yeah yeah yeah event listener on the DOM, whaterver its my own website)
