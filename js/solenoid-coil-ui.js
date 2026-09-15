/**
 * solenoid-coil-ui.js — inputs, tiles, schematic and curve for SolenoidCoil.html.
 *
 * Kept apart from solenoid-coil.js so the physics can be read, tested and
 * corrected without wading through DOM code.
 */
'use strict';

(function () {
  var S = window.SolenoidCoil;
  var MM = 0.001, IN = 0.0254;

  // The front end is US customary by default; the engine is SI throughout and
  // conversion happens only at the form boundary and in the formatters.
  var units = 'in';                       // 'in' | 'mm'

  /* Two builds of the same magnet.
   *
   *   armature  a fixed core with a separate plate pulled onto its face —
   *             holding magnets, door releases, clutch plates, lifting magnets.
   *
   *   plunger   the core itself slides in the bore and is pulled onto a fixed
   *             stop — valve and latch actuators, contactors, most things sold
   *             as "a solenoid".
   *
   * Magnetically they are the same problem: flux crosses a working gap and the
   * Maxwell stress across it does the pulling. What differs is which part moves,
   * where the reaction goes, and that a plunger's pole area is set by the bore
   * it slides in rather than being free to choose.
   */
  var mode = 'armature';                  // 'armature' | 'plunger'
  var chart = null;

  function $(id) { return document.getElementById(id); }
  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : 0; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── unit helpers ───────────────────────────────────────────────────── */

  function lenIn() { return units === 'mm' ? MM : IN; }        // input -> metres
  function lenLabel() { return units === 'mm' ? 'mm' : 'in'; }

  function fmtLen(m) {
    return units === 'mm' ? (m / MM).toFixed(2) + ' mm'
                          : (m / IN).toFixed(3) + ' in';
  }
  function fmtForce(n) {
    return units === 'mm' ? n.toFixed(1) + ' N' : (n * 0.224809).toFixed(1) + ' lbf';
  }
  function fmtPress(pa) {
    return units === 'mm' ? (pa / 1000).toFixed(0) + ' kPa'
                          : (pa / 6894.757).toFixed(0) + ' psi';
  }
  function sig(v, n) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    var a = Math.abs(v);
    var d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return v.toFixed(n === undefined ? d : n);
  }

  /* ── build the wire dropdown ────────────────────────────────────────── */

  function fillSelects() {
    $('awg').innerHTML = S.WIRE.map(function (w) {
      return '<option value="' + w.awg + '"' + (w.awg === 30 ? ' selected' : '') +
             '>' + w.awg + ' AWG — ' + (w.d * 1000).toFixed(3) + ' mm bare, ' +
             (w.ohmPerM * 1000).toFixed(1) + ' mΩ/m</option>';
    }).join('');

    $('core').innerHTML = S.CORES.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === 'm19' ? ' selected' : '') +
             '>' + esc(c.name) + '</option>';
    }).join('');

    $('drive').innerHTML = S.DRIVES.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === 'ac120' ? ' selected' : '') +
             '>' + esc(d.name) + '</option>';
    }).join('');

    $('insul').innerHTML = S.INSULATION.map(function (i) {
      return '<option value="' + i.id + '"' + (i.id === 'F' ? ' selected' : '') +
             '>' + esc(i.name) + '</option>';
    }).join('');
  }

  /* ── read the form ──────────────────────────────────────────────────── */

  function readInputs() {
    var k = lenIn();
    var bore = num('bore') * k;
    var build = num('build') * k;
    var poleMode = $('poleMode').value;
    var poleArea = poleMode === 'core'
      ? Math.PI * bore * bore / 4
      : num('poleArea') * k * k;

    return {
      boreDia: bore,
      coilLen: num('coilLen') * k,
      build: build,
      gap: num('gap') * k,
      poleArea: poleArea,
      awg: parseInt($('awg').value, 10),
      fill: num('fill') / 100,
      coreId: $('core').value,
      driveId: $('drive').value,
      dcVolts: num('dcVolts'),
      ballast: num('ballast'),
      ambient: num('ambient'),
      insulationId: $('insul').value,
      returnPath: $('returnPath').value,
      hConv: num('hConv'),
      customF: num('customF'),
      gapCount: parseInt($('gapCount').value, 10)
    };
  }

  /* Fill factor here is the fraction of the winding window filled by
   * insulated-wire cells, not by bare copper. The two differ by a lot and the
   * gap widens as the wire gets finer, because the film is a bigger share of a
   * small wire: a 44 AWG cell is only 43% copper against 64% for 18 AWG. So the
   * achievable fill is roughly gauge-independent, but what it buys you is not. */
  var FILL_BANDS = [
    [0.90, 'orthocyclic / perfect layer wind — production tooling'],
    [0.80, 'careful layer wind with interleaving'],
    [0.68, 'good random wind'],
    [0.55, 'loose random wind, or fine wire that will not lie flat'],
    [0.00, 'below anything you would achieve on purpose']
  ];

  /* The popover is rebuilt on every recalc rather than written once, because
   * half of what it says depends on the gauge currently selected. */
  /* Popovers are rebuilt on every recalc because half of what they say depends
   * on the current selection. */
  function fillHint() {
    var w = S.wireFor(parseInt($('awg').value, 10));
    var f = num('fill') / 100;
    var cuPerCell = (Math.PI * w.d * w.d / 4) / (w.dIns * w.dIns);

    var band = FILL_BANDS[FILL_BANDS.length - 1][1];
    for (var i = 0; i < FILL_BANDS.length; i++) {
      if (f >= FILL_BANDS[i][0]) { band = FILL_BANDS[i][1]; break; }
    }

    var wire = $('wireHint');
    if (wire) {
      wire.innerHTML = w.awg + ' AWG: ' + (w.d * 1000).toFixed(3) +
        ' mm bare, ' + (w.dIns * 1000).toFixed(3) + ' mm over the film, ' +
        (w.ohmPerM * 1000).toFixed(1) + ' mΩ/m.';
    }

    setPop('fillInfo',
      '<div class="lug-pop-t">Fill factor</div>' +
      'The share of the winding window taken up by <strong>insulated</strong> ' +
      'wire, not by bare copper.' +
      '<div class="lug-pop-n">' +
        '<strong>90%</strong> orthocyclic, production tooling<br>' +
        '<strong>80%</strong> careful layer wind with interleaving<br>' +
        '<strong>68%</strong> good random wind<br>' +
        '<strong>55%</strong> loose, or fine wire that will not lie flat' +
      '</div>' +
      '<div class="lug-pop-n">At ' + Math.round(f * 100) + '% this is a ' +
        esc(band) + '.</div>' +
      '<div class="lug-pop-n">The film is ' +
        Math.round((1 - cuPerCell) * 100) + '% of each ' + w.awg +
        ' AWG cell, so ' + Math.round(f * 100) + '% fill is only <strong>' +
        Math.round(f * cuPerCell * 100) + '% copper</strong> by area. ' +
        'Finer wire loses more: 18 AWG cells are 64% copper, 44 AWG only ' +
        '43%. So the fill you can reach barely moves with gauge, but what ' +
        'it buys you does.</div>');

    var h = num('hConv');
    var hBand = h >= 50 ? 'forced air or liquid'
              : h >= 25 ? 'strong airflow, or potted into a large casting'
              : h >= 15 ? 'bolted to metal that can sink the heat'
              : h >= 8  ? 'a bare coil in still air'
              : 'less than still air will actually give you';
    setPop('hInfo',
      '<div class="lug-pop-t">Convection coefficient h</div>' +
      'How fast the outside of the coil sheds heat, in watts per square metre ' +
      'per kelvin of rise. It is the whole cooling model on this page.' +
      '<div class="lug-pop-n">' +
        '<strong>8–12</strong> bare coil, still air<br>' +
        '<strong>15–25</strong> bolted to metal that conducts heat away<br>' +
        '<strong>50+</strong> forced air<br>' +
        '<strong>100+</strong> potted and liquid cooled' +
      '</div>' +
      '<div class="lug-pop-n">At ' + h + ' you are describing ' + hBand + '.</div>' +
      '<div class="lug-pop-n">This is the least certain number here and it ' +
        'scales the temperature rise <strong>directly</strong>. Halve it ' +
        'and the rise doubles. Conduction out through the leads and the mount is ' +
        'not modelled separately, so anything bolted to a heatsink belongs at ' +
        'the top of the range.</div>');

    setPop('gapCountInfo',
      '<div class="lug-pop-t">Working gaps</div>' +
      'How many air gaps the flux crosses on its way round the circuit. It is ' +
      'not a detail, because it changes the force by a factor of two.' +
      '<div class="lug-pop-n"><strong>One</strong>, a plunger pulled onto ' +
      'a stop. Flux leaves the plunger face, crosses once, and returns through ' +
      'the shell with no second gap in the way.</div>' +
      '<div class="lug-pop-n"><strong>Two</strong>, a flat armature on a ' +
      'pot or horseshoe magnet. Flux leaves at one pole and comes back at the ' +
      'other, so it crosses twice.</div>' +
      '<div class="lug-pop-n">Two gaps double the reluctance, so B halves. ' +
      'Force per face goes as B squared, so a quarter, but there are ' +
      'two faces, so the total lands at <strong>half</strong> the single-gap ' +
      'figure at the same ampere-turns, gap and pole area.</div>');

    var th = $('thermHint');
    if (th) {
      th.innerHTML = 'Insulation classes are hotspot totals including ambient, ' +
        'not a permitted rise.';
    }
  }

  function setPop(iconId, html) {
    var icon = $(iconId);
    if (!icon) return;
    var pop = icon.querySelector('.lug-pop');
    if (!pop) {
      icon.insertAdjacentHTML('beforeend', '<span class="lug-pop"></span>');
      pop = icon.querySelector('.lug-pop');
    }
    pop.innerHTML = html;
  }

  /* Hover opens a popover; click, Enter and focus still do too, so touch and
     keyboard lose nothing. The close is delayed because the popover sits a few
     pixels clear of its icon: without that grace period the pointer crossing
     the gap would shut the very thing being reached for. */
  var popTimer = null;

  function closeAllPops() {
    document.querySelectorAll('.lug-pop.open').forEach(function (p) {
      p.classList.remove('open');
    });
  }

  function closePopSoon() {
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(closeAllPops, 220);
  }

  function openPop(icon) {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    var pop = icon.querySelector('.lug-pop');
    if (!pop || pop.classList.contains('open')) return;
    closeAllPops();
    placeTip(icon);
  }

  /* Let the pointer travel into the popover and stay there, so its text can be
     read at length and selected. */
  function keepOpenWhileInside(pop) {
    if (pop._kept) return;
    pop._kept = true;
    pop.addEventListener('mouseenter', function () {
      if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    });
    pop.addEventListener('mouseleave', closePopSoon);
  }

  /* A fixed popover does not travel with the page, so it would otherwise hang
     in mid-air once the page scrolled out from under its icon. Capture phase,
     so scrolling an inner panel counts as well as the window. */
  function wireDismissOnMove() {
    if (wireDismissOnMove._done) return;
    wireDismissOnMove._done = true;
    window.addEventListener('scroll', closeAllPops, true);
    window.addEventListener('resize', closeAllPops);
    document.addEventListener('click', closeAllPops);
  }

  function wireOnePopover(icon) {
    if (!icon || icon._wired) return;
    icon._wired = true;
    function toggle(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var pop = icon.querySelector('.lug-pop');
      if (!pop) return;
      var wasOpen = pop.classList.contains('open');
      closeAllPops();
      if (!wasOpen) placeTip(icon);
    }
    icon.addEventListener('click', toggle);
    icon.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(ev); }
      if (ev.key === 'Escape') closeAllPops();
    });
    icon.addEventListener('mouseenter', function () { openPop(icon); });
    icon.addEventListener('mouseleave', closePopSoon);
    icon.addEventListener('focus', function () { openPop(icon); });
    icon.addEventListener('blur', closePopSoon);
  }

  var MODE_TEXT = {
    armature: {
      note: 'A fixed core with a separate plate pulled onto its pole face. ' +
            'The plate moves, the core is held. Holding magnets, releases and ' +
            'lifting magnets work this way.',
      bore: 'Bore / core dia',
      gap: 'Working gap',
      group: 'Core &amp; working gap',
      coreMat: 'Core material',
      poleSame: 'Same as core'
    },
    plunger: {
      note: 'The core itself slides in the bore and is pulled onto a fixed ' +
            'stop. The plunger moves and the stop takes the reaction. Valve ' +
            'actuators, latches and contactors work this way. The gap below is ' +
            'the stroke still to be closed. Force at the start of the ' +
            'stroke is what has to beat the load.',
      bore: 'Plunger diameter',
      gap: 'Gap to the stop',
      group: 'Plunger, stop &amp; stroke',
      coreMat: 'Plunger &amp; stop material',
      poleSame: 'Same as plunger'
    }
  };

  function applyMode() {
    var t = MODE_TEXT[mode];
    $('modeNote').innerHTML = t.note;
    $('boreLabel').innerHTML = t.bore + ' <span class="lug-unit u-len">' +
      lenLabel() + '</span>';
    $('gapLabel').innerHTML = t.gap + ' <span class="lug-unit u-len">' +
      lenLabel() + '</span>';
    $('coreGroupH').innerHTML = t.group;
    $('coreMatLabel').innerHTML = t.coreMat;
    $('poleModeCore').textContent = t.poleSame;

    Array.prototype.forEach.call($('modeSeg').querySelectorAll('button'),
      function (b) {
        var on = b.getAttribute('data-m') === mode;
        b.classList.toggle('sq-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

    // A plunger runs inside a steel shell almost by definition; that is what
    // gives it a return path and what makes it worth building.
    if (mode === 'plunger') {
      $('returnPath').value = 'yoke';
      $('gapCount').value = '1';
    } else {
      $('gapCount').value = '2';
    }
  }

  /** Only show the supply fields the chosen drive actually uses. */
  function syncDriveFields() {
    var d = S.driveFor($('drive').value);
    $('dcVoltsField').style.display = d.custom ? '' : 'none';
    $('customFField').style.display = d.custom === 'ac' ? '' : 'none';
    $('dcVoltsLabel').innerHTML = d.custom === 'ac'
      ? 'Supply, V RMS' : 'Supply, V DC';
  }

  /* ── tiles ──────────────────────────────────────────────────────────── */

  function tile(label, value, cls, pill, subs) {
    return '<div class="lug-tile">' +
      '<div class="lug-tile-head">' +
        '<span class="lug-tile-label">' + label + '</span>' +
        (pill ? '<span class="lug-pill ' + pill[1] + '">' + pill[0] + '</span>' : '') +
      '</div>' +
      '<div class="lug-ms ' + (cls || '') + '">' + value + '</div>' +
      (subs && subs.length
        ? '<div class="lug-sub">' + subs.map(function (s) {
            return '<div>' + s[0] + ' <span class="v">' + s[1] + '</span></div>';
          }).join('') + '</div>'
        : '') +
      '</div>';
  }

  function render(r, inp) {
    var t = [];

    /* drive */
    var driveSubs = [
      ['Supply', sig(r.supplyV, 0) + ' V ' + r.driveLabel],
      ['Resistance, hot', sig(r.rHot) + ' Ω at ' +
        (r.noSteadyState ? '—' : Math.round(r.steadyTemp) + ' °C')]
    ];
    if (r.isAC) {
      driveSubs.push(['Reactance Xₗ', sig(r.xl, 0) + ' Ω at ' + r.freq + ' Hz']);
      driveSubs.push(['Impedance |Z|', sig(r.z, 0) + ' Ω, PF ' + r.powerFactor.toFixed(2)]);
      driveSubs.push(['Apparent', sig(r.apparentVA, 1) + ' VA']);
    }
    t.push(tile('Current drawn', sig(r.current, 2) + ' A', '', null, driveSubs));

    /* power */
    var pSubs = [
      ['Coil dissipation', sig(r.powerCoil, 1) + ' W'],
      ['Current density', sig(r.currentDensity / 1e6, 1) + ' A/mm²']
    ];
    if (r.powerBallast > 0) {
      pSubs.push(['Ballast resistor', sig(r.powerBallast, 1) + ' W']);
    }
    t.push(tile('Power', sig(r.powerCoil + r.powerBallast, 1) + ' W', '', null, pSubs));

    /* force */
    var fPill = r.saturated ? ['SATURATED', 'marginal'] : null;
    t.push(tile('Pull force at ' + fmtLen(inp.gap) + ' gap' +
      (r.gapCount === 2 ? ', 2 faces' : ''),
      fmtForce(r.force), r.force > 0 ? '' : 'fail', fPill, [
        ['Gap flux density', sig(r.bGap, 3) + ' T'],
        ['Pressure on each face', fmtPress(r.pressure)],
        ['Working gaps', r.gapCount === 2
          ? '2 — flux crosses out and back' : '1 — plunger onto a stop'],
        ['Ceiling at saturation', r.forceCeiling !== null
          ? fmtForce(r.forceCeiling) + ' (' + fmtPress(r.pressureCeiling) + ')'
          : 'no core — no ceiling'],
        ['Reaction on the core', fmtForce(r.force) + ' the other way']
      ]));

    /* magnetic drive */
    t.push(tile('Magnetic drive', sig(r.ampereTurns, 0) + ' At', '', null, [
      ['Turns × current', r.turns + ' × ' + sig(r.current, 2) + ' A'],
      ['Field H', sig(r.H, 0) + ' A/m'],
      ['Effective µ', sig(r.muEff, 0) + ' of ' + r.core.mur + ' material'],
      ['Core slenderness', sig(r.coreSlenderness, 1) + ' L/D']
    ]));

    /* winding */
    t.push(tile('Winding', r.turns + ' turns', '', null, [
      ['Wire', r.wire.awg + ' AWG, ' + sig(r.wireLength, 1) + ' m'],
      ['Copper mass', sig(r.copperMass * 1000, 0) + ' g'],
      ['Resistance at 20 °C', sig(r.rCold) + ' Ω'],
      ['Inductance', sig(r.inductance * 1000, 2) + ' mH'],
      ['Outside diameter', fmtLen(r.outerDia)]
    ]));

    /* thermal */
    var thermCls, thermPill, headline;
    if (r.noSteadyState) {
      thermCls = 'fail'; thermPill = ['RUNS AWAY', 'fail'];
      headline = S.fmtTime(r.timeToLimit);
    } else if (!r.thermalOK) {
      thermCls = 'marginal'; thermPill = ['INTERMITTENT', 'marginal'];
      headline = S.fmtTime(r.timeToLimit);
    } else {
      thermCls = 'ok'; thermPill = ['CONTINUOUS', 'ok'];
      headline = Math.round(r.steadyTemp) + ' °C';
    }
    t.push(tile('Thermal', headline, thermCls, thermPill, [
      [r.noSteadyState ? 'Equilibrium' : 'Settles at',
        r.noSteadyState ? 'none — runs away' : Math.round(r.steadyTemp) + ' °C'],
      ['Insulation limit', r.insulation.name],
      ['Burst from cold', S.fmtTime(r.timeToLimit)],
      ['Sustainable duty', Math.round(r.dutyCycle * 100) + '%'],
      ['Cooling surface', sig(r.surfaceArea * 1e4, 0) + ' cm²']
    ]));

    $('tileGrid').innerHTML = t.join('');

    /* warnings */
    $('warnBox').innerHTML = r.warnings.length
      ? r.warnings.map(function (w) {
          return '<div class="sc-warn">' + esc(w) + '</div>';
        }).join('')
      : '';

    steps(r, inp);
    magnetPanel(r, inp);
    schematic(r, inp);
    curve(r, inp);
  }

  /* ── worked steps ───────────────────────────────────────────────────── */

  function steps(r, inp) {
    var L = [];
    function grp(s) { L.push('<div class="grp">' + s + '</div>'); }
    function row(s) { L.push('<div>' + s + '</div>'); }
    function v(x) { return '<span class="val">' + x + '</span>'; }

    grp('Winding');
    row('Window area = length × build = ' + fmtLen(inp.coilLen) + ' × ' +
        fmtLen(inp.build) + ' = ' + v(sig(r.windowArea * 1e6, 1) + ' mm²'));
    row('Wire cell (over film) = ' + sig(r.wire.dIns * 1000, 3) + ' mm square → ' +
        v(sig(r.wire.dIns * r.wire.dIns * 1e6, 4) + ' mm²'));
    row('Turns = fill × window / cell = ' + (inp.fill * 100).toFixed(0) + '% × … = ' +
        v(r.turns));
    row('Mean turn length = π × mean diameter = ' + v(fmtLen(r.mlt)));
    row('Wire length = N × MLT = ' + v(sig(r.wireLength, 1) + ' m'));

    grp('Electrical');
    row('R₂₀ = ρ·l/A = ' + v(sig(r.rCold) + ' Ω') + ', hot ' + v(sig(r.rHot) + ' Ω'));
    row('L (Wheeler multilayer, air) = ' + v(sig(r.lAir * 1000, 2) + ' mH'));
    row('Effective permeability = ' + v(sig(r.muEff, 0)) +
        ', the open-circuit demagnetising factor holding this far below the ' +
        r.core.mur + ' of the material');
    row('L with core = ' + v(sig(r.inductance * 1000, 2) + ' mH'));
    if (r.isAC) {
      row('Xₗ = 2πfL = ' + v(sig(r.xl, 0) + ' Ω') +
          ', |Z| = √(R²+X²) = ' + v(sig(r.z, 0) + ' Ω'));
    }
    row('I = V/' + (r.isAC ? '|Z|' : 'R') + ' = ' + sig(r.supplyV, 0) + '/' +
        sig(r.z, 0) + ' = ' + v(sig(r.current, 3) + ' A'));

    grp('Magnetic circuit');
    row('Ampere-turns = N·I = ' + r.turns + ' × ' + sig(r.current, 3) + ' = ' +
        v(sig(r.ampereTurns, 0) + ' At'));
    row('Gap reluctance = g/(µ₀A) dominates; total ℛ = ' +
        v(sig(r.reluctance / 1e6, 2) + ' ×10⁶ A/Wb'));
    row('Φ = NI/ℛ = ' + v(sig(r.flux * 1e6, 1) + ' µWb') +
        ', B = Φ/A = ' + v(sig(r.bGap, 3) + ' T'));
    if (r.saturated) {
      row('B is clamped at the ' + r.core.bsat + ' T saturation of ' +
          esc(r.core.name) + ' — ' + v('more current cannot raise the force'));
    }

    grp('Force');
    row('Maxwell stress: F = B²A/(2µ₀) = ' + sig(r.bGap, 3) + '²×' +
        sig(inp.poleArea * 1e6, 0) + 'mm²/(2µ₀) = ' + v(fmtForce(r.force)));
    row('Pressure on the pole face = ' + v(fmtPress(r.pressure)) +
        (r.pressureCeiling ? ', ceiling ' + fmtPress(r.pressureCeiling) : ''));

    grp('Thermal');
    row('Dissipation = I²R = ' + v(sig(r.powerCoil, 1) + ' W') +
        ' over ' + sig(r.surfaceArea * 1e4, 0) + ' cm²');
    row('Steady rise = P/(h·A) = ' + v(sig(r.steadyRise, 0) + ' K') +
        ' above ' + inp.ambient + ' °C');
    row('Adiabatic burst = m·c·ΔT/P = ' + sig(r.copperMass * 1000, 0) + ' g × 385 × ' +
        (r.insulation.tmax - inp.ambient) + ' K / ' + sig(r.powerCoil, 1) + ' W = ' +
        v(S.fmtTime(r.timeToLimit)));

    $('calcSteps').innerHTML = L.join('');
  }

  /* ── equivalent magnet ────────────────────────────────────────
   * The trade the whole page is really about: buy the force, or power it.
   */

  /* These magnets run from a shirt-button to a brick, so a fixed number of
     decimals reads either as 0.00 or as noise. Three significant figures, and
     let the unit carry the magnitude. */
  function sigFig(v, n) {
    if (!isFinite(v) || v === 0) return '0';
    var out = v.toPrecision(n || 3);
    if (out.indexOf('e') >= 0) return Number(out).toString();
    // trailing zeros only mean padding after a decimal point; 100 keeps its own
    return out.indexOf('.') >= 0 ? out.replace(/0+$/, '').replace(/\.$/, '')
                                 : out;
  }

  function fmtMass(kg) {
    if (units === 'mm') {
      return kg < 1 ? sigFig(kg * 1000) + ' g' : sigFig(kg) + ' kg';
    }
    return sigFig(kg * 2.20462) + ' lb';
  }

  /* To the cent under $10. These magnets often weigh a few grams, and
     rounding to the dollar there collapses ferrite, N42 and SmCo onto the
     same number when telling them apart is the point of the column. */
  function fmtUSD(d) {
    if (d === null) return '—';
    if (d < 10) return '$' + d.toFixed(2);
    if (d < 100) return '$' + d.toFixed(0);
    if (d < 10000) return '$' + (Math.round(d / 10) * 10).toFixed(0);
    return '$' + (d / 1000).toFixed(1) + 'k';
  }

  function fmtVol(m3) {
    return units === 'mm' ? sigFig(m3 * 1e9) + ' mm³'
                          : sigFig(m3 / 1.6387e-5) + ' in³';
  }

  /* Header tooltips. The tables live in a horizontal scroller, which clips
     absolutely positioned children, so these popovers are fixed and get their
     coordinates when they open. */
  function tip(label, title, body) {
    return esc(label) +
      '<span class="lug-finfo sc-tip" role="button" tabindex="0" ' +
      'aria-label="' + esc(title) + '">i' +
      '<span class="lug-pop sc-tip-pop"><span class="lug-pop-t">' +
      esc(title) + '</span>' + body + '</span></span>';
  }

  function placeTip(icon) {
    var pop = icon.querySelector('.lug-pop');
    if (!pop) return;
    var r = icon.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    pop.classList.add('open');
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2),
                        window.innerWidth - w - 8);
    // flip above when there is no room below
    var top = (r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0)
      ? r.top - 8 - h : r.bottom + 8;
    // Clamp vertically too: a popover taller than BOTH the space above and
    // below (a long tooltip opened mid-viewport on a short window) would
    // otherwise render part of itself past the bottom edge. Unlike a
    // scrolled-past absolutely positioned element, a position:fixed one
    // does not come back into view when the page scrolls, so that part was
    // simply unreachable — this was the actual clipping bug.
    top = Math.min(Math.max(8, top), window.innerHeight - h - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = '';
    keepOpenWhileInside(pop);
  }

  /* The header tips are ordinary popovers; they are re-wired after each
     render because magnetPanel rebuilds its markup. */
  function wireTips() {
    wireDismissOnMove();
    Array.prototype.forEach.call(
      document.querySelectorAll('#magnetBox .sc-tip'), wireOnePopover);
  }

  var TIP = {
    cost:
      'Mass times a finished-part price per kilo: about $60/kg for ferrite, ' +
      '$220\u2013340/kg across the NdFeB grades, $400/kg for Alnico and ' +
      '$900/kg for SmCo.' +
      '<div class="lug-pop-n">This is the material cost of the part, not what ' +
      'you will be invoiced. Expect a floor of a few dollars on any single ' +
      'small magnet whatever it weighs, and a fall of several-fold in ' +
      'quantity. Rank grades with the column rather than budgeting from ' +
      'it.</div>' +
      '<div class="lug-pop-n">Cheap per kilo does not mean cheap here. ' +
      'Ferrite needs so much more thickness for the same force that it can ' +
      'land above the NdFeB it was meant to undercut.</div>',
    ceiling:
      'The most this grade can ever pull across this pole face, reached only ' +
      'in the limit of an infinitely thick magnet where the gap flux equals ' +
      'B\u1d63.' +
      '<div class="lug-pop-n">If the coil asks for more than this figure, no ' +
      'thickness of this grade will do it. Only a larger pole face will, and ' +
      'the row says how much is needed.</div>',
    grade:
      'B\u1d63 is remanence, the flux the magnet holds with no gap in the ' +
      'circuit. \u00b5_rec is recoil permeability, which sets how much ' +
      'thickness it takes to push that flux across a gap.' +
      '<div class="lug-pop-n">Alnico\u2019s \u00b5_rec of about 4 is why it ' +
      'has to be long and thin, and why it gives up so much to a much weaker ' +
      'ferrite once the gap opens.</div>',
    flux:
      'Flux density this magnet drives across the working gap:' +
      '<div class="lug-pop-n" style="font-family:var(--sq-ui)">' +
      'B = B\u1d63 \u00b7 L\u2098 / (L\u2098 + \u00b5_rec \u00b7 G)</div>' +
      '<div class="lug-pop-n">G is the rest of the circuit written as an ' +
      'equivalent length of air. The magnet only approaches B\u1d63 when it ' +
      'is long compared with \u00b5_rec\u00b7G, which is why magnets meant ' +
      'for wide gaps are thick.</div>',
    force:
      'Maxwell stress across the gap, F = B\u00b2A/(2\u00b5\u2080), summed ' +
      'over every working face.' +
      '<div class="lug-pop-n">This is the same formula and the same circuit ' +
      'the coil is solved with, which is what makes the two directly ' +
      'comparable rather than merely similar.</div>',
    ratio:
      'That force against what the coil makes at the same gap. Above 1 the ' +
      'magnet wins on force alone, in the same overall envelope and at no ' +
      'running power.' +
      '<div class="lug-pop-n">Both sides neglect fringing in the same way, so ' +
      'this ratio survives even where the two absolute figures are ' +
      'optimistic.</div>'
  };

  function magnetPanel(r, inp) {
    var host = $('magnetBox');
    if (!host) return;

    var e = S.magnetEquivalent(r, inp);
    var L = [];

    if (!(r.force > 0)) {
      host.innerHTML = '<p class="sc-mag-lead">The coil is making no force, ' +
        'so there is nothing to match. Give it a core, a gap and some current.</p>';
      return;
    }

    /* the lead: what exactly is being matched */
    L.push('<p class="sc-mag-lead">To replace this coil a magnet has to reach the ' +
      'same <strong>' + sig(e.bTarget, 3) + ' T</strong> across the same ' +
      fmtLen(inp.gap) + ' gap on the same ' + sig(e.poleArea * 1e6, 0) +
      ' mm² pole face, which is <strong>' + fmtForce(e.fTarget) +
      '</strong>.</p>');
    L.push('<p class="sc-mag-lead">The two tables come at the trade from ' +
      'opposite ends. The first sizes a magnet to match that force. The ' +
      'second keeps the size and asks what force comes out of it. Both put ' +
      'the magnet in the same steel circuit as the coil.</p>');

    L.push('<div class="sc-mag-cap">1. Same force. How big must the magnet ' +
      'be?</div>');
    L.push('<div class="sc-mag-scroll"><table class="sc-mag-tbl"><thead><tr>' +
      '<th>Grade</th><th>Thickness needed</th><th>Volume</th><th>Mass</th>' +
      '<th>' + tip('Small-qty cost', 'Small-qty cost', TIP.cost) + '</th>' +
      '<th>' + tip('Ceiling on this face', 'Ceiling on this face', TIP.ceiling) +
      '</th></tr></thead><tbody>');

    e.rows.forEach(function (x) {
      var g = x.grade;
      if (!x.reachable) {
        L.push('<tr class="sc-mag-no"><td>' + esc(g.name) + '</td>' +
          '<td colspan="4">Cannot reach ' + sig(e.bTarget, 2) + ' T at any ' +
          'thickness, Bᵣ is only ' + g.br.toFixed(2) + ' T. Needs at least ' +
          sig(x.areaNeeded * 1e6, 0) + ' mm² of pole face instead of ' +
          sig(e.poleArea * 1e6, 0) + ' mm².</td>' +
          '<td>' + fmtForce(x.forceCeiling) + '</td></tr>');
        return;
      }
      var flags = [];
      if (x.aspect !== null && x.aspect > 2) {
        flags.push('<span class="sc-mag-flag">' + x.aspect.toFixed(1) +
          '× longer than wide</span>');
      }
      if (x.tooHotFor) {
        flags.push('<span class="sc-mag-flag sc-mag-hot">coil runs ' +
          Math.round(r.steadyTemp) + ' °C, grade rated ' + g.tmax +
          ' °C</span>');
      }
      L.push('<tr><td>' + esc(g.name) +
        (flags.length ? '<br>' + flags.join(' ') : '') + '</td>' +
        '<td class="sc-mag-key">' + fmtLen(x.thickness) + '</td>' +
        '<td>' + fmtVol(x.volume) + '</td>' +
        '<td>' + fmtMass(x.mass) + '</td>' +
        '<td>' + fmtUSD(x.cost) + '</td>' +
        '<td>' + fmtForce(x.forceCeiling) + '</td></tr>');
    });
    L.push('</tbody></table></div>');

    /* the other half of the question: same overall size, whatever force falls out */
    L.push('<div class="sc-mag-cap">2. Same size. How much force do you ' +
      'get?</div>');
    L.push('<p class="sc-mag-sub">A magnet filling this coil’s whole ' +
      'envelope, ' + fmtLen(e.envDia) + ' across × ' + fmtLen(e.envLen) +
      ' long, working across the same gap.</p>');
    L.push('<div class="sc-mag-scroll"><table class="sc-mag-tbl"><thead><tr>' +
      '<th>' + tip('Grade', 'Magnet grade', TIP.grade) + '</th>' +
      '<th>' + tip('Gap flux', 'Gap flux', TIP.flux) + '</th>' +
      '<th>' + tip('Force', 'Force', TIP.force) + '</th>' +
      '<th>' + tip('Against this coil', 'Against this coil', TIP.ratio) + '</th>' +
      '</tr></thead><tbody>');
    e.rows.forEach(function (x) {
      var ratio = e.fTarget > 0 ? x.envForce / e.fTarget : 0;
      var cls = ratio >= 1 ? 'sc-mag-win' : '';
      L.push('<tr><td>' + esc(x.grade.name) + '</td>' +
        '<td>' + sig(x.envB, 2) + ' T</td>' +
        '<td class="sc-mag-key">' + fmtForce(x.envForce) + '</td>' +
        '<td class="' + cls + '">' + (ratio >= 1 ? '×' + ratio.toFixed(1) +
          ' stronger' : (ratio * 100).toFixed(0) + '% of it') + '</td></tr>');
    });
    L.push('</tbody></table></div>');

    /* the running cost, which is the only thing the magnet never pays */
    var kwhYear = e.coilPower * 8.76;             // W held continuously, kWh/yr
    L.push('<p class="sc-mag-sub">Holding this coil on costs <strong>' +
      sig(e.coilPower, 1) + ' W</strong>. Left energised it draws ' +
      sig(kwhYear, 0) + ' kWh a year, about ' + fmtUSD(kwhYear * 0.15) +
      ' at $0.15/kWh' +
      (r.thermalOK ? '' : ', and it cannot hold on continuously at all, ' +
        'see the thermal warning above') +
      '. A magnet draws nothing, ever. It also cannot be switched off, which ' +
      'is usually the reason the coil exists.</p>');

    /* what the comparison is and is not */
    L.push('<div class="sc-mag-note"><strong>Read the ratio, not the ' +
      'absolute numbers.</strong> Both sides use the same lumped circuit with ' +
      'the same fringing ignored, so the comparison between them holds up even ' +
      'where the individual figures run optimistic' +
      (r.gapRatio > 0.3 ? ', and at this gap they do by a wide margin' : '') +
      '. Three things the table leaves out: the magnet is assumed to sit in a ' +
      'steel pot or yoke like the coil does, and a bare magnet on a plate does ' +
      'far worse because the flux has no easy way home; real magnet circuits ' +
      'leak, so add 20–40% to any thickness you actually order; and prices ' +
      'are the material cost of the part at single-piece rates. A real order '
      + 'carries a floor of a few dollars on any small magnet and falls '
      + 'several-fold in quantity, so read the column as which-is-cheaper '
      + 'rather than as a budget.' +
      (e.gapFloored ? ' The gap was taken as 0.05 mm rather than zero, since ' +
        'surface finish alone leaves about that much.' : '') +
      '</div>');

    host.innerHTML = L.join('');
    wireTips();
  }

  /* ── schematic ──────────────────────────────────────────────────────── */

  /* A longitudinal section through the axis — the cut plane runs down the
   * centreline, so the winding appears as two bands of wire cross-sections, one
   * either side of the core. Current goes into the page above the axis and out
   * below it, which is what makes it read as a coil rather than two bars. */

  function rect(x, y, w, h, cls) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' +
           Math.max(w, 0.5).toFixed(1) + '" height="' + Math.max(h, 0.5).toFixed(1) +
           '" class="' + cls + '"/>';
  }

  function txt(x, y, s, cls, anchor, rot) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + cls +
      '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') +
      (rot ? ' transform="rotate(' + rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '') +
      '>' + s + '</text>';
  }

  /** Dimension line with a tick at each end, after the Lug & Pin convention. */
  function dim(x1, y1, x2, y2, vertical) {
    var dx = vertical ? 5 : 0, dy = vertical ? 0 : 5;
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
             '" class="sc-dim"/>' +
           '<line x1="' + (x1 - dx) + '" y1="' + (y1 - dy) + '" x2="' + (x1 + dx) +
             '" y2="' + (y1 + dy) + '" class="sc-dim"/>' +
           '<line x1="' + (x2 - dx) + '" y1="' + (y2 - dy) + '" x2="' + (x2 + dx) +
             '" y2="' + (y2 + dy) + '" class="sc-dim"/>';
  }

  function ext(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
           '" class="sc-ext"/>';
  }

  function schematic(r, inp) {
    if (mode === 'plunger') return plungerSchematic(r, inp);
    return armatureSchematic(r, inp);
  }

  function plungerSchematic(r, inp) {
    var W = 560, H = 350;
    var LEFT = 112, RIGHT = 96, TOP = 60, BOT = 118;

    // drawn part-way in, with the stroke still to close
    var stopLen = Math.max(inp.coilLen * 0.28, inp.gap * 1.5);
    var plungLen = inp.coilLen * 0.62;
    var totalLen = plungLen + inp.gap + stopLen;
    var shellT = Math.max(inp.build * 0.16, inp.boreDia * 0.10);
    var totalDia = inp.boreDia + 2 * inp.build + 2 * shellT;

    var sc = Math.min((W - LEFT - RIGHT) / Math.max(totalLen, 1e-9),
                      (H - TOP - BOT) / Math.max(totalDia, 1e-9));

    var cx = LEFT, cy = TOP + (H - TOP - BOT) / 2;
    var lp = plungLen * sc, ls = stopLen * sc;
    var bd = inp.build * sc, br = (inp.boreDia / 2) * sc;
    var sh = Math.max(shellT * sc, 3);
    var g = Math.max(inp.gap * sc, 3);
    var lc = lp + g + ls;

    var poleDia = Math.sqrt(4 * inp.poleArea / Math.PI);
    var pr = (poleDia / 2) * sc;
    var outR = br + bd + sh;
    var stopX = cx + lp + g;

    var o = [];

    // shell: the return path wrapped round the assembly
    o.push(rect(cx - sh, cy - outR, lc + 2 * sh, sh, 'sc-core'));
    o.push(rect(cx - sh, cy + outR - sh, lc + 2 * sh, sh, 'sc-core'));
    o.push(rect(cx + lc, cy - outR, sh, 2 * outR, 'sc-core'));
    o.push(rect(cx - sh, cy - outR, sh, 2 * outR, 'sc-core'));

    // winding
    var cols = Math.max(1, Math.min(Math.floor(lc / 15), 14));
    var rows = Math.max(1, Math.min(Math.floor(bd / 15), 3));
    var stepX = lc / cols, stepY = bd / rows;
    var rad = Math.min(Math.min(stepX, stepY) * 0.38, 7);
    o.push(rect(cx, cy - br - bd, lc, bd, 'sc-windbg'));
    o.push(rect(cx, cy + br, lc, bd, 'sc-windbg'));
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var wx = cx + stepX * (i + 0.5);
        var yU = cy - br - bd + stepY * (j + 0.5);
        var yD = cy + br + stepY * (j + 0.5);
        o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yU.toFixed(1) +
               '" r="' + rad.toFixed(1) + '" class="sc-wire"/>');
        o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yD.toFixed(1) +
               '" r="' + rad.toFixed(1) + '" class="sc-wire"/>');
        if (rad > 4) {
          o.push('<line x1="' + (wx - rad * 0.6) + '" y1="' + (yU - rad * 0.6) +
                 '" x2="' + (wx + rad * 0.6) + '" y2="' + (yU + rad * 0.6) +
                 '" class="sc-wsym"/>');
          o.push('<line x1="' + (wx + rad * 0.6) + '" y1="' + (yU - rad * 0.6) +
                 '" x2="' + (wx - rad * 0.6) + '" y2="' + (yU + rad * 0.6) +
                 '" class="sc-wsym"/>');
          o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yD.toFixed(1) +
                 '" r="' + (rad * 0.28).toFixed(1) + '" class="sc-wdot"/>');
        }
      }
    }

    // plunger, stop and the gap between them
    o.push(rect(cx, cy - br, lp, 2 * br, 'sc-plunger'));
    o.push(rect(stopX, cy - br, ls, 2 * br, 'sc-core'));
    o.push(rect(cx + lp - 2, cy - pr, 3, 2 * pr, 'sc-pole'));
    o.push(rect(stopX - 1, cy - pr, 3, 2 * pr, 'sc-pole'));
    o.push(rect(cx + lp, cy - pr, g, 2 * pr, 'sc-gapfill'));

    // flux
    o.push('<path d="M ' + (cx + lp * 0.22) + ' ' + cy + ' L ' + (cx + lp - 5) +
           ' ' + cy + '" class="sc-flux"/>');
    o.push('<polygon points="' + (cx + lp) + ',' + cy + ' ' + (cx + lp - 10) + ',' +
           (cy - 4.5) + ' ' + (cx + lp - 10) + ',' + (cy + 4.5) +
           '" class="sc-fluxf"/>');

    // dimensions
    var dOD = cx - 78, dBore = cx - 40;
    o.push(ext(cx - sh, cy - outR, dOD - 6, cy - outR));
    o.push(ext(cx - sh, cy + outR, dOD - 6, cy + outR));
    o.push(dim(dOD, cy - outR, dOD, cy + outR, true));
    o.push(txt(dOD - 7, cy, 'over shell', 'sc-ts', 'middle', -90));

    o.push(ext(cx, cy - br, dBore - 6, cy - br));
    o.push(ext(cx, cy + br, dBore - 6, cy + br));
    o.push(dim(dBore, cy - br, dBore, cy + br, true));
    o.push(txt(dBore - 7, cy, 'DIA ' + fmtLen(inp.boreDia), 'sc-ts', 'middle', -90));

    var yL = cy + br + bd + 26;
    o.push(ext(cx, cy + outR, cx, yL + 6));
    o.push(ext(cx + lc, cy + outR, cx + lc, yL + 6));
    o.push(dim(cx, yL, cx + lc, yL, false));
    o.push(txt(cx + lc / 2, yL - 6, 'coil ' + fmtLen(inp.coilLen), 'sc-ts', 'middle'));

    var yB = cy - outR - 30;
    o.push(txt(cx + lc / 2, yB - 14, r.turns + ' turns of ' + r.wire.awg + ' AWG',
               'sc-t', 'middle'));
    o.push(txt(cx + lc / 2, yB - 2, 'build ' + fmtLen(inp.build) + ' &#183; ' +
               rows + '&#215;' + cols + ' shown, not to count', 'sc-ts', 'middle'));

    var gx = cx + lp + g / 2;
    o.push('<line x1="' + gx + '" y1="' + (cy + pr) + '" x2="' + (gx + 52) +
           '" y2="' + (cy + outR + 16) + '" class="sc-lead"/>');
    o.push(txt(gx + 55, cy + outR + 19, 'stroke left ' + fmtLen(inp.gap), 'sc-tg'));

    o.push(txt(cx + lp / 2, cy + 4, 'PLUNGER', 'sc-tp', 'middle'));
    o.push(txt(stopX + ls / 2, cy + 4, 'STOP', 'sc-tp', 'middle'));
    o.push(txt(cx + lc / 2, cy - outR - 10, 'steel shell closes the circuit',
               'sc-ts', 'middle'));

    // the plunger is dragged onto the stop; the stop's mounting holds it
    var fy = cy + br + bd + 56;
    o.push('<line x1="' + (cx + lp * 0.3) + '" y1="' + fy + '" x2="' +
           (cx + lp - 9) + '" y2="' + fy + '" class="sc-force"/>');
    o.push('<polygon points="' + (cx + lp) + ',' + fy + ' ' + (cx + lp - 10) + ',' +
           (fy - 5) + ' ' + (cx + lp - 10) + ',' + (fy + 5) + '" class="sc-forcef"/>');
    o.push(txt(cx + lp * 0.3 - 6, fy + 4, 'PULLS IN ' + fmtForce(r.force),
               'sc-tf', 'end'));

    var ry = fy + 22;
    o.push('<line x1="' + (stopX + ls) + '" y1="' + ry + '" x2="' + (stopX + 9) +
           '" y2="' + ry + '" class="sc-react"/>');
    o.push('<polygon points="' + stopX + ',' + ry + ' ' + (stopX + 10) + ',' +
           (ry - 5) + ' ' + (stopX + 10) + ',' + (ry + 5) + '" class="sc-reactf"/>');
    o.push(txt(stopX + ls + 6, ry + 4, 'stop reacts ' + fmtForce(r.force), 'sc-tr'));

    $('schematic').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    $('schematic').innerHTML = o.join('');
  }

  function armatureSchematic(r, inp) {
    var W = 560, H = 350;
    var LEFT = 112, RIGHT = 92, TOP = 56, BOT = 118;

    var armLen = Math.max(inp.coilLen * 0.22, inp.gap * 2);
    var totalLen = inp.coilLen + inp.gap + armLen;
    var totalDia = inp.boreDia + 2 * inp.build;
    var s = Math.min((W - LEFT - RIGHT) / Math.max(totalLen, 1e-9),
                     (H - TOP - BOT) / Math.max(totalDia, 1e-9));

    var cx = LEFT, cy = TOP + (H - TOP - BOT) / 2;
    var lc = inp.coilLen * s, bd = inp.build * s;
    var br = (inp.boreDia / 2) * s;
    var g  = Math.max(inp.gap * s, 3);
    var al = Math.max(armLen * s, 14);

    // Pole face: an equivalent diameter from the area, so a custom pole reads
    // as visibly bigger or smaller than the core instead of silently matching.
    var poleDia = Math.sqrt(4 * inp.poleArea / Math.PI);
    var pr = (poleDia / 2) * s;

    var o = [];
    var coreR = cx + lc;                     // core end face
    var ax = coreR + g;                      // armature face

    /* -- core ------------------------------------------------------- */
    o.push(rect(cx, cy - br, lc, 2 * br, 'sc-core'));

    /* -- winding: two bands of wire cross-sections ------------------- */
    // Few enough circles that each one is big enough to carry its
    // current-direction symbol. Below about 4.5 px radius the cross and the dot
    // stop being legible and the band just reads as texture, which defeats the
    // point of drawing turns at all.
    var cols = Math.max(1, Math.min(Math.floor(lc / 15), 14));
    var rows = Math.max(1, Math.min(Math.floor(bd / 15), 3));
    var stepX = lc / cols, stepY = bd / rows;
    var rad = Math.min(Math.min(stepX, stepY) * 0.38, 7);

    o.push(rect(cx, cy - br - bd, lc, bd, 'sc-windbg'));
    o.push(rect(cx, cy + br, lc, bd, 'sc-windbg'));

    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var wx = cx + stepX * (i + 0.5);
        var yUp = cy - br - bd + stepY * (j + 0.5);
        var yDn = cy + br + stepY * (j + 0.5);
        // above the axis: current into the page
        o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yUp.toFixed(1) +
               '" r="' + rad.toFixed(1) + '" class="sc-wire"/>');
        if (rad > 4) {
          o.push('<line x1="' + (wx - rad * 0.6) + '" y1="' + (yUp - rad * 0.6) +
                 '" x2="' + (wx + rad * 0.6) + '" y2="' + (yUp + rad * 0.6) +
                 '" class="sc-wsym"/>');
          o.push('<line x1="' + (wx + rad * 0.6) + '" y1="' + (yUp - rad * 0.6) +
                 '" x2="' + (wx - rad * 0.6) + '" y2="' + (yUp + rad * 0.6) +
                 '" class="sc-wsym"/>');
        }
        // below: current out of the page
        o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yDn.toFixed(1) +
               '" r="' + rad.toFixed(1) + '" class="sc-wire"/>');
        if (rad > 4) {
          o.push('<circle cx="' + wx.toFixed(1) + '" cy="' + yDn.toFixed(1) +
                 '" r="' + (rad * 0.28).toFixed(1) + '" class="sc-wdot"/>');
        }
      }
    }

    /* -- armature ---------------------------------------------------- */
    var armHalf = Math.max(pr, br) + Math.min(bd, 10);
    o.push(rect(ax, cy - armHalf, al, 2 * armHalf, 'sc-arm'));
    // the part of the face that actually carries flux
    o.push(rect(ax - 1, cy - pr, 3, 2 * pr, 'sc-pole'));
    o.push(rect(coreR - 2, cy - pr, 3, 2 * pr, 'sc-pole'));

    /* -- gap --------------------------------------------------------- */
    o.push(rect(coreR, cy - pr, g, 2 * pr, 'sc-gapfill'));

    /* -- flux --------------------------------------------------------- */
    o.push('<path d="M ' + (cx + lc * 0.14) + ' ' + cy + ' L ' + (coreR - 4) +
           ' ' + cy + '" class="sc-flux"/>');
    o.push('<polygon points="' + (coreR + 1) + ',' + cy + ' ' + (coreR - 9) + ',' +
           (cy - 4.5) + ' ' + (coreR - 9) + ',' + (cy + 4.5) + '" class="sc-fluxf"/>');

    /* -- dimensions ---------------------------------------------------
     * Outside diameter and bore stack to the left; length runs underneath;
     * the gap gets a leader because it is usually too narrow to label inside.
     */
    var dOD = cx - 78, dBore = cx - 40;
    o.push(ext(cx, cy - br - bd, dOD - 6, cy - br - bd));
    o.push(ext(cx, cy + br + bd, dOD - 6, cy + br + bd));
    o.push(dim(dOD, cy - br - bd, dOD, cy + br + bd, true));
    o.push(txt(dOD - 7, cy, 'OD ' + fmtLen(r.outerDia), 'sc-ts', 'middle', -90));

    o.push(ext(cx, cy - br, dBore - 6, cy - br));
    o.push(ext(cx, cy + br, dBore - 6, cy + br));
    o.push(dim(dBore, cy - br, dBore, cy + br, true));
    o.push(txt(dBore - 7, cy, '⌀ ' + fmtLen(inp.boreDia), 'sc-ts', 'middle', -90));

    var yL = cy + br + bd + 26;
    o.push(ext(cx, cy + br + bd, cx, yL + 6));
    o.push(ext(coreR, cy + br + bd, coreR, yL + 6));
    o.push(dim(cx, yL, coreR, yL, false));
    o.push(txt((cx + coreR) / 2, yL - 6, fmtLen(inp.coilLen), 'sc-ts', 'middle'));

    var yB = cy - br - bd - 26;
    o.push(txt(cx + lc / 2, yB - 16, r.turns + ' turns of ' + r.wire.awg + ' AWG',
               'sc-t', 'middle'));
    o.push(txt(cx + lc / 2, yB - 4,
               'build ' + fmtLen(inp.build) + ' · ' + rows + '×' + cols +
               ' shown, not to count', 'sc-ts', 'middle'));

    // gap leader
    var gx = coreR + g / 2;
    o.push('<line x1="' + gx + '" y1="' + (cy + pr) + '" x2="' + (gx + 38) +
           '" y2="' + (cy + pr + 44) + '" class="sc-lead"/>');
    o.push(txt(gx + 41, cy + pr + 47, 'gap ' + fmtLen(inp.gap), 'sc-tg'));

    // pole face
    o.push(ext(ax + al, cy - pr, ax + al + 40, cy - pr));
    o.push(ext(ax + al, cy + pr, ax + al + 40, cy + pr));
    o.push(dim(ax + al + 34, cy - pr, ax + al + 34, cy + pr, true));
    o.push(txt(ax + al + 40, cy - 4, 'pole face', 'sc-ts'));
    o.push(txt(ax + al + 40, cy + 8, sig(inp.poleArea * (units === 'mm' ? 1e6 : 1 / (IN * IN)), 2) +
               (units === 'mm' ? ' mm²' : ' in²'), 'sc-ts'));

    // Force on the armature. An electromagnet can only ever attract a
    // ferromagnetic armature, so the arrow points back toward the pole face —
    // the armature is pulled in and the gap closes. It never pushes.
    var fy = cy + br + bd + 56;
    var fTail = ax + al, fTip = coreR;
    o.push('<line x1="' + fTail + '" y1="' + fy + '" x2="' + (fTip + 9) +
           '" y2="' + fy + '" class="sc-force"/>');
    o.push('<polygon points="' + fTip + ',' + fy + ' ' + (fTip + 10) + ',' +
           (fy - 5) + ' ' + (fTip + 10) + ',' + (fy + 5) + '" class="sc-forcef"/>');
    o.push(txt(fTail + 6, fy + 4,
               'PULLS IN ' + fmtForce(r.force), 'sc-tf'));

    // The equal and opposite half of the pair: the core is dragged toward the
    // armature just as hard, and its mounting has to hold it there.
    var ry = cy - br - bd - 8;
    var rTail = cx + lc * 0.45, rTip = coreR + g;
    o.push('<line x1="' + rTail + '" y1="' + ry + '" x2="' + (rTip - 9) +
           '" y2="' + ry + '" class="sc-react"/>');
    o.push('<polygon points="' + rTip + ',' + ry + ' ' + (rTip - 10) + ',' +
           (ry - 5) + ' ' + (rTip - 10) + ',' + (ry + 5) + '" class="sc-reactf"/>');
    o.push(txt(rTail - 4, ry + 4, 'core reacts ' + fmtForce(r.force),
               'sc-tr', 'end'));

    o.push(txt(ax + al / 2, cy - armHalf - 12, 'armature', 'sc-ts', 'middle'));
    o.push(txt(cx + lc / 2, cy - 8, sig(r.bGap, 2) + ' T in the gap', 'sc-tb', 'middle'));

    $('schematic').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    $('schematic').innerHTML = o.join('');
  }

  /** Drawn cell size for one wire, floored so the section stays legible when
   *  the real turn count is in the thousands. */
  function w_cell(r, s) {
    return Math.max(r.wire.dIns * s, 7);
  }

  /* ── force against gap ──────────────────────────────────────────────── */

  function curve(r, inp) {
    if (!window.Chart || !window.HdbkUtil) return;
    if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }
    if (!r.turns) return;

    var maxGap = Math.max(inp.gap * 3, 5 * MM);
    var pts = [];
    for (var i = 1; i <= 60; i++) {
      var g = maxGap * i / 60;
      pts.push({ x: units === 'mm' ? g / MM : g / IN,
                 y: units === 'mm' ? r.forceAtGap(g) : r.forceAtGap(g) * 0.224809 });
    }
    chart = HdbkUtil.makeMultiLine('gapChart', [
      { label: 'Pull force', data: pts, color: '#3a6270' }
    ], {
      xLabel: 'Working gap (' + lenLabel() + ')',
      yLabel: 'Force (' + (units === 'mm' ? 'N' : 'lbf') + ')',
      yMin: 0
    });
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function recalc() {
    var inp = readInputs();
    fillHint();
    inp.mode = mode;
    if (inp.boreDia <= 0 || inp.coilLen <= 0 || inp.build <= 0) return;
    render(S.compute(inp), inp);
  }

  function setUnits(next) {
    if (next === units) return;
    var k = next === 'mm' ? (1 / MM) * IN : (1 / IN) * MM;   // in->mm or mm->in
    ['bore', 'coilLen', 'build', 'gap', 'poleArea'].forEach(function (id) {
      var el = $(id);
      var v = parseFloat(el.value);
      if (!isFinite(v)) return;
      el.value = (id === 'poleArea' ? v * k * k : v * k).toFixed(id === 'gap' ? 3 : 2);
    });
    units = next;
    Array.prototype.forEach.call($('unitSeg').querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-u') === units;
      b.classList.toggle('sq-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.u-len'), function (e) {
      e.textContent = lenLabel();
    });
    applyMode();
    Array.prototype.forEach.call(document.querySelectorAll('.u-area'), function (e) {
      e.textContent = lenLabel() + '²';
    });
    recalc();
  }

  function init() {
    if (!S || !$('tileGrid')) return;
    fillSelects();

    ['bore', 'coilLen', 'build', 'gap', 'poleArea', 'fill', 'dcVolts',
     'ballast', 'ambient', 'hConv', 'customF'].forEach(function (id) {
      $(id).addEventListener('input', recalc);
    });
    ['awg', 'core', 'drive', 'insul', 'returnPath', 'poleMode',
     'gapCount'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        if (id === 'poleMode') {
          $('poleAreaField').style.display =
            $('poleMode').value === 'core' ? 'none' : '';
        }
        if (id === 'drive') syncDriveFields();
        recalc();
      });
    });
    Array.prototype.forEach.call($('unitSeg').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { setUnits(b.getAttribute('data-u')); });
    });
    Array.prototype.forEach.call($('modeSeg').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        mode = b.getAttribute('data-m');
        applyMode();
        recalc();
      });
    });

    $('poleAreaField').style.display = 'none';
    applyMode();
    syncDriveFields();
    recalc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
