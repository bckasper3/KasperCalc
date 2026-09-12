/**
 * stress-compare.js — side-by-side comparison of two MIL-HDBK-5 conditions.
 *
 * Rather than duplicating the cascading filter UI for a second material, this
 * reuses the one already on the page: whatever condition is selected can be
 * pinned into slot A or B, so picking the second material is the same motion as
 * picking the first.
 *
 * The chart deliberately plots real units rather than the handbook's percentage
 * of room temperature. A knockdown curve says 7075-T6 holds 62% at 400 F and
 * 2024-T3 holds 71%, which tells you nothing about which one is stronger up
 * there — 62% of 78 ksi beats 71% of 64 ksi. Multiplying each curve by its own
 * room-temperature allowable is what makes the two comparable, and it is the
 * only form in which the crossover temperature is visible at all.
 *
 * Depends on StressAllowables (the selection and the row definitions) and
 * StressFigures (the digitized knockdown curves).
 */
'use strict';

(function () {
  var SLOTS = { A: null, B: null };        // pinned condition per slot
  var CURVES = { A: null, B: null };       // knockdown-curve index per slot
  var COLOR = { A: '#3a6270', B: '#c87941' };

  var chart = null;
  var chartProp = 'Ftu';
  var exposureHours = null;

  // Properties worth charting against temperature. Poisson's ratio and density
  // have no knockdown curve, and the bearing allowables are per e/D rather than
  // a single number, so neither belongs on a two-series plot.
  var CHART_PROPS = ['Ftu', 'Fty', 'Fcy', 'Fsu', 'E', 'Ec'];

  function $(id) { return document.getElementById(id); }
  function SA() { return window.StressAllowables; }

  /* ── helpers borrowed from the lookup so both tables read alike ────────── */

  function esc(s) { return SA().escapeHtml(s); }
  function escAttr(s) { return SA().escapeAttr(s); }
  function fmt(v) { return SA().fmt(v); }
  function fmtNum(v) { return SA().fmtNum(v); }
  function disp(p, v) { return SA().toDisplay(p, v); }
  function unitOf(p) { return SA().unitOf(p); }
  function pick(v, sub) { return SA().pick(v, sub); }

  function rowFor(key) {
    return SA().PROP_ROWS.filter(function (p) { return p.key === key; })[0] || null;
  }

  /** PROP_ROWS labels are HTML. Subscripts flatten harmlessly (F<sub>tu</sub> ->
   *  "Ftu"), but a superscript must not: 10<sup>3</sup> ksi flattening to
   *  "103 ksi" would misstate the unit by three orders of magnitude. */
  var SUPS = { '0': '⁰', '1': '¹', '2': '²', '3': '³',
               '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
               '8': '⁸', '9': '⁹', '-': '⁻' };

  function plainText(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '').replace(
      /<sup>([^<]*)<\/sup>/gi, function (m, inner) {
        return inner.replace(/[0-9-]/g, function (ch) { return SUPS[ch] || ch; });
      });
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** A PROP_ROWS row as a chart axis title, e.g. "Ftu (ksi)". */
  function plainLabel(p) {
    var u = unitOf(p);
    return plainText(p.label + (u ? ' (' + u + ')' : ''));
  }

  function conditionTitle(e) {
    return e.alloy || '—';
  }

  function conditionSub(e) {
    return [e.form, e.temper, SA().thicknessText(e),
            e.basis ? e.basis + '-basis' : null]
      .filter(Boolean).join(' · ');
  }

  /** The room-temperature value a curve has to be scaled by. */
  function rtValue(entry, key, grain) {
    var raw = entry.props[key];
    if (raw === undefined || raw === null) return null;
    var p = rowFor(key);
    if (p && p.grain) return pick(raw, grain);
    return pick(raw);
  }

  /* ── slots ────────────────────────────────────────────────────────────── */

  function pin(slot) {
    var e = SA().selected();
    if (!e) return;
    // Pinning the same condition into both slots would compare it with itself.
    var other = slot === 'A' ? 'B' : 'A';
    if (SLOTS[other] === e) SLOTS[other] = null;
    SLOTS[slot] = e;
    loadCurves(slot).then(render);
    render();
  }

  function clear(slot) {
    SLOTS[slot] = null;
    CURVES[slot] = null;
    render();
  }

  function loadCurves(slot) {
    var e = SLOTS[slot];
    CURVES[slot] = null;
    if (!e || !window.StressFigures) return Promise.resolve();
    return StressFigures.curvesFor(e.alloy).then(function (idx) {
      // A slot swapped out while the fetch was in flight must not overwrite
      // whatever is in it now.
      if (SLOTS[slot] === e) CURVES[slot] = idx;
    });
  }

  /* ── the slot chips ───────────────────────────────────────────────────── */

  function slotHtml(slot) {
    var e = SLOTS[slot];
    var sel = SA().selected();
    var isCurrent = e && e === sel;

    if (!e) {
      return '<div class="sc-slot sc-slot-empty" data-slot="' + slot + '">' +
        '<span class="sc-slot-tag">' + slot + '</span>' +
        '<span class="sc-slot-empty-text">nothing pinned</span>' +
        '<button type="button" class="sc-pin" data-pin="' + slot + '"' +
          (sel ? '' : ' disabled') + '>Pin current</button>' +
        '</div>';
    }

    return '<div class="sc-slot" data-slot="' + slot + '"' +
      ' style="border-left-color:' + COLOR[slot] + '">' +
      '<span class="sc-slot-tag" style="background:' + COLOR[slot] + '">' +
        slot + '</span>' +
      '<div class="sc-slot-body">' +
        '<div class="sc-slot-title">' + esc(conditionTitle(e)) + '</div>' +
        '<div class="sc-slot-sub">' + esc(conditionSub(e)) + '</div>' +
      '</div>' +
      '<div class="sc-slot-acts">' +
        (isCurrent ? '' :
          '<button type="button" class="sc-pin" data-pin="' + slot +
          '"' + (sel ? '' : ' disabled') + '>Replace</button>') +
        '<button type="button" class="sc-clear" data-clear="' + slot +
        '" aria-label="Remove ' + slot + '">&#x2715;</button>' +
      '</div>' +
      '</div>';
  }

  /* ── the property table ───────────────────────────────────────────────── */

  /** Difference cell. Higher is better for every strength and stiffness row
   *  here, so the sign is reported literally and left for the reader to judge —
   *  a lighter material with a lower Ftu is not automatically worse. */
  function deltaCell(a, b) {
    if (a === null || b === null || a === undefined || b === undefined) {
      return '<td class="sa-num sc-delta">&middot;&middot;&middot;</td>';
    }
    var d = b - a;
    // Identical values are the interesting case for density or Poisson's ratio;
    // "0 +0%" is just noise, so say it plainly.
    if (d === 0) return '<td class="sa-num sc-delta">same</td>';
    var pctTxt = '';
    if (a !== 0) {
      var pct = d / Math.abs(a) * 100;
      pctTxt = ' <span class="sc-pct">' + (pct >= 0 ? '+' : '') +
               (Math.round(pct * 10) / 10) + '%</span>';
    }
    var cls = d > 0 ? ' is-up' : d < 0 ? ' is-down' : '';
    return '<td class="sa-num sc-delta' + cls + '">' +
           (d > 0 ? '+' : '') + fmtNum(d) + pctTxt +
           '</td>';
  }

  function tableHtml() {
    var a = SLOTS.A, b = SLOTS.B;
    var grain = SA().grain();

    var rows = SA().PROP_ROWS.map(function (p) {
      if (a.props[p.key] === undefined && b.props[p.key] === undefined) return '';

      // Bearing allowables are published per edge-distance ratio, so each e/D
      // gets its own row rather than being collapsed to one number.
      var parts;
      if (p.ed) {
        parts = [{ sub: 'e/D 1.5', key: 'eD1.5' }, { sub: 'e/D 2.0', key: 'eD2.0' }];
      } else if (p.grain) {
        parts = [{ sub: grain, key: grain }];
      } else {
        parts = [{ sub: '', key: null }];
      }

      return parts.map(function (part) {
        var va = a.props[p.key] === undefined ? null : pick(a.props[p.key], part.key);
        var vb = b.props[p.key] === undefined ? null : pick(b.props[p.key], part.key);
        if (va === null && vb === null) return '';
        return '<tr>' +
          '<th scope="row">' +
            '<abbr class="sa-abbr" title="' + escAttr(p.tip) + '">' + p.label +
            '</abbr>' +
            (p.unit ? ' <span class="sa-unit">' + p.unit + '</span>' : '') +
            (part.sub ? ' <span class="sa-qual">' + esc(part.sub) + '</span>' : '') +
          '</th>' +
          '<td class="sa-num">' + SA().cell(p, va) + '</td>' +
          '<td class="sa-num">' + SA().cell(p, vb) + '</td>' +
          deltaCell(disp(p, va), disp(p, vb)) +
        '</tr>';
      }).join('');
    }).join('');

    // Strength-to-weight is the reason most of these comparisons get made, and
    // it is not in the handbook tables — it falls straight out of Ftu/density.
    var extra = '';
    var da = pick(a.props.density), db = pick(b.props.density);
    var fa = rtValue(a, 'Ftu', grain), fb = rtValue(b, 'Ftu', grain);
    if (da && db && fa !== null && fb !== null) {
      // ksi/(lb/in^3) is a length; MPa/(g/cm^3) is kN·m/kg. Same quantity,
      // different conventional unit, so the ratio is converted rather than
      // either of its parts.
      var si = SA().isSI();
      var k = si ? SA().KSI_MPA / 27.679905 : 0.001;
      var uu = si ? 'kN&middot;m/kg' : '10<sup>3</sup> in.';
      var sa = (fa / da) * k, sb = (fb / db) * k;
      extra =
        '<tr class="sc-derived-row">' +
        '<th scope="row"><abbr class="sa-abbr" title="Ultimate tensile stress ' +
        'divided by density — the specific strength, which is what matters when ' +
        'the design is weight-critical rather than space-critical.">' +
        'F<sub>tu</sub>/&omega;</abbr>' +
        ' <span class="sa-qual">' + esc(grain) + '</span></th>' +
        '<td class="sa-num">' + fmtNum(sa) + ' <span class="sa-unit">' + uu + '</span></td>' +
        '<td class="sa-num">' + fmtNum(sb) + ' <span class="sa-unit">' + uu + '</span></td>' +
        deltaCell(sa, sb) +
        '</tr>';
    }

    return '<div class="sa-table-scroll"><table class="sa-prop-table sc-table">' +
      '<thead><tr>' +
        '<th>Property</th>' +
        '<th class="sa-num"><span class="sc-head-tag" style="background:' +
          COLOR.A + '">A</span> ' + esc(conditionTitle(a)) + '</th>' +
        '<th class="sa-num"><span class="sc-head-tag" style="background:' +
          COLOR.B + '">B</span> ' + esc(conditionTitle(b)) + '</th>' +
        '<th class="sa-num">B &minus; A</th>' +
      '</tr></thead><tbody>' + rows + extra + '</tbody></table></div>';
  }

  /* ── the real-units chart ─────────────────────────────────────────────── */

  /** Which properties both slots can actually plot right now. */
  function chartablePropsFor() {
    var grain = SA().grain();
    return CHART_PROPS.filter(function (key) {
      return ['A', 'B'].every(function (s) {
        var e = SLOTS[s];
        if (!e || rtValue(e, key, grain) === null) return false;
        return !!(CURVES[s] && StressFigures.curveFor(CURVES[s], key, exposureHours));
      });
    });
  }

  /** Scale one slot's percentage-of-RT curve into the property's real unit. */
  function seriesFor(slot, key, grain) {
    var e = SLOTS[slot];
    var c = CURVES[slot] && StressFigures.curveFor(CURVES[slot], key, exposureHours);
    if (!e || !c) return null;
    var rt = rtValue(e, key, grain);
    if (rt === null) return null;

    var p = rowFor(key);
    var si = SA().isSI();
    var pts = c.points.map(function (pt) {
      var y = c.mode === 'percent' ? rt * pt.y / 100 : pt.y;
      return { x: si ? SA().fToC(pt.x) : pt.x, y: disp(p, y) };
    });
    // The handbook curves start at or near room temperature; anchoring the
    // series at the tabulated RT value keeps the two curves honest at the left
    // edge, where the reader compares them against the table above.
    var roomT = si ? SA().fToC(70) : 70;
    if (c.mode === 'percent' && pts.length && pts[0].x > roomT + 5) {
      pts.unshift({ x: roomT, y: disp(p, rt) });
    }
    return {
      label: conditionTitle(e) + (c.seriesLabel ? ' · ' + c.seriesLabel : ''),
      data: pts, color: COLOR[slot], fig: c.fig
    };
  }

  function destroyChart() {
    if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }
  }

  function renderChart() {
    var sec = $('sc-chart-section');
    var host = $('sc-chart-body');
    if (!sec || !host) return;

    destroyChart();

    if (!SLOTS.A || !SLOTS.B) { sec.hidden = true; host.innerHTML = ''; return; }

    var avail = chartablePropsFor();
    if (!avail.length) {
      sec.hidden = false;
      host.innerHTML = '<p class="sa-empty">No effect-of-temperature curve is ' +
        'published for both of these alloys yet, so there is nothing to plot ' +
        'against each other. The room-temperature comparison above still ' +
        'applies.</p>';
      return;
    }
    if (avail.indexOf(chartProp) === -1) chartProp = avail[0];

    var grain = SA().grain();
    var p = rowFor(chartProp);
    var sa = seriesFor('A', chartProp, grain);
    var sb = seriesFor('B', chartProp, grain);

    var exps = mergedExposures();
    var expCtl = exps.length < 2 ? '' :
      '<label for="sc-exposure">Time at temperature</label>' +
      '<select id="sc-exposure">' + exps.map(function (o) {
        return '<option value="' + o.hours + '"' +
               (o.hours === exposureHours ? ' selected' : '') + '>' +
               esc(o.label) + '</option>';
      }).join('') + '</select>';

    sec.hidden = false;
    host.innerHTML =
      '<div class="sc-chart-ctl">' +
        '<label for="sc-prop">Property</label>' +
        '<select id="sc-prop">' + avail.map(function (k) {
          var r = rowFor(k);
          return '<option value="' + k + '"' + (k === chartProp ? ' selected' : '') +
                 '>' + r.note + '</option>';
        }).join('') + '</select>' +
        expCtl +
      '</div>' +
      '<div class="sc-canvas-wrap"><canvas id="sc-canvas"></canvas></div>' +
      '<p class="sa-source">' + esc(plainLabel(p)) +
        ' against temperature, in real units &mdash; each alloy&rsquo;s ' +
        'effect-of-temperature curve multiplied by its own room-temperature ' +
        'allowable, so the two are directly comparable. Sources: ' +
        [sa, sb].filter(Boolean).map(function (s) {
          return '<a href="' + escAttr(s.fig.page + '#' + s.fig.anchor) +
                 '">Fig ' + esc(s.fig.id) + '</a>';
        }).join(' and ') + '.</p>';

    var datasets = [sa, sb].filter(Boolean).map(function (s) {
      return { label: s.label, data: s.data, color: s.color };
    });

    if (window.HdbkUtil) {
      chart = HdbkUtil.makeMultiLine('sc-canvas', datasets, {
        xLabel: SA().isSI() ? 'Temperature (°C)' : 'Temperature (°F)',
        yLabel: plainLabel(p),
        yMin: 0
      });
    }

    var ps = $('sc-prop');
    if (ps) ps.addEventListener('change', function () {
      chartProp = ps.value;
      renderChart();
    });
    var es = $('sc-exposure');
    if (es) es.addEventListener('change', function () {
      exposureHours = es.value === '' ? null : parseFloat(es.value);
      renderChart();
    });
  }

  /** Times at temperature that both alloys publish, so the two curves on the
   *  plot are always measured over the same exposure. */
  function mergedExposures() {
    if (!window.StressFigures || !CURVES.A || !CURVES.B) return [];
    var a = StressFigures.exposuresFrom(CURVES.A);
    var b = StressFigures.exposuresFrom(CURVES.B);
    var inB = Object.create(null);
    b.forEach(function (o) { inB[o.hours] = 1; });
    var both = a.filter(function (o) { return inB[o.hours]; });
    if (both.length && (exposureHours === null ||
        !both.some(function (o) { return o.hours === exposureHours; }))) {
      exposureHours = both[0].hours;
    }
    return both;
  }

  /* ── render ───────────────────────────────────────────────────────────── */

  function render() {
    var slots = $('sc-slots');
    var body = $('sc-body');
    if (!slots || !body) return;

    slots.innerHTML = slotHtml('A') + slotHtml('B');

    if (!SLOTS.A || !SLOTS.B) {
      var n = (SLOTS.A ? 1 : 0) + (SLOTS.B ? 1 : 0);
      body.innerHTML = '<p class="sa-empty">' + (n === 0
        ? 'Choose a material above, pin it as A, then change the filters and ' +
          'pin the second one as B.'
        : 'One more to go — change the filters above and pin the second ' +
          'material.') + '</p>';
    } else {
      body.innerHTML = tableHtml();
    }

    renderChart();
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */

  function init() {
    var wrap = $('sc-section');
    if (!wrap || !window.StressAllowables) return;

    wrap.addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-pin')) pin(t.getAttribute('data-pin'));
      else if (t.hasAttribute('data-clear')) clear(t.getAttribute('data-clear'));
    });

    document.addEventListener('sa:change', function () {
      // The grain selector changes what every row reports, so the table has to
      // be rebuilt even when neither slot moved.
      render();
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
