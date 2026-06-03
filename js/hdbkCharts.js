/**
 * hdbkCharts.js  —  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable Chart.js 4 builder for static MIL-HDBK-5 reference charts.
 * Encapsulates the KasperAero chart style so each new figure on a page only
 * needs to supply its canvas id, data array, and a small config object.
 *
 * Usage (inline script on the page):
 * ─────────────────────────────────
 *   const myChart = HdbkCharts.makeLine('myCanvasId', dataArray, {
 *     label  : 'AISI 1025 — α',
 *     xLabel : 'Temperature (°F)',
 *     yLabel : 'α (× 10⁻⁶ in./in./°F)',
 *     xTip   : v => v.toFixed(0) + ' °F',
 *     yTip   : v => 'α = ' + v.toFixed(3) + ' × 10⁻⁶ in./in./°F',
 *     // optional overrides:
 *     color  : 'rgb(68,119,170)',   // default: site teal rgb(58,98,112)
 *     tension: 0.3,                 // default: 0.3
 *     xMin   : 0,
 *     xMax   : 1800,
 *     yMin   : 5,
 *     yMax   : 9
 *   });
 *   HdbkCharts.addToggle('myToggleBtnId', myChart);
 *
 * Public API
 * ──────────
 *   HdbkCharts.makeLine(canvasId, data, opts)  → Chart instance
 *   HdbkCharts.addToggle(btnId, chart)
 */
'use strict';

window.HdbkCharts = (function () {

  // ── White background plugin ─────────────────────────────────────────────────
  // Required so that PNG downloads (via canvas.toBlob) have a white background
  // instead of transparent.
  var _customBg = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: function (chart, args, options) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = (options && options.color) ? options.color : 'white';
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    }
  };

  // ── Standard legend ─────────────────────────────────────────────────────────
  function _makeLegend() {
    return {
      position: 'top',
      labels: {
        align        : 'top',
        padding      : 20,
        usePointStyle: false,
        boxHeight    : 2,
        font         : { size: 18 }
      },
      onClick: function (e, legendItem, legend) {
        var ci   = legend.chart;
        var meta = ci.getDatasetMeta(legendItem.datasetIndex);
        meta.hidden = (meta.hidden === null)
          ? !ci.data.datasets[legendItem.datasetIndex].hidden
          : null;
        ci.update();
      }
    };
  }

  // ── Tooltip toggle button ────────────────────────────────────────────────────
  /**
   * Wire a button to show/hide chart tooltips.
   * @param {string} btnId   id of the <button> element
   * @param {Chart}  chart   Chart.js instance returned by makeLine()
   */
  function addToggle(btnId, chart) {
    if (!chart) return;
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var cur = chart.options.plugins.tooltip.enabled;
      chart.options.plugins.tooltip.enabled = !cur;
      chart.update();
      btn.textContent = cur ? 'Show Tooltips' : 'Hide Tooltips';
    });
  }

  // ── Single-series line chart factory ────────────────────────────────────────
  /**
   * Build a single-series {x, y} scatter-line chart in the KasperAero style.
   *
   * @param {string} canvasId   id of the target <canvas> element
   * @param {Array}  data       [{x: number, y: number}, …]
   * @param {Object} opts       configuration (see file header for full list)
   * @returns {Chart|null}      Chart.js instance, or null on error
   */
  function makeLine(canvasId, data, opts) {
    if (typeof Chart === 'undefined') {
      console.warn('[HdbkCharts] Chart.js is not loaded.');
      return null;
    }
    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn('[HdbkCharts] canvas element not found: "' + canvasId + '"');
      return null;
    }

    opts = opts || {};
    var color        = opts.color        || 'rgb(58,98,112)';
    var tension      = (opts.tension      !== undefined) ? opts.tension      : 0.3;
    var pointRadius  = (opts.pointRadius  !== undefined) ? opts.pointRadius  : 3;
    var pointHoverR  = (opts.pointHoverRadius !== undefined) ? opts.pointHoverRadius : 6;

    // ── Scales ────────────────────────────────────────────────────────────────
    var xScale = {
      type : 'linear',
      ticks: { maxRotation: 0, font: { size: 16 } },
      title: { display: true, text: opts.xLabel || 'x', font: { size: 20 } },
      grid : { color: 'rgba(0,0,0,0.07)' }
    };
    if (opts.xMin !== undefined) xScale.min = opts.xMin;
    if (opts.xMax !== undefined) xScale.max = opts.xMax;

    var yScale = {
      type : 'linear',
      ticks: { font: { size: 16 } },
      title: { display: true, text: opts.yLabel || 'y', padding: 10, font: { size: 20 } },
      grid : { color: 'rgba(0,0,0,0.07)' }
    };
    if (opts.yMin !== undefined) yScale.min = opts.yMin;
    if (opts.yMax !== undefined) yScale.max = opts.yMax;

    // ── Tooltip callbacks ────────────────────────────────────────────────────
    var tooltipCfg = {
      enabled  : true,
      mode     : 'nearest',
      intersect: false,
      axis     : 'x',
      callbacks : {}
    };
    if (opts.xTip) {
      tooltipCfg.callbacks.title = function (items) {
        return opts.xTip(items[0].parsed.x);
      };
    }
    if (opts.yTip) {
      tooltipCfg.callbacks.label = function (item) {
        return opts.yTip(item.parsed.y);
      };
    }

    // ── Build chart ───────────────────────────────────────────────────────────
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label          : opts.label || 'Value',
          data           : data,
          fill           : false,
          borderColor    : color,
          backgroundColor: color,
          tension        : tension,
          pointRadius    : pointRadius,
          pointHoverRadius: pointHoverR
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive         : true,
        layout: { padding: { left: 10, right: 25, top: 5, bottom: 5 } },
        plugins: {
          customCanvasBackgroundColor: { color: 'white' },
          legend : _makeLegend(),
          tooltip: tooltipCfg
        },
        interaction: { mode: 'nearest', axis: 'x' },
        elements   : { point: { radius: 3 } },
        scales     : { x: xScale, y: yScale }
      },
      plugins: [_customBg]
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    makeLine : makeLine,
    addToggle: addToggle
  };

}());
