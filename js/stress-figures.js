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

  /* ── real units ─────────────────────────────────────────────────────────
   * The handbook plots a knockdown as a percentage of the room-temperature
   * value, which is the only form that works on a page serving every temper of
   * an alloy at once. Here one condition is selected, so its tabulated value is
   * known and the curve can be shown in ksi instead — which is what an engineer
   * actually wants to read off it. `rtLookup` is supplied by the page and maps
   * a property to {value, unit, label} for the current selection.
   */
  var unitMode = 'percent';   // 'percent' | 'real'
  var rtLookup = null;

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

    var rec = {
      chart: chart,
      isTemp: isTempChart(spec),
      derate: spec.derate || null,
      yLabel: (spec.opts && spec.opts.yLabel) || '',
      // Kept so switching back to percent restores exactly what was drawn,
      // rather than an approximation reconstructed from the scaled values.
      orig: chart.data.datasets.map(function (d) {
        return { label: d.label, color: d.borderColor, data: d.data.slice() };
      })
    };
    charts.push(rec);
    applyTemp(rec);
    applyUnits(rec);
    chart.update();
    return chart;
  }

  /** Can this chart be redrawn in real units for the current selection? */
  function convertible(rec) {
    if (!rec.derate || rec.derate.mode !== 'percent' || !rtLookup) return false;
    return (rec.derate.series || []).some(function (sr, i) {
      return i < rec.orig.length && (sr.props || []).some(function (p) {
        var r = rtLookup(p);
        return r && r.value !== null && r.value !== undefined;
      });
    });
  }

  /**
   * Rescale a percentage-of-RT chart into the property's own unit.
   *
   * One published curve often covers several properties at once ("effect of
   * temperature on Ftu and Fty"), which is unambiguous in percent but not in
   * ksi — each property has its own room-temperature value. Those are split
   * into one real-unit curve per property rather than picking one and hiding
   * the rest.
   */
  function applyUnits(rec) {
    if (!rec.isTemp) return;
    var want = unitMode === 'real' && convertible(rec);
    if (!want) {
      if (rec.converted) {
        rec.chart.data.datasets = rec.orig.map(function (d) {
          return baseDataset(d.label, d.data, d.color);
        });
        setYLabel(rec, rec.yLabel);
        rec.converted = false;
      }
      return;
    }

    var out = [], units = Object.create(null), names = Object.create(null);
    rec.orig.forEach(function (d, i) {
      var sr = (rec.derate.series || [])[i];
      var props = (sr && sr.props) || [];
      var made = 0;
      props.forEach(function (prop) {
        var r = rtLookup(prop);
        if (!r || r.value === null || r.value === undefined) return;
        units[r.unit || ''] = 1;
        names[r.label || ''] = 1;
        out.push(baseDataset(
          d.label + (props.length > 1 ? ' · ' + r.label : ''),
          d.data.map(function (pt) { return { x: pt.x, y: r.value * pt.y / 100 }; }),
          d.color,
          made ? [6, 4] : undefined));
        made++;
      });
      // A series with no tabulated value for this condition is dropped rather
      // than left on the plot in percent next to curves in ksi.
    });

    if (!out.length) return;
    rec.chart.data.datasets = out;
    // "Ftu (ksi)" where one property is plotted, plain "ksi" where a figure
    // carries several and the axis is shared.
    var u = Object.keys(units), nm = Object.keys(names);
    var unit = u.length === 1 ? u[0] : '';
    setYLabel(rec, nm.length === 1 && unit ? nm[0] + ' (' + unit + ')'
                 : unit || 'value');
    rec.converted = true;
  }

  function baseDataset(label, data, color, dash) {
    return {
      label: label, data: data, fill: false,
      borderColor: color, backgroundColor: color,
      tension: 0, pointRadius: 0, pointHoverRadius: 0,
      borderWidth: 2, showLine: true, borderDash: dash
    };
  }

  function setYLabel(rec, text) {
    var sc = rec.chart.config.options.scales;
    if (sc && sc.y && sc.y.title) sc.y.title.text = text;
    if (rec.chart.options.scales && rec.chart.options.scales.y &&
        rec.chart.options.scales.y.title) {
      rec.chart.options.scales.y.title.text = text;
    }
  }

  /**
   * Switch every temperature figure between the handbook's percentage and the
   * selected condition's real units.
   * @param {'percent'|'real'} mode
   * @param {function(string):{value:number,unit:string,label:string}|null} lookup
   */
  function setUnits(mode, lookup) {
    unitMode = mode === 'real' ? 'real' : 'percent';
    if (lookup !== undefined) rtLookup = lookup;
    charts.forEach(function (rec) {
      applyUnits(rec);
      rec.chart.update('none');
    });
  }

  /** Re-read the room-temperature values without changing the mode — used when
   *  the selected condition or grain direction changes under a live plot. */
  function setRtLookup(lookup) {
    rtLookup = lookup;
    if (unitMode === 'real') setUnits('real');
  }

  /** How many figures on screen could actually be shown in real units. */
  function convertibleCount() {
    return charts.filter(convertible).length;
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

        derateIndex = makeDerateIndex(figs);

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

  /* The host element survives every load — only its innerHTML is replaced —
     so binding on each load stacked another delegated listener on it and one
     click fired the download once per alloy visited this session. Bind once. */
  function wireButtons(host) {
    if (host._sfWired) return;
    host._sfWired = true;
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

  /** Build a property -> curves index from a list of figures. Returns it rather
   *  than assigning it, so the comparison panel can hold an index for a second
   *  alloy at the same time as the on-screen figures hold theirs. */
  function makeDerateIndex(figs) {
    var derateIndex = Object.create(null);
    figs.forEach(function (fig) {
      fig.charts.forEach(function (chart) {
        var d = chart.derate;
        if (!d) return;
        d.series.forEach(function (ds, i) {
          var data = chart.series[i] && chart.series[i].data;
          if (!data || !data.length) return;
          // interpAt walks the array in order, so a point digitized out of
          // sequence would silently interpolate against the wrong neighbours
          // rather than fail. Temperature is monotonic by definition here, so
          // sorting can only ever repair such a series.
          data = data.slice().sort(function (a, b) { return a.x - b.x; });
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
    return derateIndex;
  }

  /** Distinct times at temperature offered by a knockdown-curve index. */
  function exposuresFrom(idx) {
    var seen = Object.create(null), out = [];
    Object.keys(idx || {}).forEach(function (p) {
      idx[p].forEach(function (c) {
        if (c.kind !== 'temperature' || c.hours === null) return;
        if (!seen[c.hours]) { seen[c.hours] = 1; out.push({ hours: c.hours, label: c.seriesLabel }); }
      });
    });
    out.sort(function (a, b) { return a.hours - b.hours; });
    return out;
  }

  function exposures() { return exposuresFrom(derateIndex); }

  /**
   * Read the knockdown for one property.
   * @param {string} prop   Ftu, Fty, Fcy, Fsu, Fbru, Fbry, E, Ec or elong
   * @param {number} t      temperature, °F
   * @param {number|null} hours  preferred time at temperature
   * @returns {{mode:string, value:number, fig:object, seriesLabel:string,
   *            hours:number|null}|null}
   */
  function derate(prop, t, hours) {
    return derateFrom(derateIndex, prop, t, hours);
  }

  /* Exact time at temperature, then a curve with no time dimension at all,
     then the shortest exposure published — never silently a longer one, which
     would read lower than the engineer asked for. */
  function chooseCurve(idx, prop, hours) {
    var list = (idx && idx[prop]) || [];
    var pool = list.filter(function (c) { return c.kind === 'temperature'; });
    if (!pool.length) return null;

    var pick = null;
    for (var i = 0; i < pool.length && !pick; i++) {
      if (hours !== null && hours !== undefined && pool[i].hours === hours) pick = pool[i];
    }
    if (!pick) {
      for (var j = 0; j < pool.length && !pick; j++) {
        if (pool[j].hours === null) pick = pool[j];
      }
    }
    if (!pick) {
      pick = pool.slice().sort(function (a, b) { return a.hours - b.hours; })[0];
    }
    return pick;
  }

  function derateFrom(idx, prop, t, hours) {
    var pick = chooseCurve(idx, prop, hours);
    if (!pick) return null;

    var y = interpAt(pick.data, t);
    if (y === null) return null;
    return {
      mode: pick.mode, value: y, fig: pick.fig,
      seriesLabel: pick.seriesLabel, hours: pick.hours
    };
  }

  /* ── tangent modulus ──────────────────────────────────────
   * The reader itself lives in js/tangent-modulus.js so that pages with no
   * interest in the figure gallery — a column buckling check, say — can read a
   * tangent modulus without pulling in this renderer or Chart.js. It is handed
   * our loader so the section files are fetched and parsed once, not twice.
   * These two are kept as pass-throughs because this page reaches the reader
   * through StressFigures already.
   */
  if (window.TangentModulus) {
    window.TangentModulus.useLoader({ index: ensureIndex, section: loadSection });
  }

  function tangentFor(alloy) {
    return window.TangentModulus
      ? window.TangentModulus.curves(alloy)
      : Promise.resolve([]);
  }

  function tangentAt(curve, stressKsi) {
    return window.TangentModulus
      ? window.TangentModulus.at(curve, stressKsi)
      : null;
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

  /**
   * Knockdown curves for any alloy, without touching what is on screen.
   * Sections are cached, so asking for an alloy already displayed costs nothing.
   * @param {string|null} alloy
   * @returns {Promise<Object|null>} property -> curves, or null if none published
   */
  function curvesFor(alloy) {
    if (!alloy) return Promise.resolve(null);
    return ensureIndex().then(function (idx) {
      var prefixes = (idx.byAlloy && idx.byAlloy[alloy]) || [];
      if (!prefixes.length) return null;
      return Promise.all(prefixes.map(loadSection)).then(function (parts) {
        var figs = [];
        parts.forEach(function (p) { figs = figs.concat(p.figures || []); });
        return makeDerateIndex(figs);
      });
    }).catch(function () { return null; });
  }

  /**
   * The full curve for one property, as {x: degF, y: value} points.
   * Picks the same curve `derate` would, so a chart and the derated table can
   * never disagree about which figure they came from.
   */
  /* ── physical properties ────────────────────────────────────────────────
   * Each chapter opens with an "Effect of temperature on the physical
   * properties" figure carrying thermal conductivity (K), coefficient of
   * thermal expansion (alpha) and specific heat (C) against temperature. Those
   * are exactly the three an FEA package asks for and the design-property
   * tables do not carry, so they are read off the curve at room temperature.
   */
  var PHYS_RT = 70;                  // degF, the handbook's room temperature

  function physQuantity(seriesLabel, yLabel) {
    // Some chapters print K, alpha and C on one frame with three different
    // scales. The digitizer captures those against a single axis, so two of the
    // three come out mis-scaled — 4130 reads alpha = 32e-6/degF and
    // C = 0.44 Btu/lb-degF, both several times their real values. Only a chart
    // whose axis carries one quantity can be trusted.
    var y = (yLabel || '').trim();
    if (y.indexOf('|') !== -1) return null;
    if (/^K,/.test(y)) return 'K';
    if (/^α,/.test(y)) return 'alpha';
    if (/^C,/.test(y)) return 'C';
    return null;
  }

  // Second guard: a value outside the range any structural metal occupies means
  // the curve was captured against the wrong scale, whatever the axis said.
  var PHYS_RANGE = {
    K:     [1, 160],      // Btu/[(hr)(ft^2)(degF)/ft]
    alpha: [2, 22],       // 10^-6 in./in./degF
    C:     [0.03, 0.40]   // Btu/(lb)(degF)
  };

  /**
   * Room-temperature K, alpha and C for an alloy, straight off its own figure.
   * @param {string} alloy
   * @param {string} [hint] temper or grade, when one figure serves several
   * @returns {Promise<Object>} quantity -> {value, unit, fig, series}
   */
  function physicalFor(alloy, hint) {
    if (!alloy) return Promise.resolve({});
    return ensureIndex().then(function (idx) {
      var prefixes = (idx.byAlloy && idx.byAlloy[alloy]) || [];
      if (!prefixes.length) return {};
      return Promise.all(prefixes.map(function (p) { return loadSection(p); }))
        .then(function (parts) {
          var out = {};
          parts.forEach(function (p) {
            (p.figures || []).forEach(function (fig) {
              if (!/physical propert/i.test(fig.caption || '')) return;
              (fig.charts || []).forEach(function (ch) {
                var yl = (ch.opts && ch.opts.yLabel) || '';
                var q = physQuantity(null, yl);
                if (!q) return;
                (ch.series || []).forEach(function (sr) {
                  if (!sr.data || !sr.data.length) return;
                  var sorted = sr.data.slice().sort(function (a, b) { return a.x - b.x; });
                  var v = interpAt(sorted, PHYS_RT);
                  // Never extrapolate; only accept an endpoint that is already
                  // close to room temperature.
                  if (v === null) {
                    if (sorted[0].x > PHYS_RT && sorted[0].x < PHYS_RT + 200) v = sorted[0].y;
                    else return;
                  }
                  var r = PHYS_RANGE[q];
                  if (v < r[0] || v > r[1]) return;

                  var named = hint && sr.label &&
                    sr.label.toLowerCase().indexOf(String(hint).toLowerCase()) !== -1;
                  if (out[q] && !named) return;
                  out[q] = { value: v, unit: yl, fig: fig, series: sr.label || '' };
                });
              });
            });
          });
          return out;
        });
    }).catch(function () { return {}; });
  }

  function curveFor(idx, prop, hours) {
    var pick = chooseCurve(idx, prop, hours);
    if (!pick) return null;
    return {
      mode: pick.mode, fig: pick.fig, hours: pick.hours,
      seriesLabel: pick.seriesLabel,
      points: pick.data.map(function (p) { return { x: p.x, y: p.y }; })
    };
  }

  return {
    load: load,
    setTemperature: setTemperature,
    tempChartCount: tempChartCount,
    exposures: exposures,
    exposuresFrom: exposuresFrom,
    setUnits: setUnits,
    setRtLookup: setRtLookup,
    convertibleCount: convertibleCount,
    derate: derate,
    derateFrom: derateFrom,
    curvesFor: curvesFor,
    curveFor: curveFor,
    tangentFor: tangentFor,
    tangentAt: tangentAt,
    physicalFor: physicalFor,
    interpAt: interpAt
  };
})();
