// ============================================================
// KASPERCALC COMPRESSION SPRING — STL / STEP DOWNLOAD
//
// Both exports build the FREE (unloaded) position, independent of
// whichever tab is selected in the 3D preview above — see
// springTorsion3DExport.js for the same reasoning and for why STEP
// needs a real B-rep CAD kernel (OpenCascade.js, ~50MB WASM, fetched
// from a CDN only when "Download STEP" is clicked) while STL does not.
// ============================================================

import { buildSpringMesh } from './springCompression3D.js';

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
  const p   = window.getComp3DParams?.();
  const pos = p?.positions?.free;
  if (!p || !pos) return null;
  return {
    d: p.d, D: p.D, Na: p.Na, Nd: p.Nd, closed: p.closed, ground: p.ground,
    length: pos.length,
    hand: document.getElementById('hand')?.value === 'Left hand' ? -1 : 1,
  };
}

function setStatus(msg) {
  const el = document.getElementById('comp3DExportStatus');
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

async function downloadComp3DSTL() {
  const params = currentFreeParams();
  if (!params) { alert('Solve a spring design first — there is nothing to export yet.'); return; }

  setStatus('Building STL…');
  try {
    const { STLExporter } = await import('./STLExporter.js');
    const mesh = buildSpringMesh(
      params.d, params.D, params.Na, params.Nd, params.closed, params.ground,
      params.length, false, params.hand, undefined
    );
    const stlText = new STLExporter().parse(mesh, { binary: false });
    downloadBlob(new Blob([stlText], { type: 'model/stl' }), 'compression-spring.stl');
    setStatus('');
  } catch (e) {
    setStatus('STL export failed: ' + e.message);
  }
}

async function downloadComp3DSTEP() {
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
    const path = '/compression-spring.step';
    writer.Write(path);
    const stepText = oc.FS.readFile(path, { encoding: 'utf8' });

    downloadBlob(new Blob([stepText], { type: 'application/step' }), 'compression-spring.step');
    setStatus('');
  } catch (e) {
    setStatus('STEP export failed: ' + e.message);
  }
}

// Same region walk as buildRegions()/regionHeight() in
// springCompression3D.js (kept in sync by hand — Three.js and
// OpenCascade have no shared curve/vector types). A ground end isn't
// just clipped after the fact — the coil actually tapers down and lies
// flush (zero slope) against the bearing plane; see regionHeight there
// for the closed-form math.
function buildRegions(d, Na, Nd, closed, ground, length) {
  let endOffset = 0;
  if      ( closed &&  ground) endOffset = 2 * d;
  else if ( closed && !ground) endOffset = 3 * d;
  else if (!closed &&  ground) endOffset = d;
  const bodyPitch = Math.max((length - endOffset) / Na, d);

  if (closed) {
    const ndEach = Nd / 2;
    return [
      { turns: ndEach, pitch: d, ...(ground ? { taper: 'in' }  : {}) },
      { turns: Na,     pitch: bodyPitch },
      { turns: ndEach, pitch: d, ...(ground ? { taper: 'out' } : {}) },
    ].filter(r => r.turns > 0);
  }

  if (!ground) return [{ turns: Na, pitch: bodyPitch }];

  const taper = Math.min(0.5, Na / 2);
  const mid   = Na - 2 * taper;
  return [
    { turns: taper, pitch: bodyPitch, taper: 'in' },
    ...(mid > 0 ? [{ turns: mid, pitch: bodyPitch }] : []),
    { turns: taper, pitch: bodyPitch, taper: 'out' },
  ].filter(r => r.turns > 0);
}

function regionHeight(r, span) {
  if (r.taper === 'in') {
    return r.pitch * (span / 2 - (r.turns / (2 * Math.PI)) * Math.sin(Math.PI * span / r.turns));
  }
  if (r.taper === 'out') {
    return r.pitch * (span / 2 + (r.turns / (2 * Math.PI)) * Math.sin(Math.PI * span / r.turns));
  }
  return span * r.pitch;
}

function samplePoints(R, regions, hand, segsPerTurn) {
  const totalTurns = regions.reduce((s, r) => s + r.turns, 0);
  const segs = Math.max(64, Math.round(totalTurns * segsPerTurn + 16));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const turnsTotal = t * totalTurns;
    const theta = turnsTotal * Math.PI * 2;
    let z = 0, remaining = turnsTotal;
    for (const r of regions) {
      const span = Math.min(remaining, r.turns);
      z += regionHeight(r, span);
      if (remaining <= r.turns) { remaining = 0; break; }
      remaining -= r.turns;
    }
    pts.push([R * Math.cos(theta), hand * R * Math.sin(theta), z]);
  }
  return pts;
}

// A circular profile face swept along a POLYLINE spine (many short line
// edges, not one smooth BSpline curve) via BRepOffsetAPI_MakePipe.
//
// A single high-degree BSpline fit through hundreds of points wound
// through many turns is numerically unstable to sweep — OCCT's pipe
// transport visibly bulges/balloons the tube well past the coil radius
// once the spine winds more than a couple of turns (confirmed directly:
// the same technique with one smooth curve produced a tube 2-3x too
// wide in testing). A dense polyline has no continuous curvature for
// the transport algorithm to destabilize on, so it sweeps correctly —
// the standard, well-tested workaround for this exact OCCT limitation.
// The facets are far below visual/print tolerance at this point density
// (same segment count already used for the on-screen Three.js tube).
function buildSpringSolid(oc, { d, D, Na, Nd, closed, ground, length, hand }) {
  const R = D / 2;
  const regions = buildRegions(d, Na, Nd, closed, ground, length);
  const points  = samplePoints(R, regions, hand, 24);

  const pnt = p => new oc.gp_Pnt_3(p[0], p[1], p[2]);
  const wireMaker = new oc.BRepBuilderAPI_MakeWire_1();
  for (let i = 0; i < points.length - 1; i++) {
    wireMaker.Add_1(new oc.BRepBuilderAPI_MakeEdge_3(pnt(points[i]), pnt(points[i + 1])).Edge());
  }
  const spineWire = wireMaker.Wire();

  // Circular profile, radius d/2, at the spine's start, facing along the
  // spine's initial direction of travel (first two sample points).
  const p0 = points[0], p1 = points[1];
  const travel = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const len = Math.hypot(...travel);
  const travelDir = travel.map(v => v / len);
  const ax2      = new oc.gp_Ax2_3(pnt(p0), new oc.gp_Dir_4(travelDir[0], travelDir[1], travelDir[2]));
  const circ     = new oc.gp_Circ_2(ax2, d / 2);
  const circEdge = new oc.BRepBuilderAPI_MakeEdge_8(circ).Edge();
  const circWire = new oc.BRepBuilderAPI_MakeWire_2(circEdge).Wire();
  const profileFace = new oc.BRepBuilderAPI_MakeFace_15(circWire, false).Face();

  let solid = new oc.BRepOffsetAPI_MakePipe_1(spineWire, profileFace).Shape();

  // Ground ends: the taper (see buildRegions/regionHeight) brings the
  // CENTERLINE in flush, but the wire has real thickness (radius d/2),
  // so part of its round cross-section still pokes past the bearing
  // plane near the very tip — geometrically unavoidable from a swept
  // curve alone, the same issue as the Three.js viewer. There it's
  // fixed by clamping vertices onto the plane; here, with a real solid
  // kernel, the correct fix is a real boolean cut — subtract everything
  // below z=0 and above z=length so the solid is genuinely flush, not
  // just clipped for display.
  if (ground) {
    const margin = R + d; // generous — covers the whole coil radius
    const bottomBox = new oc.BRepPrimAPI_MakeBox_3(
      new oc.gp_Pnt_3(-margin, -margin, -margin), 2 * margin, 2 * margin, margin
    ).Shape();
    const topBox = new oc.BRepPrimAPI_MakeBox_3(
      new oc.gp_Pnt_3(-margin, -margin, length), 2 * margin, 2 * margin, margin
    ).Shape();
    solid = new oc.BRepAlgoAPI_Cut_3(solid, bottomBox, new oc.Message_ProgressRange_1()).Shape();
    solid = new oc.BRepAlgoAPI_Cut_3(solid, topBox, new oc.Message_ProgressRange_1()).Shape();
  }

  return solid;
}

window.downloadComp3DSTL  = downloadComp3DSTL;
window.downloadComp3DSTEP = downloadComp3DSTEP;
