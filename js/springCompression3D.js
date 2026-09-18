// ============================================================
// KASPERCALC COMPRESSION SPRING — 3D PARAMETRIC VIEWER
//
// Renders the wire as a swept tube along a helix whose PITCH varies by
// region — touching (pitch = d) end coils when the ends are Closed,
// active-coil pitch in the body — built from numbers the solver has
// already produced (Na, Nt, pitch, Lf, Ls, the Closed/Ground flags) in
// runDeterministicPostPass() (js/SpringCompressionRound.js). No new
// spring math here, only a presentation of it.
//
// End-coil geometry, the genuinely hard part the user flagged: the
// solver already encodes the standard Shigley Table 10-1 relationships
// (end coils Ne=0/1/2/2, solid length, free length) via
// getDeadCoilCountFromEndType() and the Pass-6/7 formulas — this module
// reuses those exact formulas (endOffset below mirrors Pass 7 verbatim)
// rather than re-deriving anything. One known simplification: those
// formulas' small (≤1 wire diameter) allowances for an un-ground wire
// tip aren't separately modeled as a protruding stub — the rendered
// coil is very slightly shorter than the table's Lf/Ls in the
// "closed, not ground" and "plain, not ground" cases. Cosmetic only.
// ============================================================

import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

let _lastModel3DParams = null;
let _currentPositionKey = 'free';

let _scene, _camera, _renderer, _controls, _springMesh, _container, _canvas;
let _rafId = null;
let _initTried = false;
let _webglOK = true;

const POSITION_LABELS = {
  free:  'Free',
  l1:    'L1',
  l2:    'L2',
  solid: 'At Solid',
};

// Height (z) contributed by a region as a function of how many turns
// into it the walk has gone (span, 0..r.turns). Three kinds:
//   plain region        — constant pitch, height = span * pitch.
//   region.taper='in'   — rate eases 0 → pitch (SMOOTHSTEP-style cosine
//                          ease), so the coil arrives BONE-FLUSH (zero
//                          slope) at the region's own start and ramps up
//                          to the normal rate by its end. Used for the
//                          first region at a ground bottom end.
//   region.taper='out'  — the mirror: rate eases pitch → 0, arriving
//                          flush at the region's end. Used for the last
//                          region at a ground top end.
// Both taper forms integrate to exactly half of the plain-region height
// over the same span (average rate is pitch/2) and match the
// neighbouring region's rate at the shared boundary, so there's no kink
// where a taper meets a constant-pitch run — only at the flush tip
// itself, where by construction the slope is zero.
function regionHeight(r, span) {
  if (r.taper === 'in') {
    return r.pitch * (span / 2 - (r.turns / (2 * Math.PI)) * Math.sin(Math.PI * span / r.turns));
  }
  if (r.taper === 'out') {
    return r.pitch * (span / 2 + (r.turns / (2 * Math.PI)) * Math.sin(Math.PI * span / r.turns));
  }
  return span * r.pitch;
}

// t runs 0→1 across the WHOLE coil (Curve interface). Angle is simply
// proportional to total turns traversed — only the axial rise per turn
// (pitch, or taper — see regionHeight) changes between regions, so only
// z needs the piecewise walk.
class CompressionHelixCurve extends THREE.Curve {
  constructor(R, regions, hand) {
    super();
    this.R = R;
    this.hand = hand;
    this.regions = regions;
    this.totalTurns = regions.reduce((s, r) => s + r.turns, 0);
  }
  getPoint(t, target = new THREE.Vector3()) {
    const turnsTotal = t * this.totalTurns;
    const theta = turnsTotal * Math.PI * 2;
    let z = 0, remaining = turnsTotal;
    for (const r of this.regions) {
      const span = Math.min(remaining, r.turns);
      z += regionHeight(r, span);
      if (remaining <= r.turns) { remaining = 0; break; }
      remaining -= r.turns;
    }
    return target.set(
      this.R * Math.cos(theta),
      this.hand * this.R * Math.sin(theta),
      z
    );
  }
}

// Lays out the bottom-end / body / top-end regions for one position.
// Shared between the Three.js viewer and the STEP/STL export sampler
// (springCompression3DExport.js) — kept in sync by hand, since the two
// have no shared curve/vector types.
//
//   closed  end coils are wound touching (pitch = d) rather than at the
//           body's own pitch — see getDeadCoilCountFromEndType().
//   ground  the last bit of wire at each end is ground flat against a
//           bearing plane. Modeled as a taper (see regionHeight) over
//           the closed end coil if Closed is also set (the already-
//           touching turn eases down to flush), or over the last 0.5
//           turns of the body pitch if not (mirroring the ~0.5-turn/end
//           allowance getDeadCoilCountFromEndType() already gives a
//           plain-and-ground end) — either way the coil actually lies
//           flat against z=0 / z=length, not just clipped after the
//           fact, so it reads as genuinely ground rather than merely cut.
function buildRegions(d, Na, Nd, closed, ground, length, isSolid) {
  let regions;

  if (isSolid) {
    const totalTurns = Na + Nd;
    if (!ground) return [{ turns: totalTurns, pitch: d }];
    const taper = Math.min(0.5, totalTurns / 2);
    const mid   = totalTurns - 2 * taper;
    regions = [
      { turns: taper, pitch: d, taper: 'in' },
      ...(mid > 0 ? [{ turns: mid, pitch: d }] : []),
      { turns: taper, pitch: d, taper: 'out' },
    ].filter(r => r.turns > 0);
  } else {
    // Mirrors Pass 7 in SpringCompressionRound.js exactly.
    let endOffset = 0;
    if      ( closed &&  ground) endOffset = 2 * d;
    else if ( closed && !ground) endOffset = 3 * d;
    else if (!closed &&  ground) endOffset = d;
    const bodyPitch = Math.max((length - endOffset) / Na, d);

    if (closed) {
      const ndEach = Nd / 2;
      regions = [
        { turns: ndEach, pitch: d, ...(ground ? { taper: 'in' }  : {}) },
        { turns: Na,     pitch: bodyPitch },
        { turns: ndEach, pitch: d, ...(ground ? { taper: 'out' } : {}) },
      ].filter(r => r.turns > 0);
    } else if (!ground) {
      regions = [{ turns: Na, pitch: bodyPitch }];
    } else {
      const taper = Math.min(0.5, Na / 2);
      const mid   = Na - 2 * taper;
      regions = [
        { turns: taper, pitch: bodyPitch, taper: 'in' },
        ...(mid > 0 ? [{ turns: mid, pitch: bodyPitch }] : []),
        { turns: taper, pitch: bodyPitch, taper: 'out' },
      ].filter(r => r.turns > 0);
    }
  }

  // A taper trades away some of its region's height for a flush landing
  // (regionHeight integrates a taper to HALF of what constant pitch over
  // the same span would give), so as built the coil falls a bit short
  // of `length` — the bottom still looks ground (it starts at z=0 by
  // construction) but the top just stops short in mid-air, well before
  // it ever reaches the bearing plane to be flush against, let alone
  // clamped to it. Rescaling every pitch uniformly closes that gap: it
  // stretches the whole coil so the top actually reaches `length` again,
  // without disturbing any taper's zero-slope landing (a uniform scale
  // doesn't change the shape, just its size).
  if (ground) {
    const builtHeight = regions.reduce((s, r) => s + regionHeight(r, r.turns), 0);
    if (builtHeight > 1e-9) {
      const scale = length / builtHeight;
      regions = regions.map(r => ({ ...r, pitch: r.pitch * scale }));
    }
  }

  return regions;
}

// Builds the regions for one position, then sweeps a circular wire
// cross-section along them. Returns a THREE.Mesh ready to add to the
// scene.
//
//   d, D       wire diameter, mean coil diameter
//   Na, Nd     active coils, total dead/end coils (0/1/2/2 per end type)
//   closed, ground   end-type flags — see getDeadCoilCountFromEndType()
//   length     the length to render at (Lf, L1, L2, or Ls)
//   isSolid    true for the Solid position: every coil (Na+Nd) touches
//              at pitch = d, regardless of end type — that is what
//              "solid" means.
//   hand       +1 right-hand wound (default), -1 left-hand wound —
//              mirroring the y-term reverses chirality (see torsion
//              viewer for the same trick).
function buildSpringMesh(d, D, Na, Nd, closed, ground, length, isSolid, hand, material) {
  const R = D / 2;
  const regions = buildRegions(d, Na, Nd, closed, ground, length, isSolid);

  const curve = new CompressionHelixCurve(R, regions, hand);
  const tubularSegments = Math.max(64, Math.round(curve.totalTurns * 24 + 16));
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, d / 2, 10, false);

  // The taper (see buildRegions) brings the CENTERLINE in flush with
  // zero slope, but the wire has real thickness (radius d/2) — near the
  // very tip the centerline is closer to the bearing plane than that
  // radius, so part of the tube's round cross-section still poking
  // through the plane is geometrically unavoidable from a swept curve
  // alone. Ground ends finish the job by flattening those vertices onto
  // the plane directly, which is what "ground" physically is — material
  // removed until it's flush — rather than a rounded tip left in place.
  if (ground) {
    const posAttr = geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      if (z < 0)      posAttr.setZ(i, 0);
      else if (z > length) posAttr.setZ(i, length);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return new THREE.Mesh(geometry, material);
}

function ensureScene() {
  if (_scene || _initTried) return _scene;
  _initTried = true;

  if (!_container || !_canvas) return null;

  if (!window.WebGLRenderingContext) {
    _webglOK = false;
    showFallback('Your browser does not support WebGL, so the 3D model cannot be shown.');
    return null;
  }

  try {
    _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true, alpha: true });
  } catch (e) {
    _webglOK = false;
    showFallback('3D rendering could not start (' + e.message + ').');
    return null;
  }
  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  _scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1, 1.3, 1.5);
  _scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-1.2, -0.4, -1);
  _scene.add(fill);

  _controls = new OrbitControls(_camera, _renderer.domElement);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.08;

  window.addEventListener('resize', resizeRenderer);

  return _scene;
}

function showFallback(msg) {
  if (!_container) return;
  clearFallback();
  const note = document.createElement('div');
  note.className = 'comp3d-fallback';
  note.textContent = msg;
  _container.appendChild(note);
  if (_canvas) _canvas.style.display = 'none';
}

function clearFallback() {
  _container?.querySelector('.comp3d-fallback')?.remove();
  if (_canvas) _canvas.style.display = 'block';
}

function resizeRenderer() {
  if (!_renderer || !_canvas) return;
  const w = _canvas.clientWidth, h = _canvas.clientHeight;
  if (w === 0 || h === 0) return;
  _renderer.setSize(w, h, false);
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
}

function frameCamera(R, height) {
  const extent = Math.max(R, height / 2, 0.05);
  const dist   = extent * 3.2;
  _camera.position.set(dist * 0.7, dist * 0.5, dist * 0.9);
  _camera.lookAt(0, 0, height / 2);
  _controls.target.set(0, 0, height / 2);
  _controls.update();
}

function renderPosition(key) {
  const p   = _lastModel3DParams;
  const pos = p?.positions[key];
  if (!pos) {
    showFallback(`No data yet for ${POSITION_LABELS[key]}. Pin a load or length for this position to see it here.`);
    if (_springMesh && _scene) { _scene.remove(_springMesh); _springMesh.geometry.dispose(); _springMesh = null; }
    return;
  }

  if (!_scene) return;
  clearFallback();
  if (_springMesh) {
    _scene.remove(_springMesh);
    _springMesh.geometry.dispose();
    _springMesh = null;
  }

  // Ground ends are baked into the geometry itself (see buildRegions /
  // regionHeight) — the coil actually tapers down and lies flush against
  // the bearing plane, rather than being clipped after the fact.
  const material = new THREE.MeshStandardMaterial({
    color: 0x8a9296, metalness: 0.6, roughness: 0.35,
  });
  const hand    = document.getElementById('hand')?.value === 'Left hand' ? -1 : 1;
  const isSolid = key === 'solid';
  _springMesh = buildSpringMesh(
    p.d, p.D, p.Na, p.Nd, p.closed, p.ground, pos.length, isSolid, hand, material
  );
  _scene.add(_springMesh);

  frameCamera(p.D / 2, pos.length);
}

function startLoop() {
  if (_rafId != null) return;
  const tick = () => {
    _rafId = requestAnimationFrame(tick);
    if (!isVisible()) return;
    _controls?.update();
    resizeRenderer();
    if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
  };
  _rafId = requestAnimationFrame(tick);
}

function isVisible() {
  return !!(_container && _container.offsetWidth > 0 && _container.offsetHeight > 0);
}

// ── Position selector ─────────────────────────────────────────
function wirePositionButtons() {
  const row = document.getElementById('comp3DPositions');
  if (!row || row._wired) return;
  row._wired = true;
  row.querySelectorAll('button[data-pos]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-pos');
      row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentPositionKey = key;
      renderPosition(key);
    });
  });

  const handSel = document.getElementById('hand');
  if (handSel && !handSel._comp3DWired) {
    handSel._comp3DWired = true;
    handSel.addEventListener('change', () => renderPosition(_currentPositionKey));
  }
}

function syncPositionButtons(p) {
  const row = document.getElementById('comp3DPositions');
  if (!row) return;
  row.querySelectorAll('button[data-pos]').forEach(btn => {
    const key = btn.getAttribute('data-pos');
    const available = !!(p && p.positions[key]);
    btn.classList.toggle('unavailable', !available);
    btn.title = available ? '' : `${POSITION_LABELS[key]} has no data yet`;
  });
  if (!p || !p.positions[_currentPositionKey]) {
    _currentPositionKey = 'free';
    const freeBtn = row.querySelector('[data-pos="free"]');
    row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    freeBtn?.classList.add('active');
  }
}

// ── Public entry point, mirrors the torsion viewer's update3DModel() ──
function update3DModel(p) {
  _lastModel3DParams = p;

  const container = document.getElementById('comp3DPanel');
  if (!container) return;

  wirePositionButtons();
  syncPositionButtons(p);

  if (!p && _springMesh && _scene) {
    _scene.remove(_springMesh);
    _springMesh.geometry.dispose();
    _springMesh = null;
  }

  if (!_scene) {
    if (!ensureScene()) return;
    if (!_webglOK) return;
    startLoop();
  }

  renderPosition(_currentPositionKey);
}

window.update3DModel = update3DModel;
window.getComp3DParams = () => _lastModel3DParams;

export { buildSpringMesh };

// Wire the position buttons and grab the panel/canvas elements the
// moment this module loads — see springTorsion3D.js for why this can't
// wait for the first update3DModel() call.
_container = document.getElementById('comp3DPanel');
_canvas    = document.getElementById('comp3DCanvas');
wirePositionButtons();
syncPositionButtons(_lastModel3DParams);
renderPosition(_currentPositionKey);
