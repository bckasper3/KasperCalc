
let denseWater = 998; //kg per m^3, for water at 70°F
let result_SG;
let result_Density;
let result_lbin;
let result_kgm;
let result_inches3sec;
let result_lpm;
let result_ccm;
let result_gpm;

function calculate() {
  let operation = document.getElementById("operation").value;
  let input1 = parseFloat(document.getElementById("input1").value) || 0;
  let input2 = parseFloat(document.getElementById("input2").value) || 0;

  const fuelHeadCalcCheckbox = document.getElementById('PPHtoGPMcheck');
  const varpphgpmCalcOption1 = document.getElementById('pphgpmCalcOption1');
  const varpphgpmCalcOption2 = document.getElementById('pphgpmCalcOption2');
  const varfuelHeadCalcOption3 = document.getElementById('fuelHeadCalcOption3');
  const varfuelHeadCalcOption4 = document.getElementById('fuelHeadCalcOption4');
  const varfuelHeadCalcOption5 = document.getElementById('fuelHeadCalcOption5');
  const varfuelHeadCalcOption6 = document.getElementById('fuelHeadCalcOption6');

  const pphgpmCalcResult1 = document.getElementById('pphgpmCalcResult1');
  const pphgpmCalcResult2 = document.getElementById('pphgpmCalcResult2');

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

  if (fuelHeadCalcCheckbox.checked) {
      //GPM CHECK BOX
      switch (operation) {
        case "S.G.":
          result_gpm = (input1*60*result_SG*denseWater*(1/27679.90471)*(231));
          result_inches3sec = (result_gpm*(1/3.8500177461755)).toFixed(4);
          result_lpm = (result_gpm * 3.78541).toFixed(4);
          result_ccm = (result_gpm * 3785.41).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_gpm = result_gpm.toFixed(4);
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'inline';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
          break;
        case "LB / Gal":
          result_gpm = (input1*60*result_SG*denseWater*(1/27679.90471)*(231));
          result_inches3sec = (result_gpm*(1/3.8500177461755)).toFixed(4);
          result_lpm = (result_gpm * 3.78541).toFixed(4);
          result_ccm = (result_gpm * 3785.41).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_gpm = result_gpm.toFixed(4);
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'inline';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
          break;
        case "lbin":
          result_gpm = (input1*60*result_SG*denseWater*(1/27679.90471)*(231));
          result_inches3sec = (result_gpm*(1/3.8500177461755)).toFixed(4);
          result_lpm = (result_gpm * 3.78541).toFixed(4);
          result_ccm = (result_gpm * 3785.41).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_gpm = result_gpm.toFixed(4);
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'inline';
          varfuelHeadCalcOption6.style.display = 'none';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
          break;
        case "kgm":
          result_gpm = (input1*60*result_SG*denseWater*(1/27679.90471)*(231));
          result_inches3sec = (result_gpm*(1/3.8500177461755)).toFixed(4);
          result_lpm = (result_gpm * 3.78541).toFixed(4);
          result_ccm = (result_gpm * 3785.41).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_gpm = result_gpm.toFixed(4);
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'inline';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
          break;
        case "In. of H20":
          result_gpm = (input1*60*result_SG*denseWater*(1/27679.90471)*(231));
          result_inches3sec = (result_gpm*(1/3.8500177461755)).toFixed(4);
          result_lpm = (result_gpm * 3.78541).toFixed(4);
          result_ccm = (result_gpm * 3785.41).toFixed(4);

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_gpm = result_gpm.toFixed(4);
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'none';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
          break;
        default:
          result_gpm = "0";
          result_inches3sec = "0";
          result_lpm = "0";
          result_ccm = "0";
          varpphgpmCalcOption1.style.display = 'none';
          varpphgpmCalcOption2.style.display = 'inline';
          varfuelHeadCalcOption3.style.display = 'inline';
          varfuelHeadCalcOption4.style.display = 'none';
          varfuelHeadCalcOption5.style.display = 'none';
          varfuelHeadCalcOption6.style.display = 'none';
          pphgpmCalcResult1.style.display = 'none';
          pphgpmCalcResult2.style.display = 'inline';
        }
    } else {
      //PPH CHECK BOX
        switch (operation) {
          case "S.G.":
            result_gpm = (input1*(1/60)*(1/result_SG)*(1/denseWater)*27679.90471*(1/231));
            result_inches3sec = (result_gpm*3.8500177461755).toFixed(4);
            result_lpm = (result_gpm * 3.78541).toFixed(4);
            result_ccm = (result_gpm * 3785.41).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_gpm = result_gpm.toFixed(4);
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'inline';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
            break;
          case "LB / Gal":
            result_gpm = (input1*(1/60)*(1/result_SG)*(1/denseWater)*27679.90471*(1/231));
            result_inches3sec = (result_gpm*3.8500177461755).toFixed(4);
            result_lpm = (result_gpm * 3.78541).toFixed(4);
            result_ccm = (result_gpm * 3785.41).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_gpm = result_gpm.toFixed(4);
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'inline';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
            break;
          case "lbin":
            result_gpm = (input1*(1/60)*(1/result_SG)*(1/denseWater)*27679.90471*(1/231));
            result_inches3sec = (result_gpm*3.8500177461755).toFixed(4);
            result_lpm = (result_gpm * 3.78541).toFixed(4);
            result_ccm = (result_gpm * 3785.41).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_gpm = result_gpm.toFixed(4);
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'inline';
            varfuelHeadCalcOption6.style.display = 'none';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
            break;
          case "kgm":
            result_gpm = (input1*(1/60)*(1/result_SG)*(1/denseWater)*27679.90471*(1/231));
            result_inches3sec = (result_gpm*3.8500177461755).toFixed(4);
            result_lpm = (result_gpm * 3.78541).toFixed(4);
            result_ccm = (result_gpm * 3785.41).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_gpm = result_gpm.toFixed(4);
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'inline';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
            break;
          case "In. of H20":
            result_gpm = (input1*(1/60)*(1/result_SG)*(1/denseWater)*27679.90471*(1/231));
            result_inches3sec = (result_gpm*3.8500177461755).toFixed(4);
            result_lpm = (result_gpm * 3.78541).toFixed(4);
            result_ccm = (result_gpm * 3785.41).toFixed(4);

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_gpm = result_gpm.toFixed(4);
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'none';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
            break;
          default:
            result_gpm = "0";
            result_inches3sec = "0";
            result_lpm = "0";
            result_ccm = "0";
            varpphgpmCalcOption1.style.display = 'inline';
            varpphgpmCalcOption2.style.display = 'none';
            varfuelHeadCalcOption3.style.display = 'inline';
            varfuelHeadCalcOption4.style.display = 'none';
            varfuelHeadCalcOption5.style.display = 'none';
            varfuelHeadCalcOption6.style.display = 'none';
            pphgpmCalcResult1.style.display = 'inline';
            pphgpmCalcResult2.style.display = 'none';
        }
    }

    if (input1 == 0 || input1 == null) {
      result_gpm = (0).toFixed(4);
      result_inches3sec = (0).toFixed(4);
      result_lpm = (0).toFixed(4);
      result_ccm = (0).toFixed(4);
    }

  document.getElementById("result_SG").innerText = result_SG;
  document.getElementById("result_Density").innerText = result_Density;
  document.getElementById("result_lbin").innerText = result_lbin;
  document.getElementById("result_kgm").innerText = result_kgm;
  document.getElementById("result_gpm").innerText = result_gpm;
  document.getElementById("result_inches3sec").innerText = result_inches3sec;
  document.getElementById("result_lpm").innerText = result_lpm;
  document.getElementById("result_ccm").innerText = result_ccm;
  document.getElementById("result_Densitylbft").innerText = (result_Density*7.48052).toFixed(4);
}

const textElement1 = document.getElementById("text-to-toggle1");
const textElement2 = document.getElementById("text-to-toggle2");
const clickableWord = document.getElementById("clickable-word");

clickableWord.addEventListener("click", function() {
  // Change the variable when the word is clicked

  if (textElement1.style.display === "none") {
    // If hidden, show the text
    textElement1.style.display = "block";
    textElement2.style.display = "none";
    clickableWord.innerHTML = "<p>*<u>Click here to use density of 999kg/m³</u>*</p>"; // Change button text to "Show"
    denseWater = 998; //kg per m^3, for water at 60°F
    console.log(denseWater);
    calculate();
} else {
    // If visible, hide the text
    textElement1.style.display = "none";
    textElement2.style.display = "block";
    clickableWord.innerHTML = "<p>*<u>Click here to use density of 998kg/m³</u>*</p>"; // Change button text to "Show"
    denseWater = 999; //kg per m^3, for water at 70°F
    console.log(denseWater);
    calculate();
}
});

// THE TOGGLE SLIDER FOR THE FUEL HEAD CALCULATOR
const fuelHeadCalcCheckbox = document.getElementById('PPHtoGPMcheck');
// Add an event listener to the checkbox to monitor changes
fuelHeadCalcCheckbox.addEventListener('change', function() { // need to try: click, change, and input
    calculate();
});

calculate(); //run once when the page loads (yeah yeah yeah event listener on the DOM, whaterver its my own website)
