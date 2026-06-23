/* sensor-charts.js — Chart.js wiring: Time Plot, Bit Plot, Hamming histogram */
'use strict';

var SensorCharts = (function() {
  var _timePlotChart = null;
  var _bitPlotChart  = null;
  var _hammingChart  = null;

  /* ── INIT ──────────────────────────────────────────────────────── */
  function _init() {
    _initTimePlot();
    _initBitPlot();
    _initHamming();
  }

  /* ── TIME PLOT ─────────────────────────────────────────────────── */
  function _initTimePlot() {
    var canvas = document.getElementById('chartTimePlot');
    if (!canvas || !window.Chart) return;
    if (_timePlotChart) { _timePlotChart.destroy(); _timePlotChart = null; }

    var plugins = {};
    if (window.ChartZoom || (Chart.registry && Chart.registry.plugins && Chart.registry.plugins.get('zoom'))) {
      plugins = {
        zoom: {
          pan:  { enabled: true, mode: 'xy' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
        }
      };
    }

    _timePlotChart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Time / Sample Index', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
          y: {
            title: { display: true, text: 'Value', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
        },
        plugins: Object.assign({
          legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + ctx.parsed.y.toPrecision(5);
              }
            }
          },
        }, plugins),
        elements: { point: { radius: 0, hitRadius: 4 }, line: { borderWidth: 1.5 } },
      }
    });

    /* Reset zoom button */
    var resetBtn = document.getElementById('btnResetZoom');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (_timePlotChart && _timePlotChart.resetZoom) _timePlotChart.resetZoom();
      });
    }
  }

  function updateTimePlot() {
    if (!_timePlotChart) _initTimePlot();
    if (!_timePlotChart) return;

    var channels = SensorManager.getAllChannels();
    var normalize = SensorManager.isNormalizeActive();

    var datasets = channels
      .filter(function(ch){ return ch.enabled && !ch.hidden; })
      .map(function(ch) {
        var samples = SensorManager.getDisplaySamples(ch);
        var ts      = ch.timestamps ? Array.from(ch.timestamps) : null;
        var data = samples.map(function(v, i) {
          return { x: ts ? ts[i] : i, y: v };
        });
        return {
          label: ch.name + (ch.units ? ' (' + ch.units + ')' : ''),
          data:  data,
          borderColor: ch.color,
          backgroundColor: ch.color + '22',
          tension: 0,
          pointRadius: 0,
          borderWidth: 1.5,
        };
      });

    _timePlotChart.data.datasets = datasets;
    _timePlotChart.options.scales.y.title.text = normalize ? 'Normalized (0–1)' : 'Value';
    _timePlotChart.update('none');
  }

  function resizeTimePlot() {
    if (_timePlotChart) _timePlotChart.resize();
  }

  function zoomToEvent(idx) {
    var evt = SensorEvents.getEvent(idx);
    if (!evt || !_timePlotChart) return;
    /* Switch to Time Plot tab */
    var btn = document.querySelector('.graph-tab[onclick*="switchSensorGraphTab(1"]');
    if (btn && !btn.classList.contains('active')) btn.click();

    var pad  = evt.duration * 2 || 10;
    var xMin = evt.start - pad;
    var xMax = evt.end   + pad;
    _timePlotChart.options.scales.x.min = xMin;
    _timePlotChart.options.scales.x.max = xMax;
    _timePlotChart.update('none');
  }

  /* ── BIT PLOT ──────────────────────────────────────────────────── */
  function _initBitPlot() {
    var canvas = document.getElementById('chartBitPlot');
    if (!canvas || !window.Chart) return;
    if (_bitPlotChart) { _bitPlotChart.destroy(); _bitPlotChart = null; }

    _bitPlotChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Bit Occupancy P(1)', data: [], backgroundColor: '#699dad', borderColor: '#3a6270', borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 150 },
        scales: {
          x: { title: { display: true, text: 'Bit Position (0 = LSB)', font: { size: 11 } }, ticks: { font: { size: 10 } } },
          y: { min: 0, max: 1, title: { display: true, text: 'P(bit = 1)', font: { size: 11 } }, ticks: { font: { size: 10 } } },
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: { callbacks: {
            label: function(ctx){ return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(4); }
          }},
        },
      }
    });
  }

  function updateBitPlot(result, view) {
    if (!_bitPlotChart) _initBitPlot();
    if (!_bitPlotChart) return;
    if (!result) {
      _bitPlotChart.data.labels = [];
      _bitPlotChart.data.datasets[0].data = [];
      _bitPlotChart.update('none');
      return;
    }
    var bw     = result.bitWidth;
    var labels = Array.from({length: bw}).map(function(_, i){ return 'Bit ' + i; });
    var data   = (view === 'toggle') ? result.toggleRate : result.occupancy;
    var label  = (view === 'toggle') ? 'Toggle Rate' : 'Bit Occupancy P(1)';
    var color  = (view === 'toggle') ? '#E91E63' : '#699dad';

    _bitPlotChart.data.labels              = labels;
    _bitPlotChart.data.datasets[0].label   = label;
    _bitPlotChart.data.datasets[0].data    = data;
    _bitPlotChart.data.datasets[0].backgroundColor = color + 'aa';
    _bitPlotChart.data.datasets[0].borderColor      = color;
    _bitPlotChart.options.scales.y.title.text = (view === 'toggle') ? 'Toggle Rate' : 'P(bit = 1)';
    _bitPlotChart.update();
  }

  function resizeBitPlot() {
    if (_bitPlotChart) _bitPlotChart.resize();
    if (_hammingChart)  _hammingChart.resize();
  }

  /* ── HAMMING HISTOGRAM ─────────────────────────────────────────── */
  function _initHamming() {
    var canvas = document.getElementById('chartHamming');
    if (!canvas || !window.Chart) return;
    if (_hammingChart) { _hammingChart.destroy(); _hammingChart = null; }

    _hammingChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Hamming Distance Count', data: [], backgroundColor: '#4CAF5088', borderColor: '#4CAF50', borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 150 },
        scales: {
          x: { title: { display: true, text: 'Hamming Distance (# bits changed)', font: { size: 11 } }, ticks: { font: { size: 10 } } },
          y: { title: { display: true, text: 'Count', font: { size: 11 } }, ticks: { font: { size: 10 } } },
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
        },
      }
    });
  }

  function updateHamming(result) {
    if (!_hammingChart) _initHamming();
    if (!_hammingChart || !result) return;
    var labels = result.hammingHist.map(function(_, i){ return i.toString(); });
    _hammingChart.data.labels = labels;
    _hammingChart.data.datasets[0].data = result.hammingHist;
    _hammingChart.update();
  }

  /* ── DOM READY ─────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    _init();
    /* Patch updateBitPlot to also update hamming */
    var origUpdateBitPlot = updateBitPlot;
    /* We need to expose the Hamming update via the bitdiag results hook */
    /* This is triggered when bitdiag posts back; we'll update from the bitPlotChannelSelect change */
    var plotSel = document.getElementById('bitPlotChannelSelect');
    if (plotSel) {
      plotSel.addEventListener('change', function() {
        /* Hamming uses the same result object — refresh both when user picks a channel */
        var chId = parseInt(this.value, 10);
        if (SensorBitDiag && SensorBitDiag._results) {
          /* results are encapsulated, but we re-run to get them */
        }
      });
    }
  });

  return {
    updateTimePlot: updateTimePlot,
    resizeTimePlot: resizeTimePlot,
    zoomToEvent: zoomToEvent,
    updateBitPlot: updateBitPlot,
    updateHamming: updateHamming,
    resizeBitPlot: resizeBitPlot,
  };
})();
