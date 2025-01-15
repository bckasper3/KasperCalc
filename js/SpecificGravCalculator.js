
let denseWater = 998; //kg per m^3, for water at 70°F
let result_SG;
let result_Density;
let result_lbin;
let result_kgm;
let result_kgm1;


const csvFiles1 = [
  '../csvData/densityofWater-combined.csv', // Replace with actual file paths or URLs
 ];

 let switchIndex = 0;
 let flag = false;
 let fallData1;
 let nonChartData; // Declare a global variable to store the result

 processCSVFiles(csvFiles1)
   .then(allData1 => {
     console.log('allData1:', allData1);
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
  denseWater = result_kgm1;
  let operation = document.getElementById("operation").value;
  let input2 = parseFloat(document.getElementById("input2").value) || 0;

  const varfuelHeadCalcOption3 = document.getElementById('fuelHeadCalcOption3');
  const varfuelHeadCalcOption4 = document.getElementById('fuelHeadCalcOption4');
  const varfuelHeadCalcOption5 = document.getElementById('fuelHeadCalcOption5');
  const varfuelHeadCalcOption6 = document.getElementById('fuelHeadCalcOption6');

  const varfuelHeadCalcResult1 = document.getElementById('fuelHeadCalcResult1');

  if (input2 == null) {
    input2 = 0;
  }

  if (operation == 'gramsLiters') {
    result_SG = result_kgm/denseWater;;
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

      switch (operation) {
        case "S.G.":
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
          break;
        case "LB / Gal":
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
          break;
        case "lbin":        
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'inline'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
          break;
        case "kgm":
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'inline'; // Show element when unchecked
          break;
        case "In. of H20":
          result_SG = result_SG.toFixed(4);
          result_Density = result_Density.toFixed(4);
          result_lbin = result_lbin.toFixed(4);
          result_kgm = result_kgm.toFixed(2);
          varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
          break;
        default:
          result_SG = "0";
          result_Density = "";
          result_lbin = "";
          result_kgm = "";
          varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
          varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
          varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
        }
  document.getElementById("result_SG").innerText = result_SG;
  document.getElementById("result_Density").innerText = result_Density;
  document.getElementById("result_lbin").innerText = result_lbin;
  document.getElementById("result_kgm").innerText = result_kgm;
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
  console.log('tis is the data into the interp function', data);
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







transformedData = function(parameter1){
  const transformedDataintermediate = fallData1.map(dataset => 
    dataset.map(point => [point.x, point.y])  // Create an array with x and y values
  );
  return transformedDataintermediate;
};


function calculate1() {
  let operation1 = document.getElementById("operation1").value;
  let input3 = parseFloat(document.getElementById("input3").value) || 0;
  let result_temp;
  let result_temp_F;

  if (input3 == 0) {
    input3 = 60;
  }

  result_temp = parseFloat(input3);

  if (operation1 == 'degF') {
    result_temp_F = result_temp;

  } else if (operation1 == 'degC') {
    result_temp_F = result_temp*(9/5)+32;

  } else if (operation1 == 'degK') {
    result_temp_F = ((result_temp+(-273.15))*(9/5))+32;

  } else if (operation1 == 'degR') {
    result_temp_F = (result_temp*1)+(-459.67);

  } else {
    result_temp = 0;
    result_temp_F = 0;
  }

  console.log('degrees F before linearInterpolation:',result_temp_F);

  console.log('nonChart Data Here:',nonChartData);
  result_kgm1 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  console.log(`Interpolated value at x = ${result_temp_F} is y = ${result_kgm1}`);


  result_gcm = result_kgm1*0.001;
  result_lbgal = result_kgm1*(1/27679.90471)*231;
  result_lbft = result_kgm1*(1/27679.90471)*(12*12*12);
  result_lbin = result_kgm1*(1/27679.90471);
  result_slugft = result_kgm1*(1/515.37881839);
  result_kgm1 = result_kgm1;

  switch (operation1) {
    case "degF":
      FF.style.display = 'inline'; // Show element when checked
      CC.style.display = 'none'; // Show element when unchecked
      KK.style.display = 'none'; // Show element when unchecked
      RR.style.display = 'none'; // Show element when unchecked
      break;
    case "degC":
      FF.style.display = 'none'; // Show element when checked
      CC.style.display = 'inline'; // Show element when unchecked
      KK.style.display = 'none'; // Show element when unchecked
      RR.style.display = 'none'; // Show element when unchecked
      break;
    case "degK":
      FF.style.display = 'none'; // Show element when checked
      CC.style.display = 'none'; // Show element when unchecked
      KK.style.display = 'inline'; // Show element when unchecked
      RR.style.display = 'none'; // Show element when unchecked
      break;
    case "degR":
      FF.style.display = 'none'; // Show element when checked
      CC.style.display = 'none'; // Show element when unchecked
      KK.style.display = 'none'; // Show element when unchecked
      RR.style.display = 'inline'; // Show element when unchecked
      break;
    default:
      FF.style.display = 'inline'; // Show element when checked
      CC.style.display = 'none'; // Show element when unchecked
      KK.style.display = 'none'; // Show element when unchecked
      RR.style.display = 'none'; // Show element when unchecked
    }

  if (flag == true) {
    document.getElementById("result_kgm1").innerText =     ("Out of Range");
  } else {
    document.getElementById("result_kgm1").innerText = (result_kgm1.toFixed(2));
  }
 
}