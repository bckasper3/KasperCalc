// Viscosity CSV files: [Freeze Curve, 50%, 45%, 40%, 35%, 30%, 25%]
const pgViscFiles = [
  '../csvData/propyleneglycol/pg-22.csv',
  '../csvData/propyleneglycol/pg-23.csv',
  '../csvData/propyleneglycol/pg-24.csv',
  '../csvData/propyleneglycol/pg-25.csv',
  '../csvData/propyleneglycol/pg-26.csv',
  '../csvData/propyleneglycol/pg-27.csv',
  '../csvData/propyleneglycol/pg-28.csv',
];

// Density CSV files: [Freeze Curve, 25%, 30%, 35%, 40%, 45%, 50%]
const pgDensFiles = [
  '../csvData/propyleneglycol/pg-1.csv',
  '../csvData/propyleneglycol/pg-2.csv',
  '../csvData/propyleneglycol/pg-3.csv',
  '../csvData/propyleneglycol/pg-4.csv',
  '../csvData/propyleneglycol/pg-5.csv',
  '../csvData/propyleneglycol/pg-6.csv',
  '../csvData/propyleneglycol/pg-7.csv',
];

// Maps viscosity index [0..6] to density index [0..6]
// Visc order: [Freeze Curve, 50%, 45%, 40%, 35%, 30%, 25%]
// Dens order: [Freeze Curve, 25%, 30%, 35%, 40%, 45%, 50%]
const pgDensIndexForVisc = [0, 6, 5, 4, 3, 2, 1];

const pgColors = [
  'rgb(68,119,170)',
  'rgb(34,136,51)',
  'rgb(204,187,68)',
  'rgb(238,102,119)',
  'rgb(170,51,119)',
  'rgb(187,187,187)',
  'rgb(102,204,238)',
];

const pgViscLabels = ['Freeze Curve', '50%', '45%', '40%', '35%', '30%', '25%'];

let pgViscData = null;
let pgDensData = null;
let pgViscChart = null;
let pgKinChart = null;

function pgParseCSV(text) {
  const parsed = [];
  text.trim().split('\n').forEach(row => {
    const cols = row.split(',');
    if (cols.length >= 2) {
      const x = parseFloat(cols[0].trim());
      const y = parseFloat(cols[1].trim());
      if (!isNaN(x) && !isNaN(y)) parsed.push({ x, y });
    }
  });
  return parsed;
}

async function pgFetchCSVs(filePaths) {
  const all = [];
  for (const fp of filePaths) {
    try {
      const res = await fetch(fp);
      all.push(pgParseCSV(await res.text()));
    } catch (err) {
      console.error('Error loading', fp, err);
      all.push([]);
    }
  }
  return all;
}

// Linear interpolation on array of {x, y} objects
function pgLinInterp(xTarget, data) {
  if (!data || data.length === 0) return NaN;
  for (let i = 0; i < data.length - 1; i++) {
    if (xTarget >= data[i].x && xTarget <= data[i + 1].x) {
      return data[i].y + (xTarget - data[i].x) * (data[i + 1].y - data[i].y) / (data[i + 1].x - data[i].x);
    }
  }
  return NaN;
}

// Build kinematic datasets: ν [cSt] = μ [mPa·s] × 1000 / ρ [kg/m³]
function pgBuildKinDatasets() {
  return pgViscData.map((vData, vi) => {
    const dData = pgDensData[pgDensIndexForVisc[vi]];
    if (!vData.length || !dData.length) return { label: pgViscLabels[vi], data: [], fill: false, borderColor: pgColors[vi], tension: 0.1 };
    const minF = Math.max(vData[0].x, dData[0].x);
    const maxF = Math.min(vData[vData.length - 1].x, dData[dData.length - 1].x);
    const pts = [];
    for (let t = minF; t <= maxF; t += 1) {
      const mu  = pgLinInterp(t, vData);
      const rho = pgLinInterp(t, dData);
      if (!isNaN(mu) && !isNaN(rho) && rho > 0)
        pts.push({ x: t, y: parseFloat((mu * 1000 / rho).toFixed(4)) });
    }
    return { label: pgViscLabels[vi], data: pts, fill: false, borderColor: pgColors[vi], tension: 0.1 };
  });
}

const pgCustomBg = {
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

function pgMakeChart(canvasId, datasets, yLabel) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { datasets },
    plugins: [pgCustomBg],
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
          max: 176,
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

function pgInit() {
  const dynDatasets = pgViscData.map((data, i) => ({
    label: pgViscLabels[i],
    data: data.map(p => ({ x: p.x, y: p.y })),
    fill: false,
    borderColor: pgColors[i],
    tension: 0.1
  }));

  pgViscChart = pgMakeChart('myChart',  dynDatasets,         'Dynamic (Absolute) Viscosity (mPa·s)');
  pgKinChart  = pgMakeChart('kinChart', pgBuildKinDatasets(), 'Kinematic Viscosity (cSt = mm²/s)');

  document.getElementById('toggleTooltipButton').addEventListener('click', function () {
    pgViscChart.options.plugins.tooltip.enabled = !pgViscChart.options.plugins.tooltip.enabled;
    pgViscChart.update();
    this.textContent = pgViscChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });

  document.getElementById('toggleTooltipButtonKin').addEventListener('click', function () {
    pgKinChart.options.plugins.tooltip.enabled = !pgKinChart.options.plugins.tooltip.enabled;
    pgKinChart.update();
    this.textContent = pgKinChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });

  convertToCelsius();
  calculate();
}

Promise.all([pgFetchCSVs(pgViscFiles), pgFetchCSVs(pgDensFiles)])
  .then(([viscData, densData]) => {
    pgViscData = viscData;
    pgDensData = densData;
    pgInit();
  })
  .catch(err => console.error('Error loading PG viscosity/density data:', err));

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

function pgConcentrationIndex(op) {
  switch (op) {
    case 'Freeze Curve': return 0;
    case '50':           return 1;
    case '45':           return 2;
    case '40':           return 3;
    case '35':           return 4;
    case '30':           return 5;
    case '25':           return 6;
    default:             return 0;
  }
}

function calculate() {
  if (!pgViscData || !pgDensData) return;

  const op   = document.getElementById('operation').value;
  const fahr = parseFloat(document.getElementById('fahrenheit').value);
  const vi   = pgConcentrationIndex(op);
  const vData = pgViscData[vi];
  const dData = pgDensData[pgDensIndexForVisc[vi]];

  const dynIds = ['result_density1','result_density4','result_density3','result_density2','result_density5','result_density6'];
  const kinIds = ['result_kin1','result_kin2','result_kin3','result_kin4','result_kin5','result_kin6'];

  const dynOK  = vData && vData.length > 0 && !isNaN(fahr) && fahr >= vData[0].x && fahr <= vData[vData.length - 1].x;
  const densOK = dData && dData.length > 0 && !isNaN(fahr) && fahr >= dData[0].x && fahr <= dData[dData.length - 1].x;

  if (dynOK) {
    const mu = pgLinInterp(fahr, vData);
    document.getElementById('result_density1').textContent = mu.toFixed(4);                     // mPa·s
    document.getElementById('result_density4').textContent = mu.toFixed(4);                     // cP (= mPa·s)
    document.getElementById('result_density3').textContent = (mu * 0.01).toFixed(6);            // Poise
    document.getElementById('result_density2').textContent = (mu * 0.001).toFixed(7);           // Pa·s
    document.getElementById('result_density5').textContent = (mu * 0.000671969).toFixed(6);     // lbm/(ft·s)
    document.getElementById('result_density6').textContent = (mu * 3.6).toFixed(5);             // kg/(m·h)
  } else {
    dynIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }

  if (dynOK && densOK) {
    const mu  = pgLinInterp(fahr, vData);
    const rho = pgLinInterp(fahr, dData);
    const nu  = mu * 1000 / rho;
    document.getElementById('result_kin1').textContent = nu.toFixed(4);                         // mm²/s
    document.getElementById('result_kin2').textContent = nu.toFixed(4);                         // cSt (= mm²/s)
    document.getElementById('result_kin3').textContent = (nu * 0.01).toFixed(6);                // Stokes
    document.getElementById('result_kin4').textContent = (nu * 1e-6).toExponential(3);          // m²/s
    document.getElementById('result_kin5').textContent = (nu * 0.0015500031).toFixed(6);        // in²/s
    document.getElementById('result_kin6').textContent = (nu * 0.000010764).toFixed(7);         // ft²/s
  } else {
    kinIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }
}
