// URLs of the CSV files (replace with your own file paths or URLs)
const csvFiles = [
  '../csvData/densityofWater.csv', // Replace with actual file paths or URLs
  '../csvData/densityofWater-sat.csv',
 ];

const fixedColors = [ //for setting the rgb values of the lines //https://personal.sron.nl/~pault/#sec:qualitative
  'rgb(68,119,170)',   // Blue
  'rgb(238,102,119)',  // Red
  'rgb(34,136,51)',    // Green
  'rgb(204,187,68)',   // Yellow
  'rgb(170,51,119)',   // Purple
  'rgb(187,187,187)',  // Grey
  'rgb(102,204,238)',  // Cyan
  'rgb(238,119,51)',   // Orange
  'rgb(204,51,17)',    // Red
  'rgb(0,153,136)',    // Teal
  'rgb(153,153,51)',   // Olive
  'rgb(136,34,85)',    // Wine
];

const fixedLabels = [ //for the data labels because they aren't in the csv files
  'Density of Water',
  'Saturation Pressure Density of Water',
];

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
processCSVFiles(csvFiles)
  .then(allData => {
    // allData is now an array of arrays, where each inner array represents the data of one CSV file
    fallData = allData;
    createGraph();
  })
  .catch(error => {
    console.error('Error processing CSV files:', error);
  });

function createGraph() {
  // Code to run after the delay
  console.log('the big array', fallData);

  fallData.forEach((dataSet, index) => {
  // You can now use each `dataSet` (an array of { x, y } objects) for a different chart
  console.log(`Data from file ${csvFiles[index]}:`, dataSet);
    });

  const datasets = fallData.map((dataSet, index) => {
      return {
        label: fixedLabels[index % fixedLabels.length],  //`Dataset ${index + 1}`,  // Give each dataset a unique label
        data: dataSet.map(item => ({ x: item.x, y: item.y })),  // Map to Chart.js format
        fill: false,  // Set to `true` if you want the area under the line to be filled
        borderColor:  fixedColors[index % fixedColors.length],//`hsl(${index * 60}, 100%, 50%)`,  // Set a unique color for each line (based on index)
        tension: 0.1  // Line smoothing (0 = no smoothing, 1 = highly smoothed)
      };
    });

    // console.log('the data set');
    // console.log(datasets);

  const config = {
        type: 'line',  // Line chart type
        data: {
          datasets: datasets  // Use the datasets we created
        },
        options: {
          decimation: {
          enabled: false // Disable data decimation completely [2, 7]
          },
          plugins:{
            // decimation: {
            //   enabled: false, // Disable data decimation completely [2, 7]
            //   algorithm: 'min-max',
            // },
            legend: {
              position: 'top',  // Position of the legend (optional)
            },
            tooltip: {
              enabled: true,
              mode: 'nearest',
              intersect: false,
              axis: 'x',
            },
            customCanvasBackgroundColor:{
              color: 'white',
            },
            // title:{
            //   align: 'center',
            //   display: true,
            //   text: 'Nominal Density',
            //   fullSize: true,
            // },
            legend:{
              labels:{
                align: 'top',
                padding: 20,
                usePointStyle: false,
                boxHeight: 2,
                font: {
                  size: 18, // Set the desired font size for legend labels
                },
              },

            //makes the lines disappear faster
              onClick: function(e, legendItem, legend) {
                // This will toggle the dataset visibility when the legend item is clicked
                const datasetIndex = legendItem.datasetIndex;
                const ci = legend.chart;
                const meta = ci.getDatasetMeta(datasetIndex);
                meta.hidden = meta.hidden === null ? !ci.data.datasets[datasetIndex].hidden : null;
                ci.update();
            },

            },
          },
          maintainAspectRatio: false,
          layout: {
            padding: {
            left: 10,
            right: 25,
            top: 5,
            bottom: 5,
            },
          },
          interaction: {
            mode: 'nearest', // Change interaction mode if needed
            //intersect: false,
            axis: 'x',
          },
          elements: {
            point:{
                radius: 0,
            },
          },
          responsive: true,
          scales: {
            x:{
              type: 'linear',
              //beginAtZero: true,
              min: 32,
              max: 675,
              //suggestedMax: 194, 
              ticks:{
                //stepSize:10,
                //autoSkip: true,
                //maxTicksLimit: 26,
                maxRotation: 0,
                font: {
                  size: 16,
                },
              },
              title: {
                display:true,
                text: 'Temperature °F',
                font: {
                  size: 20,
                },
              }
            },
            y:{
              type: 'linear',
              tick:{
                crossAlign:'far',
              },
              //beginAtZero: true,
              //min: 620,
              //max:1200, 
              ticks:{
                //stepSize:20,
                font: {
                size: 16,
              },
              },
              title: {
                display:true,
                text: 'Density kg/m³',
                padding: 10,
                font: {
                  size: 20,
                },
              }
            },
          }
        }
      };

  const ctx = document.getElementById('myChart').getContext('2d');
 myChart =  new Chart(ctx, config);

};



//Listening for the Tooptips Toggle Button
document.getElementById('toggleTooltipButton').addEventListener('click', function() {
  // Toggle the enabled property of tooltips
  const currentTooltipState = myChart.options.plugins.tooltip.enabled;
  myChart.options.plugins.tooltip.enabled = !currentTooltipState;

  // Update the chart to apply the change
  myChart.update();

  // Change the button text based on the tooltip state
  const buttonText = myChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  document.getElementById('toggleTooltipButton').textContent = buttonText;
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







let switchIndex = 0;
let flag = false;
let fallData1;
let nonChartData; // Declare a global variable to store the result

const csvFiles1 = [
  '../csvData/densityofWater-combined.csv', // Replace with actual file paths or URLs
 ];

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


transformedData = function(parameter1){
  const transformedDataintermediate = fallData1.map(dataset => 
    dataset.map(point => [point.x, point.y])  // Create an array with x and y values
  );
  return transformedDataintermediate;
};


function calculate() {
  let operation = document.getElementById("operation").value;
  let input2 = parseFloat(document.getElementById("input2").value) || 0;

  const varfuelHeadCalcOption3 = document.getElementById('fuelHeadCalcOption3');
  const varfuelHeadCalcOption4 = document.getElementById('fuelHeadCalcOption4');
  const varfuelHeadCalcOption5 = document.getElementById('fuelHeadCalcOption5');
  const varfuelHeadCalcOption6 = document.getElementById('fuelHeadCalcOption6');

  let result_temp;
  let result_temp_F;

  let result_gcm;
  let result_lbgal;
  let result_lbft;
  let result_lbin;
  let result_slugft;
  let result_kgm;

  if (input2 == 0) {
    input2 = 70;
  }

  result_temp = parseFloat(input2);

  if (operation == 'degF') {
    result_temp_F = result_temp;

  } else if (operation == 'degC') {
    result_temp_F = result_temp*(9/5)+32;

  } else if (operation == 'degK') {
    result_temp_F = ((result_temp+(-273.15))*(9/5))+32;

  } else if (operation == 'degR') {
    result_temp_F = (result_temp*1)+(-459.67);

  } else {
    result_temp = 0;
    result_temp_F = 0;
  }

  console.log('degrees F before linearInterpolation:',result_temp_F);

  console.log('nonChart Data Here:',nonChartData);
  result_kgm = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  console.log(`Interpolated value at x = ${result_temp_F} is y = ${result_kgm}`);


  result_gcm = result_kgm*0.001;
  result_lbgal = result_kgm*(1/27679.90471)*231;
  result_lbft = result_kgm*(1/27679.90471)*(12*12*12);
  result_lbin = result_kgm*(1/27679.90471);
  result_slugft = result_kgm*(1/515.37881839);
  result_kgm = result_kgm;

  switch (operation) {
    case "degF":
      varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
      varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      break;
    case "degC":
      varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption4.style.display = 'inline'; // Show element when unchecked
      varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      break;
    case "degK":
      varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption5.style.display = 'inline'; // Show element when unchecked
      varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
      break;
    case "degR":
      varfuelHeadCalcOption3.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption6.style.display = 'inline'; // Show element when unchecked
      break;
    default:
      varfuelHeadCalcOption3.style.display = 'inline'; // Show element when checked
      varfuelHeadCalcOption4.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption5.style.display = 'none'; // Show element when unchecked
      varfuelHeadCalcOption6.style.display = 'none'; // Show element when unchecked
    }

  if (flag == true) {
    document.getElementById("result_gcm").innerText =     ("Out of Range");
    document.getElementById("result_lbgal").innerText =   ("Out of Range");
    document.getElementById("result_lbft").innerText =    ("Out of Range");
    document.getElementById("result_lbin").innerText =    ("Out of Range");
    document.getElementById("result_slugft").innerText =  ("Out of Range");
    document.getElementById("result_kgm").innerText =     ("Out of Range");
  } else {
    document.getElementById("result_gcm").innerText = (result_gcm.toFixed(4));
    document.getElementById("result_lbgal").innerText = (result_lbgal.toFixed(3));
    document.getElementById("result_lbft").innerText = (result_lbft.toFixed(3));
    document.getElementById("result_lbin").innerText = (result_lbin.toFixed(4));
    document.getElementById("result_slugft").innerText = (result_slugft.toFixed(4));
    document.getElementById("result_kgm").innerText = (result_kgm.toFixed(3));
  }
}

