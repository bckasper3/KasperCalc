/**
 * stress-materials.js — MIL-HDBK-5 material picker for the stress calculators.
 *
 * Reads the same js/data/design-allowables.json that MaterialPropertyLookup.html
 * uses, and drives a two-level control: a short curated list for the common case,
 * and — behind a checkbox — the full alloy/condition cascade with grain direction
 * and a service temperature that derates off the effect-of-temperature curves.
 *
 * A page declares which properties it actually needs; conditions that do not
 * publish all of them are dropped rather than filled in with a guess, so the
 * dropdown only ever offers materials the calculation can genuinely run on.
 *
 * Generalised from js/lug-materials.js. That module still drives
 * LugPinAnalysis.html and could be retired onto this one, but it is left alone
 * here rather than refactored underneath a working page.
 */
'use strict';

window.StressMaterials = (function () {
  var DATA_URL = 'js/data/design-allowables.json';

  var ENTRIES = [];
  var byId = Object.create(null);
  var cfg = null;
  var advanced = false;
  var curatedIds = Object.create(null);

  var GROUP_ORDER = [
    'Carbon Steels', 'Low-Alloy Steels', 'Intermediate Alloy Steels',
    'High-Alloy Steels',
    'Precipitation and Transformation-Hardening Stainless Steels',
    'Austenitic Stainless Steels', 'Steels',
    'Aluminum Alloys', 'Magnesium Alloys', 'Other'
  ];

  /* Properties that are published per grain direction; everything else is a
     single number for the condition. */
  var GRAINED = { Ftu: 1, Fty: 1, Fcy: 1, elong: 1 };

  /* ── data shaping ─────────────────────────────────────────────────────── */

  function pick(v, sub) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (sub && Object.prototype.hasOwnProperty.call(v, sub)) return v[sub];
    return null;
  }

  function prop(e, name, grain) {
    var v = e.props[name];
    if (GRAINED[name]) {
      var g = pick(v, grain || 'L');
      return g !== null ? g : pick(v, 'L');
    }
    return pick(v);
  }

  function usable(e) {
    for (var i = 0; i < cfg.require.length; i++) {
      if (prop(e, cfg.require[i], 'L') === null) return false;
    }
    return true;
  }

  function baseLabel(e) {
    var bits = [];
    if (e.form) bits.push(e.form);
    if (e.temper) bits.push(e.temper);
    var th = e.thickness;
    if (th && th.raw && (th.min !== null || th.max !== null)) bits.push(th.raw + ' in');
    if (e.basis) bits.push(e.basis + '-basis');
    return bits.join(' · ') || 'as published';
  }

  function conditionLabel(e) {
    return baseLabel(e) + (e.labelSuffix || '');
  }

  /* Form, temper, thickness and basis do not always tell two conditions apart:
     4130 tubing quenched and tempered is published at 125, 150 and 180 ksi under
     labels that are otherwise identical, and 4135 tubing at four levels. Left
     alone the dropdown offers the same text several times over and the engineer
     picks a strength level by accident. Where that happens the strength is added
     to the label — it is what the handbook actually distinguishes them by. */
  function disambiguate() {
    var groups = Object.create(null);
    ENTRIES.forEach(function (e) {
      var k = e.alloy + '|' + baseLabel(e);
      (groups[k] || (groups[k] = [])).push(e);
    });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      if (list.length < 2) return;
      list.forEach(function (e) {
        var ftu = prop(e, 'Ftu', 'L');
        e.labelSuffix = ftu !== null ? ' · F' + 'ₜᵤ ' + ftu + ' ksi' : '';
      });
      // still colliding (same published strength) — separate on yield, then ordinal
      var seen = Object.create(null);
      list.forEach(function (e, i) {
        var full = baseLabel(e) + e.labelSuffix;
        if (!seen[full]) { seen[full] = 1; return; }
        var fty = prop(e, 'Fty', 'L');
        e.labelSuffix += fty !== null ? ' / F' + 'ₜᵧ ' + fty : ' (alt ' + (i + 1) + ')';
      });
    });
  }

  function shortLabel(e) {
    var bits = [e.alloy.replace(/ Alloy$/i, '')];
    if (e.temper) bits.push(e.temper);
    if (e.form) bits.push('(' + e.form + ')');
    // the short list is picked from at a glance, so always carry the strength
    var ftu = prop(e, 'Ftu', 'L');
    if (ftu !== null) bits.push('— ' + ftu + ' ksi');
    return bits.join(' ');
  }

  /* ── resolution ───────────────────────────────────────────────────────── */

  /* Strengths are ksi in the dataset and psi here; moduli are Msi and psi. */
  var KSI = 1000, MSI = 1e6;
  var IS_MODULUS = { E: 1, Ec: 1, G: 1 };

  function resolve(id, grain, tempF, hours) {
    var e = byId[id];
    if (!e) return null;

    var out = {
      label: e.alloy + ' — ' + conditionLabel(e),
      alloy: e.alloy, entry: e, grain: grain || 'L', derated: null
    };

    cfg.expose.forEach(function (name) {
      var v = prop(e, name, grain);
      if (v === null) { out[name] = null; return; }
      out[name] = IS_MODULUS[name] ? v * MSI : (name === 'elong' ? v : v * KSI);
    });

    if (tempF !== null && tempF !== undefined && window.StressFigures) {
      applyDerate(out, tempF, hours);
    }
    return out;
  }

  /* Knock the properties down onto the effect-of-temperature curves. Anything
     without a published curve keeps its room-temperature value and is named, so
     a partial derate is never mistaken for a complete one. */
  function applyDerate(m, tempF, hours) {
    var applied = [], missing = [];
    cfg.derate.forEach(function (name) {
      if (m[name] === null || m[name] === undefined) return;
      var d = StressFigures.derate(name, tempF, hours);
      if (d && d.mode === 'percent') {
        m[name] = m[name] * d.value / 100;
        applied.push(name + ' ' + d.value.toFixed(1) + '%');
      } else {
        missing.push(name);
      }
    });
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

  function el(part, kind) { return document.getElementById('mat' + part + '_' + kind); }

  function currentId(part) {
    var simple = el(part, 'simple'), cond = el(part, 'cond');
    return advanced ? (cond && cond.value) : (simple && simple.value);
  }

  function renderPart(part, keepId) {
    var simple = el(part, 'simple');
    var alloySel = el(part, 'alloy');
    var condSel = el(part, 'cond');
    if (!simple || !alloySel || !condSel) return;

    var ids = curatedIds[part] || [];
    if (!ids.length) ids = ENTRIES.slice(0, 12).map(function (e) { return e.id; });
    simple.innerHTML = ids.map(function (id) {
      return opt(id, byId[id] ? byId[id].shortLabel : id, keepId);
    }).join('');
    if (keepId && ids.indexOf(keepId) === -1) simple.selectedIndex = 0;

    var wantAlloy = (keepId && byId[keepId]) ? byId[keepId].alloy : null;
    alloySel.innerHTML = alloyOptions(wantAlloy);
    if (!alloySel.value) alloySel.selectedIndex = 0;
    condSel.innerHTML = conditionOptions(alloySel.value, keepId);
    if (!condSel.value) condSel.selectedIndex = 0;

    var sw = el(part, 'simpleWrap'), fw = el(part, 'fullWrap');
    if (sw) sw.hidden = advanced;
    if (fw) fw.hidden = !advanced;
  }

  function readTemp() {
    var n = document.getElementById('mat_temp');
    var v = n ? parseFloat(n.value) : NaN;
    return isFinite(v) ? v : null;
  }
  function readHours() {
    var s = document.getElementById('mat_hours');
    return s && s.value !== '' ? parseFloat(s.value) : null;
  }
  function grainNow() {
    var g = document.getElementById('mat_grain');
    return advanced && g ? g.value : 'L';
  }

  function refreshReadouts() {
    var grain = grainNow(), tempF = advanced ? readTemp() : null, hours = advanced ? readHours() : null;
    cfg.parts.forEach(function (p) {
      var out = el(p.key, 'props');
      if (!out) return;
      var m = resolve(currentId(p.key), grain, tempF, hours);
      if (!m) { out.textContent = ''; return; }
      var bits = [cfg.readout(m)];
      if (m.derated && m.derated.applied.length) bits.push('derated at ' + m.derated.tempF + '°F');
      if (m.derated && m.derated.missing.length) {
        bits.push('no curve for ' + m.derated.missing.join(', '));
      }
      out.innerHTML = bits.join(' &nbsp;|&nbsp; ');
    });
  }

  function fire() {
    refreshReadouts();
    if (cfg.onChange) cfg.onChange();
  }

  /* The effect-of-temperature curves live per alloy and are what derate() reads,
     so the selected alloy's set is fetched on demand. This is deliberately off
     the critical path: the readout and the calculator are updated first, and a
     failure here leaves room-temperature properties standing rather than
     stopping the page. */
  var figuresFor = null;

  function loadFigures() {
    if (!window.StressFigures || !advanced) return;
    var id = currentId(cfg.parts[0].key);
    var e = byId[id];
    if (!e || figuresFor === e.alloy) return;
    figuresFor = e.alloy;
    var sink = document.createElement('div');
    try {
      var p = StressFigures.load(e.alloy, sink, document.createElement('div'));
      if (p && p.then) {
        p.then(function () { populateHours(); fire(); })
         .catch(function () { figuresFor = null; });
      }
    } catch (err) {
      figuresFor = null;                     // let a later change try again
    }
  }

  function populateHours() {
    var sel = document.getElementById('mat_hours');
    var wrap = document.getElementById('mat_hoursWrap');
    if (!sel || !window.StressFigures || !StressFigures.exposures) return;
    var list = StressFigures.exposures();
    var keep = sel.value;
    sel.innerHTML = '<option value="">shortest published</option>' +
      list.map(function (o) { return opt(String(o.hours), o.label, keep); }).join('');
    if (wrap) wrap.hidden = list.length < 2;
  }

  function wire() {
    var adv = document.getElementById('mat_advanced');
    if (adv) {
      adv.addEventListener('change', function (ev) {
        advanced = ev.target.checked;
        var keep = {};
        cfg.parts.forEach(function (p) { keep[p.key] = currentId(p.key); });
        var f = document.getElementById('mat_advancedFields');
        if (f) f.hidden = !advanced;
        cfg.parts.forEach(function (p) { renderPart(p.key, keep[p.key]); });
        fire();
        if (advanced) loadFigures();
      });
    }

    cfg.parts.forEach(function (p) {
      var s = el(p.key, 'simple'), c = el(p.key, 'cond'), a = el(p.key, 'alloy');
      if (s) s.addEventListener('change', function () { fire(); loadFigures(); });
      if (c) c.addEventListener('change', function () { fire(); loadFigures(); });
      if (a) a.addEventListener('change', function () {
        el(p.key, 'cond').innerHTML = conditionOptions(a.value, null);
        fire();
        loadFigures();
      });
    });

    ['mat_grain', 'mat_temp', 'mat_hours'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('change', fire);
      if (n && n.tagName === 'INPUT') n.addEventListener('input', fire);
    });
  }

  /* ── init ─────────────────────────────────────────────────────────────── */

  function buildCurated() {
    cfg.parts.forEach(function (p) { curatedIds[p.key] = []; });
    (cfg.curated || []).forEach(function (c) {
      var hit = ENTRIES.filter(function (e) {
        if (e.alloy !== c.alloy) return false;
        if (c.temper && !(e.temper && c.temper.test(e.temper))) return false;
        /* The raw form string is written differently chapter to chapter —
           "Extruded bar, rod, and shapes" in 2024, "Extrusion (rod, bar, and
           shapes)" in 7075 — so match the normalised formGroup where the entry
           carries one and only fall back to a substring on the raw text. */
        if (c.form) {
          var want = c.form.toLowerCase();
          var fg = String(e.formGroup || '').toLowerCase();
          var raw = String(e.form || '').toLowerCase();
          if (fg ? fg.indexOf(want) === -1 && raw.indexOf(want) === -1
                 : raw.indexOf(want) === -1) return false;
        }
        // an alloy published at several strength levels needs the level naming
        if (c.ftu !== undefined && prop(e, 'Ftu', 'L') !== c.ftu) return false;
        return true;
      })[0];
      if (!hit) return;                       // not in the dataset — drop it
      cfg.parts.forEach(function (p) {
        if ((c.part || p.key) === p.key && curatedIds[p.key].indexOf(hit.id) === -1) {
          curatedIds[p.key].push(hit.id);
        }
      });
    });
  }

  function init(options) {
    cfg = {
      parts: options.parts || [{ key: 'Col', label: 'Material' }],
      require: options.require || ['Ftu'],
      expose: options.expose || options.require || ['Ftu'],
      derate: options.derate || [],
      curated: options.curated || [],
      readout: options.readout || function () { return ''; },
      onChange: options.onChange || null
    };

    return fetch(DATA_URL)
      .then(function (r) { return r.json(); })
      .then(function (json) {
        ENTRIES = (json.entries || []).filter(usable);
        disambiguate();
        ENTRIES.forEach(function (e) {
          e.shortLabel = shortLabel(e);
          byId[e.id] = e;
        });
        buildCurated();
        cfg.parts.forEach(function (p) { renderPart(p.key, null); });
        wire();
        refreshReadouts();
        return { conditions: ENTRIES.length, alloys: countAlloys() };
      });
  }

  function countAlloys() {
    var seen = Object.create(null), n = 0;
    ENTRIES.forEach(function (e) { if (!seen[e.alloy]) { seen[e.alloy] = 1; n++; } });
    return n;
  }

  function get(partKey) {
    return resolve(currentId(partKey), grainNow(),
                   advanced ? readTemp() : null, advanced ? readHours() : null);
  }

  return {
    init: init,
    get: get,
    isAdvanced: function () { return advanced; },
    count: function () { return { conditions: ENTRIES.length, alloys: countAlloys() }; }
  };
}());
