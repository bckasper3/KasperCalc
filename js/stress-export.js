/**
 * stress-export.js — hand the selected material to a CAD or FEA package.
 *
 * Files are written in SI base units (Pa, kg/m^3, W/(m K), J/(kg K), 1/K)
 * regardless of what the page is displaying, because that is what the formats
 * themselves are defined in — the US/metric toggle is a display choice and must
 * not change the contents of an exported file.
 *
 * What each format actually accepts:
 *
 *   .sldmat  SolidWorks material library — XML. Save it into a folder registered
 *            under Tools > Options > File Locations > Material Databases and the
 *            material appears in the Custom Materials tree. SolidWorks reads
 *            EX, NUXY, GXY, DENS, SIGXT, SIGYLD, SIGXC, ALPX, KX, C.
 *
 *   .inp     Mechanical APDL MP commands. Paste into a Commands (APDL) object in
 *            Workbench Mechanical, or /INPUT it in Mechanical APDL. Engineering
 *            Data has its own XML import, but that schema is verbose and moves
 *            between releases, so the APDL route is the one that keeps working.
 *
 *   .csv     Everything published for the condition, for anything else.
 *
 * A usable material card needs more than the MIL-HDBK-5 design-property tables
 * carry, so the gaps are filled — but never silently. Every value is tagged with
 * its provenance, the tags are shown in a preview the user passes through before
 * the file is written, and they are repeated as comments inside the file so they
 * survive the trip into SolidWorks or ANSYS.
 */
'use strict';

(function () {
  var KSI_PA     = 6.894757e6;     // ksi          -> Pa
  var KSI3_PA    = 6.894757e9;     // 10^3 ksi     -> Pa
  var LBIN3_KGM3 = 27679.905;      // lb/in.^3     -> kg/m^3
  var BTU_WMK    = 1.730735;       // Btu/[(hr)(ft^2)(degF)/ft] -> W/(m K)
  var PERF_PERK  = 1.8e-6;         // 10^-6 in./in./degF        -> 1/K
  var BTU_JKGK   = 4186.8;         // Btu/(lb)(degF)            -> J/(kg K)

  var HANDBOOK = 'handbook';   // straight off a MIL-HDBK-5 table or figure
  var DERIVED  = 'derived';    // computed from other published values
  var TYPICAL  = 'typical';    // generic value for the material family

  /* Room-temperature family typicals in the handbook's own units, used only
     where the alloy itself publishes nothing usable. Representative of the
     family, NOT of the specific alloy — conductivity alone varies by more than
     a factor of two across the aluminium alloys, which is why this tier is
     flagged everywhere it appears. */
  var FAMILY = {
    'Carbon Steels':               { K: 27,   alpha: 6.5,  C: 0.11 },
    'Low-Alloy Steels':            { K: 24,   alpha: 6.3,  C: 0.114 },
    'Intermediate Alloy Steels':   { K: 20,   alpha: 6.2,  C: 0.11 },
    'High-Alloy Steels':           { K: 16,   alpha: 6.0,  C: 0.11 },
    'Precipitation and Transformation-Hardening Stainless Steels':
                                   { K: 10,   alpha: 6.0,  C: 0.11 },
    'Austenitic Stainless Steels': { K: 9.4,  alpha: 9.6,  C: 0.12 },
    'Aluminum Alloys':             { K: 80,   alpha: 12.9, C: 0.23 },
    'Magnesium Alloys':            { K: 45,   alpha: 14.5, C: 0.25 }
  };

  var DISCLAIMER = [
    'KasperCalc provides this file "as is", with no warranty of any kind and',
    'accepts no liability whatsoever for any use made of it. The values are a',
    'transcription of published data together with the derived and typical',
    'values flagged above, and have not been independently verified. You are',
    'responsible for checking every number against the source documents before',
    'it informs any design, analysis or manufacturing decision.'
  ];

  var PHYS = {};               // alloy -> physicalFor() result, cached
  var pending = null;          // the file the preview is holding

  function SA() { return window.StressAllowables; }
  function $(id) { return document.getElementById(id); }
  function pick(v, sub) { return SA().pick(v, sub); }

  /* ── values in SI base units ────────────────────────────────────────── */

  function si(e, key, grain) {
    var raw = e.props[key];
    if (raw === undefined || raw === null) return null;
    var v;
    switch (key) {
      case 'Ftu': case 'Fty': case 'Fcy': case 'Fsu':
        v = pick(raw, grain);
        return v === null ? null : v * KSI_PA;
      case 'Fbru': case 'Fbry':
        v = pick(raw, 'eD2.0');
        if (v === null) v = pick(raw, 'eD1.5');
        return v === null ? null : v * KSI_PA;
      case 'E': case 'Ec': case 'G':
        v = pick(raw);
        return v === null ? null : v * KSI3_PA;
      case 'density':
        v = pick(raw);
        return v === null ? null : v * LBIN3_KGM3;
      default:
        return pick(raw);
    }
  }

  /**
   * The complete material card, every field tagged with where it came from.
   * @returns {Array<{id,label,value,unit,tier,note}>} values in SI base units
   */
  function card(e, grain) {
    var rows = [];
    function add(id, label, value, unit, tier, note) {
      if (value === null || value === undefined || !isFinite(value)) return;
      rows.push({ id: id, label: label, value: value, unit: unit,
                  tier: tier, note: note || '' });
    }

    var Epub = si(e, 'E', grain);
    var Gpub = si(e, 'G', grain);
    var nu   = si(e, 'mu', grain);

    // An isotropic card needs E, G and nu, and the handbook does not always
    // print all three. E = 2G(1 + nu) is exact for an isotropic material, so the
    // missing one is filled from the other two rather than shipping a card the
    // solver will reject.
    var Eval = Epub, Etier = HANDBOOK, Enote = '';
    if (Eval === null && Gpub !== null && nu !== null) {
      Eval = 2 * Gpub * (1 + nu);
      Etier = DERIVED;
      Enote = 'E = 2G(1 + ν); this table publishes G and ν but not E';
    }
    var Gval = Gpub, Gtier = HANDBOOK, Gnote = '';
    if (Gval === null && Epub !== null && nu !== null) {
      Gval = Epub / (2 * (1 + nu));
      Gtier = DERIVED;
      Gnote = 'G = E / 2(1 + ν); this table publishes E and ν but not G';
    }

    var basis = e.basis || 'S';
    add('EX',     'Elastic modulus',      Eval, 'Pa', Etier, Enote);
    add('GXY',    'Shear modulus',        Gval, 'Pa', Gtier, Gnote);
    add('NUXY',   "Poisson's ratio",      nu,   '',   HANDBOOK);
    add('DENS',   'Mass density',         si(e, 'density', grain), 'kg/m^3', HANDBOOK);
    add('SIGXT',  'Tensile strength',     si(e, 'Ftu', grain), 'Pa', HANDBOOK,
        'design allowable (' + basis + '-basis), not a typical value');
    add('SIGYLD', 'Yield strength',       si(e, 'Fty', grain), 'Pa', HANDBOOK,
        'design allowable (' + basis + '-basis), not a typical value');
    add('SIGXC',  'Compressive strength', si(e, 'Fcy', grain), 'Pa', HANDBOOK,
        'compressive yield, Fcy');

    // Thermal properties: the alloy's own physical-properties figure first, a
    // family typical only where the handbook publishes nothing usable.
    var phys = PHYS[e.alloy] || {};
    var fam  = FAMILY[e.group] || null;

    function thermal(id, label, q, factor, unit) {
      if (phys[q]) {
        add(id, label, phys[q].value * factor, unit, HANDBOOK,
            'read at 70 °F off Figure ' + phys[q].fig.id +
            (phys[q].series ? ' (' + phys[q].series + ')' : ''));
      } else if (fam && fam[q] !== undefined) {
        add(id, label, fam[q] * factor, unit, TYPICAL,
            'typical for ' + (e.group || 'this family') +
            ' — not specific to this alloy');
      }
    }
    thermal('ALPX', 'Thermal expansion coefficient', 'alpha', PERF_PERK, '1/K');
    thermal('KX',   'Thermal conductivity',          'K',     BTU_WMK,   'W/(m K)');
    thermal('C',    'Specific heat',                 'C',     BTU_JKGK,  'J/(kg K)');

    return rows;
  }

  /* ── labels ─────────────────────────────────────────────────────────── */

  function nameOf(e) {
    return [e.alloy, e.temper, e.form].filter(Boolean).join(' ');
  }

  function conditionLine(e) {
    return [e.form, e.temper, SA().thicknessText(e),
            e.basis ? e.basis + '-basis' : null].filter(Boolean).join(' / ');
  }

  function sourceLine(e) {
    return 'MIL-HDBK-5J Table ' + e.table +
      (e.basis ? ', ' + e.basis + '-basis' : '') +
      (e.spec ? ', ' + e.spec : '');
  }

  function slug(s) {
    return String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  /**
   * Download filename, without extension.
   *
   * The basis is the difference between two files that are otherwise named
   * identically — the same alloy and temper is published A-basis and B-basis at
   * different strengths — so it goes in the name. It is appended after the
   * length cap rather than before, so a long alloy name can never truncate it
   * away and leave two files looking interchangeable.
   */
  function fileBase(e, grain) {
    var tail = [grain, e.basis ? e.basis + '-basis' : null]
      .filter(Boolean).join('-');
    return slug(nameOf(e)) + (tail ? '-' + tail : '');
  }

  function xmlEsc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function esc(s) { return SA().escapeHtml(s); }

  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<sup>([^<]*)<\/sup>/gi, '^$1');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** The provenance block both file formats carry, as plain lines. */
  function preamble(e, grain, rows) {
    var out = [
      nameOf(e),
      conditionLine(e) + '   grain ' + grain,
      sourceLine(e),
      'Generated by kaspercalc.com. SI base units: Pa, kg/m^3, W/(m K), J/(kg K), 1/K.'
    ];
    var odd = rows.filter(function (r) { return r.tier !== HANDBOOK; });
    if (odd.length) {
      out.push('');
      out.push('NOT TAKEN FROM THE HANDBOOK TABLE FOR THIS CONDITION:');
      odd.forEach(function (r) {
        out.push('  ' + r.id + ' (' + r.label + ') = ' +
                 (r.tier === DERIVED ? 'DERIVED' : 'FAMILY TYPICAL') + '. ' + r.note);
      });
    }
    out.push('');
    out.push('Strength values are MIL-HDBK-5 design allowables: statistical');
    out.push('minimums, not typical or mean properties. An analysis run on them');
    out.push('is a minimum-property analysis.');
    out.push('');
    return out.concat(DISCLAIMER);
  }

  /* ── SolidWorks .sldmat ─────────────────────────────────────────────── */

  function sldmat(e, grain) {
    var rows = card(e, grain);
    var props = rows.map(function (r) {
      return '        <PropertyData name="' + r.id + '"><value>' +
             r.value.toPrecision(6) + '</value></PropertyData>';
    }).join('\n');

    // "--" cannot appear inside an XML comment.
    var head = preamble(e, grain, rows)
      .map(function (l) { return '  ' + l.replace(/--+/g, '–'); })
      .join('\n');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!--\n' + head + '\n-->\n' +
      '<mstns:materials xmlns:mstns="http://www.solidworks.com/sldmaterials"\n' +
      '                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
      '                 version="2008.03">\n' +
      '  <curves id="curve0"><point x="1" y="1"/><point x="2" y="1"/></curves>\n' +
      '  <classification name="MIL-HDBK-5">\n' +
      '    <material name="' + xmlEsc(nameOf(e) + (grain ? ' (' + grain + ')' : '')) +
            '" description="' + xmlEsc(sourceLine(e)) +
            '" propertysource="MIL-HDBK-5J">\n' +
      '      <shaders><shader name="" sourcename=""/></shaders>\n' +
      '      <xhatch name="ANSI31 (Iron BrickStone)" angle="0" scale="1"/>\n' +
      '      <physicalproperties>\n' + props + '\n' +
      '      </physicalproperties>\n' +
      '      <custom>\n' +
      '        <prop name="Source" value="' + xmlEsc(sourceLine(e)) + '"/>\n' +
      '        <prop name="Condition" value="' + xmlEsc(conditionLine(e)) + '"/>\n' +
      '        <prop name="Disclaimer" value="' + xmlEsc(DISCLAIMER.join(' ')) + '"/>\n' +
      '      </custom>\n' +
      '    </material>\n' +
      '  </classification>\n' +
      '</mstns:materials>\n';
  }

  /* ── Mechanical APDL ────────────────────────────────────────────────── */

  var APDL_MP = { EX: 1, GXY: 1, NUXY: 1, DENS: 1, ALPX: 1, KXX: 1, C: 1 };

  function apdl(e, grain) {
    var rows = card(e, grain);
    var L = preamble(e, grain, rows).map(function (l) { return '! ' + l; });

    L.push('');
    L.push('MATID = 1');
    rows.forEach(function (r) {
      var id = r.id === 'KX' ? 'KXX' : r.id;
      if (!APDL_MP[id]) return;
      L.push('MP,' + id + ',MATID,' + r.value.toPrecision(6) +
             '   ! ' + r.label + (r.unit ? ', ' + r.unit : '') +
             (r.tier === HANDBOOK ? '' : '  [' + r.tier.toUpperCase() + ']'));
    });

    L.push('');
    L.push('! Strength allowables. APDL has no standard MP slot for these, so');
    L.push('! they are parameters; reference them in your own post-processing.');
    rows.forEach(function (r) {
      if (APDL_MP[r.id === 'KX' ? 'KXX' : r.id]) return;
      var nm = { SIGXT: 'FTU', SIGYLD: 'FTY', SIGXC: 'FCY' }[r.id] || r.id;
      L.push(nm + ' = ' + r.value.toPrecision(6) + '   ! ' + r.label + ', ' + r.unit);
    });
    var fsu = si(e, 'Fsu', grain);
    if (fsu !== null) {
      L.push('FSU = ' + fsu.toPrecision(6) + '   ! Ultimate shear stress, Pa');
    }
    return L.join('\n') + '\n';
  }

  /* ── CSV and clipboard: published values only, no substitutions ─────── */

  function siFor(p, v) { return p.si ? +(v * p.si.k).toPrecision(6) : v; }

  function eachPublished(e, grain, fn) {
    SA().PROP_ROWS.forEach(function (p) {
      var raw = e.props[p.key];
      if (raw === undefined) return;
      var parts = p.ed ? [['e/D 1.5', 'eD1.5'], ['e/D 2.0', 'eD2.0']]
                : p.grain ? [[grain, grain]] : [['', null]];
      parts.forEach(function (part) {
        var v = pick(raw, part[1]);
        if (v === null || v === undefined) return;
        fn(p, part[0], v);
      });
    });
  }

  function csv(e, grain) {
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var out = [['Property', 'Symbol', 'Value', 'Unit', 'Value (SI)', 'Unit (SI)'].join(',')];
    eachPublished(e, grain, function (p, sub, v) {
      out.push([q(p.note), q(plain(p.label) + (sub ? ' ' + sub : '')), v,
                q(plain(p.unit)), siFor(p, v),
                q(plain(p.si ? p.si.unit : p.unit))].join(','));
    });
    out.push('');
    out.push([q('Alloy'), q(e.alloy || '')].join(','));
    out.push([q('Condition'), q(conditionLine(e))].join(','));
    out.push([q('Specification'), q(e.spec || '')].join(','));
    out.push([q('Grain direction'), q(grain)].join(','));
    out.push([q('Source'), q(sourceLine(e))].join(','));
    out.push([q('Disclaimer'), q(DISCLAIMER.join(' '))].join(','));
    return out.join('\n') + '\n';
  }

  function pad(s, n) { while (s.length < n) s += ' '; return s; }

  function text(e, grain) {
    var lines = [nameOf(e), conditionLine(e) + '   grain ' + grain, ''];
    var rows = [], w = 0;
    eachPublished(e, grain, function (p, sub, v) {
      var k = plain(p.label) + (sub ? ' ' + sub : '');
      w = Math.max(w, k.length);
      rows.push([k, v, plain(p.unit), siFor(p, v), plain(p.si ? p.si.unit : p.unit)]);
    });
    rows.forEach(function (r) {
      lines.push(pad(r[0], w) + '  ' + pad(String(r[1]), 9) + ' ' + pad(r[2], 10) +
                 '  ' + pad(String(r[3]), 9) + ' ' + r[4]);
    });
    lines.push('');
    lines.push(sourceLine(e));
    lines.push(DISCLAIMER.join(' '));
    return lines.join('\n');
  }

  /* ── delivery ───────────────────────────────────────────────────────── */

  function download(name, mime, body) {
    var blob = new Blob([body], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function flash(btn, msg) {
    var was = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(function () { btn.textContent = was; btn.disabled = false; }, 1400);
  }

  function copy(btn, body) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = body;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta);
      flash(btn, 'Copied');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(body)
        .then(function () { flash(btn, 'Copied'); })
        .catch(fallback);
    } else {
      fallback();
    }
  }

  /* ── preview ────────────────────────────────────────────────────────── */

  var FORMATS = {
    sw: {
      title: 'SolidWorks material library',
      ext: '.sldmat', mime: 'application/xml', build: sldmat,
      how: 'Save it into a folder registered under <em>Tools &rsaquo; Options ' +
           '&rsaquo; File Locations &rsaquo; Material Databases</em>; the material ' +
           'then appears under Custom Materials.'
    },
    ansys: {
      title: 'ANSYS Mechanical APDL',
      ext: '.inp', mime: 'text/plain', build: apdl,
      how: 'Paste the contents into a <em>Commands (APDL)</em> object in Workbench ' +
           'Mechanical, or <em>/INPUT</em> the file in Mechanical APDL. Engineering ' +
           'Data&rsquo;s own XML schema changes between releases, so the APDL route ' +
           'is the one that keeps working.'
    }
  };

  function fmtSI(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(4);
    return String(+v.toPrecision(5));
  }

  function tierBadge(tier) {
    if (tier === HANDBOOK) return '<span class="xp-b xp-b-ok">handbook</span>';
    if (tier === DERIVED)  return '<span class="xp-b xp-b-derived">derived</span>';
    return '<span class="xp-b xp-b-typical">family typical</span>';
  }

  function openPreview(kind) {
    var e = SA().selected();
    if (!e) return;
    var fmt = FORMATS[kind];
    var grain = SA().grain();

    $('xp-title').textContent = fmt.title;
    $('xp-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    $('xp-go').disabled = true;

    // The thermal figures are fetched per alloy; hold the preview until they
    // land, so the table never shows a family typical that the alloy's own
    // figure would have replaced a moment later.
    var done = function () { renderPreview(e, grain, fmt); };
    if (PHYS[e.alloy] || !window.StressFigures) { done(); return; }
    $('xp-body').innerHTML = '<p class="sa-empty">Reading this alloy&rsquo;s ' +
                             'physical-property figures&hellip;</p>';
    StressFigures.physicalFor(e.alloy, e.temper)
      .then(function (p) { PHYS[e.alloy] = p || {}; done(); })
      .catch(function () { PHYS[e.alloy] = {}; done(); });
  }

  function warnBlock(title, inner, legal) {
    return '<div class="xp-warn' + (legal ? ' xp-warn-legal' : '') + '">' +
             '<div class="xp-warn-h">' + title + '</div>' + inner + '</div>';
  }

  function listOf(rows) {
    return rows.map(function (r) {
      return '<strong>' + esc(r.id) + '</strong> (' + esc(r.label) + ') &mdash; ' +
             esc(r.note);
    }).join('<br>');
  }

  function renderPreview(e, grain, fmt) {
    var rows = card(e, grain);
    var derived = rows.filter(function (r) { return r.tier === DERIVED; });
    var typical = rows.filter(function (r) { return r.tier === TYPICAL; });

    var body = rows.map(function (r) {
      return '<tr>' +
        '<td class="xp-id">' + esc(r.id) + '</td>' +
        '<td>' + esc(r.label) + '</td>' +
        '<td class="xp-num">' + fmtSI(r.value) + '</td>' +
        '<td class="xp-unit">' + esc(r.unit) + '</td>' +
        '<td>' + tierBadge(r.tier) +
          (r.note ? '<div class="xp-note">' + esc(r.note) + '</div>' : '') +
        '</td></tr>';
    }).join('');

    var warns = warnBlock(
      'These are design allowables, not typical properties',
      '<p>Every strength here is a MIL-HDBK-5 <strong>' + esc(e.basis || 'S') +
      '-basis statistical minimum</strong> &mdash; the value a specified fraction ' +
      'of the material is guaranteed to exceed. They are not mean or typical ' +
      'values. An analysis run on them is a minimum-property analysis and will ' +
      'not match a test article.</p>');

    if (derived.length) {
      warns += warnBlock('Derived &mdash; not published for this material',
        '<p>' + listOf(derived) + '</p>' +
        '<p>The relation is exact for an isotropic material, but this handbook ' +
        'table does not print the value. Check it before relying on it.</p>');
    }

    if (typical.length) {
      warns += warnBlock('Generic family values &mdash; NOT this alloy',
        '<p>' + listOf(typical) + '</p>' +
        '<p>MIL-HDBK-5 publishes no usable physical-property figure for this ' +
        'alloy, so a representative value for its family is substituted. ' +
        'Thermal conductivity varies by more than a factor of two within the ' +
        'aluminium alloys alone. <strong>Replace these with real data before ' +
        'any thermal analysis.</strong></p>');
    }

    warns += warnBlock('No warranty and no liability',
      '<p>KasperCalc provides this file <strong>&ldquo;as is&rdquo;</strong>, with ' +
      'no warranty of any kind, express or implied, and <strong>accepts no ' +
      'liability whatsoever</strong> for any use made of it or for any loss or ' +
      'damage arising from it. The data is a transcription and has not been ' +
      'independently verified. <strong>You are responsible for checking every ' +
      'number against the source documents</strong> before it informs any design, ' +
      'analysis or manufacturing decision.</p>', true);

    $('xp-body').innerHTML =
      '<div class="xp-head">' +
        '<div class="xp-mat">' + esc(nameOf(e)) + '</div>' +
        '<div class="xp-sub">' + esc(conditionLine(e)) + ' &middot; grain ' +
          esc(grain) + '</div>' +
        '<div class="xp-sub">' + esc(sourceLine(e)) + '</div>' +
      '</div>' +
      warns +
      '<table class="xp-table"><thead><tr><th>Field</th><th>Property</th>' +
        '<th class="xp-num">Value</th><th>Unit</th><th>Source</th></tr></thead>' +
        '<tbody>' + body + '</tbody></table>' +
      '<p class="xp-how">' + fmt.how + '</p>';

    pending = {
      name: fileBase(e, grain) + fmt.ext,
      mime: fmt.mime,
      body: fmt.build(e, grain)
    };
    $('xp-go').disabled = false;
    $('xp-go').textContent = 'I understand — download ' + fmt.ext;
  }

  function closePreview() {
    $('xp-overlay').classList.remove('active');
    document.body.style.overflow = '';
    pending = null;
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function act(kind, btn) {
    var e = SA().selected();
    if (!e) return;
    var grain = SA().grain();
    if (kind === 'copy') return copy(btn, text(e, grain));
    if (kind === 'csv') {
      return download(fileBase(e, grain) + '.csv', 'text/csv', csv(e, grain));
    }
    openPreview(kind);
  }

  function sync() {
    var bar = $('sa-export');
    if (bar) bar.hidden = !SA().selected();
  }

  function init() {
    var bar = $('sa-export');
    if (!bar || !window.StressAllowables) return;

    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-export]');
      if (b) act(b.getAttribute('data-export'), b);
    });

    var ov = $('xp-overlay');
    if (ov) {
      ov.addEventListener('click', function (ev) {
        if (ev.target === ov) closePreview();
      });
      $('xp-close').addEventListener('click', closePreview);
      $('xp-cancel').addEventListener('click', closePreview);
      $('xp-go').addEventListener('click', function () {
        if (!pending) return;
        download(pending.name, pending.mime, pending.body);
        closePreview();
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && ov.classList.contains('active')) closePreview();
      });
    }

    document.addEventListener('sa:change', sync);
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
