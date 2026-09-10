/**
 * stress-allowables.js — MIL-HDBK-5 material property lookup.
 *
 * Reads js/data/design-allowables.json, which tools/extract-allowables.py
 * generates from the design-property tables already digitized on the Chapter
 * pages. One JSON entry corresponds to one column of one handbook table, i.e.
 * one fully-specified condition (alloy + form + temper + thickness + basis).
 *
 * The filters cascade: each select offers only the values still reachable given
 * the selections above it, so it is not possible to land on an empty result by
 * picking a combination the handbook does not publish.
 */
'use strict';

(function () {
  var DATA_URL = 'js/data/design-allowables.json';

  var ENTRIES = [];
  var SELECTED = null;
  var SHOWN_ALLOY = null;      // alloy whose figures/tables are currently drawn

  // Filter order matters — each one narrows the options offered by the next.
  var FILTERS = [
    { id: 'alloy',    key: 'alloy',     label: 'Alloy' },
    { id: 'form',     key: 'formGroup', label: 'Product form' },
    { id: 'temper',   key: 'temper',    label: 'Temper / condition' },
    { id: 'spec',     key: 'spec',      label: 'Specification' },
    { id: 'basis',    key: 'basis',     label: 'Basis' }
  ];

  var GRAIN_PROPS = ['Ftu', 'Fty', 'Fcy'];

  // Display order and formatting for the result grid. `tip` is the hover
  // explanation on the property name — enough to tell a reader who has not met
  // the symbol before what it actually is and when it governs.
  var PROP_ROWS = [
    { key: 'Ftu',     label: 'F<sub>tu</sub>',  unit: 'ksi',      grain: true,
      note: 'Ultimate tensile stress',
      tip: 'Ultimate tensile stress — the stress at which the material finally '
         + 'breaks in tension. Ultimate load cases are checked against this.' },
    { key: 'Fty',     label: 'F<sub>ty</sub>',  unit: 'ksi',      grain: true,
      note: 'Tensile yield stress',
      tip: 'Tensile yield stress — the stress producing 0.2% permanent set in '
         + 'tension. Limit load cases are checked against this, since yielding '
         + 'is permanent deformation rather than failure.' },
    { key: 'Fcy',     label: 'F<sub>cy</sub>',  unit: 'ksi',      grain: true,
      note: 'Compressive yield stress',
      tip: 'Compressive yield stress — 0.2% permanent set in compression. It '
         + 'differs from Fty because most alloys are not symmetric, and it is '
         + 'what column buckling and crippling checks use.' },
    { key: 'Fsu',     label: 'F<sub>su</sub>',  unit: 'ksi',
      note: 'Ultimate shear stress',
      tip: 'Ultimate shear stress — failure stress in pure shear. Governs '
         + 'fastener shear, shear webs and shear tie-outs.' },
    { key: 'Fbru',    label: 'F<sub>bru</sub>', unit: 'ksi',      ed: true,
      note: 'Ultimate bearing stress (dry pin)',
      tip: 'Ultimate bearing stress — failure of the material bearing against '
         + 'a pin or fastener, taken as load divided by (hole diameter x '
         + 'thickness). Tabulated at edge-distance ratios e/D of 1.5 and 2.0, '
         + 'and these are dry-pin values per Section 1.4.7.1.' },
    { key: 'Fbry',    label: 'F<sub>bry</sub>', unit: 'ksi',      ed: true,
      note: 'Bearing yield stress (dry pin)',
      tip: 'Bearing yield stress — permanent hole elongation begins here. Use '
         + 'it where hole deformation matters, such as a joint that must stay '
         + 'tight. Also dry-pin, at e/D of 1.5 and 2.0.' },
    { key: 'elong',   label: 'e',               unit: '%',        grain: true,
      note: 'Elongation (S-basis)',
      tip: 'Elongation — permanent stretch at fracture, as a percentage of the '
         + 'gauge length. A ductility measure, not a strength; published on an '
         + 'S-basis (specification minimum).' },
    { key: 'E',       label: 'E',               unit: '10<sup>3</sup> ksi',
      note: 'Tensile modulus',
      tip: "Young's modulus in tension — stiffness, the slope of the elastic "
         + 'part of the stress-strain curve. Drives deflection, not strength.' },
    { key: 'Ec',      label: 'E<sub>c</sub>',   unit: '10<sup>3</sup> ksi',
      note: 'Compressive modulus',
      tip: 'Compressive modulus — the same stiffness measured in compression, '
         + 'usually slightly higher than E. Use it for buckling.' },
    { key: 'G',       label: 'G',               unit: '10<sup>3</sup> ksi',
      note: 'Shear modulus',
      tip: 'Shear modulus (modulus of rigidity) — stiffness in shear, relating '
         + 'shear stress to shear strain. Drives torsional deflection and '
         + 'shear-panel buckling.' },
    { key: 'mu',      label: '&mu;',            unit: '',
      note: "Poisson's ratio",
      tip: "Poisson's ratio — how much the material contracts sideways as it "
         + 'stretches. Near 0.33 for aluminium and 0.32 for steel.' },
    { key: 'density', label: '&omega;',         unit: 'lb/in.<sup>3</sup>',
      note: 'Density',
      tip: 'Density — weight per unit volume. Aluminium runs about 0.10 and '
         + 'steel about 0.28 lb/in3.' }
  ];

  function $(id) { return document.getElementById(id); }

  function collator() {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  }

  /* ── matching ─────────────────────────────────────────────────────────── */

  function thicknessMatches(entry, t) {
    if (t === null) return true;
    var th = entry.thickness;
    // A table that does not break the property out by thickness applies to the
    // whole product form, so it stays in the running.
    if (!th || (th.min === null && th.max === null)) return true;
    var eps = 1e-9;
    if (th.min !== null && t < th.min - eps) return false;
    if (th.max !== null && t > th.max + eps) return false;
    return true;
  }

  function matches(entry, sel, t) {
    for (var i = 0; i < FILTERS.length; i++) {
      var f = FILTERS[i];
      var want = sel[f.id];
      if (want && entry[f.key] !== want) return false;
    }
    return thicknessMatches(entry, t);
  }

  /** Entries surviving every filter *above* the given one — used to decide
   *  which options that select should still offer. */
  function upstream(index, sel, t) {
    return ENTRIES.filter(function (e) {
      for (var i = 0; i < index; i++) {
        var f = FILTERS[i];
        if (sel[f.id] && e[f.key] !== sel[f.id]) return false;
      }
      return thicknessMatches(e, t);
    });
  }

  /* ── filter UI ────────────────────────────────────────────────────────── */

  function readSelections() {
    var sel = {};
    FILTERS.forEach(function (f) {
      var el = $('sa-' + f.id);
      sel[f.id] = el && el.value ? el.value : '';
    });
    return sel;
  }

  function readThickness() {
    var raw = $('sa-thickness').value.trim();
    if (raw === '') return null;
    var v = parseFloat(raw);
    return isFinite(v) && v > 0 ? v : null;
  }

  function rebuildFilters() {
    var sel = readSelections();
    var t = readThickness();

    FILTERS.forEach(function (f, i) {
      var el = $('sa-' + f.id);
      var pool = upstream(i, sel, t);

      var values = [];
      var seen = Object.create(null);
      pool.forEach(function (e) {
        var v = e[f.key];
        if (v && !seen[v]) { seen[v] = 1; values.push(v); }
      });
      values.sort(collator().compare);

      // Drop a selection that the narrower pool no longer offers.
      if (sel[f.id] && values.indexOf(sel[f.id]) === -1) sel[f.id] = '';

      var anyLabel = f.id === 'alloy' ? 'Select an alloy…' : 'Any';
      var html = '<option value="">' + anyLabel + '</option>';
      html += f.id === 'alloy'
        ? groupedOptions(values, sel[f.id])
        : flatOptions(values, sel[f.id]);
      el.innerHTML = html;
      el.disabled = values.length === 0;
    });

    return sel;
  }

  // Handbook order, so the alloy list reads the way the chapters are numbered
  // (2.2 through 2.7, then Chapter 3, then Chapter 4).
  var GROUP_ORDER = [
    'Carbon Steels',
    'Low-Alloy Steels',
    'Intermediate Alloy Steels',
    'High-Alloy Steels',
    'Precipitation and Transformation-Hardening Stainless Steels',
    'Austenitic Stainless Steels',
    'Steels',
    'Aluminum Alloys',
    'Magnesium Alloys',
    'Other'
  ];

  var alloyGroup = null;      // alloy name -> handbook family

  function groupFor(alloy) {
    if (!alloyGroup) {
      alloyGroup = Object.create(null);
      ENTRIES.forEach(function (e) {
        if (e.alloy && !alloyGroup[e.alloy]) alloyGroup[e.alloy] = e.group || 'Other';
      });
    }
    return alloyGroup[alloy] || 'Other';
  }

  function option(v, selected) {
    return '<option value="' + escapeAttr(v) + '"' +
           (v === selected ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
  }

  function flatOptions(values, selected) {
    return values.map(function (v) { return option(v, selected); }).join('');
  }

  /** Alloys are bucketed by the handbook family they come from, so the list
   *  reads as "Aluminum Alloys / Magnesium Alloys / Austenitic Stainless
   *  Steels …" rather than one run of eighty names. */
  function groupedOptions(values, selected) {
    var buckets = Object.create(null);
    values.forEach(function (v) {
      var g = groupFor(v);
      (buckets[g] || (buckets[g] = [])).push(v);
    });

    var names = Object.keys(buckets).sort(function (a, b) {
      var ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      if (ia === -1) ia = GROUP_ORDER.length;
      if (ib === -1) ib = GROUP_ORDER.length;
      return ia - ib || a.localeCompare(b);
    });

    // A single remaining group adds nothing but a header once the list is
    // already narrowed to one family.
    if (names.length < 2) return flatOptions(values, selected);

    return names.map(function (g) {
      return '<optgroup label="' + escapeAttr(g) + '">' +
             flatOptions(buckets[g], selected) + '</optgroup>';
    }).join('');
  }

  /* ── rendering ────────────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  function fmt(v) {
    if (v === null || v === undefined) return '&middot;&middot;&middot;';
    return (Math.round(v * 1000) / 1000).toString();
  }

  function thicknessText(e) {
    var th = e.thickness;
    if (!th || !th.raw) return 'not broken out';
    return th.raw + ' in.';
  }

  function renderMatches(list) {
    var wrap = $('sa-matches');
    var countEl = $('sa-match-count');

    countEl.textContent = list.length === 0 ? 'No matching condition' :
      list.length === 1 ? '1 matching condition' :
      list.length + ' matching conditions';

    if (list.length === 0) {
      wrap.innerHTML = '<p class="sa-empty">No published condition matches ' +
        'these selections. Widen a filter, or clear the thickness to see every ' +
        'thickness band for this alloy.</p>';
      return;
    }

    var rows = list.map(function (e, i) {
      var ftu = e.props.Ftu;
      var fty = e.props.Fty;
      return '<tr class="sa-match-row' + (e === SELECTED ? ' is-selected' : '') +
        '" data-idx="' + i + '" tabindex="0">' +
        '<td>' + escapeHtml(e.form || e.alloy || '&mdash;') + '</td>' +
        '<td>' + escapeHtml(e.temper || '&mdash;') + '</td>' +
        '<td>' + escapeHtml(thicknessText(e)) + '</td>' +
        '<td>' + escapeHtml(e.basis || '&mdash;') + '</td>' +
        '<td class="sa-num">' + fmt(pick(ftu, 'L')) + '</td>' +
        '<td class="sa-num">' + fmt(pick(fty, 'L')) + '</td>' +
        '<td class="sa-src">' + escapeHtml(e.table) + '</td>' +
        '</tr>';
    }).join('');

    wrap.innerHTML =
      '<div class="sa-table-scroll"><table class="sa-match-table">' +
      '<thead><tr><th>Form</th><th>Temper</th><th>Thickness</th><th>Basis</th>' +
      '<th class="sa-num">F<sub>tu</sub> (L)</th>' +
      '<th class="sa-num">F<sub>ty</sub> (L)</th>' +
      '<th>Table</th></tr></thead><tbody>' + rows +
      '</tbody></table></div>';

    Array.prototype.forEach.call(wrap.querySelectorAll('.sa-match-row'),
      function (tr) {
        function choose() {
          SELECTED = list[parseInt(tr.getAttribute('data-idx'), 10)];
          renderMatches(list);
          renderDetail();
          renderDerated();
        }
        tr.addEventListener('click', choose);
        tr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); }
        });
      });
  }

  /** Read a property that may be a bare number or a per-grain / per-e-D map. */
  function pick(val, sub) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (sub && Object.prototype.hasOwnProperty.call(val, sub)) return val[sub];
    return null;
  }

  function renderDetail() {
    var host = $('sa-detail');
    if (!SELECTED) {
      host.innerHTML = '<p class="sa-empty">Pick an alloy above to see its ' +
        'published design allowables.</p>';
      return;
    }

    var e = SELECTED;
    var grain = $('sa-grain').value;

    var rows = PROP_ROWS.map(function (p) {
      var raw = e.props[p.key];
      if (raw === undefined) return '';

      var cells, shownGrain = grain;

      if (p.ed) {
        cells = '<td class="sa-num">' + fmt(pick(raw, 'eD1.5')) + '</td>' +
                '<td class="sa-num">' + fmt(pick(raw, 'eD2.0')) + '</td>';
      } else if (p.grain) {
        var v = pick(raw, grain);
        // Elongation is normally published for one direction only, so show the
        // direction that exists rather than an empty cell. Strength allowables
        // are never substituted across grain directions.
        if (v === null && p.key === 'elong' && raw && typeof raw === 'object') {
          var have = ['LT', 'L', 'ST'].filter(function (g) {
            return raw[g] !== undefined;
          });
          if (have.length) { shownGrain = have[0]; v = raw[shownGrain]; }
        }
        cells = '<td class="sa-num" colspan="2">' + fmt(v) + '</td>';
      } else {
        cells = '<td class="sa-num" colspan="2">' + fmt(pick(raw)) + '</td>';
      }

      var qualifier = p.ed ? '<span class="sa-qual">e/D = 1.5 &nbsp;|&nbsp; 2.0</span>'
                    : p.grain ? '<span class="sa-qual">' + shownGrain + '</span>' : '';

      return '<tr><th scope="row">' +
             '<abbr class="sa-abbr" title="' + escapeAttr(p.tip) + '">' +
             p.label + '</abbr>' +
             (p.unit ? ' <span class="sa-unit">' + p.unit + '</span>' : '') +
             '</th><td class="sa-note">' + p.note + ' ' + qualifier + '</td>' +
             cells + '</tr>';
    }).join('');

    var anchorHref = e.page + '#' + e.anchor;
    var pdfLink = e.pdfPage
      ? ' &nbsp;|&nbsp; <a href="downloadable/MIL-HDBK-5J-1.pdf#page=' +
        e.pdfPage + '" target="_blank" rel="noopener">handbook page ' +
        e.pdfPage + '</a>'
      : '';

    host.innerHTML =
      '<div class="sa-detail-head">' +
        '<div class="sa-detail-title">' + escapeHtml(e.alloy || '') + '</div>' +
        '<div class="sa-detail-sub">' +
          [e.form, e.temper, thicknessText(e),
           e.basis ? e.basis + '-basis' : null]
            .filter(Boolean).map(escapeHtml).join(' &nbsp;&middot;&nbsp; ') +
        '</div>' +
        (e.spec ? '<div class="sa-detail-spec">' + escapeHtml(e.spec) + '</div>' : '') +
      '</div>' +
      '<div class="sa-table-scroll"><table class="sa-prop-table">' +
      '<thead><tr><th>Property</th><th></th><th class="sa-num" colspan="2">Value</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="sa-source">Source: ' +
      '<span style="font-weight: var(--font-weight-normal)">Table ' +
      escapeHtml(e.table) +
      '</span> &mdash; <a href="' + escapeAttr(anchorHref) + '">' +
      escapeHtml(e.caption) + '</a>' + pdfLink + '</p>';
  }

  /* ── derated properties at temperature ────────────────────────────────── */

  var exposureHours = null;     // chosen time at temperature

  function renderDerated() {
    var host = $('sa-derated');
    var sec = $('sa-derated-section');
    var note = $('sa-derated-note');
    if (!host || !sec) return;

    var t = readTemperature();
    if (!SELECTED || t === null || !window.StressFigures) {
      sec.hidden = true;
      host.innerHTML = '';
      return;
    }

    var grain = $('sa-grain').value;
    var rows = [], missing = [];

    PROP_ROWS.forEach(function (p) {
      var raw = SELECTED.props[p.key];
      if (raw === undefined) return;
      if (p.key === 'mu' || p.key === 'density') return;   // not temperature-derated here

      var d = StressFigures.derate(p.key, t, exposureHours);
      if (!d) { missing.push(p.key); return; }

      function cell(rt) {
        if (rt === null) return { rt: null, out: null };
        return {
          rt: rt,
          out: d.mode === 'percent' ? rt * d.value / 100 : d.value
        };
      }

      var parts;
      if (p.ed) {
        parts = [
          { sub: 'e/D 1.5', v: cell(pick(raw, 'eD1.5')) },
          { sub: 'e/D 2.0', v: cell(pick(raw, 'eD2.0')) }
        ];
      } else if (p.grain) {
        var g = pick(raw, grain), shown = grain;
        if (g === null && p.key === 'elong' && raw && typeof raw === 'object') {
          var have = ['LT', 'L', 'ST'].filter(function (k) {
            return raw[k] !== undefined;
          });
          if (have.length) { shown = have[0]; g = raw[shown]; }
        }
        parts = [{ sub: shown, v: cell(g) }];
      } else {
        parts = [{ sub: '', v: cell(pick(raw)) }];
      }

      parts.forEach(function (part) {
        if (part.v.rt === null && d.mode === 'percent') return;
        rows.push(
          '<tr>' +
          '<th scope="row"><abbr class="sa-abbr" title="' + escapeAttr(p.tip) +
            '">' + p.label + '</abbr>' +
            (p.unit ? ' <span class="sa-unit">' + p.unit + '</span>' : '') +
            (part.sub ? ' <span class="sa-qual">' + escapeHtml(part.sub) +
                        '</span>' : '') +
          '</th>' +
          '<td class="sa-num">' + (part.v.rt === null ? '&middot;&middot;&middot;'
                                                      : fmt(part.v.rt)) + '</td>' +
          '<td class="sa-num">' +
            (d.mode === 'percent' ? fmt(d.value) + '%' : '&mdash;') + '</td>' +
          '<td class="sa-num sa-derated-val">' +
            (part.v.out === null ? '&middot;&middot;&middot;' : fmt(part.v.out)) +
          '</td>' +
          '<td class="sa-src">' +
            '<a href="' + escapeAttr(d.fig.page + '#' + d.fig.anchor) + '">Fig ' +
            escapeHtml(d.fig.id) + '</a>' +
            (d.seriesLabel && d.hours !== null
              ? ' <span class="sa-unit">' + escapeHtml(d.seriesLabel) + '</span>'
              : '') +
          '</td></tr>'
        );
      });
    });

    if (!rows.length) {
      sec.hidden = true;
      host.innerHTML = '';
      return;
    }

    sec.hidden = false;
    note.textContent = 'at ' + fmt(t) + ' °F' +
      (missing.length ? ' · no curve published for ' + missing.join(', ') : '');

    host.innerHTML =
      exposureControl() +
      '<div class="sa-table-scroll"><table class="sa-prop-table">' +
      '<thead><tr>' +
        '<th>Property</th>' +
        '<th class="sa-num">Room temp.</th>' +
        '<th class="sa-num">% of RT</th>' +
        '<th class="sa-num">At ' + fmt(t) + ' &deg;F</th>' +
        '<th>Curve</th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' +
      '<p class="sa-source">Read off the "Effect of temperature" curves for this ' +
      'alloy and applied to the room-temperature values above. Curves published ' +
      'only for a specific temper may not apply to every condition in the table ' +
      '&mdash; check the figure caption. Exposure-effect curves (properties ' +
      'measured back at room temperature after being held hot) are a separate ' +
      'question and are not used here.</p>';

    var es = $('sa-exposure');
    if (es) {
      es.addEventListener('change', function () {
        exposureHours = es.value === '' ? null : parseFloat(es.value);
        renderDerated();
      });
    }
  }

  function exposureControl() {
    var list = StressFigures.exposures();
    if (list.length < 2) return '';
    if (exposureHours === null) exposureHours = list[0].hours;
    return '<div class="sa-exposure-row">' +
      '<label for="sa-exposure">Time at temperature</label>' +
      '<select id="sa-exposure">' +
      list.map(function (o) {
        return '<option value="' + o.hours + '"' +
               (o.hours === exposureHours ? ' selected' : '') + '>' +
               escapeHtml(o.label) + '</option>';
      }).join('') +
      '</select></div>';
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */

  function refresh() {
    var sel = rebuildFilters();
    var t = readThickness();

    var list = ENTRIES.filter(function (e) { return matches(e, sel, t); });

    // Nothing is worth showing until an alloy is chosen — the full 1000-row
    // list is noise, not a result.
    if (!sel.alloy) list = [];

    if (list.indexOf(SELECTED) === -1) {
      // Thin-gauge rows often publish LT only. Landing on one of those by
      // default shows a column of dots, so prefer a row that actually carries a
      // strength value for the selected grain direction.
      var grain = $('sa-grain').value;
      var usable = list.filter(function (e) {
        return pick(e.props.Ftu, grain) !== null;
      });
      SELECTED = usable.length ? usable[0] : (list.length ? list[0] : null);
    }

    renderMatches(list);
    renderDetail();
    renderDerated();
    syncFigures(sel.alloy);
    writeUrlState(sel, t);
  }

  /* ── figures & source tables for the selected alloy ───────────────────── */

  function readTemperature() {
    var el = $('sa-temperature');
    if (!el) return null;
    var raw = el.value.trim();
    if (raw === '') return null;
    var v = parseFloat(raw);
    return isFinite(v) ? v : null;
  }

  /** Reload the figure/table panels only when the alloy actually changes —
   *  rebuilding dozens of charts on every keystroke in the thickness box would
   *  make the filters unusable. */
  function syncFigures(alloy) {
    if (!window.StressFigures) return;
    var target = alloy || null;
    if (target === SHOWN_ALLOY) return;
    SHOWN_ALLOY = target;

    var figSec = $('sf-figures-section');
    var tblSec = $('sf-tables-section');
    figSec.hidden = tblSec.hidden = !target;
    if (!target) {
      StressFigures.load(null, $('sf-figures'), $('sf-tables'));
      return;
    }

    StressFigures.load(target, $('sf-figures'), $('sf-tables'))
      .then(function (counts) {
        $('sf-figures-note').textContent = counts.figures
          ? counts.figures + ' digitized figure' + (counts.figures === 1 ? '' : 's') +
            ' for ' + target
          : '';
        $('sf-tables-note').textContent = counts.tables
          ? counts.tables + ' handbook table' + (counts.tables === 1 ? '' : 's')
          : '';
        // Not every alloy has digitized figures yet; show nothing rather than an
        // empty heading.
        figSec.hidden = !counts.figures;
        tblSec.hidden = !counts.tables;
        StressFigures.setTemperature(readTemperature());
        exposureHours = null;      // exposures differ from alloy to alloy
        renderDerated();
      });
  }

  /* ── shareable URL state ──────────────────────────────────────────────── */

  function writeUrlState(sel, t) {
    var p = new URLSearchParams();
    FILTERS.forEach(function (f) { if (sel[f.id]) p.set(f.id, sel[f.id]); });
    if (t !== null) p.set('t', String(t));
    var temp = readTemperature();
    if (temp !== null) p.set('temp', String(temp));
    var grain = $('sa-grain').value;
    if (grain !== 'L') p.set('grain', grain);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function readUrlState() {
    var p = new URLSearchParams(location.search);
    FILTERS.forEach(function (f) {
      var v = p.get(f.id);
      if (v) {
        var el = $('sa-' + f.id);
        // The option does not exist yet; stage it so rebuildFilters can honour
        // it as each select is populated in order.
        el.innerHTML = '<option value="' + escapeAttr(v) + '" selected></option>';
      }
    });
    if (p.get('t')) $('sa-thickness').value = p.get('t');
    if (p.get('temp')) $('sa-temperature').value = p.get('temp');
    if (p.get('grain')) $('sa-grain').value = p.get('grain');
  }

  function init() {
    FILTERS.forEach(function (f) {
      $('sa-' + f.id).addEventListener('change', refresh);
    });
    $('sa-thickness').addEventListener('input', refresh);
    $('sa-grain').addEventListener('change', function () {
      renderDetail();
      renderDerated();
      writeUrlState(readSelections(), readThickness());
    });
    $('sa-temperature').addEventListener('input', function () {
      if (window.StressFigures) StressFigures.setTemperature(readTemperature());
      renderDerated();
      writeUrlState(readSelections(), readThickness());
    });
    $('sa-reset').addEventListener('click', function () {
      FILTERS.forEach(function (f) { $('sa-' + f.id).value = ''; });
      $('sa-thickness').value = '';
      $('sa-temperature').value = '';
      $('sa-grain').value = 'L';
      SELECTED = null;
      exposureHours = null;
      if (window.StressFigures) StressFigures.setTemperature(null);
      refresh();
    });

    readUrlState();
    refresh();
  }

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (payload) {
      ENTRIES = payload.entries || [];
      var meta = payload.meta || {};
      var stamp = $('sa-dataset-note');
      if (stamp) {
        stamp.textContent = ENTRIES.length + ' published conditions from ' +
          (meta.tables || 0) + ' ' + (meta.source || 'MIL-HDBK-5') +
          ' tables. Digitization is ongoing; more chapters are added as they ' +
          'are transcribed.';
      }
      $('sa-loading').hidden = true;
      $('sa-app').hidden = false;
      init();
    })
    .catch(function (err) {
      $('sa-loading').innerHTML =
        '<p class="sa-empty">Could not load the allowables dataset (' +
        escapeHtml(err.message) + '). Reload the page to try again.</p>';
    });
})();
