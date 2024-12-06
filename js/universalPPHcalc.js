function calculate1() {
  const operation1 = document.getElementById("operation1").value;
  const input1 = parseFloat(document.getElementById("input1").value) || 0;
  const input2 = parseFloat(document.getElementById("input2").value) || 0;

  console.log(input1);
  console.log(input2);
  let result_gpm;

if (varPPHtoGPMcheck.checked) {
  //GPM TO PPH CHECK BOX
  switch (operation1) {
    case "JetA":
      result_SG = SG_JetA.toFixed(4);
      result_Density = Density_JetA.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);      //Rounds to 3 decimal places
      result_gpm = (input1*Density_JetA*60).toFixed(5);    //Rounds to 5 decimal places
      break;
    case "JetB":
      result_SG = SG_JetB.toFixed(4);
      result_Density = Density_JetB.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);       
      result_gpm = (input1*Density_JetB*60).toFixed(5);
      break;
    case "JP4":
      result_SG = SG_JP_4.toFixed(4);
      result_Density = Density_JP_4.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);       
      result_gpm = (input1*Density_JP_4*60).toFixed(5);
      break;
    case "JP5":
      result_SG = SG_JP_5.toFixed(4);
      result_Density = Density_JP_5.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);       
      result_gpm = (input1*Density_JP_5*60).toFixed(5);
      break;
    case "JP8":
      result_SG = SG_JP_8.toFixed(4);
      result_Density = Density_JP_8.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);       
      result_gpm = (input1*Density_JP_8*60).toFixed(5);
      break;
    case "AvGas":
      result_SG = SG_AvGas.toFixed(4);
      result_Density = Density_AvGas.toFixed(4);
      result_inches3sec = (input1*3.85).toFixed(4);       
      result_gpm = (input1*Density_AvGas*60).toFixed(5);
      break;
    case "StoddardSolvent":
        result_SG = SG_StoddardSolvent.toFixed(4);
        result_Density = Density_StoddardSolvent.toFixed(4);
        result_inches3sec = (input1*3.85).toFixed(4);       
        result_gpm = (input1*Density_StoddardSolvent*60).toFixed(5);
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
        result_inches3sec = ((input1*231)/(3600*Density_JetA)).toFixed(4);           //Rounds to 3 decimal places
        result_gpm = (input1/(Density_JetA*60)).toFixed(5);    //Rounds to 5 decimal places
        break;
      case "JetB":
        result_SG = SG_JetB.toFixed(4);
        result_Density = Density_JetB.toFixed(4);
        result_inches3sec = ((input1*231)/(3600*Density_JetB)).toFixed(4);       
        result_gpm = (input1/(Density_JetB*60)).toFixed(5);
        break;
      case "JP4":
        result_SG = SG_JP_4.toFixed(4);
        result_Density = Density_JP_4.toFixed(4);
        result_inches3sec = ((input1*231)/(3600*Density_JP_4)).toFixed(4);       
        result_gpm = (input1/(Density_JP_4*60)).toFixed(5);
        break;
      case "JP5":
        result_SG = SG_JP_5.toFixed(4);
        result_Density = Density_JP_5.toFixed(4);
        result_inches3sec = ((input1*231)/(3600*Density_JP_5)).toFixed(4);       
        result_gpm = (input1/(Density_JP_5*60)).toFixed(5);
        break;
      case "JP8":
        result_SG = SG_JP_8.toFixed(4);
        result_Density = Density_JP_8.toFixed(4);
        result_inches3sec = ((input1*231)/(3600*Density_JP_8)).toFixed(4);       
        result_gpm = (input1/(Density_JP_8*60)).toFixed(5);
        break;
      case "AvGas":
        result_SG = SG_AvGas.toFixed(4);
        result_Density = Density_AvGas.toFixed(4);
        result_inches3sec = ((input1*231)/(3600*Density_AvGas)).toFixed(4);       
        result_gpm = (input1/(Density_AvGas*60)).toFixed(5);
        break;
      case "StoddardSolvent":
          result_SG = SG_StoddardSolvent.toFixed(4);
          result_Density = Density_StoddardSolvent.toFixed(4);
          result_inches3sec = ((input1*231)/(3600*Density_StoddardSolvent)).toFixed(4);       
          result_gpm = (input1/(Density_StoddardSolvent*60)).toFixed(5);
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
}

function updateCalculator1() {
calculate1(); // Update result when operation changes
}


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
    calculate1();
  } else {
    varpphgpmCalcOption1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcOption2.style.display = 'none'; // Hide element when unchecked

    varpphgpmCalcResult1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcResult2.style.display = 'none'; // Hide element when unchecked
    calculate1();
  }
});

vardropdowncheck.addEventListener('change', function() { // need to try: click, change, and input
  if (varPPHtoGPMcheck.checked) {
    varpphgpmCalcOption1.style.display = 'none'; // Show element when checked
    varpphgpmCalcOption2.style.display = 'inline'; // Show element when unchecked

    varpphgpmCalcResult1.style.display = 'none'; // Show element when checked
    varpphgpmCalcResult2.style.display = 'inline'; // Show element when unchecked
    calculate1();
  } else {
    varpphgpmCalcOption1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcOption2.style.display = 'none'; // Hide element when unchecked

    varpphgpmCalcResult1.style.display = 'inline'; // Hide element when unchecked
    varpphgpmCalcResult2.style.display = 'none'; // Hide element when unchecked
    calculate1();
  }
});
