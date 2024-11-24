function calculate1() {
  const operation1 = document.getElementById("operation1").value;
  const input2 = parseFloat(document.getElementById("input2").value) || 0;
  let result_gpm;

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

if (varPPHtoGPMcheck.checked) {
  //GPM TO PPH CHECK BOX
  console.log('event listener function');
  switch (operation1) {
    case "JetA":
      result_SG = SG_JetA.toFixed(4);
      result_Density = Density_JetA.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);      //Rounds to 3 decimal places
      result_gpm = (input2/(SG_JetA*0.0360912)).toFixed(5);    //Rounds to 5 decimal places
      break;
    case "JetB":
      result_SG = SG_JetB.toFixed(4);
      result_Density = Density_JetB.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);       
      result_gpm = (input2/(SG_JetB*0.0360912)).toFixed(5);
      break;
    case "JP4":
      result_SG = SG_JP_4.toFixed(4);
      result_Density = Density_JP_4.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);       
      result_gpm = (input2/(SG_JP_4*0.0360912)).toFixed(5);
      break;
    case "JP5":
      result_SG = SG_JP_5.toFixed(4);
      result_Density = Density_JP_5.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);       
      result_gpm = (input2/(SG_JP_5*0.0360912)).toFixed(5);
      break;
    case "JP8":
      result_SG = SG_JP_8.toFixed(4);
      result_Density = Density_JP_8.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);       
      result_gpm = (input2/(SG_JP_8*0.0360912)).toFixed(5);
      break;
    case "AvGas":
      result_SG = SG_AvGas.toFixed(4);
      result_Density = Density_AvGas.toFixed(4);
      result_inches3sec = (input2/0.0360912).toFixed(4);       
      result_gpm = (input2/(SG_AvGas*0.0360912)).toFixed(5);
      break;
    case "StoddardSolvent":
        result_SG = SG_StoddardSolvent.toFixed(4);
        result_Density = Density_StoddardSolvent.toFixed(4);
        result_inches3sec = (input2/0.0360912).toFixed(4);       
        result_gpm = (input2/(SG_StoddardSolvent*0.0360912)).toFixed(5);
        break;      
    default:
      result_SG = "";
      result_Density = "";
      result_inches3sec = "";  
      result_gpm = "";
    }
} else {
  //INCHES OF FUEL CHECKBOX
    switch (operation1) {
      case "JetA":
        result_SG = SG_JetA.toFixed(4);
        result_Density = Density_JetA.toFixed(4);
        result_inches3sec = (input2*SG_JetA).toFixed(4);           //Rounds to 3 decimal places
        result_gpm = ((input2*SG_JetA)*0.0360912).toFixed(5);    //Rounds to 5 decimal places
        break;
      case "JetB":
        result_SG = SG_JetB.toFixed(4);
        result_Density = Density_JetB.toFixed(4);
        result_inches3sec = (input2*SG_JetB).toFixed(4);       
        result_gpm = ((input2*SG_JetB)*0.0360912).toFixed(5);
        break;
      case "JP4":
        result_SG = SG_JP_4.toFixed(4);
        result_Density = Density_JP_4.toFixed(4);
        result_inches3sec = (input2*SG_JP_4).toFixed(4);       
        result_gpm = ((input2*SG_JP_4)*0.0360912).toFixed(5);
        break;
      case "JP5":
        result_SG = SG_JP_5.toFixed(4);
        result_Density = Density_JP_5.toFixed(4);
        result_inches3sec = (input2*SG_JP_5).toFixed(4);       
        result_gpm = ((input2*SG_JP_5)*0.0360912).toFixed(5);
        break;
      case "JP8":
        result_SG = SG_JP_8.toFixed(4);
        result_Density = Density_JP_8.toFixed(4);
        result_inches3sec = (input2*SG_JP_8).toFixed(4);       
        result_gpm = ((input2*SG_JP_8)*0.0360912).toFixed(5);
        break;
      case "AvGas":
        result_SG = SG_AvGas.toFixed(4);
        result_Density = Density_AvGas.toFixed(4);
        result_inches3sec = (input2*SG_AvGas).toFixed(4);       
        result_gpm = ((input2*SG_AvGas)*0.0360912).toFixed(5);
        break;
      case "StoddardSolvent":
          result_SG = SG_StoddardSolvent.toFixed(4);
          result_Density = Density_StoddardSolvent.toFixed(4);
          result_inches3sec = (input2*SG_StoddardSolvent).toFixed(4);       
          result_gpm = ((input2*SG_StoddardSolvent)*0.0360912).toFixed(5);
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
  console.log('event listener in the slider');
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
