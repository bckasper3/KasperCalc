// [tempC, Cv_kJkgK, Cp_kJkgK]
const waterHcData = [
  [0.01,  4.2174, 4.2199],
  [10,    4.1910, 4.1955],
  [20,    4.1570, 4.1844],
  [25,    4.1379, 4.1816],
  [30,    4.1175, 4.1801],
  [40,    4.0737, 4.1796],
  [50,    4.0264, 4.1815],
  [60,    3.9767, 4.1851],
  [70,    3.9252, 4.1902],
  [80,    3.8729, 4.1969],
  [90,    3.8204, 4.2053],
  [100,   3.7682, 4.2157],
  [110,   3.7167, 4.2283],
  [120,   3.6662, 4.2435],
  [140,   3.5694, 4.2826],
  [160,   3.4788, 4.3354],
  [180,   3.3949, 4.4050],
  [200,   3.3179, 4.4958],
  [220,   3.2479, 4.6146],
  [240,   3.1850, 4.7719],
  [260,   3.1301, 4.9856],
  [280,   3.0849, 5.2889],
  [300,   3.0530, 5.7504],
  [320,   3.0428, 6.5373],
  [340,   3.0781, 8.2080],
  [360,   3.2972, 15.004],
];

const MW_WATER = 18.015;

function interpolate(tempC) {
  if (tempC < 0 || tempC > 360) return null;
  if (tempC < 0.01) tempC = 0.01;
  for (let i = 0; i < waterHcData.length - 1; i++) {
    const [t0, cv0, cp0] = waterHcData[i];
    const [t1, cv1, cp1] = waterHcData[i + 1];
    if (tempC >= t0 && tempC <= t1) {
      const f = (tempC - t0) / (t1 - t0);
      return { cv: cv0 + f * (cv1 - cv0), cp: cp0 + f * (cp1 - cp0) };
    }
  }
  return null;
}

function toTempC(val, unit) {
  if (unit === 'degF') return (val - 32) / 1.8;
  if (unit === 'degK') return val - 273.15;
  if (unit === 'degR') return (val - 491.67) / 1.8;
  return val;
}

function updateLabel() {
  const unit = document.getElementById('operation').value;
  const labels = { degC: '°C:', degF: '°F:', degK: 'K:', degR: '°R:' };
  document.getElementById('tempLabel').textContent = labels[unit];
}

function setOutOfRange() {
  ['cv_jmolk','cv_kjkgk','cv_kwh','cv_kcal','cp_jmolk','cp_kjkgk','cp_kwh','cp_kcal']
    .forEach(id => { document.getElementById('result_' + id).textContent = 'Out of range'; });
}

function calculate() {
  updateLabel();
  const unit = document.getElementById('operation').value;
  const val = parseFloat(document.getElementById('input2').value);
  if (isNaN(val)) { setOutOfRange(); return; }
  const tempC = toTempC(val, unit);
  const r = interpolate(tempC);
  if (!r) { setOutOfRange(); return; }

  document.getElementById('result_cv_jmolk').textContent = (r.cv * MW_WATER).toFixed(3);
  document.getElementById('result_cv_kjkgk').textContent = r.cv.toFixed(4);
  document.getElementById('result_cv_kwh').textContent   = (r.cv / 3600).toFixed(6);
  document.getElementById('result_cv_kcal').textContent  = (r.cv / 4.1868).toFixed(4);

  document.getElementById('result_cp_jmolk').textContent = (r.cp * MW_WATER).toFixed(3);
  document.getElementById('result_cp_kjkgk').textContent = r.cp.toFixed(4);
  document.getElementById('result_cp_kwh').textContent   = (r.cp / 3600).toFixed(6);
  document.getElementById('result_cp_kcal').textContent  = (r.cp / 4.1868).toFixed(4);
}

let myChart;

document.addEventListener('DOMContentLoaded', function () {
  calculate();

  const temps_F = waterHcData.map(d => d[0] * 9 / 5 + 32);
  const cvs     = waterHcData.map(d => d[1]);
  const cps     = waterHcData.map(d => d[2]);

  const config = {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Cv — Isochoric',
          data: temps_F.map((t, i) => ({ x: t, y: cvs[i] })),
          fill: false,
          borderColor: 'rgb(68,119,170)',
          tension: 0.1,
        },
        {
          label: 'Cp — Isobaric',
          data: temps_F.map((t, i) => ({ x: t, y: cps[i] })),
          fill: false,
          borderColor: 'rgb(238,102,119)',
          tension: 0.1,
        }
      ]
    },
    options: {
      decimation: { enabled: false },
      plugins: {
        legend: {
          labels: {
            align: 'top',
            padding: 20,
            usePointStyle: false,
            boxHeight: 2,
            font: { size: 18 },
          },
          onClick: function(e, legendItem, legend) {
            const datasetIndex = legendItem.datasetIndex;
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(datasetIndex);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[datasetIndex].hidden : null;
            ci.update();
          },
        },
        tooltip: {
          enabled: true,
          mode: 'nearest',
          intersect: false,
          axis: 'x',
        },
        customCanvasBackgroundColor: { color: 'white' },
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
          min: 32,
          max: 681,
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
          ticks: { font: { size: 16 } },
          title: {
            display: true,
            text: 'Specific Heat kJ/(kg·K)',
            padding: 10,
            font: { size: 20 },
          }
        }
      }
    }
  };

  const ctx = document.getElementById('myChart').getContext('2d');
  myChart = new Chart(ctx, config);

  document.getElementById('toggleTooltipButton').addEventListener('click', function () {
    const current = myChart.options.plugins.tooltip.enabled;
    myChart.options.plugins.tooltip.enabled = !current;
    myChart.update();
    this.textContent = myChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
});
