
let denseWater = 998; //kg per m^3, for water at 70°F
const SG_JetA = 0.8075;            //at 70°F
const SG_JetB = 0.7935;
const SG_JP_4 = 0.775;
const SG_JP_5 = 0.810;
const SG_JP_8 = 0.8075;
const SG_AvGas = 0.7240;
const SG_StoddardSolvent = 0.790;


function calculate() {
  const operation1 = document.getElementById("operation1").value;
  const input2 = parseFloat(document.getElementById("input2").value) || 0;
  let result_gpm;

  let Density_JetA = SG_JetA*denseWater*(231/27679.90471); //Pounds per Gallon at 70°F
  let Density_JetB = SG_JetB*denseWater*(231/27679.90471);
  let Density_JP_4 = SG_JP_4*denseWater*(231/27679.90471);
  let Density_JP_5 = SG_JP_5*denseWater*(231/27679.90471);
  let Density_JP_8 = SG_JP_8*denseWater*(231/27679.90471);
  let Density_AvGas = SG_AvGas*denseWater*(231/27679.90471);
  let Density_StoddardSolvent = SG_StoddardSolvent*denseWater*(231/27679.90471);

if (varPPHtoGPMcheck.checked) {
  //GPM TO PPH CHECK BOX
  switch (operation1) {
    case "JetA":
      result_SG = SG_JetA.toFixed(4);
      result_Density = Density_JetA.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);      //Rounds to 3 decimal places
      result_gpm = (input2*Density_JetA*60).toFixed(5);    //Rounds to 5 decimal places
      break;
    case "JetB":
      result_SG = SG_JetB.toFixed(4);
      result_Density = Density_JetB.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);       
      result_gpm = (input2*Density_JetB*60).toFixed(5);
      break;
    case "JP4":
      result_SG = SG_JP_4.toFixed(4);
      result_Density = Density_JP_4.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);       
      result_gpm = (input2*Density_JP_4*60).toFixed(5);
      break;
    case "JP5":
      result_SG = SG_JP_5.toFixed(4);
      result_Density = Density_JP_5.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);       
      result_gpm = (input2*Density_JP_5*60).toFixed(5);
      break;
    case "JP8":
      result_SG = SG_JP_8.toFixed(4);
      result_Density = Density_JP_8.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);       
      result_gpm = (input2*Density_JP_8*60).toFixed(5);
      break;
    case "AvGas":
      result_SG = SG_AvGas.toFixed(4);
      result_Density = Density_AvGas.toFixed(4);
      result_inches3sec = (input2*3.85).toFixed(4);       
      result_gpm = (input2*Density_AvGas*60).toFixed(5);
      break;
    case "StoddardSolvent":
        result_SG = SG_StoddardSolvent.toFixed(4);
        result_Density = Density_StoddardSolvent.toFixed(4);
        result_inches3sec = (input2*3.85).toFixed(4);       
        result_gpm = (input2*Density_StoddardSolvent*60).toFixed(5);
        break;      
    default:
      result_SG = "";
      result_Density = "";
      result_inches3sec = "";  
      result_gpm = "";
    }
} else {
  //PPH TO GPM CHECKBOX
    switch (operation1) {
      case "JetA":
        result_SG = SG_JetA.toFixed(4);
        result_Density = Density_JetA.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_JetA)).toFixed(4);           //Rounds to 3 decimal places
        result_gpm = (input2/(Density_JetA*60)).toFixed(5);    //Rounds to 5 decimal places
        break;
      case "JetB":
        result_SG = SG_JetB.toFixed(4);
        result_Density = Density_JetB.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_JetB)).toFixed(4);       
        result_gpm = (input2/(Density_JetB*60)).toFixed(5);
        break;
      case "JP4":
        result_SG = SG_JP_4.toFixed(4);
        result_Density = Density_JP_4.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_JP_4)).toFixed(4);       
        result_gpm = (input2/(Density_JP_4*60)).toFixed(5);
        break;
      case "JP5":
        result_SG = SG_JP_5.toFixed(4);
        result_Density = Density_JP_5.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_JP_5)).toFixed(4);       
        result_gpm = (input2/(Density_JP_5*60)).toFixed(5);
        break;
      case "JP8":
        result_SG = SG_JP_8.toFixed(4);
        result_Density = Density_JP_8.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_JP_8)).toFixed(4);       
        result_gpm = (input2/(Density_JP_8*60)).toFixed(5);
        break;
      case "AvGas":
        result_SG = SG_AvGas.toFixed(4);
        result_Density = Density_AvGas.toFixed(4);
        result_inches3sec = ((input2*231)/(3600*Density_AvGas)).toFixed(4);       
        result_gpm = (input2/(Density_AvGas*60)).toFixed(5);
        break;
      case "StoddardSolvent":
          result_SG = SG_StoddardSolvent.toFixed(4);
          result_Density = Density_StoddardSolvent.toFixed(4);
          result_inches3sec = ((input2*231)/(3600*Density_StoddardSolvent)).toFixed(4);       
          result_gpm = (input2/(Density_StoddardSolvent*60)).toFixed(5);
          break;      
      default:
        result_SG = "";
        result_Density = "";
        result_inches3sec = "";  
        result_gpm = "";
    }
}

document.getElementById("result_SG").innerText = result_SG;
document.getElementById("result_Density").innerText = result_Density;
document.getElementById("result_inches3sec").innerText = result_inches3sec;
document.getElementById("result_gpm").innerText = result_gpm;
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
const varPPHtoGPMcheck = document.getElementById('PPHtoGPMcheck');
const varpphgpmCalcOption1 = document.getElementById('pphgpmCalcOption1');
const varpphgpmCalcOption2 = document.getElementById('pphgpmCalcOption2');
const varpphgpmCalcResult1 = document.getElementById('pphgpmCalcResult1');
const varpphgpmCalcResult2 = document.getElementById('pphgpmCalcResult2');

// Add an event listener to the checkbox to monitor changes
varPPHtoGPMcheck.addEventListener('change', function() { // need to try: click, change, and input
  if (varPPHtoGPMcheck.checked) {
    varpphgpmCalcOption1.style.display = 'none'; // Show element when checked
    varpphgpmCalcOption2.style.display = 'inline'; // Show element when unchecked

    varpphgpmCalcResult1.style.display = 'none'; // Show element when checked
    varpphgpmCalcResult2.style.display = 'inline'; // Show element when unchecked
    calculate();
  } else {
    varpphgpmCalcOption1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcOption2.style.display = 'none'; // Hide element when unchecked

    varpphgpmCalcResult1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcResult2.style.display = 'none'; // Hide element when unchecked
    calculate();
  }
});

calculate()