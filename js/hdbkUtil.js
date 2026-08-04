/**
 * hdbkUtil.js — shared multi-series chart helper for MIL-HDBK-5 pages (Chart.js 4).
 * Extracted from the inline script first used on Chapter2.7(steel).html so new
 * chapter/section pages can include it via <script src="js/hdbkUtil.js"></script>
 * instead of repeating the same ~100 lines inline on every page.
 */
'use strict';

window.HdbkUtil = (function () {
  function linInterp(pts, step) {
    var s = pts.slice().sort(function (a, b) { return a.x - b.x; });
    var r = [], i = 0;
    var xA = Math.ceil(s[0].x / step) * step;
    var xB = Math.floor(s[s.length - 1].x / step) * step;
    for (var x = xA; x <= xB + 1e-9; x += step) {
      while (i < s.length - 2 && s[i + 1].x < x) { i++; }
      var a = s[i].x, b = s[i + 1].x, ya = s[i].y, yb = s[i + 1].y;
      r.push({ x: x, y: +(ya + (x - a) / (b - a) * (yb - ya)).toFixed(4) });
    }
    return r;
  }
  function logInterp(pts, ppd) {
    var s = pts.slice().sort(function (a, b) { return a.x - b.x; });
    var step = 1 / ppd;
    var ls = Math.ceil(Math.log10(s[0].x) * ppd) / ppd;
    var le = Math.floor(Math.log10(s[s.length - 1].x) * ppd) / ppd;
    var r = [], i = 0;
    for (var lx = ls; lx <= le + 1e-9; lx += step) {
      var x = Math.pow(10, lx);
      while (i < s.length - 2 && s[i + 1].x < x) { i++; }
      var l0 = Math.log10(s[i].x), l1 = Math.log10(s[i + 1].x);
      var t = (l1 === l0) ? 0 : (lx - l0) / (l1 - l0);
      r.push({ x: x, y: +(s[i].y + t * (s[i + 1].y - s[i].y)).toFixed(3) });
    }
    return r;
  }
  var BG = {
    id: 'customBg',
    beforeDraw: function (c) {
      var ctx = c.ctx; ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    }
  };
  var PAL = ['#3a6270','#c87941','#5a9aaa','#b34040','#4a7a4a','#7a5a8a',
             '#40a0c0','#a08040','#2a4a55','#c04060','#3a7a5a','#806030'];
  function makeMultiLine(id, datasets, opts) {
    opts = opts || {};
    var el = document.getElementById(id);
    if (!el) { return null; }
    var T = (opts.tension !== undefined) ? opts.tension : 0.3;
    var ds = datasets.map(function (d, i) {
      var pts;
      if      (d.interp === 'lin') { pts = linInterp(d.data, d.step || 1); }
      else if (d.interp === 'log') { pts = logInterp(d.data, d.ppd  || 20); }
      else                         { pts = d.data; }
      return {
        label: d.label || ('S' + (i + 1)), data: pts, fill: false,
        borderColor: d.color || PAL[i % PAL.length],
        backgroundColor: d.color || PAL[i % PAL.length],
        tension: T, pointRadius: 0, pointHoverRadius: 0,
        borderWidth: d.width || 2, showLine: true
      };
    });
    var xS = {
      type: opts.xLog ? 'logarithmic' : 'linear',
      ticks: { maxRotation: 0, font: { size: 14 } },
      title: { display: true, text: opts.xLabel || 'x', font: { size: 16 } },
      grid: { color: 'rgba(0,0,0,0.07)' }
    };
    if (opts.xMin !== undefined) { xS.min = opts.xMin; }
    if (opts.xMax !== undefined) { xS.max = opts.xMax; }
    var yS = {
      ticks: { font: { size: 14 } },
      title: { display: true, text: opts.yLabel || 'y', padding: 8, font: { size: 16 } },
      grid: { color: 'rgba(0,0,0,0.07)' }
    };
    if (opts.yMin !== undefined) { yS.min = opts.yMin; }
    if (opts.yMax !== undefined) { yS.max = opts.yMax; }
    return new Chart(el.getContext('2d'), {
      type: 'scatter', data: { datasets: ds },
      options: {
        maintainAspectRatio: false, responsive: true, animation: false,
        layout: { padding: { left: 8, right: 20, top: 5, bottom: 5 } },
        plugins: {
          customBg: {},
          legend: { position: 'top', labels: { boxHeight: 2, font: { size: 14 }, usePointStyle: false, padding: 14 } },
          tooltip: { enabled: true, mode: 'nearest', intersect: false, axis: 'x' }
        },
        scales: { x: xS, y: yS }
      },
      plugins: [BG]
    });
  }
  function addToggle(btnId, chart) {
    var b = document.getElementById(btnId);
    if (!b || !chart) { return; }
    b.addEventListener('click', function () {
      var t = chart.options.plugins.tooltip;
      t.enabled = !t.enabled; chart.update();
      b.textContent = t.enabled ? 'Hide Tooltips' : 'Show Tooltips';
    });
  }
  return { linInterp: linInterp, logInterp: logInterp, makeMultiLine: makeMultiLine, addToggle: addToggle };
}());
