// ============================================================
// KASPERCALC TORSION SPRING — 3D PARAMETRIC VIEWER
//
// Renders the wire as a swept tube along a curve built from three pieces:
// a straight fixed arm, the helical coil body, a straight moving arm. The
// coil geometry (wound diameter, turn count, body length) at each load
// position comes straight from windDownGeometry() in SpringTorsionRound.js
// — the same function that already fills the Nt1/Nt2/NtSet and
// Lb1/Lb2/LbSet table cells — so this module adds no new spring math, only
// a presentation of numbers the solver has already produced.
//
// Arm angle is deliberately NOT passed in as a separate input. It falls
// out of the coil geometry for free: the moving arm's labelled angle
// (ang1/ang2/angSet) is, by construction of the solver's own angFree
// convention, always exactly (N mod 1)*360 degrees — the fractional part
// of the wound turn count at that position, converted to degrees. Deriving
// the arm direction the same way here guarantees the rendered model can
// never disagree with the numbers in the results table.
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
  free: 'Free',
  m1:   'Cycle Torque 1',
  m2:   'Cycle Torque 2',
  set:  'Set',
};

// A single turn of the coil, radius and axial rise supplied by the caller.
// getPoint()'s t runs 0→1 across the WHOLE curve (see THREE.Curve docs);
// CurvePath weights each sub-curve by arc length automatically, so this
// class only needs to describe its own local shape.
//
// hand: +1 (right-hand wound, the default) or -1 (left-hand wound). Mirroring
// the y-term while leaving x and the rise (z) alone reverses the helix's
// chirality without changing its radius or which end is "up" — the standard
// way to turn a right-handed helix into its left-handed mirror image.
class HelixCurve extends THREE.Curve {
  constructor(R, turns, rise, hand = 1) {
    super();
    this.R = R;
    this.turns = turns;
    this.rise = rise;
    this.hand = hand;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const theta = t * this.turns * Math.PI * 2;
    return target.set(
      this.R * Math.cos(theta),
      this.hand * this.R * Math.sin(theta),
      this.rise * t
    );
  }
}

// Builds the full arm–coil–arm centerline and sweeps a circular wire
// cross-section along it. Returns a THREE.Mesh ready to add to the scene.
//
//   d      wire diameter
//   R, N, Lb   wound mean diameter/2, turn count, body length AT THIS POSITION
//   arm1, arm2 moment arm lengths (arm1 = fixed, arm2 = moving)
//   tangent    false (default): arms are RADIAL — straight lines through the
//              coil's central axis, matching how arm length is usually
//              dimensioned on a drawing. true: arms leave TANGENT to the
//              helix instead, matching how a real wire actually bends with
//              no kink — closer to the physical part, at the cost of no
//              longer being a simple radial dimension.
//   hand       +1 for right-hand wound (default), -1 for left-hand wound —
//              see HelixCurve for why mirroring the y-term is sufficient.
function buildSpringMesh(d, R, N, Lb, arm1, arm2, material, tangent, hand = 1) {
  const coilStart = new THREE.Vector3(R, 0, 0);
  const endAngle  = (N % 1) * Math.PI * 2;   // see file header: this IS ang(position)
  const coilEnd   = new THREE.Vector3(
    R * Math.cos(N * Math.PI * 2),
    hand * R * Math.sin(N * Math.PI * 2),
    Lb
  );

  let fixedArmDir, movingArmDir;
  if (tangent) {
    // d/dtheta of the helix, direction only (see HelixCurve.getPoint): a
    // small, real axial component falls out naturally, matching how a
    // physical arm follows the coil's own pitch angle where it leaves.
    const tangentAt = theta => new THREE.Vector3(
      -R * Math.sin(theta), hand * R * Math.cos(theta), Lb / (N * Math.PI * 2)
    ).normalize();
    fixedArmDir  = tangentAt(0).multiplyScalar(-1);   // arm trails backward off the start
    movingArmDir = tangentAt(endAngle);               // arm continues forward off the end
  } else {
    // Fixed arm points opposite the coil's start radius (the "9 o'clock"
    // reference the reference guide documents); the moving arm points
    // along whatever angle the coil's own winding naturally ends at.
    fixedArmDir  = new THREE.Vector3(-1, 0, 0);
    movingArmDir = new THREE.Vector3(Math.cos(endAngle), hand * Math.sin(endAngle), 0);
  }

  const fixedArmTip  = coilStart.clone().add(fixedArmDir.multiplyScalar(arm1));
  const movingArmTip = coilEnd.clone().add(movingArmDir.multiplyScalar(arm2));

  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(fixedArmTip, coilStart));
  path.add(new HelixCurve(R, N, Lb, hand));
  path.add(new THREE.LineCurve3(coilEnd, movingArmTip));

  const tubularSegments = Math.max(64, Math.round(N * 24 + 16));
  const geometry = new THREE.TubeGeometry(path, tubularSegments, d / 2, 10, false);
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
  note.className = 'torsion3d-fallback';
  note.textContent = msg;
  _container.appendChild(note);
  if (_canvas) _canvas.style.display = 'none';
}

function clearFallback() {
  _container?.querySelector('.torsion3d-fallback')?.remove();
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

function frameCamera(R, Lb, armMax) {
  // Fit a sphere around the assembly's rough extent so any spring — tight
  // and stubby, or long and wide-armed — starts framed reasonably.
  const extent = Math.max(R + armMax, Lb, 0.05);
  const dist   = extent * 3.2;
  _camera.position.set(dist * 0.7, dist * 0.5, dist * 0.9);
  _camera.lookAt(0, 0, Lb / 2);
  _controls.target.set(0, 0, Lb / 2);
  _controls.update();
}

function renderPosition(key) {
  // The "no data for this position" message doesn't need a WebGL scene —
  // check for it first so clicking a tab before anything has been solved
  // yet (scene not created) still explains itself instead of doing nothing.
  const p   = _lastModel3DParams;
  const pos = p?.positions[key];
  if (!pos) {
    showFallback(`No data yet for ${POSITION_LABELS[key]}. Pin a torque, angle, or stress value for this position to see it here.`);
    if (_springMesh && _scene) { _scene.remove(_springMesh); _springMesh.geometry.dispose(); _springMesh = null; }
    return;
  }

  if (!_scene) return;   // scene not ready yet; update3DModel() re-renders once it is
  clearFallback();
  if (_springMesh) {
    _scene.remove(_springMesh);
    _springMesh.geometry.dispose();
    _springMesh = null;
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0x8a9296, metalness: 0.6, roughness: 0.35,
  });
  const tangent = document.getElementById('torsion3DTangentArms')?.checked ?? false;
  const hand    = document.getElementById('hand')?.value === 'Left hand' ? -1 : 1;
  _springMesh = buildSpringMesh(p.d, pos.D / 2, pos.N, pos.Lb, p.arm1, p.arm2, material, tangent, hand);
  _scene.add(_springMesh);

  frameCamera(pos.D / 2, pos.Lb, Math.max(p.arm1, p.arm2));
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
// Buttons for positions with no data yet stay clickable (never `disabled`)
// — matching how the 2D graph tabs already behave elsewhere on this page —
// so clicking one always shows *something*: either the model, or a plain
// explanation of what's missing. A disabled button that silently does
// nothing when clicked reads as broken, not as "no data."
function wirePositionButtons() {
  const row = document.getElementById('torsion3DPositions');
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

  const tangentBox = document.getElementById('torsion3DTangentArms');
  if (tangentBox && !tangentBox._wired) {
    tangentBox._wired = true;
    tangentBox.addEventListener('change', () => renderPosition(_currentPositionKey));
  }

  const handSel = document.getElementById('hand');
  if (handSel && !handSel._t3dWired) {
    handSel._t3dWired = true;
    handSel.addEventListener('change', () => renderPosition(_currentPositionKey));
  }
}

function syncPositionButtons(p) {
  const row = document.getElementById('torsion3DPositions');
  if (!row) return;
  row.querySelectorAll('button[data-pos]').forEach(btn => {
    const key = btn.getAttribute('data-pos');
    const available = !!(p && p.positions[key]);
    btn.classList.toggle('unavailable', !available);
    btn.title = available ? '' : `${POSITION_LABELS[key]} has no data yet`;
  });
  // If the currently-selected position dropped out (e.g. M2 cleared),
  // fall back to Free rather than continuing to show its stale model.
  if (!p || !p.positions[_currentPositionKey]) {
    _currentPositionKey = 'free';
    const freeBtn = row.querySelector('[data-pos="free"]');
    row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    freeBtn?.classList.add('active');
  }
}

// ── Public entry point, mirrors updateAllCharts()'s calling convention ──
// Wires the buttons and (dis)plays whatever's available EVERY call, even
// when p is null — a null p used to short-circuit before the buttons were
// ever wired up, so on a fresh page (nothing solved yet) clicking a
// position tab did nothing at all, disabled-looking or not. renderPosition()
// already copes with p being null or missing a given position by showing
// an explanatory message, so there is no need to special-case it here.
function update3DModel(p) {
  _lastModel3DParams = p;

  const container = document.getElementById('torsion3DPanel');
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
window.getTorsion3DParams = () => _lastModel3DParams;

export { buildSpringMesh };

// Wire the position buttons and grab the panel/canvas elements the moment
// this module loads, not on the first update3DModel() call — that call may
// not happen for a long time on a fresh page (nothing to solve yet means
// nothing triggers a recalc), which otherwise left every button inert and
// the "no data" message unable to display (it needs _container, previously
// only captured inside ensureScene()) until the user's first edit.
_container = document.getElementById('torsion3DPanel');
_canvas    = document.getElementById('torsion3DCanvas');
wirePositionButtons();
syncPositionButtons(_lastModel3DParams);
renderPosition(_currentPositionKey);
