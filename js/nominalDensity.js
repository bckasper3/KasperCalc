// URLs of the CSV files (replace with your own file paths or URLs)
const csvFiles = [
  '../csvData/1.csv', // Replace with actual file paths or URLs
  '../csvData/2.csv',
  '../csvData/3.csv',
  '../csvData/4.csv',
  '../csvData/5.csv',
  '../csvData/6.csv',
  '../csvData/7.csv',
  '../csvData/8.csv',
  '../csvData/9.csv',
  '../csvData/10.csv'
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
  'Av. Gas',
  'JP-4, Jet B',
  'JP-7, TS',
  'JP-8, Jet A, Jet A-1',
  'JP-5',
  'RJ-4',
  'JP-10',
  'JP-9',
  'RJ-6',
  'RJ-5',
];

let densityWater = [
  [-40 , 999.9],
  [32.2, 999.9],
  [34  , 999.9],
  [39.2, 1000 ],
  [40  , 1000 ],
  [50  , 999.7],
  [60  , 999.0],
  [70  , 998.0],
  [80  , 996.6],
  [90  , 995.0],
  [100 , 993.1],
  [110 , 990.9],
  [120 , 988.6],
  [130 , 986.0],
  [140 , 983.2],
  [150 , 980.2],
  [160 , 977.1],
  [170 , 973.8],
  [180 , 970.4],
  [190 , 966.8],
  [200 , 963.0],
  [212 , 958.4],
  [220 , 955.2],
  [240 , 946.7],
  [260 , 937.5],
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
let ndExpChart = null;

processCSVFiles(csvFiles)
  .then(allData => {
    fallData = allData;
    createGraph();
    createExpansionChart();
    convertToCelsius();
  })
  .catch(error => {
    console.error('Error processing CSV files:', error);
  });

function createGraph() {
  console.log('the big array', fallData);

  fallData.forEach((dataSet, index) => {
    console.log(`Data from file ${csvFiles[index]}:`, dataSet);
  });

  const datasets = fallData.map((dataSet, index) => {
    return {
      label: fixedLabels[index % fixedLabels.length],
      data: dataSet.map(item => ({ x: item.x, y: item.y })),
      fill: false,
      borderColor: fixedColors[index % fixedColors.length],
      tension: 0.1
    };
  });

  // Linear extrapolation dashed lines from 194°F to 350°F
  const extrapolationDatasets = fallData.map((dataSet, index) => {
    const n = dataSet.length;
    const lastPt = dataSet[n - 1];
    const prevPt = dataSet[n - 2];
    const slope = (lastPt.y - prevPt.y) / (lastPt.x - prevPt.x);
    const extrapPts = [];
    for (let x = Math.round(lastPt.x); x <= 350; x++) {
      extrapPts.push({ x, y: lastPt.y + slope * (x - lastPt.x) });
    }
    return {
      label: fixedLabels[index % fixedLabels.length],
      data: extrapPts,
      fill: false,
      borderColor: fixedColors[index % fixedColors.length],
      borderDash: [6, 4],
      tension: 0,
      isExtrapolation: true,
    };
  });

  const allDatasets = [...datasets, ...extrapolationDatasets];

  const config = {
    type: 'line',
    data: {
      datasets: allDatasets
    },
    options: {
      decimation: {
        enabled: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            align: 'top',
            padding: 20,
            usePointStyle: false,
            boxHeight: 2,
            font: { size: 18 },
            filter: (legendItem, chartData) => {
              return !chartData.datasets[legendItem.datasetIndex].isExtrapolation;
            },
          },
          onClick: function(e, legendItem, legend) {
            const datasetIndex = legendItem.datasetIndex;
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(datasetIndex);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[datasetIndex].hidden : null;
            const extrapIndex = datasetIndex + fallData.length;
            if (extrapIndex < ci.data.datasets.length) {
              const extrapMeta = ci.getDatasetMeta(extrapIndex);
              extrapMeta.hidden = meta.hidden;
            }
            ci.update();
          },
        },
        tooltip: {
          enabled: true,
          mode: 'nearest',
          intersect: false,
          axis: 'x',
        },
        customCanvasBackgroundColor: {
          color: 'white',
        },
      },
      maintainAspectRatio: false,
      layout: {
        padding: { left: 10, right: 25, top: 5, bottom: 5 },
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
      },
      elements: {
        point: { radius: 0 },
      },
      responsive: true,
      scales: {
        x: {
          type: 'linear',
          min: -40,
          max: 350,
          ticks: {
            maxRotation: 0,
            font: { size: 16 },
          },
          title: {
            display: true,
            text: 'Temperature °F',
            font: { size: 20 },
          }
        },
        y: {
          type: 'linear',
          tick: { crossAlign: 'far' },
          ticks: { font: { size: 16 } },
          title: {
            display: true,
            text: 'Density, kg/m³',
            padding: 10,
            font: { size: 20 },
          }
        },
      }
    }
  };

  const ctx = document.getElementById('myChart').getContext('2d');
  myChart = new Chart(ctx, config);
}



function createExpansionChart() {
  const rho0 = linearInterpolationWater(68, densityWater); // water density at 68°F (not used)
  const td = transformedData();

  const mainDatasets = [];
  const extrapolationDatasets = [];

  td.forEach((ds, index) => {
    const rho0F = (function() {
      for (let i = 0; i < ds.length - 1; i++) {
        if (ds[i][0] <= 68 && ds[i+1][0] >= 68) {
          const x0 = ds[i][0], y0 = ds[i][1], x1 = ds[i+1][0], y1 = ds[i+1][1];
          return y0 + (68 - x0) * (y1 - y0) / (x1 - x0);
        }
      }
      return null;
    })();

    if (rho0F === null) return;

    const pts = ds
      .filter(p => p[0] >= -40 && p[0] <= 194)
      .map(p => ({ x: p[0], y: (rho0F - p[1]) / p[1] * 100 }));

    mainDatasets.push({
      label: fixedLabels[index % fixedLabels.length],
      data: pts,
      fill: false,
      borderColor: fixedColors[index % fixedColors.length],
      tension: 0.1,
    });

    // Linear extrapolation of fuel density from 194°F to 350°F
    const n = ds.length;
    const lastT = ds[n - 1][0];       // 194
    const lastRho = ds[n - 1][1];
    const dRho_dT = lastRho - ds[n - 2][1]; // slope per °F

    const extrapPts = [];
    for (let x = Math.round(lastT); x <= 350; x++) {
      const rhoT = lastRho + dRho_dT * (x - lastT);
      extrapPts.push({ x, y: (rho0F - rhoT) / rhoT * 100 });
    }

    extrapolationDatasets.push({
      label: fixedLabels[index % fixedLabels.length],
      data: extrapPts,
      fill: false,
      borderColor: fixedColors[index % fixedColors.length],
      borderDash: [6, 4],
      tension: 0,
      isExtrapolation: true,
    });
  });

  const allDatasets = [...mainDatasets, ...extrapolationDatasets];
  const numMain = mainDatasets.length;

  const whiteBg = {
    id: 'customCanvasBackgroundColor',
    beforeDraw(chart) {
      const ctx2 = chart.canvas.getContext('2d');
      ctx2.save();
      ctx2.globalCompositeOperation = 'destination-over';
      ctx2.fillStyle = 'white';
      ctx2.fillRect(0, 0, chart.width, chart.height);
      ctx2.restore();
    }
  };

  const ctx = document.getElementById('ndExpChart').getContext('2d');
  ndExpChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: allDatasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      layout: { padding: { left: 10, right: 25, top: 5, bottom: 5 } },
      interaction: { mode: 'nearest', axis: 'x' },
      elements: { point: { radius: 0 } },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 20,
            usePointStyle: false,
            boxHeight: 2,
            font: { size: 18 },
            filter: (legendItem, chartData) => {
              return !chartData.datasets[legendItem.datasetIndex].isExtrapolation;
            },
          },
          onClick: function(e, legendItem, legend) {
            const idx = legendItem.datasetIndex;
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(idx);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[idx].hidden : null;
            const extrapIndex = idx + numMain;
            if (extrapIndex < ci.data.datasets.length) {
              const extrapMeta = ci.getDatasetMeta(extrapIndex);
              extrapMeta.hidden = meta.hidden;
            }
            ci.update();
          },
        },
        tooltip: { enabled: true, mode: 'nearest', intersect: false, axis: 'x' },
        customCanvasBackgroundColor: { color: 'white' },
      },
      scales: {
        x: {
          type: 'linear',
          min: -40,
          max: 350,
          ticks: { maxRotation: 0, font: { size: 16 } },
          title: { display: true, text: 'Temperature °F', font: { size: 20 } },
        },
        y: {
          type: 'linear',
          ticks: { font: { size: 16 } },
          title: { display: true, text: 'ΔV/V₀ (%)', font: { size: 20 } },
        },
      },
    },
    plugins: [whiteBg],
  });

  document.getElementById('toggleNdExpTip').addEventListener('click', function() {
    const cur = ndExpChart.options.plugins.tooltip.enabled;
    ndExpChart.options.plugins.tooltip.enabled = !cur;
    ndExpChart.update();
    this.textContent = ndExpChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
}

function ndExpCalc() {
  const operation = document.getElementById('operation').value;
  let idx = 0;
  switch (operation) {
    case 'Av. Gas':           idx = 0; break;
    case 'JP-4, Jet B':       idx = 1; break;
    case 'JP-7, TS':          idx = 2; break;
    case 'JP-8, Jet A, Jet A-1': idx = 3; break;
    case 'JP-5':              idx = 4; break;
    case 'RJ-4':              idx = 5; break;
    case 'JP-10':             idx = 6; break;
    case 'JP-9':              idx = 7; break;
    case 'RJ-6':              idx = 8; break;
    case 'RJ-5':              idx = 9; break;
  }

  const tF = parseFloat(document.getElementById('fahrenheit').value);
  if (isNaN(tF) || !fallData) {
    document.getElementById('ndExp_volpct').innerText = '—';
    document.getElementById('ndExp_rhopct').innerText = '—';
    return;
  }

  const td = transformedData();
  const ds = td[idx];

  // interpolate at 68°F (reference)
  let rho0 = null;
  for (let i = 0; i < ds.length - 1; i++) {
    if (ds[i][0] <= 68 && ds[i+1][0] >= 68) {
      rho0 = ds[i][1] + (68 - ds[i][0]) * (ds[i+1][1] - ds[i][1]) / (ds[i+1][0] - ds[i][0]);
      break;
    }
  }

  // interpolate at tF
  let rhoT = null;
  for (let i = 0; i < ds.length - 1; i++) {
    if (ds[i][0] <= tF && ds[i+1][0] >= tF) {
      rhoT = ds[i][1] + (tF - ds[i][0]) * (ds[i+1][1] - ds[i][1]) / (ds[i+1][0] - ds[i][0]);
      break;
    }
  }

  // Extrapolate rhoT for temperatures beyond 194°F up to 350°F
  if (rhoT === null && tF > 194 && tF <= 350) {
    const n = ds.length;
    const slope = ds[n-1][1] - ds[n-2][1];
    rhoT = ds[n-1][1] + slope * (tF - ds[n-1][0]);
  }

  if (rho0 === null || rhoT === null || flag) {
    document.getElementById('ndExp_volpct').innerText = 'Out of Range';
    document.getElementById('ndExp_rhopct').innerText = 'Out of Range';
    return;
  }

  const dvv = (rho0 - rhoT) / rhoT;
  const drho = (rhoT - rho0) / rho0;
  document.getElementById('ndExp_volpct').innerText = (dvv >= 0 ? '+' : '') + (dvv * 100).toFixed(4) + ' %';
  document.getElementById('ndExp_rhopct').innerText = (drho >= 0 ? '+' : '') + (drho * 100).toFixed(4) + ' %';
}

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
  updateCalculator();
}

// Convert Fahrenheit to Celsius
function convertToCelsius() {
  var fahrenheit = document.getElementById("fahrenheit").value;
  var celsius = (parseFloat(fahrenheit) - 32) * 5/9;
  document.getElementById("celsius").value = celsius.toFixed(2); // Update Celsius box
  updateCalculator();
}

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

//Does Linear interpolation on the water data
function linearInterpolationWater(x, data) {
  // Step 1: Check if the x is within the bounds of the data
  //x = parseFloat(x); //papaParse is returning strings instead of numbers
  minX = Math.min(...data.map(point => point[0])); // Minimum x value
  maxX = Math.max(...data.map(point => point[0])); // Maximum x value

  if (x < minX || x > maxX) {
    console.log('outside of water density data');
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
function updateCalculator() {
  const operation = document.getElementById("operation").value;
  switch (operation) {
    case "Av. Gas":
      switchIndex = 0;
      break;
    case "JP-4, Jet B":
      switchIndex = 1;
      break;
    case "JP-7, TS":
      switchIndex = 2;
      break;
    case "JP-8, Jet A, Jet A-1":
      switchIndex = 3;
      break;
    case "JP-5":
      switchIndex = 4;
      break;
    case "RJ-4":
      switchIndex = 5;
      break;
    case "JP-10":
      switchIndex = 6;
      break;  
     case "JP-9":
      switchIndex = 7;
      break;      
    case "RJ-6":
      switchIndex = 8;
      break;    
    case "RJ-5":
      switchIndex = 9;
      break;     
    }

  let fahrenheit = document.getElementById("fahrenheit").value;
  let nonChartData;

  if (nonChartData == null) {
  nonChartData = transformedData();
  };
  
  let interpolatedValue = linearInterpolation(fahrenheit, nonChartData[switchIndex]);
  console.log(`Interpolated value at x = ${fahrenheit} is y = ${interpolatedValue}`);

  // Extrapolate fuel density for temperatures 194–350°F
  let isExtrapolated = false;
  if (flag === true) {
    const tF_num = parseFloat(fahrenheit);
    if (tF_num > 194 && tF_num <= 350) {
      const ds = nonChartData[switchIndex];
      const n = ds.length;
      const slope = ds[n-1][1] - ds[n-2][1]; // density change per °F
      interpolatedValue = ds[n-1][1] + slope * (tF_num - ds[n-1][0]);
      flag = false;
      isExtrapolated = true;
    }
  }
  const warnEl = document.getElementById('extrapolationWarning');
  if (warnEl) warnEl.style.display = isExtrapolated ? '' : 'none';

  let interp_densityWater = linearInterpolationWater(fahrenheit, densityWater);

  if (flag == true) {
      document.getElementById("result_density1").innerText = ("Out of Range");
      document.getElementById("result_density2").innerText = ("Out of Range");
      document.getElementById("result_density3").innerText = ("Out of Range");
      document.getElementById("result_density4").innerText = ("Out of Range");
      document.getElementById("result_density5").innerText = ("Out of Range");
      document.getElementById("result_density6").innerText = ("Out of Range");
      document.getElementById("result_density7").innerText = ("Out of Range");
      document.getElementById("result_density8").innerText = ("Out of Range");
  } else {
      document.getElementById("result_density1").innerText = ((interpolatedValue).toFixed(3));
      document.getElementById("result_density2").innerText = ((interpolatedValue*0.000036127298147753).toFixed(5));
      document.getElementById("result_density3").innerText = ((interpolatedValue*0.0083454063545262).toFixed(4));
      document.getElementById("result_density4").innerText = ((interpolatedValue/1000).toFixed(5));
      document.getElementById("result_density5").innerText = ((interpolatedValue/998).toFixed(5));
      document.getElementById("result_density6").innerText = (interp_densityWater != null && !isNaN(interp_densityWater)) ? ((interpolatedValue/interp_densityWater).toFixed(5)) : 'N/A';
      document.getElementById("result_density7").innerText = (((141.5/(interpolatedValue/998))-131.5).toFixed(5));
      document.getElementById("result_density8").innerText = ((interpolatedValue*0.0083454063545262*7.48052).toFixed(4));
  }
  ndExpCalc();
}
