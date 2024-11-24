
function calculate() {
  const operation = document.getElementById("operation").value;
  const input1 = parseFloat(document.getElementById("input1").value) || 0;
  let result_PSI;

  const SG_JetA = 0.8075;            //at 70°F
  const SG_JetB = 0.7935;
  const SG_JP_4 = 0.775;
  const SG_JP_5 = 0.810;
  const SG_JP_8 = 0.8075;
  const SG_AvGas = 0.7240;
  const SG_StoddardSolvent = 0.790;

  let Density_JetA = SG_JetA*8.3290; //Pounds per Gallon at 70°F
  let Density_JetB = SG_JetB*8.3290;
  let Density_JP_4 = SG_JP_4*8.3290;
  let Density_JP_5 = SG_JP_5*8.3290;
  let Density_JP_8 = SG_JP_8*8.3290;
  let Density_AvGas = SG_AvGas*8.3290;
  let Density_StoddardSolvent = SG_StoddardSolvent*8.3290;


  if (fuelHeadCalcCheckbox.checked) {
    //PSI CHECK BOX
    switch (operation) {
      case "JetA":
        result_SG = SG_JetA.toFixed(4);
        result_Density = Density_JetA.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);      //Rounds to 3 decimal places
        result_PSI = (input1/(SG_JetA*0.0360912)).toFixed(5);    //Rounds to 5 decimal places
        break;
      case "JetB":
        result_SG = SG_JetB.toFixed(4);
        result_Density = Density_JetB.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);       
        result_PSI = (input1/(SG_JetB*0.0360912)).toFixed(5);
        break;
      case "JP4":
        result_SG = SG_JP_4.toFixed(4);
        result_Density = Density_JP_4.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);       
        result_PSI = (input1/(SG_JP_4*0.0360912)).toFixed(5);
        break;
      case "JP5":
        result_SG = SG_JP_5.toFixed(4);
        result_Density = Density_JP_5.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);       
        result_PSI = (input1/(SG_JP_5*0.0360912)).toFixed(5);
        break;
      case "JP8":
        result_SG = SG_JP_8.toFixed(4);
        result_Density = Density_JP_8.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);       
        result_PSI = (input1/(SG_JP_8*0.0360912)).toFixed(5);
        break;
      case "AvGas":
        result_SG = SG_AvGas.toFixed(4);
        result_Density = Density_AvGas.toFixed(4);
        result_InH2O = (input1/0.0360912).toFixed(4);       
        result_PSI = (input1/(SG_AvGas*0.0360912)).toFixed(5);
        break;
      case "StoddardSolvent":
          result_SG = SG_StoddardSolvent.toFixed(4);
          result_Density = Density_StoddardSolvent.toFixed(4);
          result_InH2O = (input1/0.0360912).toFixed(4);       
          result_PSI = (input1/(SG_StoddardSolvent*0.0360912)).toFixed(5);
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
          result_SG = SG_JetA.toFixed(4);
          result_Density = Density_JetA.toFixed(4);
          result_InH2O = (input1*SG_JetA).toFixed(4);           //Rounds to 3 decimal places
          result_PSI = ((input1*SG_JetA)*0.0360912).toFixed(5);    //Rounds to 5 decimal places
          break;
        case "JetB":
          result_SG = SG_JetB.toFixed(4);
          result_Density = Density_JetB.toFixed(4);
          result_InH2O = (input1*SG_JetB).toFixed(4);       
          result_PSI = ((input1*SG_JetB)*0.0360912).toFixed(5);
          break;
        case "JP4":
          result_SG = SG_JP_4.toFixed(4);
          result_Density = Density_JP_4.toFixed(4);
          result_InH2O = (input1*SG_JP_4).toFixed(4);       
          result_PSI = ((input1*SG_JP_4)*0.0360912).toFixed(5);
          break;
        case "JP5":
          result_SG = SG_JP_5.toFixed(4);
          result_Density = Density_JP_5.toFixed(4);
          result_InH2O = (input1*SG_JP_5).toFixed(4);       
          result_PSI = ((input1*SG_JP_5)*0.0360912).toFixed(5);
          break;
        case "JP8":
          result_SG = SG_JP_8.toFixed(4);
          result_Density = Density_JP_8.toFixed(4);
          result_InH2O = (input1*SG_JP_8).toFixed(4);       
          result_PSI = ((input1*SG_JP_8)*0.0360912).toFixed(5);
          break;
        case "AvGas":
          result_SG = SG_AvGas.toFixed(4);
          result_Density = Density_AvGas.toFixed(4);
          result_InH2O = (input1*SG_AvGas).toFixed(4);       
          result_PSI = ((input1*SG_AvGas)*0.0360912).toFixed(5);
          break;
        case "StoddardSolvent":
            result_SG = SG_StoddardSolvent.toFixed(4);
            result_Density = Density_StoddardSolvent.toFixed(4);
            result_InH2O = (input1*SG_StoddardSolvent).toFixed(4);       
            result_PSI = ((input1*SG_StoddardSolvent)*0.0360912).toFixed(5);
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
}

function updateCalculator() {
  calculate(); // Update result when operation changes
}


// THE TOGGLE SLIDER FOR THE FUEL HEAD CALCULATOR
const fuelHeadCalcCheckbox = document.getElementById('fuelheadcalctoggle');
const varfuelHeadCalcOption1 = document.getElementById('fuelHeadCalcOption1');
const varfuelHeadCalcOption2 = document.getElementById('fuelHeadCalcOption2');
const varfuelHeadCalcResult1 = document.getElementById('fuelHeadCalcResult1');
const varfuelHeadCalcResult2 = document.getElementById('fuelHeadCalcResult2');

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

