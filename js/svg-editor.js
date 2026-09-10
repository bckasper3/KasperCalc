/* KasperCalc SVG Editor
 *
 * Model: the SVG source text is the document of record. Interactive edits mutate
 * the live DOM and are serialized back into the code pane; edits in the code pane
 * are parsed and re-rendered. Undo/redo stores source snapshots, so both paths
 * share a single history and Ctrl+Z always means "step back one change".
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MAX_HISTORY = 150;
  var HANDLE = 8;              /* handle box edge, screen px */
  var MIN_ZOOM = 0.05, MAX_ZOOM = 64;

  /* ────────────────────────────────────────────────────────────── state ── */

  var S = {
    doc: null,               /* live <svg> element mounted in the paper */
    tool: 'select',
    sel: null,               /* selected element (inside S.doc) */
    zoom: 1, panX: 0, panY: 0,
    grid: false, gridStep: 10, snap: false,
    arrowStyle: 'solid',
    jogStyle: 'elbowH', jogHead: false,
    codeCanonical: false,
    style: {
      stroke: '#c0392b', fill: 'none', strokeWidth: 2, dash: 'none', opacity: 1,
      fontSize: 13, fontFamily: 'inherit', fontWeight: 'normal',
      textAnchor: 'start', textFill: '#1c2227'
    },
    history: [], hIdx: -1,
    drag: null,              /* active pointer gesture */
    codeTimer: null, histTimer: null,
    suppressCodeSync: false
  };

  var els = {};
  var IDS = ('stage paper overlay code gutter status tools arrowstyles zoomlabel ' +
    'stroke strokeNone fill fillNone sw dash opacity fontSize fontFamily fontWeight anchor ' +
    'grid gridStep snap backdrop bgMode bgColor ' +
    'vbX vbY vbW vbH docW docH ' +
    'inspector layers file exportFmt exportScale exportW exportH exportNote ' +
    'undo redo').split(' ');

  /* ──────────────────────────────────────────────────────────── helpers ── */

  function $(id) { return document.getElementById(id); }
  function n2(v) { return Math.round(v * 100) / 100; }
  function num(v, d) { var f = parseFloat(v); return isFinite(f) ? f : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function el(name, attrs) {
    var e = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function tag(node) { return node && node.nodeName ? String(node.nodeName).toLowerCase() : ''; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  /* Length attributes may carry units; take the number when the unit is a
     straight pixel equivalent and give up on percentages. */
  function lenOf(v) {
    if (v == null) return null;
    var m = String(v).trim().match(/^(-?[\d.]+)\s*(px|pt|pc|mm|cm|in)?$/i);
    if (!m) return null;
    var f = parseFloat(m[1]);
    if (!isFinite(f)) return null;
    var u = (m[2] || 'px').toLowerCase();
    var k = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, 'in': 96 };
    return f * (k[u] || 1);
  }

  function status(msg, kind) {
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.className = 'svge-status' + (kind ? ' svge-status-' + kind : '');
  }

  /* ─────────────────────────────────────────────────────── sanitize/parse ── */

  /* Imported SVG is untrusted markup rendered in this page's origin, so scripts,
     event handlers and javascript: URLs come out before it is ever mounted. */
  function sanitize(root) {
    var removed = 0, i, j;
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    var kill = [];
    for (i = 0; i < all.length; i++) if (tag(all[i]) === 'script') kill.push(all[i]);
    for (i = 0; i < kill.length; i++) {
      if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
      removed++;
    }
    all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    var list = [root];
    for (i = 0; i < all.length; i++) list.push(all[i]);
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.attributes) continue;
      var bad = [];
      for (j = 0; j < e.attributes.length; j++) {
        var a = e.attributes[j];
        var nm = a.name.toLowerCase();
        if (/^on/.test(nm)) { bad.push(a.name); continue; }
        if ((nm === 'href' || nm === 'xlink:href' || nm === 'src') &&
            /^\s*(javascript|data:text\/html|vbscript)/i.test(a.value)) { bad.push(a.name); }
      }
      for (j = 0; j < bad.length; j++) { e.removeAttribute(bad[j]); removed++; }
    }
    return removed;
  }

  function parseSource(text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return { error: 'Nothing to render — the code pane is empty.' };

    /* A bare fragment of shapes is a perfectly reasonable thing to paste. */
    if (!/<svg[\s/>]/i.test(t)) t = '<svg xmlns="' + SVG_NS + '">' + t + '</svg>';

    var svg = null, perr = '';
    try {
      var xdoc = new DOMParser().parseFromString(t, 'image/svg+xml');
      var pe = xdoc.getElementsByTagName('parsererror')[0];
      if (pe) {
        perr = (pe.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      } else if (xdoc.documentElement && tag(xdoc.documentElement) === 'svg') {
        svg = xdoc.documentElement;
      }
    } catch (e) { perr = e.message; }

    /* The HTML parser is far more forgiving about unquoted attributes, stray
       ampersands and unclosed tags, so it gets a second pass at the source. */
    if (!svg) {
      try {
        var host = document.createElement('div');
        host.innerHTML = t;
        svg = host.querySelector('svg');
      } catch (e2) { /* fall through to the error below */ }
    }
    if (!svg) return { error: perr || 'Could not find an <svg> element in that source.' };

    var imported;
    try { imported = document.importNode(svg, true); }
    catch (e3) { return { error: 'Could not import that document: ' + e3.message }; }

    var stripped = sanitize(imported);
    if (!imported.getAttribute('xmlns')) imported.setAttribute('xmlns', SVG_NS);
    return { svg: imported, stripped: stripped, lenient: !!perr };
  }

  /* A <style> inside inline SVG is NOT scoped to that SVG — it applies to the
     whole HTML page, so a loaded drawing carrying `text { fill: ... }` would
     silently restyle every other example on this page. Selectors are prefixed
     for rendering only; the untouched source is kept here and put back on the
     way out, so what you export is exactly what you loaded. */
  var STYLE_SRC = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function scopeCss(css) {
    return String(css).replace(/(^|\})([^{}]+)\{/g, function (m, close, sel) {
      if (sel.indexOf('@') > -1) return m;            /* leave at-rules alone */
      var scoped = sel.split(',').map(function (one) {
        one = one.trim();
        return one ? '#svge-paper ' + one : one;
      }).join(', ');
      return close + scoped + ' {';
    });
  }

  function scopeStyles(root) {
    if (!STYLE_SRC) return;
    var sts = root.querySelectorAll ? root.querySelectorAll('style') : [];
    for (var i = 0; i < sts.length; i++) {
      STYLE_SRC.set(sts[i], sts[i].textContent);
      sts[i].textContent = scopeCss(sts[i].textContent);
    }
  }

  function unscopeStyles(clone) {
    if (!STYLE_SRC || !S.doc) return;
    var live = S.doc.querySelectorAll('style');
    var copy = clone.querySelectorAll('style');
    for (var i = 0; i < copy.length && i < live.length; i++) {
      var orig = STYLE_SRC.get(live[i]);
      if (orig != null) copy[i].textContent = orig;
    }
  }

  function viewBoxOf(svg) {
    var vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    if (vb.length === 4 && vb.every(isFinite) && vb[2] > 0 && vb[3] > 0) {
      return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
    }
    return null;
  }

  /* Without a viewBox there is no user-space to screen mapping to work in, so
     one is synthesized from width/height or, failing that, measured content. */
  function ensureViewBox(svg) {
    if (viewBoxOf(svg)) return;
    var w = lenOf(svg.getAttribute('width')), h = lenOf(svg.getAttribute('height'));
    if (w > 0 && h > 0) { svg.setAttribute('viewBox', '0 0 ' + n2(w) + ' ' + n2(h)); return; }
    var probe = svg.cloneNode(true);
    probe.setAttribute('style', 'position:absolute;left:-10000px;top:-10000px;width:2000px;height:2000px');
    document.body.appendChild(probe);
    var b = null;
    try { b = probe.getBBox(); } catch (e) { /* empty or unmeasurable */ }
    document.body.removeChild(probe);
    if (b && isFinite(b.width) && b.width > 0 && b.height > 0) {
      var p = Math.max(4, Math.max(b.width, b.height) * 0.02);
      svg.setAttribute('viewBox', [n2(b.x - p), n2(b.y - p), n2(b.width + 2 * p), n2(b.height + 2 * p)].join(' '));
    } else {
      svg.setAttribute('viewBox', '0 0 400 300');
    }
  }

  /* ───────────────────────────────────────────────────────────── serialize ── */

  var INLINE = { text: 1, tspan: 1, textpath: 1, title: 1, desc: 1, style: 1 };

  function attrsOf(n) {
    var s = '';
    for (var i = 0; i < n.attributes.length; i++) {
      var a = n.attributes[i];
      if (a.name === 'data-kc-sel') continue;
      s += ' ' + a.name + '="' + escAttr(a.value) + '"';
    }
    return s;
  }

  function innerRaw(n) {
    var out = '', k;
    for (var i = 0; i < n.childNodes.length; i++) {
      k = n.childNodes[i];
      if (k.nodeType === 3) out += esc(k.nodeValue);
      else if (k.nodeType === 8) out += '<!--' + k.nodeValue + '-->';
      else if (k.nodeType === 4) out += k.nodeValue;                       /* CDATA */
      else if (k.nodeType === 1) out += '<' + k.nodeName + attrsOf(k) + (k.childNodes.length
        ? '>' + innerRaw(k) + '</' + k.nodeName + '>' : ' />');
    }
    return out;
  }

  function writeNode(n, depth, out, minify, map) {
    var pad = minify ? '' : new Array(depth + 1).join('  ');
    var startLine = out.length;
    if (n.nodeType === 3) {
      var t = n.nodeValue;
      if (!t || !t.trim()) return;
      out.push(pad + esc(t.trim()));
      return;
    }
    if (n.nodeType === 8) { if (!minify) out.push(pad + '<!--' + n.nodeValue + '-->'); return; }
    if (n.nodeType !== 1) return;

    var name = n.nodeName;
    var a = attrsOf(n);
    if (!n.childNodes.length) {
      out.push(pad + '<' + name + a + ' />');
      if (map) map.push({ node: n, a: startLine, b: out.length - 1 });
      return;
    }
    if (INLINE[name.toLowerCase()]) {
      out.push(pad + '<' + name + a + '>' + innerRaw(n) + '</' + name + '>');
      if (map) map.push({ node: n, a: startLine, b: out.length - 1 });
      return;
    }
    out.push(pad + '<' + name + a + '>');
    for (var i = 0; i < n.childNodes.length; i++) writeNode(n.childNodes[i], depth + 1, out, minify, map);
    out.push(pad + '</' + name + '>');
    if (map) map.push({ node: n, a: startLine, b: out.length - 1 });
  }

  /* Line span of an element in the code pane. When the pane still holds exactly
     what serialize() produced the canonical map is used directly; after hand
     edits the element's own opening line is matched instead, which keeps the
     highlight working as long as that one line is intact. */
  function codeLinesOf(node) {
    if (!S.doc || !node) return null;
    /* The map has to be built from the same text the pane holds, which means the
       un-scoped clone serialize() produces — scopeCss rewrites the live <style>
       onto fewer lines, so measuring the live tree would mis-count every line
       after a stylesheet. */
    var path = pathOf(node);
    if (!path) return null;
    var clone = S.doc.cloneNode(true);
    unscopeStyles(clone);
    var target = clone, ci;
    for (ci = 0; ci < path.length; ci++) {
      target = target.children[path[ci]];
      if (!target) return null;
    }
    var out = [], map = [];
    writeNode(clone, 0, out, false, map);
    var hit = null;
    for (var i = 0; i < map.length; i++) if (map[i].node === target) { hit = map[i]; break; }
    if (!hit) return null;

    /* An entry in `out` is not always a single text line: an inline element
       keeps its own newlines (a <style> block's CSS, multi-line text content),
       so array indices are converted by counting the newlines actually emitted
       ahead of the element rather than assuming one line each. */
    function nlOf(str) { return str.split('\n').length - 1; }
    var startLine = 0, k;
    for (k = 0; k < hit.a; k++) startLine += nlOf(out[k]) + 1;
    var endLine = startLine;
    for (k = hit.a; k <= hit.b; k++) endLine += nlOf(out[k]) + (k < hit.b ? 1 : 0);

    if (S.codeCanonical) return [startLine, endLine];

    var needle = out[hit.a].split('\n')[0].trim();
    if (!needle) return null;
    var lines = els.code.value.split('\n'), found = -1, count = 0;
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].trim() === needle) { found = j; count++; }
    }
    if (count !== 1) return null;
    return [found, found + (endLine - startLine)];
  }

  function highlightSelectionInCode() {
    var hl = els.codeHl;
    if (!hl) return;
    var span = S.sel ? codeLinesOf(S.sel) : null;
    if (!span) { hl.style.display = 'none'; return; }
    var cs = getComputedStyle(els.code);
    var lh = parseFloat(cs.lineHeight);
    if (!isFinite(lh)) lh = parseFloat(cs.fontSize) * 1.5;
    var padTop = parseFloat(cs.paddingTop) || 0;
    hl.style.display = 'block';
    hl.style.top = (padTop + span[0] * lh) + 'px';
    hl.style.height = ((span[1] - span[0] + 1) * lh) + 'px';
  }

  function serialize(minify) {
    if (!S.doc) return '';
    var clone = S.doc.cloneNode(true);
    unscopeStyles(clone);
    var marked = clone.querySelectorAll('[data-kc-sel]');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-kc-sel');
    clone.removeAttribute('data-kc-sel');
    var out = [];
    writeNode(clone, 0, out, minify);
    return minify ? out.join('') : out.join('\n');
  }

  /* ───────────────────────────────────────────────────────────── history ── */

  function pushHistory(code) {
    if (S.history[S.hIdx] === code) return;
    S.history = S.history.slice(0, S.hIdx + 1);
    S.history.push(code);
    while (S.history.length > MAX_HISTORY) S.history.shift();
    S.hIdx = S.history.length - 1;
    syncHistoryButtons();
  }

  function syncHistoryButtons() {
    if (els.undo) els.undo.disabled = S.hIdx <= 0;
    if (els.redo) els.redo.disabled = S.hIdx >= S.history.length - 1;
  }

  function undo() {
    if (S.hIdx <= 0) return;
    S.hIdx--;
    restoreHistory();
  }
  function redo() {
    if (S.hIdx >= S.history.length - 1) return;
    S.hIdx++;
    restoreHistory();
  }
  function restoreHistory() {
    var code = S.history[S.hIdx];
    var path = S.sel ? pathOf(S.sel) : null;
    mount(code, { silent: true });
    setCode(code, true);
    if (path) select(elAt(path));
    syncHistoryButtons();
    status('Step ' + (S.hIdx + 1) + ' of ' + S.history.length + '.');
  }

  /* Commit an interactive change: DOM is already updated, push it everywhere. */
  function commit(msg) {
    var code = serialize(false);
    setCode(code, true);
    pushHistory(code);
    refreshOverlay();
    buildLayers();
    buildInspector();
    highlightSelectionInCode();
    if (msg) status(msg, 'ok');
  }

  /* ───────────────────────────────────────────────────── selection paths ── */

  function pathOf(node) {
    var p = [], n = node;
    while (n && n !== S.doc && n.parentNode) {
      var i = 0, sib = n.parentNode.firstChild;
      while (sib && sib !== n) { if (sib.nodeType === 1) i++; sib = sib.nextSibling; }
      p.unshift(i);
      n = n.parentNode;
    }
    return n === S.doc ? p : null;
  }

  function elAt(path) {
    if (!path || !S.doc) return null;
    var n = S.doc;
    for (var i = 0; i < path.length; i++) {
      var kids = [], c;
      for (c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) kids.push(c);
      n = kids[path[i]];
      if (!n) return null;
    }
    return n === S.doc ? null : n;
  }

  /* ────────────────────────────────────────────────────────── mount/view ── */

  function mount(code, opts) {
    opts = opts || {};
    var r = parseSource(code);
    if (r.error) {
      status(r.error, 'err');
      return false;
    }
    ensureViewBox(r.svg);
    scopeStyles(r.svg);
    S.sel = null;
    els.paper.innerHTML = '';
    els.paper.appendChild(r.svg);
    S.doc = r.svg;
    /* Something was stripped, so the source the user is looking at no longer
       matches what is rendered. Write the cleaned document back over it rather
       than leave a javascript: URL sitting in the pane waiting to be copied. */
    if (r.stripped) setCode(serialize(false), true);
    layoutPaper();
    buildLayers();
    buildInspector();
    refreshOverlay();
    syncDocFields();
    if (!opts.silent) {
      var bits = [];
      if (r.stripped) bits.push(r.stripped + ' script/handler attribute' + (r.stripped === 1 ? '' : 's') + ' removed');
      if (r.lenient) bits.push('recovered with the lenient parser');
      status(bits.length ? bits.join(' · ') : 'Rendered.', bits.length ? 'warn' : 'ok');
    }
    return true;
  }

  function docSize() {
    var vb = S.doc ? viewBoxOf(S.doc) : null;
    return vb ? { w: vb.w, h: vb.h } : { w: 400, h: 300 };
  }

  function layoutPaper() {
    var d = docSize();
    els.paper.style.width = (d.w * S.zoom) + 'px';
    els.paper.style.height = (d.h * S.zoom) + 'px';
    els.paper.style.transform = 'translate(' + S.panX + 'px,' + S.panY + 'px)';
    if (els.zoomlabel) els.zoomlabel.textContent = Math.round(S.zoom * 100) + '%';
  }

  function setZoom(z, cx, cy) {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (z === S.zoom) return;
    var rect = els.stage.getBoundingClientRect();
    if (cx == null) { cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2; }
    /* keep the point under the cursor pinned while the scale changes */
    var lx = cx - rect.left - S.panX, ly = cy - rect.top - S.panY;
    var k = z / S.zoom;
    S.panX -= lx * (k - 1);
    S.panY -= ly * (k - 1);
    S.zoom = z;
    layoutPaper();
    refreshOverlay();
  }

  function fit() {
    var d = docSize();
    var rect = els.stage.getBoundingClientRect();
    var pad = 32;
    var z = Math.min((rect.width - pad) / d.w, (rect.height - pad) / d.h);
    S.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    S.panX = (rect.width - d.w * S.zoom) / 2;
    S.panY = (rect.height - d.h * S.zoom) / 2;
    layoutPaper();
    refreshOverlay();
  }

  /* Exact user-space <-> screen mapping, so zoom, pan, viewBox and any transform
     on the root are all accounted for without duplicating the maths. */
  function toUser(clientX, clientY) {
    if (!S.doc) return { x: 0, y: 0 };
    var m = S.doc.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = S.doc.createSVGPoint();
    p.x = clientX; p.y = clientY;
    p = p.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function toScreen(ux, uy) {
    var m = S.doc.getScreenCTM();
    var p = S.doc.createSVGPoint();
    p.x = ux; p.y = uy;
    p = p.matrixTransform(m);
    var r = els.stage.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }

  /* Shift-constrain to the angles a technical drawing actually uses. 15 degree
     steps cover 0/30/45/60/90 and their mirrors, so an isometric leader or a
     45 degree hatch line lands exactly rather than nearly. */
  var SNAP_ANGLES = [];
  (function () {
    for (var a = -180; a <= 180; a += 15) SNAP_ANGLES.push(a * Math.PI / 180);
  }());

  function constrainAngle(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-9) return { x: b.x, y: b.y };
    var ang = Math.atan2(dy, dx), best = SNAP_ANGLES[0], bd = Infinity;
    for (var i = 0; i < SNAP_ANGLES.length; i++) {
      var d = Math.abs(Math.atan2(Math.sin(ang - SNAP_ANGLES[i]), Math.cos(ang - SNAP_ANGLES[i])));
      if (d < bd) { bd = d; best = SNAP_ANGLES[i]; }
    }
    return { x: n2(a.x + Math.cos(best) * L), y: n2(a.y + Math.sin(best) * L) };
  }

  function snapPt(p) {
    if (!S.snap) return { x: n2(p.x), y: n2(p.y) };
    var g = S.gridStep || 10;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  /* ────────────────────────────────────────────────────────────── overlay ── */

  function refreshOverlay() {
    var ov = els.overlay;
    if (!ov) return;
    var r = els.stage.getBoundingClientRect();
    ov.setAttribute('width', r.width);
    ov.setAttribute('height', r.height);
    ov.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
    while (ov.firstChild) ov.removeChild(ov.firstChild);

    if (S.grid && S.doc) drawGrid(ov, r);
    if (!S.sel || !S.doc || !S.sel.parentNode) return;

    var b;
    try { b = S.sel.getBBox(); } catch (e) { return; }
    var c1 = toScreen(b.x, b.y), c2 = toScreen(b.x + b.width, b.y + b.height);
    var x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
    var w = Math.abs(c2.x - c1.x), h = Math.abs(c2.y - c1.y);

    ov.appendChild(el('rect', {
      x: x - 1, y: y - 1, width: w + 2, height: h + 2,
      'class': 'svge-selbox', fill: 'none'
    }));

    var pts = handlePoints(x, y, w, h);
    for (var i = 0; i < pts.length; i++) {
      var hp = pts[i];
      var g = el('rect', {
        x: hp.x - HANDLE / 2, y: hp.y - HANDLE / 2, width: HANDLE, height: HANDLE,
        'class': 'svge-handle', 'data-handle': hp.k
      });
      g.style.cursor = hp.cur;
      ov.appendChild(g);
    }
  }

  function handlePoints(x, y, w, h) {
    var t = tag(S.sel);
    if (t === 'line') {
      var x1 = num(S.sel.getAttribute('x1'), 0), y1 = num(S.sel.getAttribute('y1'), 0);
      var x2 = num(S.sel.getAttribute('x2'), 0), y2 = num(S.sel.getAttribute('y2'), 0);
      var a = toScreen(x1, y1), b = toScreen(x2, y2);
      return [{ x: a.x, y: a.y, k: 'p1', cur: 'move' }, { x: b.x, y: b.y, k: 'p2', cur: 'move' }];
    }
    if (t === 'g' && (S.sel.getAttribute('data-kc-arrow') || S.sel.getAttribute('data-kc-jog'))) {
      var ep = linkEnds(S.sel);
      if (ep) {
        var p1 = toScreen(ep.x1, ep.y1), p2 = toScreen(ep.x2, ep.y2);
        return [{ x: p1.x, y: p1.y, k: 'a1', cur: 'move' }, { x: p2.x, y: p2.y, k: 'a2', cur: 'move' }];
      }
    }
    if (t === 'rect' || t === 'ellipse' || t === 'circle' || t === 'image') {
      return [
        { x: x, y: y, k: 'nw', cur: 'nwse-resize' },
        { x: x + w, y: y, k: 'ne', cur: 'nesw-resize' },
        { x: x, y: y + h, k: 'sw', cur: 'nesw-resize' },
        { x: x + w, y: y + h, k: 'se', cur: 'nwse-resize' }
      ];
    }
    return [];
  }

  function drawGrid(ov, r) {
    var step = (S.gridStep || 10) * S.zoom;
    if (step < 4) return;
    var g = el('g', { 'class': 'svge-grid' });
    var ox = S.panX % step, oy = S.panY % step;
    for (var x = ox; x < r.width; x += step) g.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: r.height }));
    for (var y = oy; y < r.height; y += step) g.appendChild(el('line', { x1: 0, y1: y, x2: r.width, y2: y }));
    ov.appendChild(g);
  }

  /* ─────────────────────────────────────────────────────────────── arrows ── */

  var ARROWS = [
    { k: 'solid', label: 'Solid head' },
    { k: 'open', label: 'Open head' },
    { k: 'barb', label: 'Swept barb' },
    { k: 'double', label: 'Double head' },
    { k: 'dim', label: 'Dimension' },
    { k: 'leader', label: 'Leader' }
  ];

  function arrowEnds(g) {
    var s = g.getAttribute('data-kc-arrow-pts');
    if (!s) return null;
    var v = s.split(/[\s,]+/).map(parseFloat);
    if (v.length !== 4 || !v.every(isFinite)) return null;
    return { x1: v[0], y1: v[1], x2: v[2], y2: v[3] };
  }

  /* Arrows are emitted as a self-contained <g> of plain shapes rather than a
     marker in <defs>, so the exported snippet can be pasted into any document
     without carrying id references or colliding with existing marker names. */
  function buildArrow(g, x1, y1, x2, y2, kind, st) {
    while (g.firstChild) g.removeChild(g.firstChild);
    g.setAttribute('data-kc-arrow', kind);
    g.setAttribute('data-kc-arrow-pts', [n2(x1), n2(y1), n2(x2), n2(y2)].join(' '));

    var sw = st.strokeWidth || 2;
    var dx = x2 - x1, dy = y2 - y1;
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L;
    var nx = -uy, ny = ux;
    var HL = Math.max(7, sw * 4.2 + 3);        /* head length */
    var HW = Math.max(2.6, sw * 1.9 + 1.1);    /* head half-width */

    var lineAttrs = {
      stroke: st.stroke, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'butt'
    };
    if (st.dash && st.dash !== 'none') lineAttrs['stroke-dasharray'] = st.dash;

    function head(tipX, tipY, sx, sy) {   /* sx,sy = unit vector pointing INTO the tip */
      var bx = tipX - sx * HL, by = tipY - sy * HL;
      var px = -sy, py = sx;
      if (kind === 'open') {
        var o = el('path', {
          d: 'M ' + n2(bx + px * HW) + ' ' + n2(by + py * HW) +
             ' L ' + n2(tipX) + ' ' + n2(tipY) +
             ' L ' + n2(bx - px * HW) + ' ' + n2(by - py * HW),
          fill: 'none', stroke: st.stroke, 'stroke-width': sw,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        });
        return o;
      }
      if (kind === 'barb') {
        var notch = 0.55 * HL;
        return el('path', {
          d: 'M ' + n2(tipX) + ' ' + n2(tipY) +
             ' L ' + n2(bx + px * HW) + ' ' + n2(by + py * HW) +
             ' L ' + n2(tipX - sx * notch) + ' ' + n2(tipY - sy * notch) +
             ' L ' + n2(bx - px * HW) + ' ' + n2(by - py * HW) + ' Z',
          fill: st.stroke, stroke: 'none'
        });
      }
      return el('polygon', {
        points: [n2(tipX) + ',' + n2(tipY),
                 n2(bx + px * HW) + ',' + n2(by + py * HW),
                 n2(bx - px * HW) + ',' + n2(by - py * HW)].join(' '),
        fill: st.stroke, stroke: 'none'
      });
    }

    if (kind === 'leader') {
      /* horizontal landing on the tail side, then a straight run to the tip */
      var land = Math.max(18, HL * 1.6) * (x2 >= x1 ? -1 : 1);
      var kx = x1 - land, ky = y1;
      var poly = el('polyline', lineAttrs);
      var tipBackX = x2 - ux * HL, tipBackY = y2 - uy * HL;
      poly.setAttribute('points', [n2(x1) + ',' + n2(y1), n2(kx) + ',' + n2(ky)].join(' '));
      var run = el('line', lineAttrs);
      run.setAttribute('x1', n2(kx)); run.setAttribute('y1', n2(ky));
      var rdx = x2 - kx, rdy = y2 - ky, rl = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      var rux = rdx / rl, ruy = rdy / rl;
      run.setAttribute('x2', n2(x2 - rux * HL)); run.setAttribute('y2', n2(y2 - ruy * HL));
      g.appendChild(poly); g.appendChild(run);
      g.appendChild(head(x2, y2, rux, ruy));
      return g;
    }

    var shaftA = { x: x1, y: y1 }, shaftB = { x: x2, y: y2 };
    if (kind !== 'open') shaftB = { x: x2 - ux * HL * 0.92, y: y2 - uy * HL * 0.92 };
    if (kind === 'double' || kind === 'dim') shaftA = { x: x1 + ux * HL * 0.92, y: y1 + uy * HL * 0.92 };

    if (kind === 'dim') {
      lineAttrs['stroke-width'] = Math.max(0.8, sw * 0.7);
      var tick = Math.max(5, HW * 1.6);
      g.appendChild(el('line', {
        x1: n2(x1 + nx * tick), y1: n2(y1 + ny * tick),
        x2: n2(x1 - nx * tick), y2: n2(y1 - ny * tick),
        stroke: st.stroke, 'stroke-width': lineAttrs['stroke-width']
      }));
      g.appendChild(el('line', {
        x1: n2(x2 + nx * tick), y1: n2(y2 + ny * tick),
        x2: n2(x2 - nx * tick), y2: n2(y2 - ny * tick),
        stroke: st.stroke, 'stroke-width': lineAttrs['stroke-width']
      }));
    }

    var shaft = el('line', lineAttrs);
    shaft.setAttribute('x1', n2(shaftA.x)); shaft.setAttribute('y1', n2(shaftA.y));
    shaft.setAttribute('x2', n2(shaftB.x)); shaft.setAttribute('y2', n2(shaftB.y));
    g.appendChild(shaft);

    g.appendChild(head(x2, y2, ux, uy));
    if (kind === 'double' || kind === 'dim') g.appendChild(head(x1, y1, -ux, -uy));
    return g;
  }

  /* ───────────────────────────────────────────────────────── move / geometry ── */

  /* -------------------------------------------------------- jogged lines -- */

  var JOGS = [
    { k: 'elbowH', label: 'Elbow, across first' },
    { k: 'elbowV', label: 'Elbow, down first' },
    { k: 'stepH', label: 'Z-step, across' },
    { k: 'stepV', label: 'Z-step, down' },
    { k: 'zigzag', label: 'Zigzag (jogged dimension)' }
  ];

  /* A jog is a polyline with a fixed shape between two dragged endpoints, kept
     as plain geometry (no markers, no path shorthand) so the exported snippet
     stays readable and every vertex is visible in the code. */
  function buildJog(g, x1, y1, x2, y2, kind, head, st) {
    while (g.firstChild) g.removeChild(g.firstChild);
    g.setAttribute('data-kc-jog', kind);
    g.setAttribute('data-kc-jog-pts', [n2(x1), n2(y1), n2(x2), n2(y2)].join(' '));
    g.setAttribute('data-kc-jog-head', head ? '1' : '0');

    var sw = st.strokeWidth || 2;
    var pts = [];

    if (kind === 'elbowH') pts = [[x1, y1], [x2, y1], [x2, y2]];
    else if (kind === 'elbowV') pts = [[x1, y1], [x1, y2], [x2, y2]];
    else if (kind === 'stepH') {
      var mx = (x1 + x2) / 2;
      pts = [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
    } else if (kind === 'stepV') {
      var my = (y1 + y2) / 2;
      pts = [[x1, y1], [x1, my], [x2, my], [x2, y2]];
    } else {
      /* zigzag: a straight run with the standard jog symbol at its midpoint */
      var dx = x2 - x1, dy = y2 - y1;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      var Z = Math.max(5, sw * 3);
      var mxx = (x1 + x2) / 2, myy = (y1 + y2) / 2;
      pts = [
        [x1, y1],
        [mxx - ux * Z, myy - uy * Z],
        [mxx - ux * Z * 0.34 + nx * Z * 0.75, myy - uy * Z * 0.34 + ny * Z * 0.75],
        [mxx + ux * Z * 0.34 - nx * Z * 0.75, myy + uy * Z * 0.34 - ny * Z * 0.75],
        [mxx + ux * Z, myy + uy * Z],
        [x2, y2]
      ];
    }

    var lastA = pts[pts.length - 2], lastB = pts[pts.length - 1];
    var HL = 0;
    if (head) {
      var hdx = lastB[0] - lastA[0], hdy = lastB[1] - lastA[1];
      var hl = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
      var hux = hdx / hl, huy = hdy / hl;
      HL = Math.max(7, sw * 4.2 + 3);
      var HW = Math.max(2.6, sw * 1.9 + 1.1);
      var bx = lastB[0] - hux * HL, by = lastB[1] - huy * HL;
      var px = -huy, py = hux;
      g.appendChild(el('polygon', {
        points: [n2(lastB[0]) + ',' + n2(lastB[1]),
                 n2(bx + px * HW) + ',' + n2(by + py * HW),
                 n2(bx - px * HW) + ',' + n2(by - py * HW)].join(' '),
        fill: st.stroke, stroke: 'none'
      }));
      /* pull the shaft back so a light-coloured head is not pierced by it */
      pts[pts.length - 1] = [lastB[0] - hux * HL * 0.92, lastB[1] - huy * HL * 0.92];
    }

    var attrs = {
      points: pts.map(function (p) { return n2(p[0]) + ',' + n2(p[1]); }).join(' '),
      fill: 'none', stroke: st.stroke, 'stroke-width': sw,
      'stroke-linejoin': 'miter', 'stroke-linecap': 'butt'
    };
    if (st.dash && st.dash !== 'none') attrs['stroke-dasharray'] = st.dash;
    g.insertBefore(el('polyline', attrs), g.firstChild);
    return g;
  }

  function jogEnds(g) {
    var v = (g.getAttribute('data-kc-jog-pts') || '').split(/[\s,]+/).map(parseFloat);
    if (v.length !== 4 || !v.every(isFinite)) return null;
    return { x1: v[0], y1: v[1], x2: v[2], y2: v[3] };
  }

  /* Arrows and jogs are both two-endpoint objects; the handle and drag code
     treats them the same way through this one accessor. */
  function linkEnds(g) {
    if (!g || !g.getAttribute) return null;
    if (g.getAttribute('data-kc-arrow-pts')) return arrowEnds(g);
    if (g.getAttribute('data-kc-jog-pts')) return jogEnds(g);
    return null;
  }

  function rebuildLink(g, e) {
    if (g.getAttribute('data-kc-arrow')) {
      buildArrow(g, e.x1, e.y1, e.x2, e.y2, g.getAttribute('data-kc-arrow'), styleOf(g));
    } else {
      buildJog(g, e.x1, e.y1, e.x2, e.y2, g.getAttribute('data-kc-jog'),
               g.getAttribute('data-kc-jog-head') === '1', styleOf(g));
    }
  }

  /* Translating the geometry attributes keeps the exported code readable; a
     wrapper transform is only used where the attributes cannot express it. */
  function translateEl(node, dx, dy) {
    var t = tag(node), i;
    function bump(a, d) {
      var v = node.getAttribute(a);
      if (v == null || v === '') return false;
      node.setAttribute(a, n2(num(v, 0) + d));
      return true;
    }
    if (t === 'line') { bump('x1', dx); bump('x2', dx); bump('y1', dy); bump('y2', dy); return; }
    if (t === 'rect' || t === 'image' || t === 'use' || t === 'foreignobject') {
      if (!bump('x', dx)) node.setAttribute('x', n2(dx));
      if (!bump('y', dy)) node.setAttribute('y', n2(dy));
      return;
    }
    if (t === 'circle' || t === 'ellipse') { bump('cx', dx); bump('cy', dy); return; }
    if (t === 'text' || t === 'tspan') {
      if (!bump('x', dx)) node.setAttribute('x', n2(dx));
      if (!bump('y', dy)) node.setAttribute('y', n2(dy));
      for (i = 0; i < node.children.length; i++) {
        if (tag(node.children[i]) === 'tspan') translateEl(node.children[i], dx, dy);
      }
      return;
    }
    if (t === 'polygon' || t === 'polyline') {
      var pts = (node.getAttribute('points') || '').trim().split(/\s+/).map(function (pr) {
        var c = pr.split(',');
        if (c.length !== 2) return pr;
        return n2(num(c[0], 0) + dx) + ',' + n2(num(c[1], 0) + dy);
      });
      node.setAttribute('points', pts.join(' '));
      return;
    }
    if (t === 'path') {
      var d = translatePath(node.getAttribute('d'), dx, dy);
      if (d != null) { node.setAttribute('d', d); return; }
    }
    if (t === 'g') {
      var moved = false;
      for (i = 0; i < node.children.length; i++) { translateEl(node.children[i], dx, dy); moved = true; }
      var stored = node.getAttribute('data-kc-arrow-pts') ? 'data-kc-arrow-pts'
                 : (node.getAttribute('data-kc-jog-pts') ? 'data-kc-jog-pts' : null);
      if (stored) {
        var e = linkEnds(node);
        if (e) node.setAttribute(stored,
          [n2(e.x1 + dx), n2(e.y1 + dy), n2(e.x2 + dx), n2(e.y2 + dy)].join(' '));
      }
      if (moved) return;
    }
    /* last resort: prepend a translate to whatever transform is already there */
    var tr = (node.getAttribute('transform') || '').trim();
    var m = tr.match(/^translate\(\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)\s*\)\s*(.*)$/);
    if (m) node.setAttribute('transform', 'translate(' + n2(parseFloat(m[1]) + dx) + ',' + n2(parseFloat(m[2]) + dy) + ')' + (m[3] ? ' ' + m[3] : ''));
    else node.setAttribute('transform', ('translate(' + n2(dx) + ',' + n2(dy) + ') ' + tr).trim());
  }

  /* Absolute commands get offset; relative ones are already relative, so only a
     leading relative moveto (which the spec treats as absolute) needs adjusting. */
  var PATH_ARGC = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  function translatePath(d, dx, dy) {
    if (!d) return null;
    try {
      var toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      if (!toks) return null;
      var out = [], i = 0, cmd = null, first = true;
      while (i < toks.length) {
        if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i]; out.push(cmd); i++; if (cmd.toLowerCase() === 'z') { first = false; continue; } }
        if (!cmd) return null;
        var lc = cmd.toLowerCase();
        var argc = PATH_ARGC[lc];
        if (argc == null) return null;
        if (argc === 0) continue;
        var abs = cmd === cmd.toUpperCase() || first;
        var args = [];
        for (var j = 0; j < argc; j++) { args.push(parseFloat(toks[i])); i++; }
        if (args.some(function (v) { return !isFinite(v); })) return null;
        if (abs) {
          if (lc === 'h') args[0] += dx;
          else if (lc === 'v') args[0] += dy;
          else if (lc === 'a') { args[5] += dx; args[6] += dy; }
          else for (var k = 0; k < argc; k += 2) { args[k] += dx; args[k + 1] += dy; }
        }
        for (var q = 0; q < args.length; q++) out.push(n2(args[q]));
        first = false;
      }
      return out.join(' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return null; }
  }

  function resizeEl(node, k, p) {
    var t = tag(node);
    var b;
    try { b = node.getBBox(); } catch (e) { return; }
    var x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
    if (k === 'nw') { x0 = p.x; y0 = p.y; }
    if (k === 'ne') { x1 = p.x; y0 = p.y; }
    if (k === 'sw') { x0 = p.x; y1 = p.y; }
    if (k === 'se') { x1 = p.x; y1 = p.y; }
    var nx = Math.min(x0, x1), ny = Math.min(y0, y1);
    var nw = Math.abs(x1 - x0), nh = Math.abs(y1 - y0);
    if (t === 'rect' || t === 'image') {
      node.setAttribute('x', n2(nx)); node.setAttribute('y', n2(ny));
      node.setAttribute('width', n2(Math.max(1, nw))); node.setAttribute('height', n2(Math.max(1, nh)));
    } else if (t === 'ellipse') {
      node.setAttribute('cx', n2(nx + nw / 2)); node.setAttribute('cy', n2(ny + nh / 2));
      node.setAttribute('rx', n2(Math.max(0.5, nw / 2))); node.setAttribute('ry', n2(Math.max(0.5, nh / 2)));
    } else if (t === 'circle') {
      node.setAttribute('cx', n2(nx + nw / 2)); node.setAttribute('cy', n2(ny + nh / 2));
      node.setAttribute('r', n2(Math.max(0.5, Math.min(nw, nh) / 2)));
    }
  }

  /* ─────────────────────────────────────────────────────────── selection ── */

  function select(node) {
    if (S.sel) S.sel.removeAttribute('data-kc-sel');
    S.sel = (node && node !== S.doc && node.parentNode) ? node : null;
    if (S.sel) S.sel.setAttribute('data-kc-sel', '1');
    refreshOverlay();
    buildInspector();
    markLayerRow();
    highlightSelectionInCode();
  }

  /* Click picks the outermost group so annotations move as a unit; Alt drills
     down to the exact leaf for surgery on an imported drawing. */
  function pickAt(clientX, clientY, deep) {
    if (!S.doc) return null;
    var prev = els.overlay.style.pointerEvents;
    els.overlay.style.pointerEvents = 'none';
    var hit = document.elementFromPoint(clientX, clientY);
    els.overlay.style.pointerEvents = prev;
    if (hit && S.doc.contains(hit) && hit !== S.doc) {
      if (deep) return hit;
      var n = hit;
      while (n.parentNode && n.parentNode !== S.doc) n = n.parentNode;
      return n;
    }
    /* nothing painted under the cursor: fall back to the nearest bounding box so
       hairlines and unfilled shapes are still reachable */
    var p = toUser(clientX, clientY);
    var best = null, bestA = Infinity;
    var kids = S.doc.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i];
      if (tag(e) === 'defs' || tag(e) === 'style' || tag(e) === 'title' || tag(e) === 'desc') continue;
      if (e.closest && e.closest('defs')) continue;
      var b;
      try { b = e.getBBox(); } catch (err) { continue; }
      var pad = 3 / S.zoom;
      if (p.x < b.x - pad || p.x > b.x + b.width + pad) continue;
      if (p.y < b.y - pad || p.y > b.y + b.height + pad) continue;
      var a = (b.width + 2 * pad) * (b.height + 2 * pad);
      if (a < bestA) { bestA = a; best = e; }
    }
    if (best && !deep) { while (best.parentNode && best.parentNode !== S.doc) best = best.parentNode; }
    return best;
  }

  /* ──────────────────────────────────────────────────────── shape factory ── */

  function styleAttrs(kind) {
    var st = S.style, a = {};
    if (kind === 'text') {
      a.fill = st.textFill;
      a['font-size'] = st.fontSize;
      if (st.fontFamily && st.fontFamily !== 'inherit') a['font-family'] = st.fontFamily;
      if (st.fontWeight && st.fontWeight !== 'normal') a['font-weight'] = st.fontWeight;
      if (st.textAnchor && st.textAnchor !== 'start') a['text-anchor'] = st.textAnchor;
      return a;
    }
    a.fill = st.fill;
    a.stroke = st.stroke;
    a['stroke-width'] = st.strokeWidth;
    if (st.dash && st.dash !== 'none') a['stroke-dasharray'] = st.dash;
    if (st.opacity != null && st.opacity !== 1) a.opacity = st.opacity;
    return a;
  }

  function startDraft(kind, p) {
    var node;
    if (kind === 'arrow' || kind === 'dimension') {
      node = el('g', {});
      buildArrow(node, p.x, p.y, p.x + 1, p.y, kind === 'dimension' ? 'dim' : S.arrowStyle, S.style);
    } else if (kind === 'jog') {
      node = el('g', {});
      buildJog(node, p.x, p.y, p.x + 1, p.y, S.jogStyle, S.jogHead, S.style);
    } else if (kind === 'line') {
      node = el('line', styleAttrs('shape'));
      node.setAttribute('fill', 'none');
      node.setAttribute('x1', p.x); node.setAttribute('y1', p.y);
      node.setAttribute('x2', p.x); node.setAttribute('y2', p.y);
    } else if (kind === 'rect') {
      node = el('rect', styleAttrs('shape'));
      node.setAttribute('x', p.x); node.setAttribute('y', p.y);
      node.setAttribute('width', 1); node.setAttribute('height', 1);
    } else if (kind === 'ellipse') {
      node = el('ellipse', styleAttrs('shape'));
      node.setAttribute('cx', p.x); node.setAttribute('cy', p.y);
      node.setAttribute('rx', 1); node.setAttribute('ry', 1);
    }
    if (node) S.doc.appendChild(node);
    return node;
  }

  function updateDraft(kind, node, a, b, ev) {
    if (kind === 'arrow' || kind === 'dimension') {
      var e2 = (ev && ev.shiftKey) ? constrainAngle(a, b) : b;
      buildArrow(node, a.x, a.y, n2(e2.x), n2(e2.y), kind === 'dimension' ? 'dim' : S.arrowStyle, S.style);
      return;
    }
    if (kind === 'jog') {
      buildJog(node, a.x, a.y, n2(b.x), n2(b.y), S.jogStyle, S.jogHead, S.style);
      return;
    }
    if (kind === 'line') {
      var l2 = (ev && ev.shiftKey) ? constrainAngle(a, b) : b;
      node.setAttribute('x2', n2(l2.x)); node.setAttribute('y2', n2(l2.y));
      return;
    }
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (ev && ev.shiftKey) { w = h = Math.max(w, h); }
    if (kind === 'rect') {
      node.setAttribute('x', n2(x)); node.setAttribute('y', n2(y));
      node.setAttribute('width', n2(Math.max(1, w))); node.setAttribute('height', n2(Math.max(1, h)));
    } else if (kind === 'ellipse') {
      node.setAttribute('cx', n2(x + w / 2)); node.setAttribute('cy', n2(y + h / 2));
      node.setAttribute('rx', n2(Math.max(0.5, w / 2))); node.setAttribute('ry', n2(Math.max(0.5, h / 2)));
    }
  }

  function addText(p) {
    var t = el('text', styleAttrs('text'));
    t.setAttribute('x', n2(p.x));
    t.setAttribute('y', n2(p.y));
    t.textContent = 'Text';
    S.doc.appendChild(t);
    select(t);
    commit('Text added.');
    editTextInline(t);
  }

  function editTextInline(node) {
    if (tag(node) !== 'text') return;
    var b;
    try { b = node.getBBox(); } catch (e) { return; }
    var c = toScreen(b.x, b.y);
    var inp = document.createElement('textarea');
    inp.className = 'svge-inline-edit';
    inp.value = textContentOf(node);
    inp.style.left = Math.max(2, c.x) + 'px';
    inp.style.top = Math.max(2, c.y - 4) + 'px';
    els.stage.appendChild(inp);
    inp.focus();
    inp.select();
    function done(keep) {
      if (!inp.parentNode) return;
      var v = inp.value;
      inp.parentNode.removeChild(inp);
      if (keep) { setTextContent(node, v); commit('Text updated.'); }
    }
    inp.addEventListener('blur', function () { done(true); });
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); }
    });
  }

  function textContentOf(node) {
    var parts = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3) { if (c.nodeValue.trim()) parts.push(c.nodeValue.trim()); }
      else if (tag(c) === 'tspan') parts.push(c.textContent);
    }
    return parts.join('\n');
  }

  /* Multi-line text becomes tspans with a line-height dy, which is the only way
     SVG wraps at all. */
  function setTextContent(node, v) {
    while (node.firstChild) node.removeChild(node.firstChild);
    var lines = String(v).split(/\r?\n/);
    if (lines.length <= 1) { node.textContent = lines[0] || ''; return; }
    var x = node.getAttribute('x') || 0;
    var lh = num(node.getAttribute('font-size'), S.style.fontSize) * 1.25;
    for (var i = 0; i < lines.length; i++) {
      var ts = el('tspan', { x: x, dy: i === 0 ? 0 : n2(lh) });
      ts.textContent = lines[i];
      node.appendChild(ts);
    }
  }

  /* ────────────────────────────────────────────────────────── pointer flow ── */

  function onPointerDown(e) {
    if (!S.doc) return;
    if (e.button === 1 || S.tool === 'pan' || (e.button === 0 && e.altKey && e.shiftKey)) {
      S.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, px: S.panX, py: S.panY };
      els.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    var handle = e.target && e.target.getAttribute && e.target.getAttribute('data-handle');
    if (handle && S.sel) {
      S.drag = { mode: 'handle', k: handle, node: S.sel };
      els.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    var p = snapPt(toUser(e.clientX, e.clientY));

    if (S.tool === 'select') {
      var hit = pickAt(e.clientX, e.clientY, e.altKey);
      select(hit);
      if (hit) {
        S.drag = { mode: 'move', node: hit, last: p, moved: false };
        els.stage.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      return;
    }
    if (S.tool === 'text') { addText(p); setTool('select'); e.preventDefault(); return; }

    var node = startDraft(S.tool, p);
    if (node) {
      S.drag = { mode: 'draft', kind: S.tool, node: node, a: p };
      select(node);
      els.stage.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!S.doc) return;
    if (!S.drag) {
      var p0 = toUser(e.clientX, e.clientY);
      if (els.coords) els.coords.textContent = n2(p0.x) + ', ' + n2(p0.y);
      return;
    }
    var d = S.drag;
    if (d.mode === 'pan') {
      S.panX = d.px + (e.clientX - d.sx);
      S.panY = d.py + (e.clientY - d.sy);
      layoutPaper();
      refreshOverlay();
      return;
    }
    var p = snapPt(toUser(e.clientX, e.clientY));
    if (d.mode === 'move') {
      var dx = p.x - d.last.x, dy = p.y - d.last.y;
      if (dx || dy) { translateEl(d.node, dx, dy); d.last = p; d.moved = true; refreshOverlay(); }
      return;
    }
    if (d.mode === 'draft') { updateDraft(d.kind, d.node, d.a, p, e); refreshOverlay(); return; }
    if (d.mode === 'handle') {
      var t = tag(d.node);
      if (d.k === 'p1') { d.node.setAttribute('x1', n2(p.x)); d.node.setAttribute('y1', n2(p.y)); }
      else if (d.k === 'p2') { d.node.setAttribute('x2', n2(p.x)); d.node.setAttribute('y2', n2(p.y)); }
      else if (d.k === 'a1' || d.k === 'a2') {
        var en = linkEnds(d.node);
        if (en) {
          var moved = { x: p.x, y: p.y };
          if (e.shiftKey) {
            moved = constrainAngle(d.k === 'a1' ? { x: en.x2, y: en.y2 } : { x: en.x1, y: en.y1 }, p);
          }
          if (d.k === 'a1') { en.x1 = moved.x; en.y1 = moved.y; }
          else { en.x2 = moved.x; en.y2 = moved.y; }
          rebuildLink(d.node, en);
        }
      } else resizeEl(d.node, d.k, p);
      refreshOverlay();
      return;
    }
  }

  function onPointerUp(e) {
    if (!S.drag) return;
    var d = S.drag;
    S.drag = null;
    try { els.stage.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    if (d.mode === 'pan') return;
    if (d.mode === 'draft') {
      /* a click with no drag leaves a degenerate shape behind */
      var b = null;
      try { b = d.node.getBBox(); } catch (err2) { /* ignore */ }
      if (b && b.width < 1.5 && b.height < 1.5) {
        d.node.parentNode.removeChild(d.node);
        select(null);
        refreshOverlay();
        return;
      }
      setTool('select');
      commit('Added ‹' + tag(d.node) + '›.');
      return;
    }
    if (d.mode === 'move' && !d.moved) return;
    commit(d.mode === 'handle' ? 'Reshaped.' : 'Moved.');
  }

  /* Read back the effective style of an existing arrow so reshaping it keeps its
     own colour and weight rather than adopting the current toolbar setting. */
  function styleOf(g) {
    var line = g.querySelector('line, polyline');
    if (g.getAttribute('data-kc-jog')) {
      var pl = g.querySelector('polyline');
      var hd = g.querySelector('polygon');
      return {
        stroke: (pl && pl.getAttribute('stroke')) || (hd && hd.getAttribute('fill')) || S.style.stroke,
        strokeWidth: num(pl && pl.getAttribute('stroke-width'), S.style.strokeWidth),
        dash: (pl && pl.getAttribute('stroke-dasharray')) || 'none'
      };
    }
    var head = g.querySelector('polygon, path');
    var src = line || head;
    return {
      stroke: (head && head.getAttribute('fill') && head.getAttribute('fill') !== 'none')
        ? head.getAttribute('fill')
        : (src && src.getAttribute('stroke')) || S.style.stroke,
      strokeWidth: num(src && src.getAttribute('stroke-width'), S.style.strokeWidth),
      dash: (src && src.getAttribute('stroke-dasharray')) || 'none'
    };
  }

  /* ───────────────────────────────────────────────────────────── inspector ── */

  var COMMON_ROWS = [
    { a: 'stroke', label: 'Stroke', type: 'color' },
    { a: 'fill', label: 'Fill', type: 'color' },
    { a: 'stroke-width', label: 'Stroke width', type: 'number', step: 0.1, min: 0 },
    { a: 'stroke-dasharray', label: 'Dash', type: 'dash' },
    { a: 'opacity', label: 'Opacity', type: 'number', step: 0.05, min: 0, max: 1 }
  ];
  var GEOM = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    image: ['x', 'y', 'width', 'height'],
    text: ['x', 'y', 'dx', 'dy', 'font-size', 'letter-spacing']
  };
  var DASHES = [['none', 'Solid'], ['4 3', 'Dashed'], ['1 3', 'Dotted'], ['8 4', 'Long dash'],
                ['8 3 2 3', 'Dash-dot'], ['12 4 2 4', 'Centre line']];

  function row(label, control) {
    var d = document.createElement('div');
    d.className = 'svge-row';
    var l = document.createElement('label');
    l.textContent = label;
    d.appendChild(l);
    d.appendChild(control);
    return d;
  }

  function attrInput(node, attr, type, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'svge-ctl';
    var cur = node.getAttribute(attr);

    if (type === 'color') {
      var isNone = !cur || cur === 'none' || cur === 'transparent';
      var sw = document.createElement('input');
      sw.type = 'color';
      sw.value = toHex(cur) || (attr === 'fill' ? '#000000' : '#c0392b');
      sw.disabled = isNone;
      var txt = document.createElement('input');
      txt.type = 'text';
      txt.className = 'svge-colortext';
      txt.value = cur == null ? '' : cur;
      txt.placeholder = 'inherit';
      var none = document.createElement('label');
      none.className = 'svge-none';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isNone;
      none.appendChild(cb);
      none.appendChild(document.createTextNode('none'));
      sw.addEventListener('input', function () { txt.value = sw.value; node.setAttribute(attr, sw.value); refreshOverlay(); });
      sw.addEventListener('change', function () { commit(); });
      txt.addEventListener('change', function () {
        if (txt.value === '') node.removeAttribute(attr); else node.setAttribute(attr, txt.value);
        cb.checked = txt.value === 'none';
        commit();
      });
      cb.addEventListener('change', function () {
        if (cb.checked) { node.setAttribute(attr, 'none'); txt.value = 'none'; sw.disabled = true; }
        else { node.setAttribute(attr, sw.value); txt.value = sw.value; sw.disabled = false; }
        commit();
      });
      wrap.appendChild(sw); wrap.appendChild(txt); wrap.appendChild(none);
      return wrap;
    }

    if (type === 'dash') {
      var sel = document.createElement('select');
      var found = false;
      DASHES.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d[0]; o.textContent = d[1];
        if ((cur || 'none') === d[0]) { o.selected = true; found = true; }
        sel.appendChild(o);
      });
      if (!found && cur) {
        var o2 = document.createElement('option');
        o2.value = cur; o2.textContent = cur; o2.selected = true;
        sel.appendChild(o2);
      }
      sel.addEventListener('change', function () {
        if (sel.value === 'none') node.removeAttribute(attr); else node.setAttribute(attr, sel.value);
        commit();
      });
      wrap.appendChild(sel);
      return wrap;
    }

    var inp = document.createElement('input');
    inp.type = type === 'number' ? 'number' : 'text';
    if (opts.step) inp.step = opts.step;
    if (opts.min != null) inp.min = opts.min;
    if (opts.max != null) inp.max = opts.max;
    inp.value = cur == null ? '' : cur;
    inp.addEventListener('change', function () {
      if (inp.value === '') node.removeAttribute(attr); else node.setAttribute(attr, inp.value);
      commit();
    });
    wrap.appendChild(inp);
    return wrap;
  }

  function toHex(c) {
    if (!c) return null;
    c = String(c).trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
    var m = c.match(/^rgba?\(([^)]+)\)/i);
    if (m) {
      var v = m[1].split(',').map(function (x) { return parseInt(x, 10); });
      if (v.length >= 3) return '#' + v.slice(0, 3).map(function (x) {
        return clamp(x, 0, 255).toString(16).padStart(2, '0');
      }).join('');
    }
    var probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = c;
    if (!probe.style.color) return null;
    document.body.appendChild(probe);
    var comp = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    return toHex(comp);
  }

  function buildInspector() {
    var box = els.inspector;
    if (!box) return;
    box.innerHTML = '';
    if (!S.sel) {
      var e = document.createElement('div');
      e.className = 'svge-empty';
      e.textContent = 'Nothing selected. Click a shape on the canvas, or pick one from the element list.';
      box.appendChild(e);
      return;
    }
    var node = S.sel, t = tag(node);

    var head = document.createElement('div');
    head.className = 'svge-insp-head';
    head.innerHTML = '<span class="svge-tagname">&lt;' + esc(node.nodeName) + '&gt;</span>';
    if (node.getAttribute('data-kc-arrow')) {
      head.innerHTML += ' <span class="svge-badge">' + esc(node.getAttribute('data-kc-arrow')) + ' arrow</span>';
    }
    box.appendChild(head);

    /* actions */
    var act = document.createElement('div');
    act.className = 'svge-actions';
    [['Duplicate', dupSel], ['Delete', delSel], ['Front', function () { zOrder('front'); }],
     ['Back', function () { zOrder('back'); }], ['Fwd', function () { zOrder('fwd'); }],
     ['Bwd', function () { zOrder('bwd'); }]].forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a[0];
      b.addEventListener('click', a[1]);
      act.appendChild(b);
    });
    box.appendChild(act);

    box.appendChild(row('id', attrInput(node, 'id', 'text')));
    box.appendChild(row('class', attrInput(node, 'class', 'text')));

    if (t === 'text') {
      var ta = document.createElement('textarea');
      ta.className = 'svge-textcontent';
      ta.rows = 2;
      ta.value = textContentOf(node);
      ta.addEventListener('change', function () { setTextContent(node, ta.value); commit('Text updated.'); });
      box.appendChild(row('Content', ta));

      box.appendChild(row('Fill', attrInput(node, 'fill', 'color')));
      box.appendChild(row('Font size', attrInput(node, 'font-size', 'number', { step: 0.5, min: 1 })));
      box.appendChild(row('Font family', attrInput(node, 'font-family', 'text')));
      var fw = document.createElement('select');
      ['', 'normal', '300', '400', '500', '600', 'bold'].forEach(function (v) {
        var o = document.createElement('option');
        o.value = v; o.textContent = v || '(inherit)';
        if ((node.getAttribute('font-weight') || '') === v) o.selected = true;
        fw.appendChild(o);
      });
      fw.addEventListener('change', function () {
        if (!fw.value) node.removeAttribute('font-weight'); else node.setAttribute('font-weight', fw.value);
        commit();
      });
      box.appendChild(row('Weight', fw));
      var an = document.createElement('select');
      ['', 'start', 'middle', 'end'].forEach(function (v) {
        var o = document.createElement('option');
        o.value = v; o.textContent = v || '(inherit)';
        if ((node.getAttribute('text-anchor') || '') === v) o.selected = true;
        an.appendChild(o);
      });
      an.addEventListener('change', function () {
        if (!an.value) node.removeAttribute('text-anchor'); else node.setAttribute('text-anchor', an.value);
        commit();
      });
      box.appendChild(row('Anchor', an));
    } else {
      COMMON_ROWS.forEach(function (r) {
        box.appendChild(row(r.label, attrInput(node, r.a, r.type, r)));
      });
    }

    if (node.getAttribute('data-kc-arrow')) {
      var asel = document.createElement('select');
      ARROWS.forEach(function (a) {
        var o = document.createElement('option');
        o.value = a.k; o.textContent = a.label;
        if (node.getAttribute('data-kc-arrow') === a.k) o.selected = true;
        asel.appendChild(o);
      });
      asel.addEventListener('change', function () {
        var en = arrowEnds(node);
        if (en) { buildArrow(node, en.x1, en.y1, en.x2, en.y2, asel.value, styleOf(node)); commit('Arrow restyled.'); }
      });
      box.appendChild(row('Arrow style', asel));
      var st = styleOf(node);
      var ac = document.createElement('input');
      ac.type = 'color';
      ac.value = toHex(st.stroke) || '#c0392b';
      ac.addEventListener('change', function () {
        var en = arrowEnds(node);
        if (en) {
          buildArrow(node, en.x1, en.y1, en.x2, en.y2,
            node.getAttribute('data-kc-arrow'), { stroke: ac.value, strokeWidth: st.strokeWidth, dash: st.dash });
          commit('Arrow recoloured.');
        }
      });
      box.appendChild(row('Arrow colour', ac));
      var aw = document.createElement('input');
      aw.type = 'number'; aw.step = 0.25; aw.min = 0.25;
      aw.value = st.strokeWidth;
      aw.addEventListener('change', function () {
        var en = arrowEnds(node);
        if (en) {
          buildArrow(node, en.x1, en.y1, en.x2, en.y2,
            node.getAttribute('data-kc-arrow'), { stroke: st.stroke, strokeWidth: num(aw.value, 2), dash: st.dash });
          commit('Arrow weight changed.');
        }
      });
      box.appendChild(row('Arrow weight', aw));
    }

    if (node.getAttribute('data-kc-jog')) {
      var jsel = document.createElement('select');
      JOGS.forEach(function (j) {
        var o = document.createElement('option');
        o.value = j.k; o.textContent = j.label;
        if (node.getAttribute('data-kc-jog') === j.k) o.selected = true;
        jsel.appendChild(o);
      });
      jsel.addEventListener('change', function () {
        var en = linkEnds(node);
        if (en) {
          buildJog(node, en.x1, en.y1, en.x2, en.y2, jsel.value,
                   node.getAttribute('data-kc-jog-head') === '1', styleOf(node));
          commit('Jog restyled.');
        }
      });
      box.appendChild(row('Jog style', jsel));

      var jh = document.createElement('input');
      jh.type = 'checkbox';
      jh.checked = node.getAttribute('data-kc-jog-head') === '1';
      jh.addEventListener('change', function () {
        var en = linkEnds(node);
        if (en) {
          buildJog(node, en.x1, en.y1, en.x2, en.y2, node.getAttribute('data-kc-jog'),
                   jh.checked, styleOf(node));
          commit('Jog head toggled.');
        }
      });
      box.appendChild(row('Arrow head', jh));

      var jst = styleOf(node);
      var jc = document.createElement('input');
      jc.type = 'color';
      jc.value = toHex(jst.stroke) || '#c0392b';
      jc.addEventListener('change', function () {
        var en = linkEnds(node);
        if (en) {
          buildJog(node, en.x1, en.y1, en.x2, en.y2, node.getAttribute('data-kc-jog'),
                   node.getAttribute('data-kc-jog-head') === '1',
                   { stroke: jc.value, strokeWidth: jst.strokeWidth, dash: jst.dash });
          commit('Jog recoloured.');
        }
      });
      box.appendChild(row('Jog colour', jc));

      var jw = document.createElement('input');
      jw.type = 'number'; jw.step = 0.25; jw.min = 0.25;
      jw.value = jst.strokeWidth;
      jw.addEventListener('change', function () {
        var en = linkEnds(node);
        if (en) {
          buildJog(node, en.x1, en.y1, en.x2, en.y2, node.getAttribute('data-kc-jog'),
                   node.getAttribute('data-kc-jog-head') === '1',
                   { stroke: jst.stroke, strokeWidth: num(jw.value, 2), dash: jst.dash });
          commit('Jog weight changed.');
        }
      });
      box.appendChild(row('Jog weight', jw));
    }

    var g = GEOM[t];
    if (g) {
      var sec = document.createElement('div');
      sec.className = 'svge-subhead';
      sec.textContent = 'Geometry';
      box.appendChild(sec);
      g.forEach(function (a) {
        box.appendChild(row(a, attrInput(node, a, 'number', { step: 0.5 })));
      });
    }

    /* Raw attribute table: the escape hatch that makes arbitrary imported SVG
       editable even when it uses attributes this inspector knows nothing about. */
    var sub = document.createElement('div');
    sub.className = 'svge-subhead';
    sub.textContent = 'All attributes';
    box.appendChild(sub);
    var tbl = document.createElement('div');
    tbl.className = 'svge-attrs';
    for (var i = 0; i < node.attributes.length; i++) {
      (function (a) {
        if (a.name === 'data-kc-sel') return;
        var r2 = document.createElement('div');
        r2.className = 'svge-attrrow';
        var k = document.createElement('input');
        k.value = a.name; k.className = 'svge-attrkey';
        var v = document.createElement('input');
        v.value = a.value; v.className = 'svge-attrval';
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '×'; x.title = 'Remove attribute';
        v.addEventListener('change', function () { node.setAttribute(a.name, v.value); commit(); });
        k.addEventListener('change', function () {
          var old = a.name, val = node.getAttribute(old);
          if (!k.value) return;
          node.removeAttribute(old);
          try { node.setAttribute(k.value, val); } catch (err) { /* invalid name */ }
          commit();
        });
        x.addEventListener('click', function () { node.removeAttribute(a.name); commit(); });
        r2.appendChild(k); r2.appendChild(v); r2.appendChild(x);
        tbl.appendChild(r2);
      })(node.attributes[i]);
    }
    var addRow = document.createElement('div');
    addRow.className = 'svge-attrrow';
    var nk = document.createElement('input'); nk.placeholder = 'attribute'; nk.className = 'svge-attrkey';
    var nv = document.createElement('input'); nv.placeholder = 'value'; nv.className = 'svge-attrval';
    var nb = document.createElement('button');
    nb.type = 'button'; nb.textContent = '+'; nb.title = 'Add attribute';
    nb.addEventListener('click', function () {
      if (!nk.value) return;
      try { node.setAttribute(nk.value, nv.value); commit('Attribute added.'); }
      catch (err) { status('“' + nk.value + '” is not a valid attribute name.', 'err'); }
    });
    addRow.appendChild(nk); addRow.appendChild(nv); addRow.appendChild(nb);
    tbl.appendChild(addRow);
    box.appendChild(tbl);
  }

  function dupSel() {
    if (!S.sel) return;
    var c = S.sel.cloneNode(true);
    c.removeAttribute('data-kc-sel');
    if (c.getAttribute('id')) c.setAttribute('id', c.getAttribute('id') + '-copy');
    translateEl(c, 10, 10);
    S.sel.parentNode.insertBefore(c, S.sel.nextSibling);
    select(c);
    commit('Duplicated.');
  }
  function delSel() {
    if (!S.sel || !S.sel.parentNode) return;
    var p = S.sel.parentNode;
    p.removeChild(S.sel);
    S.sel = null;
    select(null);
    commit('Deleted.');
  }
  function zOrder(dir) {
    if (!S.sel || !S.sel.parentNode) return;
    var p = S.sel.parentNode, n = S.sel;
    if (dir === 'front') p.appendChild(n);
    else if (dir === 'back') p.insertBefore(n, p.firstChild);
    else if (dir === 'fwd' && n.nextElementSibling) p.insertBefore(n.nextElementSibling, n);
    else if (dir === 'bwd' && n.previousElementSibling) p.insertBefore(n, n.previousElementSibling);
    commit('Reordered.');
  }

  /* ──────────────────────────────────────────────────────────────── layers ── */

  function buildLayers() {
    var box = els.layers;
    if (!box || !S.doc) return;
    box.innerHTML = '';
    var kids = S.doc.children;
    if (!kids.length) {
      box.innerHTML = '<div class="svge-empty">Document is empty.</div>';
      return;
    }
    for (var i = kids.length - 1; i >= 0; i--) {
      (function (node) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'svge-layer';
        var label = node.nodeName;
        var id = node.getAttribute('id'), cls = node.getAttribute('class');
        var extra = id ? '#' + id : (cls ? '.' + cls.split(/\s+/)[0] : '');
        if (node.getAttribute('data-kc-arrow')) extra = extra || (node.getAttribute('data-kc-arrow') + ' arrow');
        if (node.getAttribute('data-kc-jog')) extra = extra || (node.getAttribute('data-kc-jog') + ' jog');
        if (tag(node) === 'text') extra = '“' + textContentOf(node).slice(0, 22) + '”';
        b.innerHTML = '<span class="svge-ltag">' + esc(label) + '</span>' +
                      '<span class="svge-lname">' + esc(extra) + '</span>';
        if (node === S.sel) b.classList.add('is-sel');
        b.addEventListener('click', function () { select(node); });
        box.appendChild(b);
      })(kids[i]);
    }
  }

  function markLayerRow() {
    if (!els.layers) return;
    var rows = els.layers.querySelectorAll('.svge-layer');
    var kids = S.doc ? S.doc.children : [];
    for (var i = 0; i < rows.length; i++) {
      var node = kids[kids.length - 1 - i];
      rows[i].classList.toggle('is-sel', node === S.sel);
    }
  }

  /* ──────────────────────────────────────────────────────────── background ── */

  var BG_ID = 'kc-bg';

  function applyBackground() {
    if (!S.doc) return;
    var mode = els.bgMode ? els.bgMode.value : 'transparent';
    var existing = S.doc.querySelector('#' + BG_ID);
    if (mode === 'transparent') {
      if (existing) existing.parentNode.removeChild(existing);
    } else {
      var vb = viewBoxOf(S.doc) || { x: 0, y: 0, w: 400, h: 300 };
      var r = existing || el('rect', { id: BG_ID });
      r.setAttribute('x', n2(vb.x)); r.setAttribute('y', n2(vb.y));
      r.setAttribute('width', n2(vb.w)); r.setAttribute('height', n2(vb.h));
      r.setAttribute('fill', els.bgColor ? els.bgColor.value : '#ffffff');
      if (!existing) S.doc.insertBefore(r, S.doc.firstChild);
    }
    commit('Background updated.');
  }

  function setBackdrop() {
    var v = els.backdrop ? els.backdrop.value : 'checker';
    els.paper.className = 'svge-paper svge-bd-' + v;
  }

  /* ─────────────────────────────────────────────────────────── document box ── */

  function syncDocFields() {
    if (!S.doc || !els.vbW) return;
    var vb = viewBoxOf(S.doc) || { x: 0, y: 0, w: 0, h: 0 };
    els.vbX.value = n2(vb.x); els.vbY.value = n2(vb.y);
    els.vbW.value = n2(vb.w); els.vbH.value = n2(vb.h);
    els.docW.value = S.doc.getAttribute('width') || '';
    els.docH.value = S.doc.getAttribute('height') || '';
    var bg = S.doc.querySelector('#' + BG_ID);
    if (els.bgMode) els.bgMode.value = bg ? 'solid' : 'transparent';
    if (bg && els.bgColor) { var h = toHex(bg.getAttribute('fill')); if (h) els.bgColor.value = h; }
    syncExportSize();
  }

  function applyDocFields() {
    if (!S.doc) return;
    var x = num(els.vbX.value, 0), y = num(els.vbY.value, 0);
    var w = Math.max(1, num(els.vbW.value, 100)), h = Math.max(1, num(els.vbH.value, 100));
    S.doc.setAttribute('viewBox', [n2(x), n2(y), n2(w), n2(h)].join(' '));
    if (els.docW.value) S.doc.setAttribute('width', els.docW.value); else S.doc.removeAttribute('width');
    if (els.docH.value) S.doc.setAttribute('height', els.docH.value); else S.doc.removeAttribute('height');
    var bg = S.doc.querySelector('#' + BG_ID);
    if (bg) {
      bg.setAttribute('x', n2(x)); bg.setAttribute('y', n2(y));
      bg.setAttribute('width', n2(w)); bg.setAttribute('height', n2(h));
    }
    layoutPaper();
    commit('Document resized.');
    syncExportSize();
  }

  function fitToContent() {
    if (!S.doc) return;
    var bg = S.doc.querySelector('#' + BG_ID);
    if (bg) bg.setAttribute('display', 'none');
    var b = null;
    try { b = S.doc.getBBox(); } catch (e) { /* ignore */ }
    if (bg) bg.removeAttribute('display');
    if (!b || !isFinite(b.width) || b.width <= 0) { status('Nothing measurable to fit.', 'warn'); return; }
    var pad = num(els.fitPad && els.fitPad.value, 8);
    S.doc.setAttribute('viewBox', [n2(b.x - pad), n2(b.y - pad), n2(b.width + 2 * pad), n2(b.height + 2 * pad)].join(' '));
    if (bg) {
      bg.setAttribute('x', n2(b.x - pad)); bg.setAttribute('y', n2(b.y - pad));
      bg.setAttribute('width', n2(b.width + 2 * pad)); bg.setAttribute('height', n2(b.height + 2 * pad));
    }
    syncDocFields();
    layoutPaper();
    fit();
    commit('viewBox fitted to content.');
  }

  /* ──────────────────────────────────────────────────────────────── export ── */

  function syncExportSize() {
    if (!els.exportW || !S.doc) return;
    var d = docSize();
    var mode = els.exportScale ? els.exportScale.value : '1';
    if (mode !== 'custom') {
      var k = parseFloat(mode) || 1;
      els.exportW.value = Math.round(d.w * k);
      els.exportH.value = Math.round(d.h * k);
    }
    var fmt = els.exportFmt ? els.exportFmt.value : 'svg';
    if (els.exportNote) {
      els.exportNote.textContent = (fmt === 'svg' || fmt === 'svg-min' || fmt === 'datauri')
        ? 'Vector output — the pixel size below only applies to raster formats.'
        : els.exportW.value + ' × ' + els.exportH.value + ' px';
    }
  }

  function exportText() {
    var fmt = els.exportFmt.value;
    if (fmt === 'svg-min') return serialize(true);
    if (fmt === 'datauri') return 'data:image/svg+xml;utf8,' + encodeURIComponent(serialize(true));
    return serialize(false);
  }

  function copyCode() {
    var txt = exportText();
    function ok() { status('Copied ' + txt.length.toLocaleString() + ' characters to the clipboard.', 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { status('Could not reach the clipboard — select the code and copy manually.', 'err'); }
      document.body.removeChild(ta);
    }
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function download() {
    var fmt = els.exportFmt.value;
    var base = 'kaspercalc-drawing';
    if (fmt === 'svg' || fmt === 'svg-min') {
      saveBlob(new Blob([serialize(fmt === 'svg-min')], { type: 'image/svg+xml;charset=utf-8' }), base + '.svg');
      status('Saved ' + base + '.svg', 'ok');
      return;
    }
    if (fmt === 'datauri') {
      saveBlob(new Blob([exportText()], { type: 'text/plain;charset=utf-8' }), base + '-datauri.txt');
      status('Saved the data URI as text.', 'ok');
      return;
    }
    rasterize(fmt, function (blob, ext) {
      if (!blob) { status('That format is not supported by this browser.', 'err'); return; }
      saveBlob(blob, base + '.' + ext);
      status('Saved ' + base + '.' + ext + ' at ' + els.exportW.value + '×' + els.exportH.value + '.', 'ok');
    });
  }

  function rasterize(fmt, cb) {
    var w = Math.max(1, Math.round(num(els.exportW.value, 800)));
    var h = Math.max(1, Math.round(num(els.exportH.value, 600)));
    var src = serialize(false);
    var svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var c = cv.getContext('2d');
      if (fmt === 'jpeg') {                 /* JPEG has no alpha; flatten first */
        c.fillStyle = (els.bgColor && els.bgColor.value) || '#ffffff';
        c.fillRect(0, 0, w, h);
      }
      c.drawImage(img, 0, 0, w, h);
      var mime = fmt === 'jpeg' ? 'image/jpeg' : (fmt === 'webp' ? 'image/webp' : 'image/png');
      var ext = fmt === 'jpeg' ? 'jpg' : (fmt === 'webp' ? 'webp' : 'png');
      cv.toBlob(function (b) { cb(b, ext); }, mime, 0.92);
    };
    img.onerror = function () {
      status('The browser refused to rasterize this drawing. Export the SVG code instead.', 'err');
      cb(null);
    };
    img.src = svg64;
  }

  /* ───────────────────────────────────────────────────────────── code pane ── */

  /* The pane grows to fit its content instead of scrolling, so the whole
     document is readable at once and the highlight band never has to chase a
     scroll offset. */
  function autoGrowCode() {
    if (!els.code) return;
    els.code.style.height = 'auto';
    /* the extra allowance absorbs the horizontal scrollbar, which otherwise
       eats into the client height and leaves a sliver of vertical scroll */
    els.code.style.height = Math.max(240, els.code.scrollHeight + 20) + 'px';
  }

  function setCode(text, canonical) {
    S.suppressCodeSync = true;
    els.code.value = text;
    S.suppressCodeSync = false;
    S.codeCanonical = !!canonical;
    syncGutter();
    autoGrowCode();
  }

  function syncGutter() {
    if (!els.gutter) return;
    var lines = els.code.value.split('\n').length;
    var s = '';
    for (var i = 1; i <= lines; i++) s += i + '\n';
    els.gutter.textContent = s;
    if (els.charCount) {
      els.charCount.textContent = lines.toLocaleString() + ' lines · ' +
        els.code.value.length.toLocaleString() + ' chars';
    }
  }

  function onCodeInput() {
    if (S.suppressCodeSync) return;
    S.codeCanonical = false;
    syncGutter();
    autoGrowCode();
    clearTimeout(S.codeTimer);
    S.codeTimer = setTimeout(function () {
      var path = S.sel ? pathOf(S.sel) : null;
      if (mount(els.code.value, {})) {
        if (path) select(elAt(path));
        highlightSelectionInCode();
        clearTimeout(S.histTimer);
        S.histTimer = setTimeout(function () { pushHistory(els.code.value); }, 500);
      }
    }, 350);
  }

  function formatCode() {
    if (!mount(els.code.value, { silent: true })) return;
    setCode(serialize(false), true);
    pushHistory(els.code.value);
    highlightSelectionInCode();
    status('Formatted.', 'ok');
  }

  function minifyCode() {
    if (!mount(els.code.value, { silent: true })) return;
    setCode(serialize(true), false);
    pushHistory(els.code.value);
    highlightSelectionInCode();
    status('Minified to ' + els.code.value.length.toLocaleString() + ' characters.', 'ok');
  }

  /* ────────────────────────────────────────────────────────────── toolbars ── */

  function setTool(t) {
    S.tool = t;
    var btns = els.tools.querySelectorAll('[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-tool') === t);
    }
    els.stage.setAttribute('data-tool', t);
  }

  function buildArrowPicker() {
    var box = els.arrowstyles;
    if (!box) return;
    ARROWS.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'svge-arrowbtn';
      b.title = a.label;
      b.setAttribute('data-arrow', a.k);
      var svg = el('svg', { viewBox: '0 0 74 22', width: 74, height: 22 });
      var g = el('g', {});
      buildArrow(g, 8, 11, 66, 11, a.k, { stroke: '#1c2227', strokeWidth: 1.6, dash: 'none' });
      svg.appendChild(g);
      b.appendChild(svg);
      var lab = document.createElement('span');
      lab.textContent = a.label;
      b.appendChild(lab);
      b.addEventListener('click', function () {
        S.arrowStyle = a.k;
        var all = box.querySelectorAll('.svge-arrowbtn');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === b);
        setTool('arrow');
        if (S.sel && S.sel.getAttribute && S.sel.getAttribute('data-kc-arrow') && !S.sel.getAttribute('data-kc-jog')) {
          var en = arrowEnds(S.sel);
          if (en) { buildArrow(S.sel, en.x1, en.y1, en.x2, en.y2, a.k, styleOf(S.sel)); commit('Arrow restyled.'); }
        }
      });
      if (a.k === S.arrowStyle) b.classList.add('is-on');
      box.appendChild(b);
    });
  }

  function readStyleBar() {
    S.style.stroke = els.strokeNone.checked ? 'none' : els.stroke.value;
    S.style.fill = els.fillNone.checked ? 'none' : els.fill.value;
    S.style.strokeWidth = num(els.sw.value, 2);
    S.style.dash = els.dash.value;
    S.style.opacity = num(els.opacity.value, 1);
    S.style.fontSize = num(els.fontSize.value, 13);
    S.style.fontFamily = els.fontFamily.value;
    S.style.fontWeight = els.fontWeight.value;
    S.style.textAnchor = els.anchor.value;
    S.style.textFill = els.strokeNone.checked ? '#1c2227' : els.stroke.value;
    els.stroke.disabled = els.strokeNone.checked;
    els.fill.disabled = els.fillNone.checked;
  }

  /* Applying the toolbar style to the current selection is the fastest way to
     recolour something that came in from an imported drawing. */
  function applyStyleToSelection() {
    if (!S.sel) { status('Select something first.', 'warn'); return; }
    var t = tag(S.sel);
    if (S.sel.getAttribute('data-kc-arrow') || S.sel.getAttribute('data-kc-jog')) {
      var en = linkEnds(S.sel);
      if (en) {
        if (S.sel.getAttribute('data-kc-arrow')) {
          buildArrow(S.sel, en.x1, en.y1, en.x2, en.y2, S.sel.getAttribute('data-kc-arrow'), S.style);
        } else {
          buildJog(S.sel, en.x1, en.y1, en.x2, en.y2, S.sel.getAttribute('data-kc-jog'),
                   S.sel.getAttribute('data-kc-jog-head') === '1', S.style);
        }
        commit('Style applied.');
      }
      return;
    }
    if (t === 'text') {
      S.sel.setAttribute('fill', S.style.textFill);
      S.sel.setAttribute('font-size', S.style.fontSize);
      if (S.style.fontFamily && S.style.fontFamily !== 'inherit') S.sel.setAttribute('font-family', S.style.fontFamily);
      if (S.style.fontWeight !== 'normal') S.sel.setAttribute('font-weight', S.style.fontWeight);
      else S.sel.removeAttribute('font-weight');
      if (S.style.textAnchor !== 'start') S.sel.setAttribute('text-anchor', S.style.textAnchor);
      else S.sel.removeAttribute('text-anchor');
      commit('Style applied.');
      return;
    }
    S.sel.setAttribute('stroke', S.style.stroke);
    S.sel.setAttribute('fill', S.style.fill);
    S.sel.setAttribute('stroke-width', S.style.strokeWidth);
    if (S.style.dash && S.style.dash !== 'none') S.sel.setAttribute('stroke-dasharray', S.style.dash);
    else S.sel.removeAttribute('stroke-dasharray');
    commit('Style applied.');
  }

  /* ───────────────────────────────────────────────────────────── keyboard ── */

  function isTyping(e) {
    var t = e.target;
    if (!t) return false;
    var n = tag(t);
    return n === 'input' || n === 'textarea' || n === 'select' || t.isContentEditable;
  }

  function onKey(e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); download(); return; }
    if (isTyping(e)) return;

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); return; }
    if (e.key === 'Escape') { select(null); setTool('select'); return; }
    var map = { v: 'select', h: 'pan', a: 'arrow', l: 'line', r: 'rect', o: 'ellipse', t: 'text', d: 'dimension', j: 'jog' };
    if (!mod && map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); return; }
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); dupSel(); return; }

    if (S.sel && e.key.indexOf('Arrow') === 0) {
      e.preventDefault();
      var step = e.shiftKey ? 10 : (S.snap ? S.gridStep : 1);
      var dx = e.key === 'ArrowLeft' ? -step : (e.key === 'ArrowRight' ? step : 0);
      var dy = e.key === 'ArrowUp' ? -step : (e.key === 'ArrowDown' ? step : 0);
      translateEl(S.sel, dx, dy);
      commit();
    }
  }

  /* ───────────────────────────────────────────────────────────── samples ── */

  var SAMPLE = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="162 30 336 288" role="img" aria-label="Lug geometry schematic">',
    '  <style>',
    '    .lug-body { fill: #dce7ea; stroke: #434343; stroke-width: 2; }',
    '    .pin { fill: #ffffff; stroke: #434343; stroke-width: 2; }',
    '    .fix-hatch { stroke: #5a6168; stroke-width: 1.4; }',
    '    .dim-line { stroke: #5a6168; stroke-width: 1; }',
    '    .load-axis { stroke: #c0392b; stroke-width: 1; stroke-dasharray: 4 4; opacity: .45; }',
    '    .load-arrow { stroke: #c0392b; fill: #c0392b; stroke-width: 2; }',
    '    text { font-family: Roboto, Arial, sans-serif; fill: #1c2227; }',
    '  </style>',
    '  <path d="M 220 106 L 220 246 L 290 246 A 70 70 0 0 0 290 106 Z" class="lug-body" />',
    '  <circle cx="290" cy="176" r="33.52" class="pin" />',
    '  <line x1="220" y1="106" x2="209" y2="117" class="fix-hatch" />',
    '  <line x1="220" y1="128" x2="209" y2="139" class="fix-hatch" />',
    '  <line x1="220" y1="150" x2="209" y2="161" class="fix-hatch" />',
    '  <line x1="220" y1="172" x2="209" y2="183" class="fix-hatch" />',
    '  <line x1="220" y1="194" x2="209" y2="205" class="fix-hatch" />',
    '  <line x1="220" y1="216" x2="209" y2="227" class="fix-hatch" />',
    '  <line x1="220" y1="238" x2="209" y2="249" class="fix-hatch" />',
    '  <line x1="220" y1="264" x2="290" y2="264" class="dim-line" />',
    '  <line x1="220" y1="256" x2="220" y2="272" class="dim-line" />',
    '  <line x1="290" y1="256" x2="290" y2="272" class="dim-line" />',
    '  <text x="255" y="286" text-anchor="middle" font-size="13">e = 1.000"</text>',
    '  <line x1="189" y1="106" x2="189" y2="246" class="dim-line" />',
    '  <line x1="182" y1="106" x2="196" y2="106" class="dim-line" />',
    '  <line x1="182" y1="246" x2="196" y2="246" class="dim-line" />',
    '  <text x="180" y="176" text-anchor="middle" font-size="13" transform="rotate(-90 180 176)">W = 1.566"</text>',
    '  <text x="290" y="180" text-anchor="middle" font-size="12">D = 0.750"</text>',
    '  <text x="361" y="201" font-size="13">t = 0.250"</text>',
    '  <line x1="290" y1="176" x2="290" y2="92" class="load-axis" />',
    '  <line x1="290" y1="92" x2="290" y2="50" class="load-arrow" />',
    '  <polygon points="290,38 295.5,50 284.5,50" class="load-arrow" />',
    '  <text x="302" y="47" font-size="13" fill="#c0392b">P, &#952; = 90&#176;</text>',
    '</svg>'
  ].join('\n');

  var BLANK = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">',
    '</svg>'
  ].join('\n');

  function load(code, msg) {
    if (!mount(code, {})) return;
    setCode(serialize(false), true);
    S.history = [];
    S.hIdx = -1;
    pushHistory(els.code.value);
    fit();
    if (msg) status(msg, 'ok');
  }

  /* ───────────────────────────────────────────────────────────────── init ── */

  function init() {
    IDS.forEach(function (k) {
      els[k] = $('svge-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }));
    });
    els.coords = $('svge-coords');
    els.codeHl = $('svge-code-hl');
    els.jogStyle = $('svge-jog-style');
    els.jogHead = $('svge-jog-head');
    els.charCount = $('svge-charcount');
    els.fitPad = $('svge-fit-pad');
    if (!els.stage || !els.code) return;

    setBackdrop();
    buildArrowPicker();
    readStyleBar();
    setTool('select');

    /* stage interaction */
    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
    els.stage.addEventListener('pointerup', onPointerUp);
    els.stage.addEventListener('pointercancel', onPointerUp);
    els.stage.addEventListener('dblclick', function (e) {
      var hit = pickAt(e.clientX, e.clientY, true);
      if (hit && tag(hit) === 'text') { select(hit); editTextInline(hit); }
      else if (hit) select(hit);
    });
    els.stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* Ctrl/Cmd + wheel zooms; a plain wheel is left alone so the page still
       scrolls normally when the pointer happens to be over the canvas. */
    els.stage.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });

    /* drag and drop an .svg straight onto the canvas */
    ['dragover', 'dragenter'].forEach(function (t) {
      els.stage.addEventListener(t, function (e) { e.preventDefault(); els.stage.classList.add('is-drop'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      els.stage.addEventListener(t, function (e) { e.preventDefault(); els.stage.classList.remove('is-drop'); });
    });
    els.stage.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f);
      else if (e.dataTransfer) {
        var t = e.dataTransfer.getData('text');
        if (t) load(t, 'Loaded from dropped text.');
      }
    });

    /* tools */
    els.tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool]');
      if (b) setTool(b.getAttribute('data-tool'));
    });

    /* style bar */
    ['stroke', 'strokeNone', 'fill', 'fillNone', 'sw', 'dash', 'opacity',
     'fontSize', 'fontFamily', 'fontWeight', 'anchor'].forEach(function (k) {
      if (els[k]) els[k].addEventListener('input', readStyleBar);
      if (els[k]) els[k].addEventListener('change', readStyleBar);
    });
    bind('svge-apply-style', applyStyleToSelection);

    if (els.jogStyle) els.jogStyle.addEventListener('change', function () {
      S.jogStyle = els.jogStyle.value;
      setTool('jog');
      if (S.sel && S.sel.getAttribute && S.sel.getAttribute('data-kc-jog')) {
        var en = linkEnds(S.sel);
        if (en) {
          buildJog(S.sel, en.x1, en.y1, en.x2, en.y2, S.jogStyle,
                   S.sel.getAttribute('data-kc-jog-head') === '1', styleOf(S.sel));
          commit('Jog restyled.');
        }
      }
    });
    if (els.jogHead) els.jogHead.addEventListener('change', function () {
      S.jogHead = els.jogHead.checked;
    });

    /* view */
    if (els.grid) els.grid.addEventListener('change', function () { S.grid = els.grid.checked; refreshOverlay(); });
    if (els.snap) els.snap.addEventListener('change', function () { S.snap = els.snap.checked; });
    if (els.gridStep) els.gridStep.addEventListener('change', function () {
      S.gridStep = Math.max(1, num(els.gridStep.value, 10));
      refreshOverlay();
    });
    if (els.backdrop) els.backdrop.addEventListener('change', setBackdrop);
    if (els.bgMode) els.bgMode.addEventListener('change', applyBackground);
    if (els.bgColor) els.bgColor.addEventListener('change', function () {
      if (els.bgMode.value === 'solid') applyBackground();
    });

    /* zoom */
    bind('svge-zoom-in', function () { setZoom(S.zoom * 1.25); });
    bind('svge-zoom-out', function () { setZoom(S.zoom / 1.25); });
    bind('svge-zoom-fit', fit);
    bind('svge-zoom-100', function () { setZoom(1); });

    /* history */
    bind('svge-undo', undo);
    bind('svge-redo', redo);

    /* document */
    ['vbX', 'vbY', 'vbW', 'vbH', 'docW', 'docH'].forEach(function (k) {
      if (els[k]) els[k].addEventListener('change', applyDocFields);
    });
    bind('svge-fit-content', fitToContent);

    /* file */
    bind('svge-new', function () { load(BLANK, 'New blank drawing.'); });
    bind('svge-sample', function () { load(SAMPLE, 'Sample lug schematic loaded.'); });
    if (els.file) els.file.addEventListener('change', function () {
      if (els.file.files && els.file.files[0]) readFile(els.file.files[0]);
    });

    /* code pane */
    els.code.addEventListener('input', onCodeInput);
    els.code.addEventListener('scroll', function () { els.gutter.scrollTop = els.code.scrollTop; });
    els.code.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {              /* keep Tab inside the editor */
        e.preventDefault();
        var s = els.code.selectionStart, t = els.code.selectionEnd;
        els.code.value = els.code.value.slice(0, s) + '  ' + els.code.value.slice(t);
        els.code.selectionStart = els.code.selectionEnd = s + 2;
        onCodeInput();
      }
    });
    bind('svge-format', formatCode);
    bind('svge-minify', minifyCode);
    bind('svge-render', function () {
      if (mount(els.code.value, {})) pushHistory(els.code.value);
    });

    /* export */
    if (els.exportFmt) els.exportFmt.addEventListener('change', syncExportSize);
    if (els.exportScale) els.exportScale.addEventListener('change', syncExportSize);
    if (els.exportW) els.exportW.addEventListener('input', function () {
      if (els.exportScale.value !== 'custom') return;
      var d = docSize();
      els.exportH.value = Math.round(num(els.exportW.value, d.w) * d.h / d.w);
      syncExportSize();
    });
    bind('svge-copy', copyCode);
    bind('svge-download', download);

    /* Every card in the syntax reference below the tool can load its own snippet
       straight into the editor, so the reference doubles as a starting point. */
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('.svge-ex-load');
      if (!b) return;
      var card = b.closest('.svge-ex');
      var code = card && card.querySelector('.svge-ex-code');
      if (!code) return;
      load(code.textContent, 'Example loaded — edit it here, or copy the code.');
      var app = $('svge-app');
      if (app && app.scrollIntoView) app.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () {
      refreshOverlay();
      highlightSelectionInCode();
    });

    load(SAMPLE);
    status('Ready. Drop an .svg on the canvas, paste code below, or start drawing.', 'ok');
  }

  function bind(id, fn) {
    var b = $(id);
    if (b) b.addEventListener('click', fn);
  }

  function readFile(f) {
    if (!/\.svgz?$/i.test(f.name) && !/svg|xml|text/.test(f.type || '')) {
      status('“' + f.name + '” does not look like an SVG file.', 'err');
      return;
    }
    var fr = new FileReader();
    fr.onload = function () { load(String(fr.result), 'Loaded ' + f.name + '.'); };
    fr.onerror = function () { status('Could not read that file.', 'err'); };
    fr.readAsText(f);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
