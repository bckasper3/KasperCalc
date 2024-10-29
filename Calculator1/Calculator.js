
function calculate() {
  const operation = document.getElementById("operation").value;
  const input1 = parseFloat(document.getElementById("input1").value) || 0;
  let result_PSI;

  const SG_JetA = 0.875;            //at 70°F
  const SG_JetB = 0.8;                  //not correct value
  const SG_JP_4 = 0.885;                //not correct value
  const SG_JP_5 = 0.9;                  //not correct value
  const SG_JP_8 = 0.895;                //not correct value
  const SG_StoddardSolvent = 0.50;      //not correct value

  let Density_JetA = SG_JetA*8.3290; //Pounds per Gallon at 70°F
  let Density_JetB = SG_JetB*8.3290;
  let Density_JP_4 = SG_JP_4*8.3290;
  let Density_JP_5 = SG_JP_5*8.3290;
  let Density_JP_8 = SG_JP_8*8.3290;
  let Density_StoddardSolvent = SG_StoddardSolvent*8.3290;

  switch (operation) {
    case "JetA":
      result_SG = SG_JetA.toFixed(4);
      result_Density = Density_JetA.toFixed(4);
      result_InH2O = (input1/SG_JetA).toFixed(3);           //Rounds to 3 decimal places
      result_PSI = ((input1/SG_JetA)*0.0361).toFixed(5);    //Rounds to 5 decimal places
      break;
    case "JetB":
      result_SG = SG_JetB.toFixed(4);
      result_Density = Density_JetB.toFixed(4);
      result_InH2O = (input1/SG_JetB).toFixed(3);       
      result_PSI = ((input1/SG_JetB)*0.0361).toFixed(5);
      break;
    case "JP4":
      result_SG = SG_JP_4.toFixed(4);
      result_Density = Density_JP_4.toFixed(4);
      result_InH2O = (input1/SG_JP_4).toFixed(3);       
      result_PSI = ((input1/SG_JP_4)*0.0361).toFixed(5);
      break;
    case "JP5":
      result_SG = SG_JP_5.toFixed(4);
      result_Density = Density_JP_5.toFixed(4);
      result_InH2O = (input1/SG_JP_5).toFixed(3);       
      result_PSI = ((input1/SG_JP_5)*0.0361).toFixed(5);
      break;
    case "JP8":
      result_SG = SG_JP_8.toFixed(4);
      result_Density = Density_JP_8.toFixed(4);
      result_InH2O = (input1/SG_JP_8).toFixed(3);       
      result_PSI = ((input1/SG_JP_8)*0.0361).toFixed(5);
      break;
    case "StoddardSolvent":
        result_SG = SG_StoddardSolvent.toFixed(4);
        result_Density = Density_StoddardSolvent.toFixed(4);
        result_InH2O = (input1/SG_StoddardSolvent).toFixed(3);       
        result_PSI = ((input1/SG_StoddardSolvent)*0.0361).toFixed(5);
        break;      
    default:
      result_SG = "";
      result_Density = "";
      result_InH2O = "";  
      result_PSI = "";
  }
  document.getElementById("result_SG").innerText = "Specific Gravity (S.G.):  " + result_SG;
  document.getElementById("result_Density").innerText = "Density (lb/gallon):  " + result_Density;
  document.getElementById("result_InH2O").innerText = "Inches of Water (inH20):  " + result_InH2O;
  document.getElementById("result_PSI").innerText = "Result (PSI):  " + result_PSI;
}

function updateCalculator() {
  calculate(); // Update result when operation changes
}
