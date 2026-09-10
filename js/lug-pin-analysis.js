/**
 * lug-pin-analysis.js — Bruhn Chapter D1 lug and pin analysis.
 *
 * The lug is checked for bearing-bypass, net-section tension and shear tear-out
 * at the applied load angle; the lowest allowable governs. The pin is checked in
 * shear and in simplified bending, and an optional bushing in bearing.
 *
 * Material properties come from js/lug-materials.js, which reads the same
 * MIL-HDBK-5 dataset as MaterialPropertyLookup.html.
 *
 * See the curve-fit notice on the page: the Kt curves are shape-matched
 * approximations of the Bruhn charts rather than point-for-point digitizations,
 * and the transverse net-section allowable is a flat knockdown of the axial value.
 */
'use strict';

(function () {

  function $(id) { return document.getElementById(id); }

  /* ── Calc engine ──────────────────────────────────────────────────────── */

  function ktAxial(eOverD, DOverT, ductility) {
    var plateaus = { low: 0.95, medium: 1.0, high: 1.05 };
    var plateau = plateaus[ductility] !== undefined ? plateaus[ductility] : 1.0;
    var eR = Math.min(eOverD, 3.0);
    var base = 0.6 + (plateau - 0.6) * (eR - 1.0) / 2.0;
    base = Math.max(0.6, Math.min(plateau, base));
    var dtK = 1.0 - 0.02 * Math.max(0, DOverT - 2.0);
    dtK = Math.max(0.85, dtK);
    return base * dtK;
  }

  function ktTransverse(eOverD, ductility) {
    return 0.65 * ktAxial(eOverD, 2.0, ductility);
  }

  // Dh is the diameter of the hole in the lug. Without a bushing that is the pin
  // diameter; with one the hole is bored out to the bushing OD, so every lug
  // check — bearing area, net section, tear-out and the e/D and D/t ratios that
  // set Kt — works off the larger hole.
  function axialLugAllowable(p, Dh, t, W, e) {
    var eOverD = e / Dh, DOverT = Dh / t;
    var Kt = ktAxial(eOverD, DOverT, p.ductility);
    var Anet = Math.max(W - Dh, 0) * t;
    var Fu = effUlt(p);
    return {
      Dh: Dh, eOverD: eOverD, DOverT: DOverT, Kt: Kt, Fu: Fu,
      Pbb: Kt * Fu * Dh * t,
      Anet: Anet,
      Pnet: Fu * Anet
    };
  }

  function transverseLugAllowable(p, Dh, t, e) {
    var eOverD = e / Dh;
    var Kt = ktTransverse(eOverD, p.ductility);
    return { eOverD: eOverD, Kt: Kt, Pbb: Kt * effUlt(p) * Dh * t };
  }

  // No separate transverse lug width is carried, so the transverse net-section
  // allowable is approximated as a knockdown of the axial one — less material is
  // engaged carrying tension across the lug axis. Placeholder pending real data.
  var NET_TRANSVERSE_FACTOR = 0.85;

  function netSectionAllowable(PnetAxial, thetaDeg) {
    var PnetTrans = PnetAxial * NET_TRANSVERSE_FACTOR;
    return {
      PnetAxial: PnetAxial,
      PnetTrans: PnetTrans,
      Pallow: combinedAllowable(PnetAxial, PnetTrans, thetaDeg)
    };
  }

  // Shear tear-out: the two ligaments of material ahead of the hole shear out to
  // the lug edge. L is the clear distance from hole boundary to edge, measured
  // from the bored hole rather than the pin when a bushing is fitted.
  function tearoutAllowable(p, Dh, t, e) {
    var L = Math.max(e - Dh / 2, 0.001);
    return { L: L, Pallow: 2 * p.Fsu * t * L };
  }

  // Oblique loading. The Air Force method (and Bruhn D1, which reproduces it)
  // uses an exponent of 1.6, not the 2 of a plain ellipse: at 45° with equal
  // axial and transverse allowables an ellipse returns R = 0.707 where the
  // method returns 0.648, so a square-law reads about 9% high.
  var INTERACTION_EXP = 1.6;

  function combinedAllowable(Pax, Ptr, thetaDeg) {
    var th = thetaDeg * Math.PI / 180;
    var n = INTERACTION_EXP;
    // abs() because a fractional exponent of a negative base is NaN
    var d = Math.pow(Math.abs(Math.cos(th)) / Pax, n) +
            Math.pow(Math.abs(Math.sin(th)) / Ptr, n);
    return Math.pow(d, -1 / n);
  }

  // The method caps the effective ultimate at 1.304 x the yield strength, which
  // binds on materials with a high yield-to-ultimate ratio.
  function effUlt(p) {
    return Math.min(p.Ftu, 1.304 * p.Fty);
  }

  function pinShearAllowable(p, D, doubleShear) {
    var A = Math.PI / 4 * D * D;
    var planes = doubleShear ? 2 : 1;
    return { A: A, planes: planes, Pallow: p.Fsu * A * planes };
  }

  function pinBending(P, D, g) {
    var I = Math.PI / 64 * Math.pow(D, 4);
    var c = D / 2;
    var M = P * g / 8.0;
    return { M: M, sigma: M * c / I };
  }

  // The bushing is squeezed between the pin at its bore and the lug at its OD.
  // The bore is the smaller area and therefore the higher stress, so that is the
  // face that governs and D (the pin diameter) is the right diameter here.
  function bushingBearing(p, D, t) {
    return { Fbru: p.Fbru, Pallow: p.Fbru * D * t };
  }

  /* ── Formatting ───────────────────────────────────────────────────────── */

  function msClass(ms) {
    if (ms >= 0.15) return 'ok';
    if (ms >= 0) return 'marginal';
    return 'fail';
  }
  function msLabel(ms) {
    if (ms >= 0.15) return 'PASS';
    if (ms >= 0) return 'MARGINAL';
    return 'FAIL';
  }
  // A margin in the thousands is not information — it means the check is simply
  // not in play (a zero bending arm, say). Say so rather than printing digits.
  // The threshold is high enough that a real, if comfortable, margin such as
  // +14.3 still shows as a number.
  function msText(ms) {
    if (!isFinite(ms) || ms > 99) return 'MS &gt; +99';
    return 'MS = ' + (ms >= 0 ? '+' : '') + ms.toFixed(2);
  }
  function fmt(n, d) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d || 0 });
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Formula popovers ─────────────────────────────────────────────────── */

  var FORMULAS = {
    lugAllow: {
      title: 'Governing lug allowable',
      tex: '\\(P_{allow}(\\theta)=\\min\\big(P_{bb}(\\theta),\\,P_{net}(\\theta),\\,P_{tearout}\\big)\\)',
      note: 'Lowest of bearing-bypass, net-section tension and shear tear-out — each evaluated at the applied load angle where angle-dependence applies.'
    },
    bbNet: {
      title: 'Bearing-bypass, angled',
      tex: '\\(\\left(\\dfrac{\\cos\\theta}{P_{bb,axial}}\\right)^{1.6}+\\left(\\dfrac{\\sin\\theta}{P_{bb,trans}}\\right)^{1.6}=P_{bb}(\\theta)^{-1.6}\\)',
      note: 'Each of the axial and transverse allowables is Kt·Fu·Dh·t, using its own Kt curve. The exponent is 1.6, per the Air Force method — a plain ellipse (exponent 2) reads about 9% high at 45°.'
    },
    netSection: {
      title: 'Net-section tension, angled',
      tex: '\\(P_{net,axial}=F_{tu}(W-D)\\,t\\)',
      note: 'Fu = min(Ftu, 1.304·Fty). Combined across load angle by the same 1.6-exponent interaction. The transverse value is approximated as a knockdown of the axial one — placeholder pending a real transverse-width parameter.'
    },
    tearout: {
      title: 'Shear tear-out',
      tex: '\\(P_{allow}=2\\,F_{su}\\,t\\,L,\\quad L=e-\\tfrac{D}{2}\\)',
      note: 'Two ligaments of material ahead of the hole shear out to the lug edge. L is the clear distance from the hole boundary to the edge.'
    },
    pinShear: {
      title: 'Pin shear',
      tex: '\\(P_{allow}=F_{su}\\cdot A_{pin}\\cdot n_{planes}\\)',
      note: 'n = 1 for single shear, 2 for double shear.'
    },
    pinBend: {
      title: 'Pin bending (simplified)',
      tex: '\\(M \\approx \\dfrac{P\\,g}{8},\\qquad \\sigma=\\dfrac{M\\,c}{I}\\)',
      note: 'First-pass estimate only — the real Bruhn derivation uses the actual bearing-pressure distribution across the clevis gap.'
    },
    bushing: {
      title: 'Bushing bearing',
      tex: '\\(P_{allow}=F_{bru}\\cdot D\\cdot t\\)',
      note: 'Fbru taken at a reference e/D (commonly 1.5) from the material bearing table.'
    },
    kt_curve: {
      title: 'Bearing-bypass factor',
      tex: '\\(P_{allow} = \\min\\big(K_t F_{tu} D t,\\ F_{tu}(W-D)t\\big)\\)',
      note: 'The marker shows the current e/D. In the real Bruhn chart the curve family varies by material ductility group; this page uses a single smooth fit.'
    },
    angle_curve: {
      title: 'Oblique interaction',
      tex: '\\(\\left(\\dfrac{\\cos\\theta}{P_{axial}}\\right)^{1.6}+\\left(\\dfrac{\\sin\\theta}{P_{trans}}\\right)^{1.6}=P(\\theta)^{-1.6}\\)',
      note: 'The Air Force method interaction between the pure axial (0°) and pure transverse (90°) allowables. The 1.6 exponent is the method\'s; a plain ellipse would read about 9% high at 45°.'
    }
  };

  function popHTML(key) {
    var f = FORMULAS[key];
    if (!f) return '';
    return '<div class="lug-pop">' +
           '<div class="lug-pop-t">' + esc(f.title) + '</div>' +
           '<div>' + f.tex + '</div>' +
           '<div class="lug-pop-n">' + esc(f.note) + '</div></div>';
  }

  function wirePopovers(root) {
    root.querySelectorAll('.lug-finfo').forEach(function (icon) {
      if (icon._wired) return;
      icon._wired = true;
      if (!icon.querySelector('.lug-pop')) {
        icon.insertAdjacentHTML('beforeend', popHTML(icon.getAttribute('data-formula')));
      }
      icon.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var pop = icon.querySelector('.lug-pop');
        if (!pop) return;
        var wasOpen = pop.classList.contains('open');
        document.querySelectorAll('.lug-pop.open').forEach(function (p) {
          p.classList.remove('open');
        });
        if (!wasOpen) {
          pop.classList.add('open');
          if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([pop]);
        }
      });
    });
  }

  document.addEventListener('click', function () {
    document.querySelectorAll('.lug-pop.open').forEach(function (p) {
      p.classList.remove('open');
    });
  });

  /* ── Tiles ────────────────────────────────────────────────────────────── */

  function tileHTML(label, formulaKey, ms, subrows) {
    var cls = msClass(ms);
    var rows = subrows.map(function (r) {
      return '<div>' + esc(r[0]) + ' <span class="v">' + esc(r[1]) + '</span></div>';
    }).join('');
    return '<div class="lug-tile">' +
      '<div class="lug-tile-head">' +
        '<div class="lug-tile-label">' + label +
          '<span class="lug-finfo" data-formula="' + esc(formulaKey) + '">&fnof;</span>' +
        '</div>' +
        '<span class="lug-pill ' + cls + '">' + msLabel(ms) + '</span>' +
      '</div>' +
      '<div class="lug-ms ' + cls + '">' + msText(ms) + '</div>' +
      '<div class="lug-sub">' + rows + '</div>' +
    '</div>';
  }

  /* ── Detailed calculation steps ───────────────────────────────────────── */

  function val(s) { return '<span class="val">' + s + '</span>'; }
  function n3(x) { return Number(x).toFixed(3); }

  /** Every check written out with its numbers substituted, so the arithmetic
   *  can be followed or transcribed into a stress note. */
  function renderSteps(r) {
    var s = [];
    var pLug = r.pLug, pPin = r.pPin;

    s.push(['grp', 'Inputs']);
    s.push(['', 'Pin diameter D = ' + val(n3(r.D) + ' in') +
                ' &nbsp; Thickness t = ' + val(n3(r.t) + ' in')]);
    s.push(['', 'Lug width W = ' + val(n3(r.W) + ' in') +
                ' &nbsp; Edge distance e = ' + val(n3(r.e) + ' in')]);
    s.push(['', 'Applied load P = ' + val(fmt(r.P) + ' lb') +
                ' at &theta; = ' + val(r.theta + '&deg;')]);
    s.push(['', 'Lug material ' + esc(pLug.label) + ': F<sub>tu</sub> = ' +
                val(fmt(pLug.Ftu) + ' psi') + ', F<sub>ty</sub> = ' +
                val(fmt(pLug.Fty) + ' psi') + ', F<sub>su</sub> = ' +
                val(fmt(pLug.Fsu) + ' psi') + ', ductility group ' + pLug.ductility]);
    s.push(['', 'Effective ultimate F<sub>u</sub> = min(F<sub>tu</sub>, 1.304 F<sub>ty</sub>) = min(' +
                fmt(pLug.Ftu) + ', ' + fmt(1.304 * pLug.Fty) + ') = ' +
                val(fmt(r.axial.Fu) + ' psi')]);
    s.push(['', 'Pin material ' + esc(pPin.label) + ': F<sub>su</sub> = ' +
                val(fmt(pPin.Fsu) + ' psi')]);
    if (pLug.derated) {
      s.push(['', 'Derated to ' + val(pLug.derated.tempF + ' °F') +
                  (pLug.derated.applied.length ? ' — ' + esc(pLug.derated.applied.join(', ')) : '') +
                  (pLug.derated.missing.length
                    ? '. No curve published for ' + esc(pLug.derated.missing.join(', ')) +
                      ', left at room temperature.' : '')]);
    }

    if (r.hasBushing && !r.bushingBad) {
      s.push(['', 'Bushing fitted: lug hole bored to the bushing OD, ' +
                  'D<sub>h</sub> = ' + val(n3(r.Dh) + ' in') +
                  ' (wall = (' + n3(r.Db) + ' &minus; ' + n3(r.D) + ')/2 = ' +
                  val(n3((r.Db - r.D) / 2) + ' in') + '). Lug checks use ' +
                  'D<sub>h</sub>; pin checks use D.']);
    } else if (r.hasBushing && r.bushingBad) {
      s.push(['', 'Bushing OD is not larger than the pin &mdash; lug checks fall ' +
                  'back to D<sub>h</sub> = D = ' + val(n3(r.Dh) + ' in')]);
    } else {
      s.push(['', 'No bushing: lug hole diameter D<sub>h</sub> = D = ' +
                  val(n3(r.Dh) + ' in')]);
    }

    s.push(['grp', 'Lug — bearing-bypass']);
    s.push(['', 'e / D<sub>h</sub> = ' + n3(r.e) + ' / ' + n3(r.Dh) + ' = ' +
                val(r.axial.eOverD.toFixed(3))]);
    s.push(['', 'D<sub>h</sub> / t = ' + n3(r.Dh) + ' / ' + n3(r.t) + ' = ' +
                val(r.axial.DOverT.toFixed(3))]);
    s.push(['', 'K<sub>t</sub> axial (curve fit, ' + pLug.ductility +
                ' ductility) = ' + val(r.axial.Kt.toFixed(4))]);
    s.push(['', 'K<sub>t</sub> transverse = 0.65 &times; K<sub>t,axial</sub>(e/D, D/t=2) = ' +
                val(r.trans.Kt.toFixed(4))]);
    s.push(['', 'P<sub>bb,axial</sub> = K<sub>t</sub> F<sub>u</sub> D<sub>h</sub> t = ' +
                r.axial.Kt.toFixed(4) + ' &times; ' + fmt(r.axial.Fu) + ' &times; ' +
                n3(r.Dh) + ' &times; ' + n3(r.t) + ' = ' + val(fmt(r.axial.Pbb) + ' lb')]);
    s.push(['', 'P<sub>bb,trans</sub> = ' + val(fmt(r.trans.Pbb) + ' lb')]);
    s.push(['', 'P<sub>bb</sub>(&theta;) from (cos&theta;/P<sub>ax</sub>)<sup>1.6</sup> + ' +
                '(sin&theta;/P<sub>tr</sub>)<sup>1.6</sup> = P<sup>&minus;1.6</sup> &rarr; ' +
                val(fmt(r.PbbTheta) + ' lb')]);

    s.push(['grp', 'Lug — net-section tension']);
    s.push(['', 'A<sub>net</sub> = (W &minus; D<sub>h</sub>) t = (' + n3(r.W) + ' &minus; ' +
                n3(r.Dh) + ') &times; ' + n3(r.t) + ' = ' +
                val(r.axial.Anet.toFixed(4) + ' in&sup2;')]);
    s.push(['', 'P<sub>net,axial</sub> = F<sub>u</sub> A<sub>net</sub> = ' +
                fmt(r.axial.Fu) + ' &times; ' + r.axial.Anet.toFixed(4) + ' = ' +
                val(fmt(r.net.PnetAxial) + ' lb')]);
    s.push(['', 'P<sub>net,trans</sub> &asymp; ' + NET_TRANSVERSE_FACTOR +
                ' &times; P<sub>net,axial</sub> = ' + val(fmt(r.net.PnetTrans) + ' lb') +
                ' (placeholder knockdown)']);
    s.push(['', 'P<sub>net</sub>(&theta;) = ' + val(fmt(r.net.Pallow) + ' lb')]);

    s.push(['grp', 'Lug — shear tear-out']);
    s.push(['', 'L = e &minus; D<sub>h</sub>/2 = ' + n3(r.e) + ' &minus; ' +
                n3(r.Dh / 2) + ' = ' + val(n3(r.tearout.L) + ' in')]);
    s.push(['', 'P<sub>allow</sub> = 2 F<sub>su</sub> t L = 2 &times; ' + fmt(pLug.Fsu) +
                ' &times; ' + n3(r.t) + ' &times; ' + n3(r.tearout.L) + ' = ' +
                val(fmt(r.tearout.Pallow) + ' lb')]);

    s.push(['grp', 'Lug — governing']);
    s.push(['', 'P<sub>allow</sub>(&theta;) = min(' + fmt(r.PbbTheta) + ', ' +
                fmt(r.net.Pallow) + ', ' + fmt(r.tearout.Pallow) + ') = ' +
                val(fmt(r.PallowTheta) + ' lb') + ' &mdash; ' + r.governing.key]);
    s.push(['', 'MS = P<sub>allow</sub>/P &minus; 1 = ' + fmt(r.PallowTheta) + ' / ' +
                fmt(r.P) + ' &minus; 1 = ' +
                val(msText(r.PallowTheta / r.denom - 1).replace('MS = ', ''))]);

    s.push(['grp', 'Pin']);
    s.push(['', 'A<sub>pin</sub> = &pi;D&sup2;/4 = ' + val(r.shear.A.toFixed(4) + ' in&sup2;') +
                ', ' + (r.doubleShear ? 'double' : 'single') + ' shear (n = ' +
                r.shear.planes + ')']);
    s.push(['', 'P<sub>allow</sub> = F<sub>su</sub> A n = ' + fmt(pPin.Fsu) + ' &times; ' +
                r.shear.A.toFixed(4) + ' &times; ' + r.shear.planes + ' = ' +
                val(fmt(r.shear.Pallow) + ' lb') + ', MS = ' +
                val(msText(r.shear.Pallow / r.denom - 1).replace('MS = ', ''))]);
    s.push(['', 'M = P g / 8 = ' + fmt(r.P) + ' &times; ' + n3(r.g) + ' / 8 = ' +
                val(r.bend.M.toFixed(1) + ' in-lb')]);
    s.push(['', '&sigma; = M c / I, I = &pi;D&#8308;/64 = ' +
                (Math.PI / 64 * Math.pow(r.D, 4)).toExponential(3) + ' in&#8308; &rarr; &sigma; = ' +
                val(fmt(r.bend.sigma) + ' psi') + ' vs F<sub>tu</sub> ' +
                fmt(r.pinBendAllow) + ' psi, MS = ' +
                val(msText(r.msBend).replace('MS = ', ''))]);

    if (r.bush) {
      s.push(['grp', 'Bushing']);
      s.push(['', 'Bearing on the bore (pin diameter, the smaller of the two faces)']);
      s.push(['', 'P<sub>allow</sub> = F<sub>bru</sub> D t = ' + fmt(r.bush.Fbru) +
                  ' &times; ' + n3(r.D) + ' &times; ' + n3(r.t) + ' = ' +
                  val(fmt(r.bush.Pallow) + ' lb') + ', MS = ' +
                  val(msText(r.bush.Pallow / r.denom - 1).replace('MS = ', ''))]);
    }

    s.push(['grp', 'Result']);
    s.push(['', 'Lowest margin across all checks: ' + val(esc(r.worst.key)) +
                ' at MS = ' + val(msText(r.worst.ms).replace('MS = ', ''))]);

    $('calcSteps').innerHTML = s.map(function (row) {
      return '<div' + (row[0] ? ' class="' + row[0] + '"' : '') + '>' + row[1] + '</div>';
    }).join('');
  }

  /* ── Schematic ────────────────────────────────────────────────────────── */

  var NS = 'http://www.w3.org/2000/svg';

  // Top of the schematic viewBox, so the load label can tell when it would fall
  // outside the frame. Keep in step with the viewBox on LugPinAnalysis.html.
  var VIEW_TOP = 30;

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /** A dimension line with a tick at each end, drawn along an axis. */
  function dimension(svg, x1, y1, x2, y2, vertical) {
    svg.appendChild(svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, 'class': 'dim-line' }));
    var dx = vertical ? 7 : 0, dy = vertical ? 0 : 8;
    svg.appendChild(svgEl('line', {
      x1: x1 - dx, y1: y1 - dy, x2: x1 + dx, y2: y1 + dy, 'class': 'dim-line'
    }));
    svg.appendChild(svgEl('line', {
      x1: x2 - dx, y1: y2 - dy, x2: x2 + dx, y2: y2 + dy, 'class': 'dim-line'
    }));
  }

  function drawSchematic(D, t, W, e, thetaDeg, Dh) {
    var svg = $('lugSchematic');
    svg.innerHTML = '';

    var scale = 140 / Math.max(W, 1.5);
    var cx = 290, cy = 176;
    var Wpx = W * scale, Dpx = D * scale;
    var Dhpx = (Dh || D) * scale;

    var bodyLeft = cx - Wpx / 2, bodyRight = cx + Wpx / 2;
    var bodyTop = cy - Wpx / 2, bodyBot = cy + Wpx / 2;

    svg.appendChild(svgEl('path', {
      d: 'M ' + bodyLeft + ' ' + bodyTop +
         ' L ' + bodyLeft + ' ' + bodyBot +
         ' L ' + cx + ' ' + bodyBot +
         ' A ' + (Wpx / 2) + ' ' + (Wpx / 2) + ' 0 0 0 ' + cx + ' ' + bodyTop + ' Z',
      'class': 'lug-body'
    }));
    if (Dhpx > Dpx + 0.5) {
      // bushing: the bored hole in the lug, with the pin inside it
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: Dhpx / 2, 'class': 'bushing' }));
    }
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: Dpx / 2, 'class': 'pin' }));

    // Fixed-surface hatching on the flat back of the D: short 45° strokes
    // leaving the face, each one landing on it.
    var HATCH = 11;
    for (var hy = bodyTop; hy <= bodyBot + 0.01; hy += HATCH) {
      svg.appendChild(svgEl('line', {
        x1: bodyLeft, y1: hy,
        x2: bodyLeft - HATCH, y2: hy + HATCH,
        'class': 'fix-hatch'
      }));
    }

    // edge distance e — horizontal, below the lug
    var yDim = bodyBot + 18;
    dimension(svg, bodyLeft, yDim, cx, yDim, false);
    var te = svgEl('text', { x: (bodyLeft + cx) / 2, y: yDim + 22, 'text-anchor': 'middle', 'font-size': '13' });
    te.textContent = 'e = ' + e.toFixed(3) + '"';
    svg.appendChild(te);

    // width W — vertical, outboard of the hatching. W is measured across the
    // load axis, so it belongs on the vertical extent of the lug, not the
    // horizontal one.
    var xDim = bodyLeft - HATCH - 20;
    dimension(svg, xDim, bodyTop, xDim, bodyBot, true);
    var tw = svgEl('text', {
      x: xDim - 9, y: cy, 'text-anchor': 'middle', 'font-size': '13',
      transform: 'rotate(-90 ' + (xDim - 9) + ' ' + cy + ')'
    });
    tw.textContent = 'W = ' + W.toFixed(3) + '"';
    svg.appendChild(tw);

    // pin diameter
    var td = svgEl('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': '12' });
    td.textContent = 'D = ' + D.toFixed(3) + '"';
    svg.appendChild(td);

    // thickness — held below the centreline so the θ = 0 arrow, which runs
    // straight out along it, does not pass through the text
    var tt = svgEl('text', { x: bodyRight + 1, y: cy + 25, 'font-size': '13' });
    tt.textContent = 't = ' + t.toFixed(3) + '"';
    svg.appendChild(tt);

    // ── Load arrow ──────────────────────────────────────────────────────
    // The line of action passes through the pin centre, so the arrow is laid
    // out on a ray from (cx, cy) and swings about that point as θ changes.
    // Screen y grows downward, hence the negated sine.
    var th = thetaDeg * Math.PI / 180;
    var ux = Math.cos(th), uy = -Math.sin(th);
    var px = -uy, py = ux;                        // unit normal to the ray

    var r0 = Wpx / 2 + 14;                        // clear of the lug body
    var r1 = r0 + 54;
    var tailX = cx + r0 * ux, tailY = cy + r0 * uy;
    var tipX = cx + r1 * ux, tipY = cy + r1 * uy;

    // faint line of action back to the centre, so the pivot point reads
    svg.appendChild(svgEl('line', {
      x1: cx, y1: cy, x2: tailX, y2: tailY, 'class': 'load-axis'
    }));

    // The head is built from the ray direction, so it always points along the
    // line rather than staying axis-aligned.
    var HL = 12, HW = 5.5;
    var baseX = tipX - HL * ux, baseY = tipY - HL * uy;
    svg.appendChild(svgEl('line', {
      x1: tailX, y1: tailY, x2: baseX, y2: baseY, 'class': 'load-arrow'
    }));
    svg.appendChild(svgEl('polygon', {
      points: tipX + ',' + tipY + ' ' +
              (baseX + HW * px) + ',' + (baseY + HW * py) + ' ' +
              (baseX - HW * px) + ',' + (baseY - HW * py),
      'class': 'load-arrow'
    }));

    var lx = cx + (r1 + 11) * ux, ly = cy + (r1 + 11) * uy;
    var anchor = ux > 0.25 ? 'start' : (ux < -0.25 ? 'end' : 'middle');
    ly += (Math.abs(ux) < 0.25 ? 0 : 4);

    // Beyond the tip is the natural spot, but as the arrow swings vertical that
    // runs off the top of the frame. Fall back to alongside the tip only when
    // it would, so the common shallow-angle case is untouched.
    if (ly - 11 < VIEW_TOP) {
      lx = tipX + 12 * px;
      ly = tipY + 12 * py + 9;
      anchor = 'start';
    }

    var lp = svgEl('text', {
      x: lx, y: ly, 'text-anchor': anchor,
      'font-size': '13', fill: 'var(--lug-fail)'
    });
    lp.textContent = 'P, θ = ' + thetaDeg + '°';
    svg.appendChild(lp);
  }

  /* ── Charts ───────────────────────────────────────────────────────────── */

  var ktChart = null, angleChart = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function chartOpts(xLabel, yLabel) {
    var grid = 'rgba(0,0,0,0.08)';
    var text = cssVar('--sq-ink-soft') || '#5A6168';
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'linear', title: { display: true, text: xLabel, color: text, font: { size: 12 } },
             grid: { color: grid }, ticks: { color: text, font: { size: 11 } } },
        y: { title: { display: true, text: yLabel, color: text, font: { size: 12 } },
             grid: { color: grid }, ticks: { color: text, font: { size: 11 } } }
      }
    };
  }

  function initCharts() {
    if (typeof Chart === 'undefined') return;
    var line = cssVar('--section-title-color') || '#61828A';
    var mark = cssVar('--lug-fail') || '#a3312a';

    ktChart = new Chart($('ktChart').getContext('2d'), {
      type: 'line',
      data: { datasets: [
        { label: 'Kt(e/D)', data: [], borderColor: line, backgroundColor: 'transparent',
          tension: 0.25, pointRadius: 0, borderWidth: 2 },
        { label: 'current', data: [], borderColor: mark, backgroundColor: mark,
          pointRadius: 5, showLine: false }
      ] },
      options: chartOpts('e / D', 'Kt')
    });

    angleChart = new Chart($('angleChart').getContext('2d'), {
      type: 'line',
      data: { datasets: [
        { label: 'Allowable(θ)', data: [], borderColor: line, backgroundColor: 'transparent',
          tension: 0.2, pointRadius: 0, borderWidth: 2 },
        { label: 'current', data: [], borderColor: mark, backgroundColor: mark,
          pointRadius: 5, showLine: false }
      ] },
      options: chartOpts('load angle (deg)', 'allowable load (lb)')
    });
  }

  /* ── Main compute ─────────────────────────────────────────────────────── */

  function num(id, fallback) {
    var v = parseFloat($(id).value);
    return isFinite(v) ? v : fallback;
  }

  function compute() {
    var D = num('in_D', 0.001) || 0.001;
    var t = num('in_t', 0.001) || 0.001;
    var W = num('in_W', 0.001) || 0.001;
    var e = num('in_e', 0.001) || 0.001;
    var g = num('in_g', 0);
    var P = num('in_P', 0);
    var theta = Math.max(0, Math.min(90, num('in_theta', 0)));

    var pLug = LugMaterials.get('Lug');
    var pPin = LugMaterials.get('Pin');
    var hasBushing = $('in_hasBushing').checked;
    var pBush = hasBushing ? LugMaterials.get('Bushing') : null;
    if (!pLug || !pPin) return;
    var doubleShear = $('toggle_shear').querySelector('.active').getAttribute('data-val') === '2';

    // A bushing bores the lug hole out to the bushing OD, so the lug checks run
    // on Dh while the pin checks stay on D.
    var Db = num('in_Db', 0);
    var warn = $('bushingWarn');
    var bushingBad = hasBushing && !(Db > D);
    if (bushingBad) {
      warn.hidden = false;
      warn.textContent = 'Bushing OD must be larger than the pin diameter (' +
        D.toFixed(3) + ' in). Lug checks are using the pin diameter until it is.';
    } else {
      warn.hidden = true;
      warn.textContent = '';
    }
    var Dh = (hasBushing && !bushingBad) ? Db : D;

    var axial = axialLugAllowable(pLug, Dh, t, W, e);
    var trans = transverseLugAllowable(pLug, Dh, t, e);
    var PbbTheta = combinedAllowable(axial.Pbb, trans.Pbb, theta);
    var net = netSectionAllowable(axial.Pnet, theta);
    var tearout = tearoutAllowable(pLug, Dh, t, e);

    var lugChecks = [
      { key: 'bearing-bypass', Pallow: PbbTheta },
      { key: 'net-section',    Pallow: net.Pallow },
      { key: 'shear tear-out', Pallow: tearout.Pallow }
    ];
    var governing = lugChecks.reduce(function (a, b) { return a.Pallow < b.Pallow ? a : b; });
    var PallowTheta = governing.Pallow;

    var shear = pinShearAllowable(pPin, D, doubleShear);
    var bend = pinBending(P, D, g);
    var pinBendAllow = pPin.Ftu;   // simplified: bending stress vs pin Ftu
    var msBend = pinBendAllow / Math.max(bend.sigma, 1e-9) - 1;
    var bush = pBush ? bushingBearing(pBush, D, t) : null;

    var denom = Math.max(P, 1e-9);
    var tiles = [];

    tiles.push(tileHTML('Lug &mdash; governing allowable', 'lugAllow', PallowTheta / denom - 1, [
      ['governs', governing.key],
      ['P_allow(θ)', fmt(PallowTheta) + ' lb'],
      ['P_applied', fmt(P) + ' lb'],
      ['e/D', axial.eOverD.toFixed(2)],
      ['D/t', axial.DOverT.toFixed(2)]
    ]));

    tiles.push(tileHTML('Bearing-bypass (K<sub>t</sub>)', 'bbNet', PbbTheta / denom - 1, [
      ['Kt (axial)', axial.Kt.toFixed(3)],
      ['Kt (transverse)', trans.Kt.toFixed(3)],
      ['P_bb(θ)', fmt(PbbTheta) + ' lb']
    ]));

    tiles.push(tileHTML('Net-section tension', 'netSection', net.Pallow / denom - 1, [
      ['P_net axial', fmt(net.PnetAxial) + ' lb'],
      ['P_net transverse (approx)', fmt(net.PnetTrans) + ' lb'],
      ['P_net(θ)', fmt(net.Pallow) + ' lb']
    ]));

    tiles.push(tileHTML('Shear tear-out', 'tearout', tearout.Pallow / denom - 1, [
      ['L (e − D/2)', tearout.L.toFixed(3) + ' in'],
      ['P_allow', fmt(tearout.Pallow) + ' lb']
    ]));

    tiles.push(tileHTML('Pin &mdash; shear', 'pinShear', shear.Pallow / denom - 1, [
      ['condition', doubleShear ? 'double shear' : 'single shear'],
      ['A pin', shear.A.toFixed(4) + ' in²'],
      ['P_allow', fmt(shear.Pallow) + ' lb']
    ]));

    tiles.push(tileHTML('Pin &mdash; bending (simplified)', 'pinBend', msBend, [
      ['M', bend.M.toFixed(1) + ' in-lb'],
      ['σ bending', fmt(bend.sigma) + ' psi'],
      ['F_tu (pin)', fmt(pinBendAllow) + ' psi']
    ]));

    if (bush) {
      tiles.push(tileHTML('Bushing &mdash; bearing', 'bushing', bush.Pallow / denom - 1, [
        ['Fbru used', fmt(bush.Fbru) + ' psi'],
        ['bore', D.toFixed(3) + ' in'],
        ['P_allow', fmt(bush.Pallow) + ' lb']
      ]));
    }

    $('tileGrid').innerHTML = tiles.join('');

    // What governs the joint, across every check shown — not just the three lug
    // ones. A bronze bushing is often the weakest element in the assembly.
    var allChecks = [
      { key: 'lug ' + governing.key, ms: PallowTheta / denom - 1 },
      { key: 'pin shear',            ms: shear.Pallow / denom - 1 },
      { key: 'pin bending',          ms: msBend }
    ];
    if (bush) allChecks.push({ key: 'bushing bearing', ms: bush.Pallow / denom - 1 });
    var worst = allChecks.reduce(function (a, b) { return a.ms < b.ms ? a : b; });
    $('lug_governs').textContent = 'governed by ' + worst.key;

    wirePopovers($('tileGrid'));

    renderSteps({
      D: D, t: t, W: W, e: e, g: g, P: P, theta: theta, Dh: Dh,
      hasBushing: hasBushing, bushingBad: bushingBad, Db: Db,
      pLug: pLug, pPin: pPin, pBush: pBush,
      axial: axial, trans: trans, PbbTheta: PbbTheta, net: net,
      tearout: tearout, governing: governing, PallowTheta: PallowTheta,
      shear: shear, bend: bend, pinBendAllow: pinBendAllow, msBend: msBend,
      bush: bush, doubleShear: doubleShear, worst: worst, denom: denom
    });

    drawSchematic(D, t, W, e, theta, Dh);

    if (!ktChart || !angleChart) return;

    var ductility = pLug.ductility;
    var DOverT = D / t;
    var ktPts = [];
    for (var x = 1.0; x <= 3.0001; x += 0.05) {
      ktPts.push({ x: +x.toFixed(3), y: ktAxial(x, DOverT, ductility) });
    }
    ktChart.data.datasets[0].data = ktPts;
    ktChart.data.datasets[1].data = [{ x: axial.eOverD, y: axial.Kt }];
    ktChart.update();

    var angPts = [];
    for (var a = 0; a <= 90; a += 2) {
      var pbb = combinedAllowable(axial.Pbb, trans.Pbb, a);
      var pnet = combinedAllowable(net.PnetAxial, net.PnetTrans, a);
      angPts.push({ x: a, y: Math.min(pbb, pnet, tearout.Pallow) });
    }
    angleChart.data.datasets[0].data = angPts;
    angleChart.data.datasets[1].data = [{ x: theta, y: PallowTheta }];
    angleChart.update();
  }

  /* ── Wiring ───────────────────────────────────────────────────────────── */

  function init() {
    $('in_hasBushing').addEventListener('change', function (ev) {
      $('bushingFields').hidden = !ev.target.checked;
      compute();
    });

    $('toggle_shear').querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('toggle_shear').querySelectorAll('button').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        compute();
      });
    });

    ['in_D', 'in_t', 'in_W', 'in_e', 'in_g', 'in_P', 'in_theta',
     'in_Db'].forEach(function (id) {
      $(id).addEventListener('input', compute);
      $(id).addEventListener('change', compute);
    });

    wirePopovers(document);
    initCharts();

    // Materials arrive asynchronously; nothing can be computed until they do.
    LugMaterials.init(compute)
      .then(function (info) {
        var note = $('mat_count');
        if (note) {
          note.textContent = info.count + ' conditions · ' + info.alloys + ' alloys';
        }
        compute();
      })
      .catch(function (err) {
        $('tileGrid').innerHTML =
          '<p style="padding:16px;font-size:13px;">Could not load the material ' +
          'database (' + esc(err.message) + '). Reload to try again.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
