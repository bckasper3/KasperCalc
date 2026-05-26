// Kinematic viscosity CSVs: [RJ-5, JP-4/Jet B, TS, JP-5/Jet A/JP-8, JP-7, JP-9/JP-10, RJ-4, RJ-6, Av.Gas]
const csvFiles = [
  '../csvData/55.csv',
  '../csvData/48.csv',
  '../csvData/49.csv',
  '../csvData/50.csv',
  '../csvData/51.csv',
  '../csvData/52.csv',
  '../csvData/53.csv',
  '../csvData/54.csv',
  '../csvData/47.csv',
];

// Density CSVs matched to the kinematic viscosity order above
const densFilesForKin = [
  '../csvData/10.csv', // RJ-5
  '../csvData/2.csv',  // JP-4, Jet B
  '../csvData/3.csv',  // TS  (shares density curve with JP-7)
  '../csvData/4.csv',  // JP-5, Jet A, Jet A-1, JP-8
  '../csvData/3.csv',  // JP-7 (shares density curve with TS)
  '../csvData/8.csv',  // JP-9, JP-10 (using JP-9 nominal density)
  '../csvData/6.csv',  // RJ-4
  '../csvData/9.csv',  // RJ-6
  '../csvData/1.csv',  // Av. Gas
];

const fixedColors = [
  'rgb(68,119,170)',
  'rgb(34,136,51)',
  'rgb(204,187,68)',
  'rgb(238,102,119)',
  'rgb(170,51,119)',
  'rgb(187,187,187)',
  'rgb(102,204,238)',
  'rgb(238,119,51)',
  'rgb(204,51,17)',
];

const fixedLabels = [
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

async function processCSVFiles(filePaths) {
  const allData = [];
  for (const filePath of filePaths) {
    try {
      const response = await fetch(filePath);
      const csvData = await response.text();
      allData.push(parseCSV(csvData));
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      allData.push([]);
    }
  }
  return allData;
}

function parseCSV(csvData) {
  const rows = csvData.trim().split('\n');
  const parsedData = [];
  rows.forEach(row => {
    const columns = row.split(',');
    if (columns.length >= 2) {
      const x = parseFloat(columns[0].trim());
      const y = parseFloat(columns[1].trim());
      if (!isNaN(x) && !isNaN(y)) parsedData.push({ x, y });
    }
  });
  return parsedData;
}

let fallData = null;
let densData = null;
let myChart  = null;
let dynChart  = null;

Promise.all([processCSVFiles(csvFiles), processCSVFiles(densFilesForKin)])
  .then(([kinData, dData]) => {
    fallData = kinData;
    densData = dData;
    createGraph();
    convertToCelsius();
    calculate();
  })
  .catch(error => console.error('Error processing CSV files:', error));

const customBg = {
  id: 'customCanvasBackgroundColor',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

function makeJetFuelChart(canvasId, datasets, yLabel) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { datasets },
    plugins: [customBg],
    options: {
      maintainAspectRatio: false,
      layout: { padding: { left: 10, right: 25, top: 5, bottom: 5 } },
      interaction: { mode: 'nearest', axis: 'x' },
      elements: { point: { radius: 0 } },
      responsive: true,
      plugins: {
        legend: {
          labels: { align: 'top', padding: 20, usePointStyle: false, boxHeight: 2, font: { size: 18 } },
          onClick(e, legendItem, legend) {
            const i = legendItem.datasetIndex;
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(i);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[i].hidden : null;
            ci.update();
          }
        },
        tooltip: { enabled: true, mode: 'nearest', intersect: false, axis: 'x' },
        customCanvasBackgroundColor: { color: 'white' }
      },
      scales: {
        x: {
          type: 'linear',
          min: -40,
          max: 356,
          ticks: { maxRotation: 0, font: { size: 16 } },
          title: { display: true, text: 'Temperature °F', font: { size: 20 } }
        },
        y: {
          type: 'logarithmic',
          ticks: { font: { size: 16 } },
          title: { display: true, text: yLabel, padding: 10, font: { size: 20 } }
        }
      }
    }
  });
}

// Linear interpolation on {x,y} object array
function kinLinInterp(xTarget, data) {
  if (!data || data.length === 0) return NaN;
  for (let i = 0; i < data.length - 1; i++) {
    if (xTarget >= data[i].x && xTarget <= data[i + 1].x) {
      return data[i].y + (xTarget - data[i].x) * (data[i + 1].y - data[i].y) / (data[i + 1].x - data[i].x);
    }
  }
  return NaN;
}

function createGraph() {
  // Kinematic viscosity chart
  const kinDatasets = fallData.map((dataSet, i) => ({
    label: fixedLabels[i],
    data: dataSet.map(p => ({ x: p.x, y: p.y })),
    fill: false,
    borderColor: fixedColors[i],
    tension: 0.1
  }));
  myChart = makeJetFuelChart('myChart', kinDatasets, 'Kinematic Viscosity (cSt = mm²/s)');

  // Dynamic (absolute) viscosity chart: μ [mPa·s] = ν [cSt] × ρ [kg/m³] / 1000
  const dynDatasets = fallData.map((kinSet, i) => {
    const dSet = densData[i];
    if (!dSet || dSet.length === 0) return { label: fixedLabels[i], data: [], fill: false, borderColor: fixedColors[i], tension: 0.1 };
    const minF = Math.max(kinSet[0].x, dSet[0].x);
    const maxF = Math.min(kinSet[kinSet.length - 1].x, dSet[dSet.length - 1].x);
    const pts = [];
    for (let t = minF; t <= maxF; t += 1) {
      const nu  = kinLinInterp(t, kinSet);
      const rho = kinLinInterp(t, dSet);
      if (!isNaN(nu) && !isNaN(rho) && rho > 0)
        pts.push({ x: t, y: parseFloat((nu * rho / 1000).toFixed(4)) });
    }
    return { label: fixedLabels[i], data: pts, fill: false, borderColor: fixedColors[i], tension: 0.1 };
  });
  dynChart = makeJetFuelChart('dynChart', dynDatasets, 'Dynamic (Absolute) Viscosity (mPa·s)');

  // Tooltip toggles
  document.getElementById('toggleTooltipButton').addEventListener('click', function () {
    myChart.options.plugins.tooltip.enabled = !myChart.options.plugins.tooltip.enabled;
    myChart.update();
    this.textContent = myChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });

  document.getElementById('toggleTooltipButtonDyn').addEventListener('click', function () {
    dynChart.options.plugins.tooltip.enabled = !dynChart.options.plugins.tooltip.enabled;
    dynChart.update();
    this.textContent = dynChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
}

function convertToFahrenheit() {
  const c = parseFloat(document.getElementById('celsius').value);
  document.getElementById('fahrenheit').value = ((c * 9 / 5) + 32).toFixed(2);
  calculate();
}

function convertToCelsius() {
  const f = parseFloat(document.getElementById('fahrenheit').value);
  document.getElementById('celsius').value = ((f - 32) * 5 / 9).toFixed(2);
  calculate();
}

let switchIndex = 0;

function calculate() {
  if (!fallData || !densData) return;

  const operation = document.getElementById('operation').value;
  switch (operation) {
    case 'RJ-5':                        switchIndex = 0; break;
    case 'JP-4, Jet B':                 switchIndex = 1; break;
    case 'TS':                          switchIndex = 2; break;
    case 'JP-5, Jet A, Jet A-1, JP-8': switchIndex = 3; break;
    case 'JP-7':                        switchIndex = 4; break;
    case 'JP-9, JP-10':                 switchIndex = 5; break;
    case 'RJ-4':                        switchIndex = 6; break;
    case 'RJ-6':                        switchIndex = 7; break;
    case 'Av. Gas':                     switchIndex = 8; break;
  }

  const fahr    = parseFloat(document.getElementById('fahrenheit').value);
  const kinSet  = fallData[switchIndex];
  const densSet = densData[switchIndex];

  const kinIds = ['result_density1','result_density2','result_density3','result_density4','result_density5','result_density6'];
  const dynIds = ['result_dyn1','result_dyn2','result_dyn3','result_dyn4','result_dyn5'];

  const kinOK  = kinSet  && kinSet.length  > 0 && !isNaN(fahr) && fahr >= kinSet[0].x  && fahr <= kinSet[kinSet.length - 1].x;
  const densOK = densSet && densSet.length > 0 && !isNaN(fahr) && fahr >= densSet[0].x && fahr <= densSet[densSet.length - 1].x;

  if (kinOK) {
    const nu = kinLinInterp(fahr, kinSet);
    document.getElementById('result_density1').textContent = nu.toFixed(4);                    // mm²/s
    document.getElementById('result_density2').textContent = nu.toFixed(4);                    // cSt (= mm²/s)
    document.getElementById('result_density3').textContent = (nu * 0.01).toFixed(6);           // Stokes
    document.getElementById('result_density4').textContent = (nu * 1e-6).toExponential(3);     // m²/s
    document.getElementById('result_density5').textContent = (nu * 0.0015500031).toFixed(6);   // in²/s
    document.getElementById('result_density6').textContent = (nu * 0.0000107639).toFixed(7);   // ft²/s
  } else {
    kinIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }

  if (kinOK && densOK) {
    const nu  = kinLinInterp(fahr, kinSet);
    const rho = kinLinInterp(fahr, densSet);
    const mu  = nu * rho / 1000;
    document.getElementById('result_dyn1').textContent = mu.toFixed(4);                        // mPa·s
    document.getElementById('result_dyn2').textContent = mu.toFixed(4);                        // cP (= mPa·s)
    document.getElementById('result_dyn3').textContent = (mu * 0.01).toFixed(6);               // Poise
    document.getElementById('result_dyn4').textContent = (mu * 0.001).toFixed(7);              // Pa·s
    document.getElementById('result_dyn5').textContent = (mu * 0.000671969).toFixed(6);        // lbm/(ft·s)
  } else {
    dynIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }
}
