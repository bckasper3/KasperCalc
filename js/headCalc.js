

let denseWater = 998; //kg per m^3, for water at 70°F
const SG_JetA = 0.80884;            //at 70°F
const SG_JetB = 0.76071;
const SG_JP_4 = 0.76071;
const SG_JP_5 = 0.81585;
const SG_JP_8 = 0.80884;
const SG_AvGas = 0.69994;
const SG_StoddardSolvent = 0.78156;


function calculate() {
  const operation = document.getElementById("operation").value;
  const input1 = parseFloat(document.getElementById("input1").value) || 0;
  let result_PSI;

  let Density_JetA = SG_JetA*denseWater*(1/27679.904719)*231;    //Pounds per Gallon at 70°F
  let Density_JetB = SG_JetB*denseWater*(1/27679.904719)*231;    //Pounds per Gallon at 70°F
  let Density_JP_4 = SG_JP_4*denseWater*(1/27679.904719)*231;    //Pounds per Gallon at 70°F
  let Density_JP_5 = SG_JP_5*denseWater*(1/27679.904719)*231;    //Pounds per Gallon at 70°F
  let Density_JP_8 = SG_JP_8*denseWater*(1/27679.904719)*231;    //Pounds per Gallon at 70°F
  let Density_AvGas = SG_AvGas*denseWater*(1/27679.904719)*231;  //Pounds per Gallon at 70°F
  let Density_StoddardSolvent = SG_StoddardSolvent*denseWater*(1/27679.904719)*231; //Pounds per Gallon at 70°F


  if (fuelHeadCalcCheckbox.checked) {
    //PSI CHECK BOX
    switch (operation) {
      case "JetA":
        result_PSI = (input1*(27679.904719/(SG_JetA*denseWater)));    //Rounds to 5 decimal places
        result_InH2O = (input1*27.7076).toFixed(4); 
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_JetA.toFixed(4);
        result_Density = Density_JetA.toFixed(4);
        break;
      case "JetB":
        result_PSI = (input1*(27679.904719/(SG_JetB*denseWater)));
        result_InH2O = (input1*27.7076).toFixed(4); 
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_JetB.toFixed(4);
        result_Density = Density_JetB.toFixed(4); 
        break;
      case "JP4":
        result_PSI = (input1*(27679.904719/(SG_JP_4*denseWater)));
        result_InH2O = (input1*27.7076).toFixed(4); 
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_JP_4.toFixed(4);
        result_Density = Density_JP_4.toFixed(4);
        break;
      case "JP5":
        result_PSI = (input1*(27679.904719/(SG_JP_5*denseWater)));
        result_InH2O = (input1*27.7076).toFixed(4);   
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_JP_5.toFixed(4);
        result_Density = Density_JP_5.toFixed(4);  
        break;
      case "JP8":
        result_PSI = (input1*(27679.904719/(SG_JP_8*denseWater)));
        result_InH2O = (input1*27.7076).toFixed(4); 
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_JP_8.toFixed(4);
        result_Density = Density_JP_8.toFixed(4);
        break;
      case "AvGas":
        result_PSI = (input1*(27679.904719/(SG_AvGas*denseWater)));
        result_InH2O = (input1*27.7076).toFixed(4); 
        result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
        result_SG = SG_AvGas.toFixed(4);
        result_Density = Density_AvGas.toFixed(4);   
        break;
      case "StoddardSolvent":    
          result_PSI = (input1*(27679.904719/(SG_StoddardSolvent*denseWater)));
          result_InH2O = (input1*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_StoddardSolvent.toFixed(4);
          result_Density = Density_StoddardSolvent.toFixed(4);      
          break;      
      default:
        result_SG = "";
        result_Density = "";
        result_InH2O = "";  
        result_PSI = "";
      }
  } else {
    //INCHES OF FUEL CHECKBOX
      switch (operation) {
        case "JetA":
          result_PSI = (SG_JetA*denseWater*(1/27679.904719)*input1);    //Rounds to 5 decimal places
          result_InH2O = (result_PSI*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_JetA.toFixed(4);
          result_Density = Density_JetA.toFixed(4);
          break;
        case "JetB":
          result_PSI = (SG_JetB*denseWater*(1/27679.904719)*input1);
          result_InH2O = (result_PSI*27.7076).toFixed(4);  
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_JetB.toFixed(4);
          result_Density = Density_JetB.toFixed(4);    
          break;
        case "JP4":
          result_PSI = (SG_JP_4*denseWater*(1/27679.904719)*input1);
          result_InH2O = (result_PSI*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_JP_4.toFixed(4);
          result_Density = Density_JP_4.toFixed(4);  
          break;
        case "JP5":
          result_PSI = (SG_JP_5*denseWater*(1/27679.904719)*input1);
          result_InH2O = (result_PSI*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_JP_5.toFixed(4);
          result_Density = Density_JP_5.toFixed(4);   
          break;
        case "JP8":
          result_PSI = (SG_JP_8*denseWater*(1/27679.904719)*input1);
          result_InH2O = (result_PSI*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_JP_8.toFixed(4);
          result_Density = Density_JP_8.toFixed(4);
          break;
        case "AvGas":
          result_PSI = (SG_AvGas*denseWater*(1/27679.904719)*input1);
          result_InH2O = (result_PSI*27.7076).toFixed(4); 
          result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
          result_SG = SG_AvGas.toFixed(4);
          result_Density = Density_AvGas.toFixed(4);
          break;
        case "StoddardSolvent":
            result_PSI = (SG_StoddardSolvent*denseWater*(1/27679.904719)*input1);
            result_InH2O = (result_PSI*27.7076).toFixed(4);  
            result_PSI = result_PSI.toFixed(5);    //Rounds to 5 decimal places
            result_SG = SG_StoddardSolvent.toFixed(4);
            result_Density = Density_StoddardSolvent.toFixed(4);  
            break;      
        default:
          result_SG = "";
          result_Density = "";
          result_InH2O = "";  
          result_PSI = "";
      }
  }
  document.getElementById("result_SG").innerText = result_SG;
  document.getElementById("result_Density").innerText = result_Density;
  document.getElementById("result_InH2O").innerText = result_InH2O;
  document.getElementById("result_PSI").innerText = result_PSI;
  document.getElementById("result_Densitylbft").innerText = (result_Density*7.48052).toFixed(4);
}

// THE TOGGLE SLIDER FOR THE FUEL HEAD CALCULATOR
const fuelHeadCalcCheckbox = document.getElementById('fuelheadcalctoggle');
const varfuelHeadCalcOption1 = document.getElementById('fuelHeadCalcOption1');
const varfuelHeadCalcOption2 = document.getElementById('fuelHeadCalcOption2');
const varfuelHeadCalcResult1 = document.getElementById('fuelHeadCalcResult1');
const varfuelHeadCalcResult2 = document.getElementById('fuelHeadCalcResult2');



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


// Add an event listener to the checkbox to monitor changes
fuelHeadCalcCheckbox.addEventListener('change', function() { // need to try: click, change, and input
    if (fuelHeadCalcCheckbox.checked) {
      varfuelHeadCalcOption1.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption2.style.display = 'inline'; // Show element when unchecked

      varfuelHeadCalcResult1.style.display = 'none'; // Show element when checked
      varfuelHeadCalcResult2.style.display = 'inline'; // Show element when unchecked
      calculate();
    } else {
      varfuelHeadCalcOption1.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcOption2.style.display = 'none'; // Hide element when unchecked

      varfuelHeadCalcResult1.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcResult2.style.display = 'none'; // Hide element when unchecked
      calculate();
    }
});

calculate()