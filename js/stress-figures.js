/**
 * stress-figures.js — renders the MIL-HDBK-5 figures and source tables that
 * belong to whichever alloy is selected on the design-allowables page.
 *
 * The data comes from js/data/design-figures.json (an index) plus one file per
 * handbook section under js/data/figures/, both produced by
 * tools/extract-figures.py from the charts already digitized on the chapter
 * pages. Only the sections for the selected alloy are fetched.
 *
 * Charts are built with the same HdbkUtil.makeMultiLine helper the chapter pages
 * use, so a figure looks identical here and there. An alloy such as 2024 carries
 * dozens of them, so they are built a couple at a time on a timer rather than
 * all at once (see scheduleBuilds).
 */
'use strict';

window.StressFigures = (function () {
  var INDEX_URL = 'js/data/design-figures.json';
  var SECTION_URL = 'js/data/figures/';
  var PDF = 'downloadable/MIL-HDBK-5J-1.pdf';

  var index = null;
  var sectionCache = {};
  var charts = [];          // { chart, isTemp }
  var buildTimer = null;    // timer handle for the chunked chart builder
  var temperature = null;
  var seq = 0;

  /* ── temperature marker ─────────────────────────────────────────────────
   * Drawn as a Chart.js plugin rather than an extra dataset so it stays out of
   * the legend and cannot be toggled off with the real series.
   */
  var TempMarker = {
    id: 'tempMarker',
    afterDatasetsDraw: function (chart, args, opts) {
      var t = opts && opts.value;
      if (t === null || t === undefined || isNaN(t)) return;

      var xs = chart.scales.x, ys = chart.scales.y;
      if (!xs || !ys || t < xs.min || t > xs.max) return;

      var ctx = chart.ctx;
      var px = xs.getPixelForValue(t);

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(179,64,64,0.85)';
      ctx.beginPath();
      ctx.moveTo(px, ys.top);
      ctx.lineTo(px, ys.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '600 12px Roboto, Arial, sans-serif';
      ctx.fillStyle = 'rgba(179,64,64,0.95)';
      ctx.textAlign = (px > (xs.left + xs.right) / 2) ? 'right' : 'left';
      ctx.fillText(fmtNum(t) + '°F', px + (ctx.textAlign === 'right' ? -6 : 6),
                   ys.top + 14);

      chart.data.datasets.forEach(function (ds, i) {
        if (!chart.isDatasetVisible(i)) return;
        var y = interpAt(ds.data, t);
        if (y === null) return;
        var py = ys.getPixelForValue(y);
        if (py < ys.top || py > ys.bottom) return;

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = ds.borderColor || '#333';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        ctx.font = '600 12px Roboto, Arial, sans-serif';
        ctx.fillStyle = '#1C2227';
        ctx.textAlign = 'left';
        var label = fmtNum(y);
        var tx = px + 9;
        var w = ctx.measureText(label).width;
        if (tx + w > ys.right) tx = px - 9 - w;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(tx - 2, py - 15, w + 4, 14);
        ctx.fillStyle = '#1C2227';
        ctx.fillText(label, tx, py - 4);
      });
      ctx.restore();
    }
  };

  /** Linear interpolation onto a sorted {x,y} series; null outside its range. */
  function interpAt(data, t) {
    if (!data || data.length === 0) return null;
    if (t < data[0].x || t > data[data.length - 1].x) return null;
    for (var i = 0; i < data.length - 1; i++) {
      var a = data[i], b = data[i + 1];
      if (t >= a.x && t <= b.x) {
        if (b.x === a.x) return a.y;
        return a.y + (t - a.x) * (b.y - a.y) / (b.x - a.x);
      }
    }
    return data[data.length - 1].y;
  }

  function fmtNum(v) {
    var r = Math.round(v * 100) / 100;
    return (Math.abs(r) >= 100 ? Math.round(r) : r).toString();
  }

  function isTempChart(chart) {
    var lbl = (chart.opts && chart.opts.xLabel) || '';
    return /temperature/i.test(lbl);
  }

  /* ── markup helpers ─────────────────────────────────────────────────── */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function buttonRow(fig, canvasId) {
    var out = [];

    if (fig.image) {
      // Chapters that kept the original scan link the buttons straight at it.
      out.push('<a class="sf-btn" href="' + escAttr(fig.image) + '" download>' +
               'Download Figure</a>');
      out.push('<a class="sf-btn" href="' + escAttr(fig.image) +
               '" target="_blank" rel="noopener">Open Image in New Tab</a>');
    } else {
      out.push('<button type="button" class="sf-btn" data-act="png" ' +
               'data-canvas="' + escAttr(canvasId) + '">Download Chart</button>');
      out.push('<button type="button" class="sf-btn" data-act="tab" ' +
               'data-canvas="' + escAttr(canvasId) + '">Open in New Tab</button>');
    }

    if (fig.pdfPage) {
      out.push('<a class="sf-btn sf-btn-src" href="' + PDF + '#page=' +
               fig.pdfPage + '" target="_blank" rel="noopener">' +
               'Open this page of MIL-HDBK-5</a>');
    }
    out.push('<a class="sf-btn sf-btn-ghost" href="' + escAttr(fig.page) + '#' +
             escAttr(fig.anchor) + '">View in chapter</a>');

    return '<div class="sf-btns">' + out.join('') + '</div>';
  }

  function figureCard(fig) {
    var body = fig.charts.map(function (c) {
      var id = 'sf-canvas-' + (++seq);
      c._canvasId = id;
      return '<div class="sf-canvas-wrap">' +
             '<canvas id="' + id + '" class="chartcanvas" role="img" ' +
             'aria-label="' + escAttr('Figure ' + fig.id) + '"></canvas></div>';
    }).join('');

    return '<div class="sf-card" data-fig="' + escAttr(fig.id) + '">' +
             '<div class="sf-card-h">Figure ' + esc(fig.id) + '</div>' +
             buttonRow(fig, fig.charts[0]._canvasId) +
             body +
             (fig.caption ? '<p class="sf-caption">' + esc(fig.caption) + '</p>' : '') +
           '</div>';
  }

  function tableCard(tbl) {
    var links = [];
    if (tbl.pdfPage) {
      links.push('<a class="sf-btn sf-btn-src" href="' + PDF + '#page=' +
                 tbl.pdfPage + '" target="_blank" rel="noopener">' +
                 'Open this page of MIL-HDBK-5</a>');
    }
    links.push('<a class="sf-btn sf-btn-ghost" href="' + escAttr(tbl.page) + '#' +
               escAttr(tbl.anchor) + '">View in chapter</a>');

    return '<div class="sf-card">' +
             '<div class="sf-card-h">Table ' + esc(tbl.id) + '</div>' +
             '<div class="sf-btns">' + links.join('') + '</div>' +
             '<div class="hdbk-table-wrap">' + tbl.html + '</div>' +
           '</div>';
  }

  /* ── chart construction ─────────────────────────────────────────────── */

  var markerRegistered = false;

  function buildChart(spec) {
    if (typeof Chart === 'undefined' || !window.HdbkUtil) return null;

    // Registered globally rather than per chart: Chart.js only reads a config's
    // `plugins` array at construction, and HdbkUtil.makeMultiLine owns that
    // call. The plugin draws nothing unless a chart carries a tempMarker value,
    // so charts that are not temperature-based are unaffected.
    if (!markerRegistered) {
      Chart.register(TempMarker);
      markerRegistered = true;
    }

    var opts = {};
    for (var k in spec.opts) opts[k] = spec.opts[k];

    var chart = HdbkUtil.makeMultiLine(spec._canvasId, spec.series, opts);
    if (!chart) return null;

    var rec = { chart: chart, isTemp: isTempChart(spec) };
    charts.push(rec);
    applyTemp(rec);
    chart.update();
    return chart;
  }

  /** Plugin options must live on the config: chart.options is re-resolved from
   *  it on every update, which discards keys written straight onto it. */
  function applyTemp(rec) {
    var plugins = rec.chart.config.options.plugins;
    plugins.tempMarker = { value: rec.isTemp ? temperature : null };
    if (rec.chart.options && rec.chart.options.plugins) {
      rec.chart.options.plugins.tempMarker = plugins.tempMarker;
    }
  }

  /**
   * Build every chart, a couple per frame.
   *
   * An earlier version deferred each chart until its card scrolled into view.
   * IntersectionObserver reports nothing while a tab is not being painted (a
   * background tab, a hidden preview pane), which left the figures blank with no
   * error; requestAnimationFrame stalls for the same reason. A plain timer is
   * driven by neither, so the charts always get built, and yielding between
   * small batches keeps the filter controls responsive even for an alloy
   * carrying forty of them.
   */
  function scheduleBuilds(host) {
    cancelBuilds();

    var queue = [];
    Array.prototype.forEach.call(
      host.querySelectorAll('.sf-card[data-fig]'), function (card) {
        (card._specs || []).forEach(function (s) { queue.push(s); });
      });

    var BATCH = 2;
    function step() {
      buildTimer = null;
      for (var i = 0; i < BATCH && queue.length; i++) {
        var spec = queue.shift();
        try { buildChart(spec); } catch (e) {
          if (window.console) console.warn('[StressFigures] chart failed', e);
        }
      }
      if (queue.length) buildTimer = setTimeout(step, 0);
    }
    buildTimer = setTimeout(step, 0);
  }

  function cancelBuilds() {
    if (buildTimer !== null) {
      clearTimeout(buildTimer);
      buildTimer = null;
    }
  }

  /* ── loading ────────────────────────────────────────────────────────── */

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function ensureIndex() {
    if (index) return Promise.resolve(index);
    return fetchJson(INDEX_URL).then(function (j) { index = j; return j; });
  }

  function loadSection(prefix) {
    if (sectionCache[prefix]) return Promise.resolve(sectionCache[prefix]);
    return fetchJson(SECTION_URL + prefix + '.json').then(function (j) {
      sectionCache[prefix] = j;
      return j;
    });
  }

  function destroyCharts() {
    cancelBuilds();
    charts.forEach(function (r) { try { r.chart.destroy(); } catch (e) {} });
    charts = [];
  }

  /**
   * Render every figure and source table published for `alloy`.
   * @param {string|null} alloy
   * @param {HTMLElement} figHost   container for the charts
   * @param {HTMLElement} tblHost   container for the source tables
   */
  function load(alloy, figHost, tblHost) {
    destroyCharts();

    derateIndex = null;
    if (!alloy) {
      figHost.innerHTML = '';
      tblHost.innerHTML = '';
      return Promise.resolve({ figures: 0, tables: 0 });
    }

    figHost.innerHTML = '<p class="sa-empty">Loading figures…</p>';
    tblHost.innerHTML = '';

    return ensureIndex().then(function (idx) {
      var prefixes = (idx.byAlloy && idx.byAlloy[alloy]) || [];
      if (prefixes.length === 0) {
        figHost.innerHTML = '<p class="sa-empty">No digitized figures are ' +
          'published for this alloy yet.</p>';
        return { figures: 0, tables: 0 };
      }
      return Promise.all(prefixes.map(loadSection)).then(function (parts) {
        var figs = [], tbls = [];
        parts.forEach(function (p) {
          figs = figs.concat(p.figures || []);
          tbls = tbls.concat(p.tables || []);
        });

        buildDerateIndex(figs);

        figHost.innerHTML = figs.length
          ? figs.map(figureCard).join('')
          : '<p class="sa-empty">No digitized figures are published for this ' +
            'alloy yet.</p>';

        // Attach the parsed chart specs to their cards for the lazy builder.
        var cards = figHost.querySelectorAll('.sf-card[data-fig]');
        figs.forEach(function (f, i) {
          if (cards[i]) cards[i]._specs = f.charts;
        });

        tblHost.innerHTML = tbls.length
          ? tbls.map(tableCard).join('')
          : '<p class="sa-empty">No source tables for this alloy.</p>';

        wireButtons(figHost);
        scheduleBuilds(figHost);
        return { figures: figs.length, tables: tbls.length };
      });
    }).catch(function (err) {
      figHost.innerHTML = '<p class="sa-empty">Could not load figures (' +
        esc(err.message) + ').</p>';
      return { figures: 0, tables: 0 };
    });
  }

  function wireButtons(host) {
    host.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var canvas = document.getElementById(btn.getAttribute('data-canvas'));
      if (!canvas) return;
      if (btn.getAttribute('data-act') === 'png') {
        var a = document.createElement('a');
        a.download = canvas.id + '.png';
        a.href = canvas.toDataURL();
        a.click();
      } else {
        window.open(canvas.toDataURL());
      }
    });
  }

  /* ── temperature knockdowns ─────────────────────────────────────────────
   * The "Effect of temperature on ..." figures plot a property as a percentage
   * of its room-temperature value (elongation is plotted directly in percent
   * strain instead). tools/extract-figures.py tags each of those curves with
   * the property it derates and the time at temperature it was measured over,
   * which is what makes it possible to read them back numerically here.
   */

  var derateIndex = null;     // property -> candidate curves for this alloy

  function buildDerateIndex(figs) {
    derateIndex = Object.create(null);
    figs.forEach(function (fig) {
      fig.charts.forEach(function (chart) {
        var d = chart.derate;
        if (!d) return;
        d.series.forEach(function (ds, i) {
          var data = chart.series[i] && chart.series[i].data;
          if (!data || !data.length) return;
          ds.props.forEach(function (p) {
            (derateIndex[p] || (derateIndex[p] = [])).push({
              prop: p, kind: d.kind, mode: d.mode,
              hours: ds.hours, seriesLabel: ds.label,
              data: data, fig: fig
            });
          });
        });
      });
    });
  }

  /** Distinct times at temperature offered by this alloy's knockdown curves. */
  function exposures() {
    var seen = Object.create(null), out = [];
    Object.keys(derateIndex || {}).forEach(function (p) {
      derateIndex[p].forEach(function (c) {
        if (c.kind !== 'temperature' || c.hours === null) return;
        if (!seen[c.hours]) { seen[c.hours] = 1; out.push({ hours: c.hours, label: c.seriesLabel }); }
      });
    });
    out.sort(function (a, b) { return a.hours - b.hours; });
    return out;
  }

  /**
   * Read the knockdown for one property.
   * @param {string} prop   Ftu, Fty, Fcy, Fsu, Fbru, Fbry, E, Ec or elong
   * @param {number} t      temperature, °F
   * @param {number|null} hours  preferred time at temperature
   * @returns {{mode:string, value:number, fig:object, seriesLabel:string,
   *            hours:number|null}|null}
   */
  function derate(prop, t, hours) {
    var list = (derateIndex && derateIndex[prop]) || [];
    var pool = list.filter(function (c) { return c.kind === 'temperature'; });
    if (!pool.length) return null;

    // Exact time at temperature, then a curve with no time dimension at all,
    // then the shortest exposure published — never silently a longer one, which
    // would read lower than the engineer asked for.
    var pick = null;
    for (var i = 0; i < pool.length && !pick; i++) {
      if (hours !== null && pool[i].hours === hours) pick = pool[i];
    }
    if (!pick) {
      for (var j = 0; j < pool.length && !pick; j++) {
        if (pool[j].hours === null) pick = pool[j];
      }
    }
    if (!pick) {
      pick = pool.slice().sort(function (a, b) { return a.hours - b.hours; })[0];
    }

    var y = interpAt(pick.data, t);
    if (y === null) return null;
    return {
      mode: pick.mode, value: y, fig: pick.fig,
      seriesLabel: pick.seriesLabel, hours: pick.hours
    };
  }

  /** Set the marker temperature (°F), or null to clear it. */
  function setTemperature(t) {
    temperature = (t === null || t === undefined || isNaN(t)) ? null : t;
    charts.forEach(function (rec) {
      applyTemp(rec);
      rec.chart.update('none');
    });
  }

  function tempChartCount() {
    return charts.filter(function (r) { return r.isTemp; }).length;
  }

  return {
    load: load,
    setTemperature: setTemperature,
    tempChartCount: tempChartCount,
    exposures: exposures,
    derate: derate
  };
})();
