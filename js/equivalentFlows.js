
let denseWater1 = 998; //kg per m^3, for water at 70°F
let denseWater2 = 998; //kg per m^3, for water at 70°F
let waterDensity1;
let waterDensity2;
let flow1PPH;
let density1_kgm;
let density2_kgm;
let result;

const csvFiles1 = [
'../csvData/densityofWater-combined.csv', // Replace with actual file paths or URLs
];

let switchIndex = 0;
let flag = false;
let fallData1;
let nonChartData; // Declare a global variable to store the result

transformedData = function(parameter1){
  const transformedDataintermediate = fallData1.map(dataset => 
    dataset.map(point => [point.x, point.y])  // Create an array with x and y values
  );
  return transformedDataintermediate;
};

processCSVFiles(csvFiles1)
.then(allData1 => {
  //console.log('allData1:', allData1);
  // allData is now an array of arrays, where each inner array represents the data of one CSV file
  fallData1 = allData1;
  nonChartData = transformedData();
  calculate();
})
.catch(error => {
  console.error('Error processing CSV files:', error);
});


function calculate() {
  calculate1();
  denseWater1 = waterDensity1;
  calculate2();
  denseWater2 = waterDensity2;


  const flow1InputNum = parseFloat(document.getElementById('flow1InputNum').value) || 0;
  const flowUnit1 = document.getElementById('flowUnit1').value;
  const dens1InputNum = parseFloat(document.getElementById('dens1InputNum').value) || 0;
  const densUnit1 = document.getElementById('densUnit1').value;
  const Temp1InputNum = parseFloat(document.getElementById('Temp1InputNum').value) || 0;
  const tempUnit1 = document.getElementById('tempUnit1').value;

  const flowUnit2 = document.getElementById('flowUnit2').value;
  const dens2InputNum = parseFloat(document.getElementById('dens2InputNum').value) || 0;
  const densUnit2 = document.getElementById('densUnit2').value;
  const Temp2InputNum = parseFloat(document.getElementById('Temp2InputNum').value) || 0;
  const tempUnit2 = document.getElementById('tempUnit2').value;

  const HideableDensity1 = document.getElementById('HideableDensity1');
  const HideableTemp1 = document.getElementById('HideableTemp1');

  const HideableDensity2 = document.getElementById('HideableDensity2');
  const HideableTemp2 = document.getElementById('HideableTemp2');

  const HideableTemp1waterdensity = document.getElementById('HideableTemp1waterdensity');
  const HideableTemp2waterdensity = document.getElementById('HideableTemp2waterdensity');

  const FlowResult1 = document.getElementById('FlowResult1');
  const FlowResult2 = document.getElementById('FlowResult2');
  const FlowResult3 = document.getElementById('FlowResult3');
  const FlowResult4 = document.getElementById('FlowResult4');
  const FlowResult5 = document.getElementById('FlowResult5');
  const FlowResult6 = document.getElementById('FlowResult6');
  const FlowResult7 = document.getElementById('FlowResult7');
  const FlowResult8 = document.getElementById('FlowResult8');
  const FlowResult9 = document.getElementById('FlowResult9');

  FlowResult1.style.display = 'none'; // Show element when checked
  FlowResult2.style.display = 'none'; // Show element when checked
  FlowResult3.style.display = 'none'; // Show element when checked
  FlowResult4.style.display = 'none'; // Show element when checked
  FlowResult5.style.display = 'none'; // Show element when checked
  FlowResult6.style.display = 'none'; // Show element when checked
  FlowResult7.style.display = 'none'; // Show element when checked
  FlowResult8.style.display = 'none'; // Show element when checked
  FlowResult9.style.display = 'none'; // Show element when checked

  const result_selectedUnit= document.getElementById('result_selectedUnit');

  if (flow1InputNum == null) {
    flow1InputNum = 0;
  }

  if (densUnit1 == "S.G.") {
    HideableTemp1.style.display = 'flex'; // Show element when checked
    HideableTemp1waterdensity.style.display = 'flex'; // Show element when checked
  } else {
    HideableTemp1.style.display = 'none'; // Show element when checked
    HideableTemp1waterdensity.style.display = 'none'; // Show element when checked
  }

  if (densUnit2 == "S.G.") {
    HideableTemp2.style.display = 'flex'; // Show element when checked
    HideableTemp2waterdensity.style.display = 'flex'; // Show element when checked
  } else {
    HideableTemp2.style.display = 'none'; // Show element when checked
    HideableTemp2waterdensity.style.display = 'none'; // Show element when checked
  }

// NEED TO GET DENSITY TO KGM EVERYTIME -1
  if (densUnit1 == 'kgm') {
    density1_kgm = dens1InputNum;
   } else if (densUnit1 == 'S.G.') {
    density1_kgm = dens1InputNum*denseWater1;
  } else if (densUnit1 == 'LB / Gal') {
    density1_kgm = dens1InputNum*(1/231)*27679.90471;
  } else if (densUnit1 == 'lbin') {
    density1_kgm = dens1InputNum*27679.90471;
  } else {
    density1_kgm = "0.810";
  }
console.log("density of flow 1:",density1_kgm);

// NEED TO GET DENSITY TO KGM EVERYTIME -2
if (densUnit2 == 'kgm') {
  density2_kgm = dens2InputNum;
 } else if (densUnit2 == 'S.G.') {
  density2_kgm = dens2InputNum*denseWater2;
} else if (densUnit2 == 'LB / Gal') {
  density2_kgm = dens2InputNum*(1/231)*27679.90471;
} else if (densUnit2 == 'lbin') {
  density2_kgm = dens2InputNum*27679.90471;
} else {
  density2_kgm = "999";
}
console.log("density of flow 2:",density2_kgm);



// OUT OF HERE I NEED TO ALWAYS GET FLOW 1 IN PPH
  switch (flowUnit1) {
    case "PPH":
      HideableDensity1.style.display = 'none'; // Show element when checked
      HideableTemp1.style.display = 'none'; // Show element when checked
      flow1PPH = flow1InputNum; 
      break;
    case "GPM":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*60*density1_kgm*(1/27679.90471)*(231);  
      break;
    case "kgPs":
      HideableDensity1.style.display = 'none'; // Show element when checked
      HideableTemp1.style.display = 'none'; // Show element when checked
      flow1PPH = flow1InputNum*7936.6414387; 
      break;
    case "gramM":
      HideableDensity1.style.display = 'none'; // Show element when checked
      HideableTemp1.style.display = 'none'; // Show element when checked
      flow1PPH = flow1InputNum*0.1322773573; 
      break;
    case "inSec":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*60*60*density1_kgm*(1/27679.90471);  
      break;
    case "ftSec":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*12*12*12*60*60*density1_kgm*(1/27679.90471);  
      break;
    case "mSEc":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*39.3701*39.3701*39.3701*60*60*density1_kgm*(1/27679.90471);  
      break;
    case "mmSec":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*0.0393701*0.0393701*0.0393701*60*60*density1_kgm*(1/27679.90471);   
      break;
    case "lMin":
      HideableDensity1.style.display = 'flex'; // Show element when checked
      flow1PPH = flow1InputNum*61.0237*60*density1_kgm*(1/27679.90471);   
      break;
    default:
      HideableDensity1.style.display = 'none'; // Show element when checked
      HideableTemp1.style.display = 'none'; // Show element when checked
      flow1PPH = flow1InputNum; 
    }

    // OUT OF HERE I NEED TO TAKE FLOW 1 IN PPH, AND GET IT INTO THE DESIRED UNITS
    switch (flowUnit2) {
      case "PPH":
        HideableDensity2.style.display = 'none'; // Show element when checked
        HideableTemp2.style.display = 'none'; // Show element when checked
        FlowResult1.style.display = 'inline'; // Show element when checked
        result = flow1PPH; 
        break;
      case "GPM":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult2.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*27679.90471*(1/density2_kgm)*(1/231); 
        break;
      case "kgPs":
        HideableDensity2.style.display = 'none'; // Show element when checked
        HideableTemp2.style.display = 'none'; // Show element when checked
        FlowResult3.style.display = 'inline'; // Show element when checked
        result = flow1PPH*0.0001259979; 
        break;
      case "gramM":
        HideableDensity2.style.display = 'none'; // Show element when checked
        HideableTemp1.style.display = 'none'; // Show element when checked
        FlowResult4.style.display = 'inline'; // Show element when checked
        result = flow1PPH*7.5598728333; 
        break;
      case "inSec":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult5.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*(1/60)*(27679.90471)*(1/density2_kgm); 
        break;
      case "ftSec":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult6.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*(1/60)*(27679.90471)*(1/density2_kgm)*(1/12)*(1/12)*(1/12); 
        break;
      case "mSEc":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult7.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*(1/60)*(27679.90471)*(1/density2_kgm)*(0.0254)*(0.0254)*(0.0254); 
        break;
      case "mmSec":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult8.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*(1/60)*(27679.90471)*(1/density2_kgm)*(25.4)*(25.4)*(25.4);
        break;
      case "lMin":
        HideableDensity2.style.display = 'flex'; // Show element when checked
        FlowResult9.style.display = 'inline'; // Show element when checked
        result = flow1PPH*(1/60)*(1/60)*(27679.90471)*(1/density2_kgm)*0.0163871; 
        break;
      default:
        HideableDensity2.style.display = 'none'; // Show element when checked
        HideableTemp2.style.display = 'none'; // Show element when checked
        FlowResult1.style.display = 'inline'; // Show element when checked
        FlowResult2.style.display = 'inline'; // Show element when checked
        FlowResult3.style.display = 'inline'; // Show element when checked
        FlowResult4.style.display = 'inline'; // Show element when checked
        FlowResult5.style.display = 'inline'; // Show element when checked
        FlowResult6.style.display = 'inline'; // Show element when checked
        FlowResult7.style.display = 'inline'; // Show element when checked
        flow1PPH = flow1InputNum; 
      }

    document.getElementById("result_selectedUnit").innerText = result.toFixed(3);
  }



// Function to fetch and parse CSV files, returning an array of separate datasets
async function processCSVFiles(filePaths) {
  const allData = [];  // This will store an array of data for each CSV file

  for (const filePath of filePaths) {
    try {
      // Fetch the CSV file
      const response = await fetch(filePath);
      const csvData = await response.text();

      // Parse the CSV file
      const parsedData = parseCSV(csvData);

      // Store the parsed data for this file as a separate array
      allData.push(parsedData);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  return allData;  // Return an array of arrays
}

// Function to parse the CSV content into { x, y } objects
function parseCSV(csvData) {
  const rows = csvData.trim().split('\n');  // Split the CSV into rows
  const parsedData = [];

  rows.forEach(row => {
    const columns = row.split(',');  // Split each row by commas (assuming CSV format)

    // Assuming the file has no header, so the first column is x and the second is y
    if (columns.length >= 2) {
      const x = parseFloat(columns[0].trim());  // Parse x value
      const y = parseFloat(columns[1].trim());  // Parse y value

      // Only add to the array if both x and y are valid numbers
      if (!isNaN(x) && !isNaN(y)) {
        parsedData.push({ x, y });
      }
    }
  });

  return parsedData;
}

// Example usage of the processCSVFiles function
processCSVFiles(csvFiles1)
  .then(allData => {
    // allData is now an array of arrays, where each inner array represents the data of one CSV file
    fallData = allData;

  })
  .catch(error => {
    console.error('Error processing CSV files:', error);
  });

 
//Performing Linear Interpolation to calculate the Y value
function linearInterpolation(x, data) {
  //console.log('tis is the data into the interp function', data);
  // Step 1: Check if the x is within the bounds of the data
  x = parseFloat(x); //papaParse is returning strings instead of numbers
  minX = Math.min(...data.map(point => point[0])); // Minimum x value
  maxX = Math.max(...data.map(point => point[0])); // Maximum x value

  //console.log('min', minX);
  //console.log('max', maxX);

  if (x < minX || x > maxX) {
    flag = true;
  } else {
    flag = false;
  }

  // Step 2: Check if x is already in the data array
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === x) {
      //console.log('value is predefined');
      return data[i][1]; // If x is already in the array, no interpolation is needed
    }
  }

  // Step 3: Find the two data points (x0, y0) and (x1, y1)
  for (let i = 0; i < data.length - 1; i++) {
    let x0 = parseFloat(data[i][0]);
    let y0 = parseFloat(data[i][1]);
    let x1 = parseFloat(data[i+1][0]);
    let y1 = parseFloat(data[i+1][1]);

    // Check if x is between x0 and x1 (i.e., find the two surrounding points)
    if (x >= x0 && x <= x1) {
    
      // Step 4: Perform linear interpolation
      let y = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
      return y; // Return the interpolated y value
    }
  }
}





function calculate1() {
  let tempUnit1 = document.getElementById("tempUnit1").value;
  let Temp1InputNum = parseFloat(document.getElementById("Temp1InputNum").value) || 0;
  let result_temp;
  let result_temp_F;

  if (Temp1InputNum == 0) {
    Temp1InputNum = 60;
  }

  result_temp = parseFloat(Temp1InputNum);

  if (tempUnit1 == 'degF') {
    result_temp_F = result_temp;

  } else if (tempUnit1 == 'degC') {
    result_temp_F = result_temp*(9/5)+32;

  } else if (tempUnit1 == 'degK') {
    result_temp_F = ((result_temp+(-273.15))*(9/5))+32;

  } else if (tempUnit1 == 'degR') {
    result_temp_F = (result_temp*1)+(-459.67);

  } else {
    result_temp = 0;
    result_temp_F = 0;
  }

  //console.log('degrees F before linearInterpolation:',result_temp_F);
  //console.log('nonChart Data Here:',nonChartData);
  waterDensity1 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  //console.log(`Interpolated value at x = ${result_temp_F} is y = ${waterDensity1}`);

  if (flag == true) {
    document.getElementById("waterDensity1").innerText =     ("Out of Range");
  } else {
    document.getElementById("waterDensity1").innerText = (waterDensity1.toFixed(2));
  }
 }

 function calculate2() {
  let tempUnit2 = document.getElementById("tempUnit2").value;
  let Temp2InputNum = parseFloat(document.getElementById("Temp2InputNum").value) || 0;
  let result_temp;
  let result_temp_F;

  if (Temp2InputNum == 0) {
    Temp2InputNum = 60;
  }

  result_temp = parseFloat(Temp2InputNum);

  if (tempUnit2 == 'degF') {
    result_temp_F = result_temp;

  } else if (tempUnit2 == 'degC') {
    result_temp_F = result_temp*(9/5)+32;

  } else if (tempUnit2 == 'degK') {
    result_temp_F = ((result_temp+(-273.15))*(9/5))+32;

  } else if (tempUnit2 == 'degR') {
    result_temp_F = (result_temp*1)+(-459.67);

  } else {
    result_temp = 0;
    result_temp_F = 0;
  }

  //console.log('degrees F before linearInterpolation:2',result_temp_F);
  //console.log('nonChart Data Here:',nonChartData);
  waterDensity2 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  //console.log(`Interpolated value at x = ${result_temp_F} is y = ${waterDensity2}`);

  if (flag == true) {
    document.getElementById("waterDensity2").innerText =     ("Out of Range");
  } else {
    document.getElementById("waterDensity2").innerText = (waterDensity2.toFixed(2));
  }
 }