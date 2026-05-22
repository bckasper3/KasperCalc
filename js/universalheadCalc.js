
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

  if (input1 == null) {
    input1 = 0;
  }
  if (input2 == null) {
    input2 = 0;
  }

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



  // console.log('calculate() is being run');
  // console.log('operation:',operation);
  // console.log('log and jog baby');  
  // console.log('input 1',input1);
  // console.log('input 2',input2);

  // if (fuelheadcalctoggle.checked) {
  //   console.log('CHECKED');
  // } else {
  //   console.log('not CHECKED');
  // };

  if (fuelHeadCalcCheckbox.checked) {
      //PSI CHECK BOX
      switch (operation) {
        case "S.G.":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*result_SG).toFixed(4);      //Rounds to 3 decimal places

          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
          break;
        case "LB / Gal":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*result_SG).toFixed(4);      //Rounds to 3 decimal places 
          
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
          break;
        case "lbin":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*result_SG).toFixed(4);      //Rounds to 3 decimal places
          
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
          break;
        case "kgm":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*result_SG).toFixed(4);      //Rounds to 3 decimal places  
          
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'inline'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
          break;
        case "In. of H20":
          result_PSI = ((1/result_SG)*(1/denseWater)*27679.90471*(input1));    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*result_SG).toFixed(4);      //Rounds to 3 decimal places
          
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          result_PSI = result_PSI.toFixed(4);
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
          break;
        default:
          result_SG = "0";
          result_Density = "";
          result_lbin = "";
          result_kgm = "";

          result_InH2O = "";  
          result_PSI = "";
          varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      
          varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
          varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
        }
    } else {
      //INCHES OF FUEL CHECKBOX
        switch (operation) {
          case "S.G.":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);    //Rounds to 5 decimal places
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);         //Rounds to 3 decimal places

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
            break;
          case "LB / Gal":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);            //Rounds to 3 decimal places

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'inline'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
            break;
          case "lbin":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);            //Rounds to 3 decimal places

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'inline'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
            break;
          case "kgm":
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);            //Rounds to 3 decimal places

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'inline'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
            break;
          case "In. of H20":     
            result_PSI = (result_SG*denseWater*(1/27679.90471)*input1);
            result_InH2O = (result_PSI*(1/(denseWater*(1/27679.90471)))).toFixed(4);           //Rounds to 3 decimal places

            result_SG = result_SG.toFixed(4);
            result_Density = result_Density.toFixed(4);
            result_lbin = result_lbin.toFixed(4);
            result_kgm = result_kgm.toFixed(2);
            result_PSI = result_PSI.toFixed(4);
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
            break;
          default:
            result_SG = "0";
            result_Density = "";
            result_lbin = "";
            result_kgm = "";
            result_InH2O = "";  
            result_PSI = "";
            varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked
            varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
            varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
            varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked

            varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
            varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
        }
    }
  document.getElementById("result_SG").innerText = result_SG;
  document.getElementById("result_Density").innerText = result_Density;
  document.getElementById("result_lbin").innerText = result_lbin;
  document.getElementById("result_kgm").innerText = result_kgm;
  document.getElementById("result_InH2O").innerText = result_InH2O;
  document.getElementById("result_PSI").innerText = result_PSI;
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
const fuelHeadCalcCheckbox = document.getElementById('fuelheadcalctoggle');
// Add an event listener to the checkbox to monitor changes
fuelHeadCalcCheckbox.addEventListener('change', function() { // need to try: click, change, and input
    calculate();
});

calculate(); //run once when the page loads (yeah yeah yeah event listener on the DOM, whaterver its my own website)