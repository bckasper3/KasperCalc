/**
 * column-buckling.js — column buckling and crippling, AFFDL-TR-69-42 Section 2.
 *
 * Two failure modes share one curve. Crippling (local buckling of the thin
 * elements) sets the short-column plateau; Euler buckling takes over once the
 * member is slender enough. The allowable is the lower of the two at the
 * member's effective slenderness, so a section that cripples early never gets
 * credit for its full compressive yield.
 *
 *   Crippling of angle elements   Fcc = Ce sqrt(Fcy E) / (b'/t)^0.75   (Eq 2-26)
 *   Built-up sections             Fcc = sum(Fcc_i A_i) / sum(A_i)      (Eq 2-29)
 *   Round tubes                   Fcc = C E t / r, C from Figure 2-67
 *   Euler                         Fc  = pi^2 E / (L'/rho)^2
 *   Short columns (Johnson)       Fc  = Fcc [1 - Fcc (L'/rho)^2 / (4 pi^2 E)]
 *
 * Material properties come from js/stress-materials.js, reading the same
 * MIL-HDBK-5 dataset as MaterialPropertyLookup.html.
 */
'use strict';

(function () {

  function $(id) { return document.getElementById(id); }
  function num(v, d) { var f = parseFloat(v); return isFinite(f) ? f : d; }
  function n2(v) { return Math.round(v * 100) / 100; }

  /* ── section geometry ──────────────────────────────────────────────────
     Every thin-walled shape is described as a list of non-overlapping
     rectangles. One routine then gets the area, centroid and principal second
     moments for all of them, which keeps the unsymmetric shapes — angles and
     zees, whose weak axis is not a drawing axis — correct rather than
     approximate. The same rectangles drive the cross-section drawing. */

  function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

  function sectionProps(rects) {
    var A = 0, sx = 0, sy = 0, i, r;
    for (i = 0; i < rects.length; i++) {
      r = rects[i];
      var a = r.w * r.h;
      A += a; sx += a * r.x; sy += a * r.y;
    }
    if (A <= 0) return null;
    var xc = sx / A, yc = sy / A;
    var Ix = 0, Iy = 0, Ixy = 0;
    for (i = 0; i < rects.length; i++) {
      r = rects[i];
      var ai = r.w * r.h, dx = r.x - xc, dy = r.y - yc;
      Ix += r.w * r.h * r.h * r.h / 12 + ai * dy * dy;
      Iy += r.h * r.w * r.w * r.w / 12 + ai * dx * dx;
      Ixy += ai * dx * dy;           // each rectangle's own Ixy is zero
    }
    var avg = (Ix + Iy) / 2;
    var rad = Math.sqrt(Math.pow((Ix - Iy) / 2, 2) + Ixy * Ixy);
    return {
      A: A, xc: xc, yc: yc, Ix: Ix, Iy: Iy, Ixy: Ixy,
      Imax: avg + rad, Imin: avg - rad,
      // principal axis rotation, degrees; zero for the symmetric shapes
      theta: Math.abs(Ixy) < 1e-12 ? 0 : 0.5 * Math.atan2(-2 * Ixy, Ix - Iy) * 180 / Math.PI
    };
  }

  /* ── the shape library ────────────────────────────────────────────────
     fields  : dimension inputs, in order
     rects   : rectangles for properties and drawing (thin-walled shapes)
     analytic: closed-form properties instead, for the round shapes
     elems   : Needham angle elements for crippling — legs b and h, and the
               edge-fixity coefficient Ce
     Ce: 0.316 two edges free, 0.342 one edge free, 0.366 no edge free. */

  var CE = { two: 0.316, one: 0.342, none: 0.366 };

  var SHAPES = {
    'round-tube': {
      label: 'Round tube',
      fields: [['D', 'Outside dia. D', 2.0], ['t', 'Wall t', 0.065]],
      tube: true,
      analytic: function (d) {
        var Di = Math.max(d.D - 2 * d.t, 0);
        var A = Math.PI / 4 * (d.D * d.D - Di * Di);
        var I = Math.PI / 64 * (Math.pow(d.D, 4) - Math.pow(Di, 4));
        return { A: A, Ix: I, Iy: I, Imin: I, Imax: I, theta: 0 };
      },
      valid: function (d) { return d.t > 0 && d.D > 2 * d.t; }
    },

    'round-solid': {
      label: 'Solid round bar',
      fields: [['D', 'Diameter D', 1.0]],
      solid: true,
      analytic: function (d) {
        var A = Math.PI / 4 * d.D * d.D;
        var I = Math.PI / 64 * Math.pow(d.D, 4);
        return { A: A, Ix: I, Iy: I, Imin: I, Imax: I, theta: 0 };
      },
      valid: function (d) { return d.D > 0; }
    },

    'rect-tube': {
      label: 'Square / rectangular tube',
      fields: [['b', 'Width b', 2.0], ['h', 'Height h', 2.0], ['t', 'Wall t', 0.0625]],
      rects: function (d) {
        var wi = d.h - 2 * d.t;
        return [
          rect(0, (d.h - d.t) / 2, d.b, d.t),      // top wall
          rect(0, -(d.h - d.t) / 2, d.b, d.t),     // bottom wall
          rect(-(d.b - d.t) / 2, 0, d.t, wi),      // left wall
          rect((d.b - d.t) / 2, 0, d.t, wi)        // right wall
        ];
      },
      elems: function (d) {
        // four corners, each half a wall either side; the box restrains both
        // edges of every wall, so no edge is free
        return [0, 1, 2, 3].map(function (i) {
          return { b: d.b / 2, h: d.h / 2, t: d.t, Ce: CE.none, label: 'Corner ' + (i + 1) };
        });
      },
      valid: function (d) { return d.t > 0 && d.b > 2 * d.t && d.h > 2 * d.t; }
    },

    'rect-solid': {
      label: 'Solid rectangular bar',
      fields: [['b', 'Width b', 1.0], ['h', 'Height h', 2.0]],
      solid: true,
      rects: function (d) { return [rect(0, 0, d.b, d.h)]; },
      valid: function (d) { return d.b > 0 && d.h > 0; }
    },

    'i-beam': {
      label: 'I-section',
      fields: [['b', 'Flange width b', 2.0], ['h', 'Depth h', 3.0], ['t', 'Thickness t', 0.125]],
      rects: function (d) {
        var wi = d.h - 2 * d.t;
        return [
          rect(0, (d.h - d.t) / 2, d.b, d.t),
          rect(0, -(d.h - d.t) / 2, d.b, d.t),
          rect(0, 0, d.t, wi)
        ];
      },
      elems: function (d) {
        // four quarter-angles, each a flange outstand plus half the web; the
        // flange tip is unsupported so one edge is free
        return [0, 1, 2, 3].map(function (i) {
          return { b: d.b / 2, h: d.h / 2, t: d.t, Ce: CE.one, label: 'Quarter ' + (i + 1) };
        });
      },
      valid: function (d) { return d.t > 0 && d.b > d.t && d.h > 2 * d.t; }
    },

    'channel': {
      label: 'Channel',
      fields: [['b', 'Flange width b', 1.5], ['h', 'Depth h', 3.0], ['t', 'Thickness t', 0.125]],
      rects: function (d) {
        var wi = d.h - 2 * d.t;
        return [
          rect(d.b / 2, (d.h - d.t) / 2, d.b, d.t),
          rect(d.b / 2, -(d.h - d.t) / 2, d.b, d.t),
          rect(0, 0, d.t, wi)
        ];
      },
      elems: function (d) {
        return [0, 1].map(function (i) {
          return { b: d.b, h: d.h / 2, t: d.t, Ce: CE.one, label: 'Half ' + (i + 1) };
        });
      },
      valid: function (d) { return d.t > 0 && d.b > d.t && d.h > 2 * d.t; }
    },

    'angle': {
      label: 'Angle',
      fields: [['b', 'Leg b', 1.5], ['h', 'Leg h', 1.5], ['t', 'Thickness t', 0.125]],
      rects: function (d) {
        return [
          rect(d.b / 2, d.t / 2, d.b, d.t),                 // horizontal leg
          rect(d.t / 2, d.t + (d.h - d.t) / 2, d.t, d.h - d.t)  // vertical leg
        ];
      },
      elems: function (d) {
        return [{ b: d.b, h: d.h, t: d.t, Ce: CE.two, label: 'Angle' }];
      },
      valid: function (d) { return d.t > 0 && d.b > d.t && d.h > d.t; }
    },

    'zee': {
      label: 'Zee',
      fields: [['b', 'Flange width b', 1.25], ['h', 'Depth h', 3.0], ['t', 'Thickness t', 0.125]],
      rects: function (d) {
        var wi = d.h - 2 * d.t;
        return [
          rect(d.b / 2, (d.h - d.t) / 2, d.b, d.t),
          rect(-d.b / 2, -(d.h - d.t) / 2, d.b, d.t),
          rect(0, 0, d.t, wi)
        ];
      },
      elems: function (d) {
        return [0, 1].map(function (i) {
          return { b: d.b, h: d.h / 2, t: d.t, Ce: CE.one, label: 'Half ' + (i + 1) };
        });
      },
      valid: function (d) { return d.t > 0 && d.b > d.t && d.h > 2 * d.t; }
    }
  };

  /* ── crippling ────────────────────────────────────────────────────────── */

  /* Figure 2-67, read off the printed chart. Below the plotted range the
     coefficient is held at its first value; the cap at Fcy makes that harmless
     for the thick tubes it applies to. */
  var TUBE_C = [
    // 0.220 at r/t = 500 is the manual's own reading in its worked example on
    // p. 2-89, which this table reproduces exactly.
    [500, 0.220], [600, 0.205], [800, 0.175], [1000, 0.152], [1200, 0.135],
    [1400, 0.121], [1600, 0.111], [1800, 0.102], [2000, 0.095], [2200, 0.090],
    [2400, 0.085], [2600, 0.081], [2800, 0.079], [3000, 0.078]
  ];

  function tubeC(rOverT) {
    if (rOverT <= TUBE_C[0][0]) return TUBE_C[0][1];
    var last = TUBE_C[TUBE_C.length - 1];
    if (rOverT >= last[0]) return last[1];
    for (var i = 0; i < TUBE_C.length - 1; i++) {
      var a = TUBE_C[i], b = TUBE_C[i + 1];
      if (rOverT <= b[0]) {
        return a[1] + (rOverT - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
      }
    }
    return last[1];
  }

  /* Needham, Eq 2-26: the element's crippling stress falls off with b'/t.
     Nothing above the compressive yield has any meaning, hence the cap. */
  function elementFcc(e, Fcy, E) {
    var bp = (e.b + e.h) / 2;
    var raw = e.Ce * Math.sqrt(Fcy * E) / Math.pow(bp / e.t, 0.75);
    return {
      bp: bp, bpt: bp / e.t, raw: raw, Fcc: Math.min(raw, Fcy),
      capped: raw > Fcy,
      A: (e.b + e.h - e.t) * e.t,
      label: e.label, Ce: e.Ce, t: e.t
    };
  }

  function crippling(shapeKey, d, Fcy, E) {
    var S = SHAPES[shapeKey];

    if (S.solid) {
      return { Fcc: Fcy, mode: 'solid', parts: [] };
    }

    if (S.tube) {
      var r = (d.D - d.t) / 2;                 // mid-wall radius
      var C = tubeC(r / d.t);
      var raw = C * E * d.t / r;
      return {
        Fcc: Math.min(raw, Fcy), mode: 'tube', C: C, rOverT: r / d.t,
        raw: raw, capped: raw > Fcy, r: r, parts: []
      };
    }

    var parts = S.elems(d).map(function (e) { return elementFcc(e, Fcy, E); });
    var sPA = 0, sA = 0;
    parts.forEach(function (p) { sPA += p.Fcc * p.A; sA += p.A; });
    var Fcc = sA > 0 ? sPA / sA : Fcy;
    return { Fcc: Math.min(Fcc, Fcy), mode: 'needham', parts: parts, sumA: sA };
  }

  /* ── column curve ─────────────────────────────────────────────────────── */

  var FIXITY = [
    { key: 'pp', label: 'Pinned — pinned', c: 1.0 },
    { key: 'fp', label: 'Fixed — pinned', c: 2.05 },
    { key: 'ff', label: 'Fixed — fixed', c: 4.0 },
    { key: 'fc', label: 'Fixed — free (cantilever)', c: 0.25 }
  ];

  function fixityOf(key) {
    for (var i = 0; i < FIXITY.length; i++) if (FIXITY[i].key === key) return FIXITY[i];
    return FIXITY[0];
  }

  /* Johnson parabola, tangent to Euler at Fc = Fcc/2. Below the tangency the
     parabola governs, above it Euler does; the two meet with equal slope so the
     allowable is continuous across the transition. */
  function lambdaCrit(E, Fcc) { return Math.sqrt(2 * Math.PI * Math.PI * E / Fcc); }

  function columnStress(lam, E, Fcc) {
    if (lam <= 0) return { Fc: Fcc, mode: 'crippling' };
    var lc = lambdaCrit(E, Fcc);
    if (lam <= lc) {
      return { Fc: Fcc * (1 - Fcc * lam * lam / (4 * Math.PI * Math.PI * E)), mode: 'johnson' };
    }
    return { Fc: Math.PI * Math.PI * E / (lam * lam), mode: 'euler' };
  }

  /* ── state ────────────────────────────────────────────────────────────── */

  var curveChart = null;
  var LAST = null;

  function readDims(shapeKey) {
    var d = {};
    SHAPES[shapeKey].fields.forEach(function (f) {
      d[f[0]] = num($('cb_' + f[0]) && $('cb_' + f[0]).value, f[2]);
    });
    return d;
  }

  function buildFields(shapeKey) {
    var wrap = $('cb_dims');
    var S = SHAPES[shapeKey];
    var prev = {};
    S.fields.forEach(function (f) {
      var n = $('cb_' + f[0]);
      if (n) prev[f[0]] = n.value;
    });
    wrap.innerHTML = S.fields.map(function (f) {
      var v = prev[f[0]] !== undefined ? prev[f[0]] : f[2];
      return '<div class="lug-field">' +
             '<label for="cb_' + f[0] + '">' + f[1] + ' <span class="lug-unit">in</span></label>' +
             '<input type="number" id="cb_' + f[0] + '" value="' + v + '" step="0.005" min="0" />' +
             '</div>';
    }).join('');
    wrap.querySelectorAll('input').forEach(function (n) {
      n.addEventListener('input', compute);
    });
  }

  /* ── drawing ──────────────────────────────────────────────────────────── */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    var e = document.createElementNS(SVG_NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* Elevation: how the member is held and loaded. The end symbols and the
     dashed buckled shape are the whole point — the fixity coefficient is
     otherwise just a number in a dropdown. */
  function drawElevation(fix, L, lam) {
    var svg = $('cbElevation');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var topY = 52, botY = 300, cx = 150;
    var w = 26;

    function ground(y, flip) {
      var g = svgEl('g', {});
      g.appendChild(svgEl('line', { x1: cx - 44, y1: y, x2: cx + 44, y2: y, 'class': 'cb-ground' }));
      for (var x = cx - 40; x <= cx + 34; x += 11) {
        g.appendChild(svgEl('line', {
          x1: x, y1: y, x2: x + 9, y2: y + (flip ? -11 : 11), 'class': 'cb-hatch'
        }));
      }
      return g;
    }
    function pin(y) {
      var g = svgEl('g', {});
      var s = flipSign(y);
      g.appendChild(svgEl('polygon', {
        points: [cx + ',' + y, (cx - 12) + ',' + (y + 18 * s), (cx + 12) + ',' + (y + 18 * s)].join(' '),
        'class': 'cb-pin'
      }));
      g.appendChild(ground(y + 18 * s, s < 0));
      return g;
    }
    function flipSign(y) { return y > (topY + botY) / 2 ? 1 : -1; }
    function fixed(y) {
      var s = flipSign(y);
      var g = svgEl('g', {});
      g.appendChild(svgEl('rect', {
        x: cx - 30, y: s > 0 ? y : y - 12, width: 60, height: 12, 'class': 'cb-fixblock'
      }));
      g.appendChild(ground(s > 0 ? y + 12 : y - 12, s < 0));
      return g;
    }

    // the member
    svg.appendChild(svgEl('rect', {
      x: cx - w / 2, y: topY, width: w, height: botY - topY, 'class': 'cb-member'
    }));

    // buckled shape, amplitude exaggerated
    var amp = 26, pts = [], i, n = 40;
    for (i = 0; i <= n; i++) {
      var s = i / n, y = topY + s * (botY - topY), off = 0;
      if (fix.key === 'pp') off = amp * Math.sin(Math.PI * s);
      else if (fix.key === 'ff') off = amp * 0.5 * (1 - Math.cos(2 * Math.PI * s));
      else if (fix.key === 'fp') off = amp * Math.sin(Math.PI * s) * (1 - 0.45 * s);
      else off = amp * (1 - Math.cos(Math.PI * s / 2));   // fixed–free
      pts.push((cx + off) + ',' + n2(y));
    }
    svg.appendChild(svgEl('polyline', { points: pts.join(' '), 'class': 'cb-buckle' }));

    // ends
    if (fix.key === 'pp') { svg.appendChild(pin(botY)); svg.appendChild(pin(topY)); }
    else if (fix.key === 'ff') { svg.appendChild(fixed(botY)); svg.appendChild(fixed(topY)); }
    else if (fix.key === 'fp') { svg.appendChild(fixed(botY)); svg.appendChild(pin(topY)); }
    else { svg.appendChild(fixed(botY)); }

    // load arrow
    var ay = fix.key === 'fc' ? topY : topY - 22;
    svg.appendChild(svgEl('line', { x1: cx, y1: ay - 34, x2: cx, y2: ay - 6, 'class': 'cb-load' }));
    svg.appendChild(svgEl('polygon', {
      points: [cx + ',' + ay, (cx - 6) + ',' + (ay - 13), (cx + 6) + ',' + (ay - 13)].join(' '),
      'class': 'cb-load-head'
    }));
    var pt = svgEl('text', { x: cx + 12, y: ay - 20, 'class': 'cb-lab' });
    pt.textContent = 'P';
    svg.appendChild(pt);

    // length dimension
    var dx = cx - 62;
    svg.appendChild(svgEl('line', { x1: dx, y1: topY, x2: dx, y2: botY, 'class': 'cb-dim' }));
    svg.appendChild(svgEl('line', { x1: dx - 7, y1: topY, x2: dx + 7, y2: topY, 'class': 'cb-dim' }));
    svg.appendChild(svgEl('line', { x1: dx - 7, y1: botY, x2: dx + 7, y2: botY, 'class': 'cb-dim' }));
    var lt = svgEl('text', {
      x: dx - 8, y: (topY + botY) / 2, 'class': 'cb-lab', 'text-anchor': 'middle',
      transform: 'rotate(-90 ' + (dx - 8) + ' ' + (topY + botY) / 2 + ')'
    });
    lt.textContent = 'L = ' + L.toFixed(2) + '"';
    svg.appendChild(lt);

    var ft = svgEl('text', { x: cx + 54, y: (topY + botY) / 2 - 6, 'class': 'cb-lab-sm' });
    ft.textContent = 'c = ' + fix.c;
    svg.appendChild(ft);
    var kt = svgEl('text', { x: cx + 54, y: (topY + botY) / 2 + 10, 'class': 'cb-lab-sm' });
    kt.textContent = "L' = L/√c";
    svg.appendChild(kt);
  }

  /* Cross-section, drawn to the entered dimensions so a silly aspect ratio is
     obvious before the numbers are read. */
  function drawSection(shapeKey, d, props) {
    var svg = $('cbSection');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var S = SHAPES[shapeKey];

    var W = 300, H = 240, pad = 46;
    var cx = W / 2, cy = H / 2;

    var ext;
    if (S.tube || (S.solid && shapeKey === 'round-solid')) {
      ext = { w: d.D, h: d.D };
    } else {
      var rs = S.rects(d), minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      rs.forEach(function (r) {
        minx = Math.min(minx, r.x - r.w / 2); maxx = Math.max(maxx, r.x + r.w / 2);
        miny = Math.min(miny, r.y - r.h / 2); maxy = Math.max(maxy, r.y + r.h / 2);
      });
      ext = { w: maxx - minx, h: maxy - miny, minx: minx, miny: miny };
    }
    var sc = Math.min((W - 2 * pad) / Math.max(ext.w, 1e-6), (H - 2 * pad) / Math.max(ext.h, 1e-6));

    if (shapeKey === 'round-tube' || shapeKey === 'round-solid') {
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: d.D / 2 * sc, 'class': 'cb-sec' }));
      if (shapeKey === 'round-tube') {
        svg.appendChild(svgEl('circle', {
          cx: cx, cy: cy, r: Math.max(d.D / 2 - d.t, 0) * sc, 'class': 'cb-sec-hole'
        }));
      }
    } else {
      var rs2 = S.rects(d);
      var ox = (ext.minx + ext.w / 2), oy = (ext.miny + ext.h / 2);
      rs2.forEach(function (r) {
        svg.appendChild(svgEl('rect', {
          x: cx + (r.x - ox - r.w / 2) * sc,
          y: cy - (r.y - oy + r.h / 2) * sc,
          width: r.w * sc, height: r.h * sc, 'class': 'cb-sec'
        }));
      });
    }

    // principal axes through the centroid
    var ang = props.theta || 0;
    var half = Math.min(W, H) / 2 - 14;
    ['', 'perp'].forEach(function (k, i) {
      var a = (ang + (i ? 90 : 0)) * Math.PI / 180;
      svg.appendChild(svgEl('line', {
        x1: cx - Math.cos(a) * half, y1: cy + Math.sin(a) * half,
        x2: cx + Math.cos(a) * half, y2: cy - Math.sin(a) * half,
        'class': i ? 'cb-axis-weak' : 'cb-axis'
      }));
    });

    var t1 = svgEl('text', { x: 8, y: 16, 'class': 'cb-lab-sm' });
    t1.textContent = 'A = ' + props.A.toFixed(4) + ' in²';
    svg.appendChild(t1);
    var t2 = svgEl('text', { x: 8, y: 31, 'class': 'cb-lab-sm' });
    t2.textContent = 'I_min = ' + props.Imin.toExponential(3) + ' in⁴';
    svg.appendChild(t2);
    if (Math.abs(ang) > 0.05) {
      var t3 = svgEl('text', { x: 8, y: 46, 'class': 'cb-lab-sm' });
      t3.textContent = 'principal axis ' + ang.toFixed(1) + '°';
      svg.appendChild(t3);
    }
  }

  /* ── chart ────────────────────────────────────────────────────────────── */

  function buildChart(E, Fcc, Fcy, lam, Fc) {
    var lmax = Math.max(160, lam * 1.6);
    var euler = [], john = [], N = 120, i, l;
    var lc = lambdaCrit(E, Fcc);
    for (i = 1; i <= N; i++) {
      l = lmax * i / N;
      var eu = Math.PI * Math.PI * E / (l * l) / 1000;
      if (eu <= Fcy / 1000 * 1.15) euler.push({ x: l, y: eu });
      if (l <= lc) john.push({ x: l, y: Fcc * (1 - Fcc * l * l / (4 * Math.PI * Math.PI * E)) / 1000 });
    }
    var data = {
      datasets: [
        { label: 'Johnson (short)', data: john, borderColor: '#3a6270', backgroundColor: '#3a6270',
          pointRadius: 0, borderWidth: 2, tension: 0, showLine: true },
        { label: 'Euler (long)', data: euler, borderColor: '#c87941', backgroundColor: '#c87941',
          pointRadius: 0, borderWidth: 2, tension: 0, showLine: true },
        { label: 'F_cc cutoff', data: [{ x: 0, y: Fcc / 1000 }, { x: lmax, y: Fcc / 1000 }],
          borderColor: '#7a5a8a', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, showLine: true },
        { label: 'This column', data: [{ x: lam, y: Fc / 1000 }],
          borderColor: '#a3312a', backgroundColor: '#a3312a', pointRadius: 6, showLine: false }
      ]
    };
    var opts = {
      maintainAspectRatio: false, responsive: true, animation: false,
      plugins: {
        legend: { position: 'top', labels: { boxHeight: 2, font: { size: 11 }, padding: 8 } },
        tooltip: { mode: 'nearest', intersect: false, axis: 'x' }
      },
      scales: {
        x: { type: 'linear', min: 0, max: lmax, title: { display: true, text: "L'/ρ" },
             ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.07)' } },
        y: { type: 'linear', min: 0, title: { display: true, text: 'F_c, ksi' },
             ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.07)' } }
      }
    };
    if (curveChart) {
      curveChart.data = data;
      curveChart.options = opts;
      curveChart.update();
    } else {
      var el = $('cbCurve');
      if (el && window.Chart) curveChart = new Chart(el.getContext('2d'), { type: 'scatter', data: data, options: opts });
    }
  }

  /* ── output ───────────────────────────────────────────────────────────── */

  function fmt(v) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1e5) return Math.round(v).toLocaleString();
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(4);
  }

  function msClass(ms) { return ms < 0 ? 'fail' : (ms < 0.15 ? 'marginal' : 'ok'); }
  function msText(ms) {
    if (!isFinite(ms)) return '—';
    if (ms > 99) return '> +99';
    return (ms >= 0 ? '+' : '') + ms.toFixed(2);
  }

  /* Same tile markup the lug page uses, so the two calculators read alike. */
  function tile(title, ms, lines, badge) {
    var cls = msClass(ms);
    var pill = isFinite(ms)
      ? (badge || (ms < 0 ? 'FAIL' : (ms < 0.15 ? 'MARGINAL' : 'PASS')))
      : (badge || '');
    return '<div class="lug-tile">' +
      '<div class="lug-tile-head">' +
        '<div class="lug-tile-label">' + title + '</div>' +
        (pill ? '<span class="lug-pill ' + cls + '">' + pill + '</span>' : '') +
      '</div>' +
      (isFinite(ms)
        ? '<div class="lug-ms ' + cls + '">MS = ' + msText(ms) + '</div>'
        : '') +
      '<div class="lug-sub">' +
        lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') +
      '</div></div>';
  }

  function compute() {
    var shapeKey = $('cb_shape').value;
    var S = SHAPES[shapeKey];
    var d = readDims(shapeKey);
    var L = num($('cb_L').value, 20);
    var P = num($('cb_P').value, 5000);
    var fix = fixityOf($('cb_fixity').value);

    var mat = window.StressMaterials ? StressMaterials.get('Col') : null;
    var warn = $('cb_warn');

    if (!mat || !mat.Fcy || !mat.E) {
      warn.textContent = 'Waiting for material data…';
      return;
    }
    if (!S.valid(d)) {
      warn.textContent = 'Those dimensions do not describe a closed section — check that the wall fits inside the outside dimensions.';
      $('cbTiles').innerHTML = '';
      return;
    }
    warn.textContent = '';

    var props = S.analytic ? S.analytic(d) : sectionProps(S.rects(d));
    var Fcy = mat.Fcy, E = mat.E;

    var crip = crippling(shapeKey, d, Fcy, E);
    var rho = Math.sqrt(props.Imin / props.A);
    var Le = L / Math.sqrt(fix.c);
    var lam = Le / rho;

    var col = columnStress(lam, E, crip.Fcc);
    var Pallow = col.Fc * props.A;
    var msCol = P > 0 ? Pallow / P - 1 : Infinity;

    var Pcrip = crip.Fcc * props.A;
    var msCrip = P > 0 ? Pcrip / P - 1 : Infinity;

    var Peuler = Math.PI * Math.PI * E * props.Imin / (Le * Le);
    var msEuler = P > 0 ? Peuler / P - 1 : Infinity;

    LAST = {
      shapeKey: shapeKey, d: d, L: L, P: P, fix: fix, mat: mat, props: props,
      crip: crip, rho: rho, Le: Le, lam: lam, col: col, Pallow: Pallow, ms: msCol
    };

    var governs = col.mode === 'euler' ? 'Euler buckling'
                : (lam < 1e-6 ? 'crippling' : 'short-column (crippling-limited)');
    $('cb_governs').textContent = 'governed by ' + governs;

    $('cbTiles').innerHTML =
      tile('Column — allowable', msCol, [
        'F<sub>c</sub> = ' + fmt(col.Fc / 1000) + ' ksi',
        'P<sub>allow</sub> = ' + fmt(Pallow) + ' lb',
        'P<sub>applied</sub> = ' + fmt(P) + ' lb',
        "L'/ρ = " + lam.toFixed(1)
      ], col.mode === 'euler' ? 'EULER' : 'SHORT') +
      tile('Crippling (local)', msCrip, [
        'F<sub>cc</sub> = ' + fmt(crip.Fcc / 1000) + ' ksi' +
          (crip.Fcc >= Fcy * 0.999 ? ' (capped at F<sub>cy</sub>)' : ''),
        'P<sub>cc</sub> = ' + fmt(Pcrip) + ' lb',
        crip.mode === 'tube' ? 'C = ' + crip.C.toFixed(3) + ', r/t = ' + crip.rOverT.toFixed(0)
                             : (crip.mode === 'solid' ? 'solid section — no local buckling'
                                                      : crip.parts.length + ' elements, area-weighted')
      ]) +
      tile('Euler (elastic)', msEuler, [
        'P<sub>E</sub> = ' + fmt(Peuler) + ' lb',
        'I<sub>min</sub> = ' + props.Imin.toExponential(3) + ' in<sup>4</sup>',
        'ρ = ' + rho.toFixed(4) + ' in',
        "L' = " + Le.toFixed(2) + ' in'
      ]) +
      tile('Section', Infinity, [
        'A = ' + props.A.toFixed(4) + ' in<sup>2</sup>',
        'I<sub>x</sub> = ' + (props.Ix || 0).toExponential(3),
        'I<sub>y</sub> = ' + (props.Iy || 0).toExponential(3),
        'F<sub>cy</sub> = ' + fmt(Fcy / 1000) + ' ksi, E = ' + fmt(E / 1e6) + ' Msi'
      ]);

    drawElevation(fix, L, lam);
    drawSection(shapeKey, d, props);
    buildChart(E, crip.Fcc, Fcy, lam, col.Fc);
    buildSteps();
  }

  function buildSteps() {
    var r = LAST;
    if (!r) return;
    var s = [];
    function row(label, value) {
      s.push('<div><span>' + label + '</span> <span class="val">' + value + '</span></div>');
    }
    function grp(t) { s.push('<div class="grp">' + t + '</div>'); }

    grp('Material');
    row('Condition', r.mat.label);
    row('F<sub>cy</sub>', fmt(r.mat.Fcy / 1000) + ' ksi');
    row('E', fmt(r.mat.E / 1e6) + ' Msi');
    if (r.mat.derated && r.mat.derated.applied.length) {
      row('Derated at ' + r.mat.derated.tempF + '°F', r.mat.derated.applied.join(', '));
    }
    if (r.mat.derated && r.mat.derated.missing.length) {
      row('No temperature curve for', r.mat.derated.missing.join(', '));
    }

    grp('Section properties');
    row('Shape', SHAPES[r.shapeKey].label);
    row('Area A', r.props.A.toFixed(4) + ' in²');
    row('I<sub>min</sub>', r.props.Imin.toExponential(4) + ' in⁴');
    row('Radius of gyration &rho; = &radic;(I/A)', r.rho.toFixed(4) + ' in');
    if (Math.abs(r.props.theta || 0) > 0.05) {
      row('Principal axis rotated', r.props.theta.toFixed(2) + '° — I<sub>min</sub> is about that axis, not x or y');
    }

    grp('Crippling — ' + (r.crip.mode === 'needham' ? 'Needham, Eq 2-26 and 2-29'
                        : r.crip.mode === 'tube' ? 'round tube, Figure 2-67' : 'solid section'));
    if (r.crip.mode === 'needham') {
      r.crip.parts.forEach(function (p) {
        row(p.label + ': b′/t = ' + p.bpt.toFixed(1) + ', C<sub>e</sub> = ' + p.Ce,
            'F<sub>cc</sub> = ' + fmt(p.Fcc / 1000) + ' ksi' + (p.capped ? ' (capped)' : '') +
            ', A = ' + p.A.toFixed(4) + ' in²');
      });
      row('Area-weighted &Sigma;(F<sub>cc</sub>A)/&Sigma;A', fmt(r.crip.Fcc / 1000) + ' ksi');
    } else if (r.crip.mode === 'tube') {
      row('Mid-wall radius r', r.crip.r.toFixed(4) + ' in');
      row('r/t', r.crip.rOverT.toFixed(0));
      row('C from Figure 2-67', r.crip.C.toFixed(4));
      row('F<sub>cc</sub> = C·E·t/r', fmt(r.crip.raw / 1000) + ' ksi' + (r.crip.capped ? ' → capped at F<sub>cy</sub>' : ''));
    } else {
      row('Solid section', 'no local buckling; plateau is F<sub>cy</sub>');
    }

    grp('Column');
    row('End fixity', r.fix.label + ' (c = ' + r.fix.c + ')');
    row("Effective length L' = L/&radic;c", r.Le.toFixed(3) + ' in');
    row("Effective slenderness L'/&rho;", r.lam.toFixed(2));
    row('Transition slenderness &radic;(2&pi;²E/F<sub>cc</sub>)', lambdaCrit(r.mat.E, r.crip.Fcc).toFixed(2));
    row('Branch used', r.col.mode === 'euler' ? 'Euler, F<sub>c</sub> = &pi;²E/(L′/&rho;)²'
                                              : 'Johnson, F<sub>c</sub> = F<sub>cc</sub>[1 − F<sub>cc</sub>(L′/&rho;)²/(4&pi;²E)]');
    row('Allowable stress F<sub>c</sub>', fmt(r.col.Fc / 1000) + ' ksi');
    row('P<sub>allow</sub> = F<sub>c</sub>·A', fmt(r.Pallow) + ' lb');
    row('MS = P<sub>allow</sub>/P − 1', msText(r.ms));

    $('cbSteps').innerHTML = s.join('');
  }

  /* ── init ─────────────────────────────────────────────────────────────── */

  /* The digitized Figure 2-67, published in the reference guide so the tube
     coefficient can be read rather than taken on trust. */
  function buildFig267() {
    var el = $('cbFig267');
    if (!el || !window.HdbkUtil) return;
    HdbkUtil.makeMultiLine('cbFig267', [{
      label: 'C', data: TUBE_C.map(function (p) { return { x: p[0], y: p[1] }; }),
      color: '#3a6270', interp: 'lin', step: 25
    }], {
      xLabel: 'r / t', yLabel: 'C', xMin: 400, xMax: 3100, yMin: 0, yMax: 0.24
    });
  }

  function init() {
    var sel = $('cb_shape');
    if (!sel) return;
    buildFig267();
    sel.innerHTML = Object.keys(SHAPES).map(function (k) {
      return '<option value="' + k + '">' + SHAPES[k].label + '</option>';
    }).join('');
    sel.value = 'rect-tube';

    $('cb_fixity').innerHTML = FIXITY.map(function (f) {
      return '<option value="' + f.key + '">' + f.label + ' (c = ' + f.c + ')</option>';
    }).join('');

    buildFields(sel.value);
    sel.addEventListener('change', function () { buildFields(sel.value); compute(); });
    ['cb_L', 'cb_P', 'cb_fixity'].forEach(function (id) {
      var n = $(id);
      if (n) { n.addEventListener('input', compute); n.addEventListener('change', compute); }
    });

    StressMaterials.init({
      parts: [{ key: 'Col', label: 'Column material' }],
      require: ['Fcy', 'E'],
      expose: ['Fcy', 'E', 'Ftu', 'Fty'],
      derate: ['Fcy', 'E'],
      /* The shapes on this page are mostly tube, extrusion and formed sheet, so
         the short list leads with the forms a strut is actually made from.
         4130 and 4135 tube are published at several heat-treat levels under
         otherwise identical labels, hence the explicit ftu. */
      curated: [
        { alloy: 'AISI 4130', temper: /Normalized/, form: 'tubing' },
        { alloy: 'AISI 4130', temper: /Quenched/, form: 'Tubing', ftu: 125 },
        { alloy: 'AISI 4130', temper: /Quenched/, form: 'Tubing', ftu: 150 },
        { alloy: 'AISI 4130', temper: /Quenched/, form: 'Tubing', ftu: 180 },
        { alloy: 'AISI 4135', temper: /Quenched/, form: 'Tubing', ftu: 180 },
        { alloy: 'AISI 1025 Carbon Steel', temper: null, form: 'Tubing' },
        { alloy: 'AISI 1025 Carbon Steel', temper: null, form: 'Bar' },
        { alloy: 'AISI 4340', temper: null, form: null },
        { alloy: 'AISI 8630', temper: /Normalized/, form: 'Tubing' },
        { alloy: '15-5PH', temper: /H1025/, form: 'Bar' },
        { alloy: '17-4PH', temper: /H1025/, form: 'Bar' },
        { alloy: '2024 Aluminum Alloy', temper: /^T3$/, form: 'Sheet' },
        { alloy: '2024 Aluminum Alloy', temper: /^T351$/, form: 'Plate' },
        { alloy: '2024 Aluminum Alloy', temper: /T3, T3510/, form: 'Extrusion' },
        { alloy: '6061 Aluminum Alloy', temper: /T6, T6510/, form: 'Extrusion' },
        { alloy: '6061 Aluminum Alloy', temper: /T651/, form: 'Plate' },
        { alloy: '6061 Aluminum Alloy', temper: /T6 and T62/, form: 'Sheet' },
        { alloy: '7075 Aluminum Alloy', temper: /T6 and T62/, form: 'Sheet' },
        { alloy: '7075 Aluminum Alloy', temper: /^T651$/, form: 'Plate' },
        { alloy: '7075 Aluminum Alloy', temper: /T6, T6510/, form: 'Extrusion' },
        { alloy: '7050 Aluminum Alloy', temper: /T7451/, form: 'Plate' },
        { alloy: '2219 Aluminum Alloy', temper: /T87/, form: 'Plate' }
      ],
      readout: function (m) {
        return 'F<sub>cy</sub> ' + Math.round(m.Fcy / 1000) + ' ksi · E ' +
               (m.E / 1e6).toFixed(1) + ' Msi';
      },
      onChange: compute
    }).then(function (info) {
      var n = $('cb_matcount');
      if (n) n.textContent = info.conditions.toLocaleString() + ' conditions · ' + info.alloys + ' alloys';
      compute();
    }).catch(function (e) {
      $('cb_warn').textContent = 'Could not load the material dataset: ' + e.message;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
