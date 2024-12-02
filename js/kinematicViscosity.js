// URLs of the CSV files (replace with your own file paths or URLs)
const csvFiles = [
  '../csvData/55.csv', // Replace with actual file paths or URLs
  '../csvData/48.csv',
  '../csvData/49.csv',
  '../csvData/50.csv',
  '../csvData/51.csv',
  '../csvData/52.csv',
  '../csvData/53.csv',
  '../csvData/54.csv',
  '../csvData/47.csv',
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
  'RJ-5',
  'JP-4, Jet B',
  'TS',
  'JP-5, Jet A, Jet A-1, JP-8',
  'JP-7',
  'JP-9, JP-10',
  'RJ-4',
  'RJ-6',
  'Av. Gas',
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

let papaParseOutput = [];    // this is an empty array
//let papaParseOutput1 = {}; // this is an empty object

// Initialize an empty array to hold parsed data
let allData = [];
let labels = [];

// Function to load and parse CSV data from multiple files
function loadCSVData(files) {
  let promises = files.map((file, index) => {     // this was let promises = files.map(file => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        dynamicTyping: true, //changes the strings to numbers
        download: true,  // Downloads the file if it's a URL
        complete: function(results) {
          // Push the new parsed data into the global ARRAY, with the index as the key
          papaParseOutput.push(results.data);  // This adds a new index to the array
          resolve(results.data);  // Resolve the promise with the parsed data
          //console.log(allData);
        },
        error: function(error) {
          reject('Error parsing CSV: ' + error.message);
        },
        header: false,    // Assumes the CSV has headers
        skipEmptyLines: true
      });
    });
  });

  // Once all files are loaded and parsed, create the chart
  Promise.all(promises)
    .then(() => {
      // Process each CSV file's data (optional)
      papaParseOutput.forEach((data, index) => {
        processCSVData(data, index);
      });

      // Create the chart after all data is processed
      createChart();
    })
    .catch(error => {
      console.error('Error loading CSV files: ', error);
    });
}

// Function to process data from each CSV file
function processCSVData(csvData, fileIndex) {
  // Assuming each CSV has the same structure
  // Example: ['Date', 'Value'] columns, adjust if your structure is different

  if (fileIndex === 0) {
    // Only populate labels once (using the first file as reference)
    csvData.forEach(row => {
      labels.push(row[0]);  // Assuming the first column is 'Date'
    });
  }

  // Extract values from the 'Value' column and push to allData array
  const values = csvData.map(row => parseFloat(row[1])); // Adjust 'Value' as needed
  allData.push(values);
}

// Function to create the chart
function createChart() {
  // Create a line chart for each CSV file's data
  const ctx = document.getElementById('myChart').getContext('2d');

  // Prepare datasets for Chart.js
  const datasets = allData.map((data, index) => ({
    label: fixedLabels[index % fixedLabels.length], // Label for each dataset (e.g., Data 1, Data 2, etc.)
    data: data,                     // The data for the chart
    borderColor: fixedColors[index % fixedColors.length], // Use fixed color, wrap around if index exceeds array length //`rgb(${index * 60}, ${index * 80}, ${index * 100})`, // Different colors for each line
    fill: false,                     // Don't fill under the line
    tension: 0.1                     // Line smoothing
    //console.log(data);
  }));

  // Create the Chart.js chart
  myChart = new Chart(ctx, {
    type: 'line',  // Chart type (e.g., line chart)
    data: {
      labels: labels, // X-axis labels (shared across all datasets)
      datasets: datasets // Data from all CSV files
    },
    
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
        left: 10,
        right: 25,
        top: 5,
        bottom: 5,
        }
      },
      interaction: {
        mode: 'index', // Change interaction mode if needed
        intersect: false,
      },
      elements: {
        point:{
            radius: 0,
        },
      },
      plugins:{
        tooltip: {
          enabled: true  // Tooltips are enabled by default
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
        }

        },
      },
      responsive: true,
      scales: {
        y:{
          type: 'logarithmic',
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
            text: 'Kinematic Viscosity, mm²/sec (centistokes)',
            padding: 10,
            font: {
              size: 20,
             },
          }
        },
        x:{
           //beginAtZero: true,
           //min: 0,
           //max: 392,
           //suggestedMax: 194, 
           ticks:{
            //stepSize:10,
            //autoSkip: true,
            maxTicksLimit: 26,
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
        },
    }
  });
}


// Load and parse all CSV files
loadCSVData(csvFiles);


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
  updateCalculator();
}

// Convert Fahrenheit to Celsius
function convertToCelsius() {
  var fahrenheit = document.getElementById("fahrenheit").value;
  var celsius = (parseFloat(fahrenheit) - 32) * 5/9;
  document.getElementById("celsius").value = celsius.toFixed(2); // Update Celsius box
  updateCalculator();
}

function linearInterpolation(x, data) {

  console.log('tis is the data into the interp function', data);
  // Step 1: Check if the x is within the bounds of the data
  x = parseFloat(x); //papaParse is returning strings instead of numbers
  minX = Math.min(...data.map(point => point[0])); // Minimum x value
  maxX = Math.max(...data.map(point => point[0])); // Maximum x value

  console.log('min', minX);
  console.log('max', maxX);

  if (x < minX || x > maxX) {
    flag = true;
  } else {
    flag = false;
  }

  // Step 2: Check if x is already in the data array
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === x) {
      console.log('value is predefined');
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

// Example usage:
function updateCalculator() {
  const operation = document.getElementById("operation").value;
  switch (operation) {
    case "RJ-5":
      switchIndex = 0;
      break;
    case "JP-4, Jet B":
      switchIndex = 1;
      break;
    case "TS":
      switchIndex = 2;
      break;
    case "JP-5, Jet A, Jet A-1, JP-8":
      switchIndex = 3;
      break;
    case "JP-7":
      switchIndex = 4;
      break;
    case "JP-9, JP-10":
      switchIndex = 5;
      break;
    case "RJ-4":
      switchIndex = 6;
      break;  
    case "RJ-6":
      switchIndex = 7;
      break;  
    case "Av. Gas":
      switchIndex = 8;
      break;  
    }

  let fahrenheit = document.getElementById("fahrenheit").value;
  let interpolatedValue = linearInterpolation(fahrenheit, papaParseOutput[switchIndex]);
  console.log(`Interpolated value at x = ${fahrenheit} is y = ${interpolatedValue}`);

  //let interp_densityWater = linearInterpolationWater(fahrenheit, densityWater);

  if (flag == true) {
      document.getElementById("result_density1").innerText = ("Out of Range");
      document.getElementById("result_density2").innerText = ("Out of Range");
      document.getElementById("result_density3").innerText = ("Out of Range");
      document.getElementById("result_density4").innerText = ("Out of Range");
      document.getElementById("result_density5").innerText = ("Out of Range");
      document.getElementById("result_density6").innerText = ("Out of Range");
  } else {
      document.getElementById("result_density1").innerText = ((interpolatedValue).toFixed(3));
      document.getElementById("result_density2").innerText = ((interpolatedValue).toFixed(3));
      document.getElementById("result_density3").innerText = ((interpolatedValue*.01).toFixed(5));
      document.getElementById("result_density4").innerText = ((interpolatedValue*0.000001).toFixed(8));
      document.getElementById("result_density5").innerText = ((interpolatedValue*0.0015500031).toFixed(5));
      document.getElementById("result_density6").innerText = ((interpolatedValue*0.0000107639).toFixed(5));
  }
}
