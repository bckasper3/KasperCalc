// ============================================================
// KASPERCALC TORSION SPRING — STL / STEP DOWNLOAD
//
// Both exports build the FREE (unloaded, as-wound) position, independent
// of whichever tab happens to be selected in the 3D preview above — a CAD
// deliverable should be the part as it's actually manufactured, not a
// snapshot of whichever load state someone last looked at.
//
// Nothing here loads until its button is clicked. STL only needs
// STLExporter, a tiny Three.js addon riding on the core module the 3D
// viewer already loaded. STEP needs a real B-rep CAD kernel — Three.js
// only produces a triangle mesh, which isn't valid STEP geometry — so
// this dynamically imports OpenCascade.js (a ~50MB WASM build of the
// actual OpenCascade kernel) from a CDN the first time "Download STEP"
// is clicked, and never touches it for STL or for ordinary page use.
// ============================================================

import { buildSpringMesh } from './springTorsion3D.js';

const OCC_BASE = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/';
let _occPromise = null;

function loadOpenCascade() {
  if (!_occPromise) {
    _occPromise = import(OCC_BASE + 'opencascade.full.js')
      .then(mod => mod.default({ locateFile: (path) => OCC_BASE + path }));
  }
  return _occPromise;
}

function currentFreeParams() {
  const p   = window.getTorsion3DParams?.();
  const pos = p?.positions?.free;
  if (!p || !pos) return null;
  return {
    d: p.d, R: pos.D / 2, N: pos.N, Lb: pos.Lb,
    arm1: p.arm1, arm2: p.arm2,
    tangent: document.getElementById('torsion3DTangentArms')?.checked ?? false,
    hand:    document.getElementById('hand')?.value === 'Left hand' ? -1 : 1,
  };
}

function setStatus(msg) {
  const el = document.getElementById('torsion3DExportStatus');
  if (el) el.textContent = msg;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadTorsion3DSTL() {
  const params = currentFreeParams();
  if (!params) { alert('Solve a spring design first — there is nothing to export yet.'); return; }

  setStatus('Building STL…');
  try {
    const { STLExporter } = await import('./STLExporter.js');
    const mesh = buildSpringMesh(
      params.d, params.R, params.N, params.Lb, params.arm1, params.arm2,
      undefined, params.tangent, params.hand
    );
    const stlText = new STLExporter().parse(mesh, { binary: false });
    downloadBlob(new Blob([stlText], { type: 'model/stl' }), 'torsion-spring.stl');
    setStatus('');
  } catch (e) {
    setStatus('STL export failed: ' + e.message);
  }
}

async function downloadTorsion3DSTEP() {
  const params = currentFreeParams();
  if (!params) { alert('Solve a spring design first — there is nothing to export yet.'); return; }

  setStatus('Loading CAD engine (~50MB, first time only)…');
  try {
    const oc = await loadOpenCascade();
    setStatus('Building solid…');
    const solid = buildSpringSolid(oc, params);

    const writer   = new oc.STEPControl_Writer_1();
    const progress = new oc.Message_ProgressRange_1();
    writer.Transfer(solid, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    const path = '/torsion-spring.step';
    writer.Write(path);
    const stepText = oc.FS.readFile(path, { encoding: 'utf8' });

    downloadBlob(new Blob([stepText], { type: 'application/step' }), 'torsion-spring.step');
    setStatus('');
  } catch (e) {
    setStatus('STEP export failed: ' + e.message);
  }
}

// Rebuilds the same arm→helix→arm centerline as buildSpringMesh() in
// springTorsion3D.js — kept in sync with it by hand, since Three.js and
// OpenCascade have no shared curve/vector types — but as a real
// OpenCascade solid: a circular profile face swept along a BSpline/line
// spine via BRepOffsetAPI_MakePipe. That produces a genuine capped B-rep
// solid, not a re-export of a triangle mesh, which is what makes the
// result a true, editable STEP part rather than an imported mesh.
function buildSpringSolid(oc, { d, R, N, Lb, arm1, arm2, tangent, hand }) {
  const endAngle = (N % 1) * Math.PI * 2;
  const coilStart = [R, 0, 0];
  const coilEnd   = [R * Math.cos(N * Math.PI * 2), hand * R * Math.sin(N * Math.PI * 2), Lb];

  let fixedArmDir, movingArmDir;
  if (tangent) {
    const tangentAt = theta => {
      const v = [-R * Math.sin(theta), hand * R * Math.cos(theta), Lb / (N * Math.PI * 2)];
      const len = Math.hypot(...v);
      return v.map(c => c / len);
    };
    fixedArmDir  = tangentAt(0).map(v => -v);
    movingArmDir = tangentAt(endAngle);
  } else {
    fixedArmDir  = [-1, 0, 0];
    movingArmDir = [Math.cos(endAngle), hand * Math.sin(endAngle), 0];
  }

  const fixedArmTip  = coilStart.map((v, i) => v + fixedArmDir[i] * arm1);
  const movingArmTip = coilEnd.map((v, i) => v + movingArmDir[i] * arm2);

  const pnt = p => new oc.gp_Pnt_3(p[0], p[1], p[2]);
  const lineEdge = (p1, p2) => new oc.BRepBuilderAPI_MakeEdge_3(pnt(p1), pnt(p2)).Edge();

  // The coil is swept as a POLYLINE of short line edges, not one smooth
  // BSpline curve through the same points — OCCT's pipe transport is
  // numerically unstable sweeping a single high-degree BSpline through
  // more than a couple of turns (confirmed directly: it visibly bulges
  // the tube 2-3x past the coil radius). A dense polyline has no
  // continuous curvature to destabilize on, so it sweeps correctly; the
  // facets are far below visual/print tolerance at this point density
  // (same segment count already used for the on-screen Three.js tube).
  const helixSegs = Math.max(64, Math.round(N * 24 + 16));
  const helixPts = [];
  for (let i = 0; i <= helixSegs; i++) {
    const t = i / helixSegs, theta = t * N * Math.PI * 2;
    helixPts.push([R * Math.cos(theta), hand * R * Math.sin(theta), Lb * t]);
  }

  const wireMaker = new oc.BRepBuilderAPI_MakeWire_1();
  wireMaker.Add_1(lineEdge(fixedArmTip, coilStart));
  for (let i = 0; i < helixPts.length - 1; i++) {
    wireMaker.Add_1(lineEdge(helixPts[i], helixPts[i + 1]));
  }
  wireMaker.Add_1(lineEdge(coilEnd, movingArmTip));
  const spineWire = wireMaker.Wire();

  // Circular profile, radius d/2, at the spine's start, facing along the
  // spine's own initial direction of travel — BRepOffsetAPI_MakePipe
  // transports it automatically along the rest of the spine, and because
  // the profile is a closed FACE (not just a wire), the swept result is a
  // capped solid rather than an open shell.
  const travelDir = fixedArmDir.map(v => -v);
  const ax2       = new oc.gp_Ax2_3(pnt(fixedArmTip), new oc.gp_Dir_4(travelDir[0], travelDir[1], travelDir[2]));
  const circ      = new oc.gp_Circ_2(ax2, d / 2);
  const circEdge  = new oc.BRepBuilderAPI_MakeEdge_8(circ).Edge();
  const circWire  = new oc.BRepBuilderAPI_MakeWire_2(circEdge).Wire();
  const profileFace = new oc.BRepBuilderAPI_MakeFace_15(circWire, false).Face();

  return new oc.BRepOffsetAPI_MakePipe_1(spineWire, profileFace).Shape();
}

window.downloadTorsion3DSTL  = downloadTorsion3DSTL;
window.downloadTorsion3DSTEP = downloadTorsion3DSTEP;
