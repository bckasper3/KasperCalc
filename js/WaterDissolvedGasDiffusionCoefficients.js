// Diffusion coefficients (×10⁻⁵ cm²/s) at atmospheric pressure
// d array: [10°C, 15°C, 20°C, 25°C, 30°C, 35°C] — null = no data
const diffCoeffData = [
  { name: 'Acetylene',              formula: 'C₂H₂',   d: [1.43, 1.59, 1.78, 1.99, 2.23, null] },
  { name: 'Ammonia',                formula: 'NH₃',         d: [null, 1.30, 1.50, null, null, null] },
  { name: 'Argon',                  formula: 'Ar',               d: [null, null, null, 2.50, null, null] },
  { name: 'Bromomethane',           formula: 'CH₃Br',       d: [null, null, null, 1.35, null, null] },
  { name: 'Carbon dioxide',         formula: 'CO₂',         d: [1.26, 1.45, 1.67, 1.91, 2.17, 2.47] },
  { name: 'Chlorine',               formula: 'Cl₂',         d: [null, 1.13, 1.50, 1.89, null, null] },
  { name: 'Chloromethane',          formula: 'CH₃Cl',       d: [null, null, null, 1.40, null, null] },
  { name: 'Dichlorofluoromethane',  formula: 'CHCl₂F',      d: [null, null, null, 1.80, null, null] },
  { name: 'Helium',                 formula: 'He',               d: [5.67, 6.18, 6.71, 7.28, 7.87, 8.48] },
  { name: 'Hydrogen',               formula: 'H₂',          d: [3.62, 4.08, 4.58, 5.11, 5.69, 6.31] },
  { name: 'Hydrogen bromide',       formula: 'HBr',              d: [null, null, null, 3.15, null, null] },
  { name: 'Hydrogen chloride',      formula: 'HCl',              d: [null, null, null, 3.07, null, null] },
  { name: 'Hydrogen sulfide',       formula: 'H₂S',         d: [null, null, null, 1.36, null, null] },
  { name: 'Krypton',                formula: 'Kr',               d: [1.20, 1.39, 1.60, 1.84, 2.11, 2.40] },
  { name: 'Methane',                formula: 'CH₄',         d: [1.24, 1.43, 1.62, 1.84, 2.08, 2.35] },
  { name: 'Neon',                   formula: 'Ne',               d: [2.93, 3.27, 3.64, 4.03, 4.45, 4.89] },
  { name: 'Nitrogen',               formula: 'N₂',          d: [null, null, null, 2.00, null, null] },
  { name: 'Nitrogen dioxide',       formula: 'NO₂',         d: [null, null, 1.23, 1.40, 1.59, null] },
  { name: 'Nitrous oxide',          formula: 'N₂O',         d: [null, 1.62, 2.11, 2.57, null, null] },
  { name: 'Oxygen',                 formula: 'O₂',          d: [null, 1.67, 2.01, 2.42, null, null] },
  { name: 'Radon',                  formula: 'Rn',               d: [0.81, 0.96, 1.13, 1.33, 1.55, 1.80] },
  { name: 'Sulfur dioxide',         formula: 'SO₂',         d: [null, null, 1.62, 1.83, 2.07, 2.32] },
  { name: 'Xenon',                  formula: 'Xe',               d: [0.93, 1.08, 1.27, 1.47, 1.70, 1.95] },
];

const tempsFahrenheit = [50, 59, 68, 77, 86, 95];

const chartColors = [
  'rgb(68,119,170)',
  'rgb(238,102,119)',
  'rgb(34,136,51)',
  'rgb(204,187,68)',
  'rgb(170,51,119)',
  'rgb(102,204,238)',
  'rgb(238,119,51)',
  'rgb(0,153,136)',
  'rgb(153,153,51)',
  'rgb(136,34,85)',
  'rgb(204,51,17)',
  'rgb(187,187,187)',
];

let myChart;

document.addEventListener('DOMContentLoaded', function () {
  // Chart: only gases with 4 or more data points
  const chartGases = diffCoeffData.filter(g => g.d.filter(v => v !== null).length >= 4);

  let colorIdx = 0;
  const datasets = chartGases.map(gas => {
    const points = gas.d
      .map((v, i) => v !== null ? { x: tempsFahrenheit[i], y: v } : null)
      .filter(p => p !== null);
    return {
      label: gas.name + ' (' + gas.formula + ')',
      data: points,
      fill: false,
      showLine: true,
      borderColor: chartColors[colorIdx % chartColors.length],
      tension: 0.1,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      _colorIdx: colorIdx++,
    };
  });

  const config = {
    type: 'scatter',
    data: { datasets },
    options: {
      plugins: {
        legend: {
          labels: {
            align: 'top',
            padding: 20,
            usePointStyle: false,
            boxHeight: 2,
            font: { size: 16 },
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
          callbacks: {
            label: function(ctx) {
              return ctx.dataset.label + ': ' + ctx.parsed.y + ' ×10⁻⁵ cm²/s';
            }
          }
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
      responsive: true,
      scales: {
        x: {
          type: 'linear',
          min: 48,
          max: 97,
          ticks: {
            maxRotation: 0,
            font: { size: 16 },
            callback: function(val) { return val + '°F'; }
          },
          title: {
            display: true,
            text: 'Temperature °F',
            font: { size: 20 },
          }
        },
        y: {
          type: 'linear',
          min: 0,
          ticks: { font: { size: 16 } },
          title: {
            display: true,
            text: 'D (×10⁻⁵ cm²/s)',
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
