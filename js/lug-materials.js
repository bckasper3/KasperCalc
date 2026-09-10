/**
 * lug-materials.js — material selection for the lug and pin calculator, backed
 * by the same MIL-HDBK-5 dataset as MaterialPropertyLookup.html.
 *
 * Two modes share one resolver:
 *
 *   simple    a short curated list of common aerospace conditions, one select
 *             per part, so the page is usable without knowing the handbook
 *   full      every published condition — alloy grouped by handbook family,
 *             then a condition select carrying form, temper, thickness and
 *             basis — plus grain direction and a service temperature that
 *             derates the strengths off the effect-of-temperature curves
 *
 * Only entries publishing Ftu, Fty and Fsu are offered: without all three the
 * lug and pin checks cannot be completed, and quietly substituting a default
 * would be worse than leaving the material out.
 */
'use strict';

window.LugMaterials = (function () {
  var DATA_URL = 'js/data/design-allowables.json';

  var ENTRIES = [];          // usable conditions only
  var byId = Object.create(null);
  var onChange = null;
  var advanced = false;

  var PARTS = ['Lug', 'Pin', 'Bushing'];

  // Handbook order, matching MaterialPropertyLookup.
  var GROUP_ORDER = [
    'Carbon Steels', 'Low-Alloy Steels', 'Intermediate Alloy Steels',
    'High-Alloy Steels',
    'Precipitation and Transformation-Hardening Stainless Steels',
    'Austenitic Stainless Steels', 'Steels',
    'Aluminum Alloys', 'Magnesium Alloys', 'Other'
  ];

  // What the curated list offers, in preference order. Each is matched against
  // the dataset at load time; anything that does not resolve is dropped rather
  // than faked.
  var CURATED = [
    { part: 'lug',     alloy: '2024 Aluminum Alloy', temper: /^T351$/,   form: 'Plate' },
    { part: 'lug',     alloy: '2024 Aluminum Alloy', temper: /^T3$/,     form: 'Sheet' },
    { part: 'lug',     alloy: '6061 Aluminum Alloy', temper: /T6/,       form: 'Plate' },
    { part: 'lug',     alloy: '6061 Aluminum Alloy', temper: /T6/,       form: 'Extrusion' },
    { part: 'lug',     alloy: '7075 Aluminum Alloy', temper: /^T651$/,   form: 'Plate' },
    { part: 'lug',     alloy: '7075 Aluminum Alloy', temper: /^T6$/,     form: 'Sheet' },
    { part: 'lug',     alloy: '7050 Aluminum Alloy', temper: /T7451/,    form: 'Plate' },
    { part: 'pin',     alloy: 'AISI 4130',           temper: null,       form: null },
    { part: 'pin',     alloy: 'AISI 4340',           temper: null,       form: null },
    { part: 'pin',     alloy: '15-5PH',              temper: null,       form: null },
    { part: 'pin',     alloy: '17-4PH',              temper: null,       form: null },
    { part: 'bushing', alloy: 'AISI 4130',           temper: null,       form: null }
  ];

  var curatedIds = { lug: [], pin: [], bushing: [] };

  /* ── data shaping ─────────────────────────────────────────────────────── */

  function pick(v, sub) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (sub && Object.prototype.hasOwnProperty.call(v, sub)) return v[sub];
    return null;
  }

  function usable(e) {
    return pick(e.props.Ftu, 'L') !== null &&
           pick(e.props.Fty, 'L') !== null &&
           pick(e.props.Fsu) !== null;
  }

  /** Kt curve family. The handbook picks it by material type; elongation is a
   *  reasonable stand-in and is what the dataset actually carries. */
  function ductilityOf(e) {
    var el = e.props.elong;
    var v = null;
    if (typeof el === 'number') v = el;
    else if (el) {
      ['LT', 'L', 'ST'].forEach(function (g) {
        if (v === null && el[g] !== undefined) v = el[g];
      });
    }
    if (v === null) return 'medium';
    if (v < 5) return 'low';
    if (v > 12) return 'high';
    return 'medium';
  }

  function conditionLabel(e) {
    var bits = [];
    if (e.form) bits.push(e.form);
    if (e.temper) bits.push(e.temper);
    // Only show a thickness band that actually carries a bound — some tables
    // print the placeholder dots where they do not break the property out.
    var th = e.thickness;
    if (th && th.raw && (th.min !== null || th.max !== null)) {
      bits.push(th.raw + ' in');
    }
    if (e.basis) bits.push(e.basis + '-basis');
    return bits.join(' · ') || 'as published';
  }

  /* ── resolution ───────────────────────────────────────────────────────── */

  /**
   * Turn a selected condition into the property set the calculator needs.
   * Strengths are ksi in the dataset and psi in the calculator.
   * @returns {{Ftu,Fty,Fsu,Fbru,ductility,label,entry,derated}|null}
   */
  function resolve(id, grain, tempF, hours) {
    var e = byId[id];
    if (!e) return null;

    var g = grain || 'L';
    var Ftu = pick(e.props.Ftu, g);
    var Fty = pick(e.props.Fty, g);
    // Fall back to L where a grain direction is not published rather than
    // dropping the material.
    if (Ftu === null) Ftu = pick(e.props.Ftu, 'L');
    if (Fty === null) Fty = pick(e.props.Fty, 'L');
    var Fsu = pick(e.props.Fsu);
    var Fbru = pick(e.props.Fbru, 'eD1.5');

    // Bearing allowable is not published for every condition; the method's own
    // relation to compressive yield is a better stand-in than a guess.
    var derivedFbru = false;
    if (Fbru === null) {
      var Fcy = pick(e.props.Fcy, g);
      if (Fcy === null) Fcy = pick(e.props.Fcy, 'L');
      if (Fcy !== null) { Fbru = 1.304 * Fcy; derivedFbru = true; }
      else { Fbru = 1.5 * Ftu; derivedFbru = true; }
    }

    var out = {
      Ftu: Ftu * 1000, Fty: Fty * 1000, Fsu: Fsu * 1000, Fbru: Fbru * 1000,
      ductility: ductilityOf(e),
      label: e.alloy + ' — ' + conditionLabel(e),
      alloy: e.alloy, entry: e, grain: g,
      derivedFbru: derivedFbru, derated: null
    };

    if (tempF !== null && tempF !== undefined && window.StressFigures) {
      applyDerate(out, tempF, hours);
    }
    return out;
  }

  /** Knock the strengths down onto the effect-of-temperature curves. Anything
   *  without a published curve keeps its room-temperature value and is named,
   *  so a partial derate is never mistaken for a complete one. */
  function applyDerate(m, tempF, hours) {
    var applied = [], missing = [];
    [['Ftu', 'Ftu'], ['Fty', 'Fty'], ['Fsu', 'Fsu']].forEach(function (pair) {
      var d = StressFigures.derate(pair[1], tempF, hours);
      if (d && d.mode === 'percent') {
        m[pair[0]] = m[pair[0]] * d.value / 100;
        applied.push(pair[0] + ' ' + d.value.toFixed(1) + '%');
      } else {
        missing.push(pair[0]);
      }
    });
    var db = StressFigures.derate('Fbru', tempF, hours);
    if (db && db.mode === 'percent') {
      m.Fbru = m.Fbru * db.value / 100;
      applied.push('Fbru ' + db.value.toFixed(1) + '%');
    } else {
      missing.push('Fbru');
    }
    m.derated = { tempF: tempF, hours: hours, applied: applied, missing: missing };
  }

  /* ── option building ──────────────────────────────────────────────────── */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function opt(value, label, selected) {
    return '<option value="' + escAttr(value) + '"' +
           (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function alloyOptions(selected) {
    var groups = Object.create(null);
    ENTRIES.forEach(function (e) {
      var g = e.group || 'Other';
      if (!groups[g]) groups[g] = Object.create(null);
      groups[g][e.alloy] = 1;
    });
    var names = Object.keys(groups).sort(function (a, b) {
      var ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      if (ia === -1) ia = 99;
      if (ib === -1) ib = 99;
      return ia - ib || a.localeCompare(b);
    });
    var coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return names.map(function (g) {
      var list = Object.keys(groups[g]).sort(coll.compare);
      return '<optgroup label="' + escAttr(g) + '">' +
        list.map(function (a) { return opt(a, a, selected); }).join('') +
        '</optgroup>';
    }).join('');
  }

  function conditionOptions(alloy, selectedId) {
    var coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return ENTRIES.filter(function (e) { return e.alloy === alloy; })
      .sort(function (a, b) { return coll.compare(conditionLabel(a), conditionLabel(b)); })
      .map(function (e) { return opt(e.id, conditionLabel(e), selectedId); })
      .join('');
  }

  /* ── UI ───────────────────────────────────────────────────────────────── */

  function el(part, kind) {
    return document.getElementById('mat' + part + '_' + kind);
  }

  function currentId(part) {
    var simple = el(part, 'simple'), cond = el(part, 'cond');
    return advanced ? (cond && cond.value) : (simple && simple.value);
  }

  function renderPart(part, keepId) {
    var key = part.toLowerCase();
    var simple = el(part, 'simple');
    var alloySel = el(part, 'alloy');
    var condSel = el(part, 'cond');

    // simple list
    var ids = curatedIds[key].length ? curatedIds[key]
                                     : curatedIds.lug.concat(curatedIds.pin);
    simple.innerHTML = ids.map(function (id) {
      return opt(id, byId[id] ? byId[id].shortLabel : id, keepId);
    }).join('');
    if (keepId && ids.indexOf(keepId) === -1) simple.selectedIndex = 0;

    // full list
    var wantAlloy = (keepId && byId[keepId]) ? byId[keepId].alloy : null;
    alloySel.innerHTML = alloyOptions(wantAlloy);
    if (!alloySel.value) alloySel.selectedIndex = 0;
    condSel.innerHTML = conditionOptions(alloySel.value, keepId);
    if (!condSel.value) condSel.selectedIndex = 0;

    el(part, 'simpleWrap').hidden = advanced;
    el(part, 'fullWrap').hidden = !advanced;
  }

  function refreshReadouts() {
    var grain = advanced ? document.getElementById('mat_grain').value : 'L';
    var tempF = advanced ? readTemp() : null;
    var hours = advanced ? readHours() : null;
    PARTS.forEach(function (part) {
      var m = resolve(currentId(part), grain, tempF, hours);
      var out = el(part, 'props');
      if (!out) return;
      if (!m) { out.textContent = ''; return; }
      var bits = ['F<sub>tu</sub> ' + Math.round(m.Ftu / 1000) +
                  ' · F<sub>ty</sub> ' + Math.round(m.Fty / 1000) +
                  ' · F<sub>su</sub> ' + Math.round(m.Fsu / 1000) + ' ksi'];
      if (m.derated && m.derated.applied.length) {
        bits.push('derated at ' + m.derated.tempF + '°F');
      }
      out.innerHTML = bits.join(' &nbsp;|&nbsp; ');
    });
  }

  function readTemp() {
    var v = parseFloat(document.getElementById('mat_temp').value);
    return isFinite(v) ? v : null;
  }
  function readHours() {
    var s = document.getElementById('mat_hours');
    return s && s.value !== '' ? parseFloat(s.value) : null;
  }

  function fire() {
    refreshReadouts();
    if (onChange) onChange();
  }

  function wire() {
    document.getElementById('mat_advanced').addEventListener('change', function (ev) {
      advanced = ev.target.checked;
      var keep = {};
      PARTS.forEach(function (p) { keep[p] = currentId(p); });
      document.getElementById('mat_advancedFields').hidden = !advanced;
      PARTS.forEach(function (p) { renderPart(p, keep[p]); });
      if (advanced) loadFigures();
      fire();
    });

    PARTS.forEach(function (part) {
      el(part, 'simple').addEventListener('change', fire);
      el(part, 'cond').addEventListener('change', fire);
      el(part, 'alloy').addEventListener('change', function () {
        el(part, 'cond').innerHTML = conditionOptions(el(part, 'alloy').value, null);
        el(part, 'cond').selectedIndex = 0;
        loadFigures();
        fire();
      });
    });

    document.getElementById('mat_grain').addEventListener('change', fire);
    document.getElementById('mat_temp').addEventListener('input', function () {
      loadFigures();
      fire();
    });
    document.getElementById('mat_hours').addEventListener('change', fire);
  }

  /* ── temperature curves ───────────────────────────────────────────────── */

  var figuresFor = null;      // alloy whose curves are loaded

  /** The derate curves live per alloy; load the lug alloy's set on demand. */
  function loadFigures() {
    if (!advanced || !window.StressFigures) return;
    var m = byId[currentId('Lug')];
    if (!m || figuresFor === m.alloy) return;
    figuresFor = m.alloy;
    var sink = document.createElement('div');
    StressFigures.load(m.alloy, sink, document.createElement('div'))
      .then(function () {
        populateHours();
        fire();
      });
  }

  function populateHours() {
    var sel = document.getElementById('mat_hours');
    if (!sel || !window.StressFigures) return;
    var list = StressFigures.exposures();
    var keep = sel.value;
    sel.innerHTML = '<option value="">shortest published</option>' +
      list.map(function (o) { return opt(String(o.hours), o.label, keep); }).join('');
    document.getElementById('mat_hoursWrap').hidden = list.length < 2;
  }

  /* ── init ─────────────────────────────────────────────────────────────── */

  function buildCurated() {
    CURATED.forEach(function (want) {
      var hit = ENTRIES.filter(function (e) {
        if (e.alloy !== want.alloy) return false;
        if (want.form && e.formGroup !== want.form) return false;
        if (want.temper && !(e.temper && want.temper.test(e.temper))) return false;
        return true;
      });
      if (!hit.length) return;
      // Prefer an A-basis, mid-thickness condition as the representative one.
      hit.sort(function (a, b) {
        var ba = a.basis === 'A' ? 0 : 1, bb = b.basis === 'A' ? 0 : 1;
        return ba - bb;
      });
      var e = hit[0];
      e.shortLabel = e.alloy.replace(' Aluminum Alloy', '') +
        (e.temper ? ' ' + e.temper : '') +
        (e.formGroup ? ' — ' + e.formGroup : '');
      if (curatedIds[want.part].indexOf(e.id) === -1) curatedIds[want.part].push(e.id);
    });
  }

  /**
   * @param {function} changed  called whenever a material selection changes
   * @returns {Promise}
   */
  function init(changed) {
    onChange = changed;
    return fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (payload) {
        ENTRIES = (payload.entries || []).filter(usable);
        ENTRIES.forEach(function (e) { byId[e.id] = e; });
        buildCurated();
        PARTS.forEach(function (p) { renderPart(p, null); });
        wire();
        refreshReadouts();
        return { count: ENTRIES.length, alloys: Object.keys(
          ENTRIES.reduce(function (a, e) { a[e.alloy] = 1; return a; }, {})).length };
      });
  }

  /** Current properties for a part, in psi. */
  function get(part) {
    var grain = advanced ? document.getElementById('mat_grain').value : 'L';
    return resolve(currentId(part), grain,
                   advanced ? readTemp() : null,
                   advanced ? readHours() : null);
  }

  return { init: init, get: get, isAdvanced: function () { return advanced; } };
})();
