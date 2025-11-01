// URLs of the CSV files (replace with your own file paths or URLs)
const csvFiles = [
  '../csvData/11.csv', // Replace with actual file paths or URLs
  '../csvData/12.csv',
  '../csvData/13.csv',
  '../csvData/14.csv',
  '../csvData/15.csv',
  '../csvData/16.csv',
  '../csvData/17.csv',
  '../csvData/18.csv',
  '../csvData/19.csv',
  '../csvData/20.csv',
  '../csvData/21.csv', 
  '../csvData/22.csv',
  '../csvData/23.csv',
  '../csvData/24.csv',
  '../csvData/25.csv',
  '../csvData/26.csv',
  '../csvData/27.csv',
  '../csvData/28.csv',
  '../csvData/29.csv',
  '../csvData/30.csv',
  '../csvData/31.csv', 
  '../csvData/32.csv',
  '../csvData/33.csv',
  '../csvData/34.csv',
  '../csvData/35.csv',
  '../csvData/36.csv',
  '../csvData/37.csv',
  '../csvData/38.csv',
  '../csvData/39.csv',
];

const fixedColors = [ //for setting the rgb values of the lines //https://personal.sron.nl/~pault/#sec:qualitative
  'rgb(68,119,170)',   // Blue
  'rgb(34,136,51)',    // Green
  'rgb(204,187,68)',   // Yellow
  'rgb(238,102,119)',  // Red
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
  'JP-4, Jet B (Min)',
  'JP-4, Jet B (Typical)',
  'JP-5 (Min)',
  'JP-4, Jet B (Max)',
  'JP-5 (Typical)',
  'JP-5 (Max)',
  'Jet A, Jet A-1, JP-8 (Min)',
  'JP-7 (Min)',
  'JP-7 (Typical)',
  'JP-7 (Max)',
  'Jet A, Jet A-1, JP-8 (Typical)',
  'Jet A, Jet A-1, JP-8 (Max)',
  'TS (Min)',
  'TS (Typical)',
  'TS (Max)',
  'RJ-4 (Min)',
  'RJ-4 (Typical)',
  'RJ-4 (Max)',
  'RJ-6 (Min)',
  'RJ-6 (Typical)',
  'RJ-6 (Max)',
  'RJ-5 (Min)',
  'RJ-5 (Typical)',
  'RJ-5 (Max)',
  'JP-9, JP-10 (Min)',
  'JP-10 (Typical)',
  'JP-10 (Max)',
  'JP-9 (Typical)',
  'JP-9 (Max)',
];

// let densityWater = [
//   [-40 , 999.9],
//   [32.2, 999.9],
//   [34  , 999.9],
//   [39.2, 1000 ],
//   [40  , 1000 ],
//   [50  , 999.7],
//   [60  , 999.0],
//   [70  , 998.0],
//   [80  , 996.6],
//   [90  , 995.0],
//   [100 , 993.1],
//   [110 , 990.9],
//   [120 , 988.6],
//   [130 , 986.0],
//   [140 , 983.2],
//   [150 , 980.2],
//   [160 , 977.1],
//   [170 , 973.8],
//   [180 , 970.4],
//   [190 , 966.8],
//   [200 , 963.0],
//   [212 , 958.4],
//   [220 , 955.2],
//   [240 , 946.7],
//   [260 , 937.5],
// ];

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
    convertToCelsius();
    calculate();
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
              min: -40,
              max: 250,
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
                text: 'Relative Density, Water at 60°F',
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
  myChart = new Chart(ctx, config);

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


// Convert Celsius to Fahrenheit
function convertToFahrenheit() {
  var celsius = document.getElementById("celsius").value;
  var fahrenheit = (parseFloat(celsius) * 9/5) + 32;
  document.getElementById("fahrenheit").value = fahrenheit.toFixed(2); // Update Fahrenheit box
  calculate();
}

// Convert Fahrenheit to Celsius
function convertToCelsius() {
  var fahrenheit = document.getElementById("fahrenheit").value;
  var celsius = (parseFloat(fahrenheit) - 32) * 5/9;
  document.getElementById("celsius").value = celsius.toFixed(2); // Update Celsius box
  calculate();
}

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

//Does Linear interpolation on the water data
// function linearInterpolationWater(x, data) {
//   // Step 1: Check if the x is within the bounds of the data
//   //x = parseFloat(x); //papaParse is returning strings instead of numbers
//   minX = Math.min(...data.map(point => point[0])); // Minimum x value
//   maxX = Math.max(...data.map(point => point[0])); // Maximum x value

//   if (x < minX || x > maxX) {
//     console.log('outside of water density data');
//   }

//   // Step 2: Check if x is already in the data array
//   for (let i = 0; i < data.length; i++) {
//     if (data[i][0] === x) {
//       console.log('value is predefined');
//       return data[i][1]; // If x is already in the array, no interpolation is needed
//     }
//   }

//   // Step 3: Find the two data points (x0, y0) and (x1, y1)
//   for (let i = 0; i < data.length - 1; i++) {
//     let x0 = parseFloat(data[i][0]);
//     let y0 = parseFloat(data[i][1]);
//     let x1 = parseFloat(data[i+1][0]);
//     let y1 = parseFloat(data[i+1][1]);

//     // Check if x is between x0 and x1 (i.e., find the two surrounding points)
//     if (x >= x0 && x <= x1) {
    
//       // Step 4: Perform linear interpolation
//       let y = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
//       return y; // Return the interpolated y value
//     }
//   }
// }

let switchIndex = 0;
let flag = false;
let nonChartData = null; // Declare a global variable to store the result

transformedData = function(parameter1){
  const transformedDataintermediate = fallData.map(dataset => 
    dataset.map(point => [point.x, point.y])  // Create an array with x and y values
  );
  return transformedDataintermediate;
};

// Example usage:
function calculate() {
  const operation = document.getElementById("operation").value;
    switch (operation) {
     case'JP-4, Jet B (Min)':
      switchIndex = 0;
      break;    
     case'JP-4, Jet B (Typical)':
      switchIndex = 1;
      break;    
     case'JP-5 (Min)':
      switchIndex = 2;
      break;    
     case'JP-4, Jet B (Max)':
      switchIndex = 3;
      break;    
     case'JP-5 (Typical)':
      switchIndex = 4;
      break;    
     case'JP-5 (Max)':
      switchIndex = 5;
      break;    
     case'Jet A, Jet A-1, JP-8 (Min)':
      switchIndex = 6;
      break;    
     case'JP-7 (Min)':
      switchIndex = 7;
      break;    
     case'JP-7 (Typical)':
      switchIndex = 8;
      break;    
     case'JP-7 (Max)':
      switchIndex = 9;
      break;    
     case'Jet A, Jet A-1, JP-8 (Typical)':
      switchIndex = 10;
      break;    
     case'Jet A, Jet A-1, JP-8 (Max)':
      switchIndex = 11;
      break;    
     case'TS (Min)':
      switchIndex = 12;
      break;    
     case'TS (Typical)':
      switchIndex = 13;
      break;    
     case'TS (Max)':
      switchIndex = 14;
      break;    
     case 'RJ-4 (Min)':
      switchIndex = 15;
      break;    
     case'RJ-4 (Typical)':
      switchIndex = 16;
      break;    
     case'RJ-4 (Max)':
      switchIndex = 17;
      break;    
     case 'RJ-6 (Min)':
      switchIndex = 18;
      break;    
    case'RJ-6 (Typical)':
      switchIndex = 19;
      break;    
    case 'RJ-6 (Max)':
      switchIndex = 20;
      break;    
    case 'RJ-5 (Min)':
      switchIndex = 21;
      break;    
    case 'RJ-5 (Typical)':
      switchIndex = 22;
      break;    
    case 'RJ-5 (Max)':
      switchIndex = 23;
      break;    
    case 'JP-9, JP-10 (Min)':
      switchIndex = 24;
      break;    
    case 'JP-10 (Typical)':
      switchIndex = 25;
      break;    
    case 'JP-10 (Max)':
      switchIndex = 26;
      break;    
    case 'JP-9 (Typical)':
      switchIndex = 27;
      break;    
     case'JP-9 (Max)':
      switchIndex = 28;
      break;    
    }

    let fahrenheit = document.getElementById("fahrenheit").value;

    if (nonChartData == null) {
    nonChartData = transformedData();
    };
    
    let interpolatedValue = linearInterpolation(fahrenheit, nonChartData[switchIndex]);
    console.log(`Interpolated value at x = ${fahrenheit} is y = ${interpolatedValue}`);
  
    //let interp_densityWater = linearInterpolationWater(fahrenheit, densityWater);

  if (flag == true) {
      document.getElementById("result_density1").innerText = ("Out of Range");
      document.getElementById("result_density2").innerText = ("Out of Range");
      document.getElementById("result_density3").innerText = ("Out of Range");
      document.getElementById("result_density4").innerText = ("Out of Range");
      document.getElementById("result_density5").innerText = ("Out of Range");
      document.getElementById("result_density6").innerText = ("Out of Range");
      document.getElementById("result_density7").innerText = ("Out of Range");
      document.getElementById("result_density8").innerText = ("Out of Range");
      document.getElementById("result_density9").innerText = ("Out of Range");
      document.getElementById("result_density10").innerText = ("Out of Range");
      document.getElementById("result_density11").innerText = ("Out of Range");
  } else {
      document.getElementById("result_density1").innerText = ((interpolatedValue).toFixed(3));
      document.getElementById("result_density2").innerText = ((interpolatedValue*999).toFixed(3));
      document.getElementById("result_density3").innerText = ((interpolatedValue*0.000036127298147753*999).toFixed(4));
      document.getElementById("result_density4").innerText = ((interpolatedValue*0.0083454063545262*999).toFixed(4));
      document.getElementById("result_density5").innerText = ((interpolatedValue*998).toFixed(3));
      document.getElementById("result_density6").innerText = ((interpolatedValue*0.000036127298147753*998).toFixed(4));
      document.getElementById("result_density7").innerText = ((interpolatedValue*0.0083454063545262*998).toFixed(4));
      document.getElementById("result_density8").innerText = ((interpolatedValue*1000).toFixed(3));
      document.getElementById("result_density9").innerText = ((interpolatedValue*0.000036127298147753*1000).toFixed(4));
      document.getElementById("result_density10").innerText = ((interpolatedValue*0.0083454063545262*1000).toFixed(4));
      document.getElementById("result_density11").innerText = (((141.5/(interpolatedValue))-131.5).toFixed(4));

      document.getElementById("result_density12").innerText = ((interpolatedValue*0.0083454063545262*999*7.48052).toFixed(4));
      document.getElementById("result_density13").innerText = ((interpolatedValue*0.0083454063545262*998*7.48052).toFixed(4));
      document.getElementById("result_density14").innerText = ((interpolatedValue*0.0083454063545262*1000*7.48052).toFixed(4));
  }
}