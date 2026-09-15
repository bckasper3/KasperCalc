/**
 * solenoid-coil.js — sizing a wound coil: what it takes to drive it, how much
 * force it makes, and how long it survives.
 *
 * The chain is: winding geometry -> turns -> resistance and inductance ->
 * drive current -> ampere-turns -> flux -> force, with a thermal check hung off
 * the dissipation. Each stage feeds the next, which is the whole reason this is
 * one page rather than a handful of formulas.
 *
 * Two things dominate real designs and are surfaced deliberately:
 *
 *   The air gap. Force goes as 1/g^2 in the gap-dominated regime, so a
 *   half-millimetre of paint or a burr changes the answer more than any amount
 *   of extra copper.
 *
 *   Saturation. Once the core reaches B_sat the force stops responding to
 *   current, and B_sat^2/(2*mu0) is a hard ceiling on force per unit pole area
 *   no matter how many ampere-turns are thrown at it.
 *
 * Units are SI internally; the UI converts on the way in and out.
 */
'use strict';

window.SolenoidCoil = (function () {

  /* ── physical constants ─────────────────────────────────────────────── */

  var MU0      = 4e-7 * Math.PI;   // H/m
  var RHO_CU20 = 1.724e-8;         // ohm*m, annealed copper at 20 C
  var ALPHA_CU = 0.00393;          // 1/K, copper resistance tempco
  var DENS_CU  = 8933;             // kg/m^3
  var CP_CU    = 385;              // J/(kg*K)

  /* ── magnet wire ─────────────────────────────────────────────────────
   * Bare diameter is exact: AWG is defined as d = 0.005 * 92^((36-n)/39) in.
   * The film build is not — it is a NEMA MW 1000 nominal for grade 2 ("heavy")
   * and varies by supplier and film chemistry. It only enters through the
   * packing calculation, where the fill factor swamps it anyway, and both are
   * exposed so a real datasheet can be dialled in.
   */
  function bareDiaIn(n) { return 0.005 * Math.pow(92, (36 - n) / 39); }

  // nominal heavy-build film increase over bare diameter, inches
  var BUILD_IN = {
    14: 0.0051, 16: 0.0047, 18: 0.0043, 20: 0.0038, 22: 0.0033, 24: 0.0029,
    26: 0.0025, 28: 0.0022, 30: 0.0019, 32: 0.00165, 34: 0.0014, 36: 0.0012,
    38: 0.0010, 40: 0.0010, 42: 0.0008, 44: 0.0007
  };

  function buildIn(n) {
    if (BUILD_IN[n] !== undefined) return BUILD_IN[n];
    var lo = n - 1, hi = n + 1;                       // odd gauge: interpolate
    if (BUILD_IN[lo] !== undefined && BUILD_IN[hi] !== undefined) {
      return (BUILD_IN[lo] + BUILD_IN[hi]) / 2;
    }
    return 0.002;
  }

  /** Magnet wire table, 14 through 44 AWG. Dimensions in metres. */
  var WIRE = (function () {
    var out = [];
    for (var n = 14; n <= 44; n++) {
      var dIn = bareDiaIn(n);
      var d   = dIn * 0.0254;
      var dIns = (dIn + buildIn(n)) * 0.0254;
      out.push({
        awg: n,
        d: d,                                  // bare conductor diameter, m
        dIns: dIns,                            // over-film diameter, m
        area: Math.PI * d * d / 4,             // conductor area, m^2
        ohmPerM: RHO_CU20 / (Math.PI * d * d / 4),
        kgPerM: DENS_CU * Math.PI * d * d / 4
      });
    }
    return out;
  })();

  /** Nearest tabulated gauge, so an out-of-range request cannot silently
   *  return 14 AWG and quietly change every number downstream. */
  function wireFor(awg) {
    var best = WIRE[0];
    for (var i = 0; i < WIRE.length; i++) {
      if (WIRE[i].awg === awg) return WIRE[i];
      if (Math.abs(WIRE[i].awg - awg) < Math.abs(best.awg - awg)) best = WIRE[i];
    }
    return best;
  }

  /* ── core materials ──────────────────────────────────────────────────
   * mur is an initial/amplitude permeability for a closed circuit. In a real
   * solenoid the working gap dominates the reluctance, so the exact value
   * matters far less than whether the iron saturates — which is what bsat is
   * for. Laminated grades assume the flux is in the plane of the laminations.
   */
  var CORES = [
    { id: 'air',     name: 'Air / non-magnetic (no core)', mur: 1,    bsat: null,
      note: 'Nothing to saturate; force comes only from the coil field and is small.' },
    { id: 'steel',   name: 'Low-carbon steel, 1018 / 1010', mur: 1000, bsat: 2.0,
      note: 'The usual solenoid core. Solid, so eddy currents make it poor on AC.' },
    { id: 'm19',     name: 'M19 silicon steel, laminated',  mur: 4000, bsat: 1.95,
      note: 'Laminated for AC. Standard for mains-driven coils and relays.' },
    { id: '430fr',   name: '430FR solenoid-quality stainless', mur: 800, bsat: 1.4,
      note: 'Corrosion resistant, free machining; lower saturation than plain steel.' },
    { id: 'ferrite', name: 'MnZn ferrite',                  mur: 2000, bsat: 0.45,
      note: 'For high frequency. Saturates early, so a weak choice for force.' },
    { id: 'powder',  name: 'Iron powder, -26 mix',          mur: 75,   bsat: 1.2,
      note: 'Distributed gap. Soft saturation, low permeability.' }
  ];

  function coreFor(id) {
    for (var i = 0; i < CORES.length; i++) {
      if (CORES[i].id === id) return CORES[i];
    }
    return CORES[0];
  }

  /* ── insulation classes ─────────────────────────────────────────────
   * The number is the total hotspot temperature the system is rated for, not a
   * rise. Rise plus ambient has to stay under it.
   */
  var INSULATION = [
    { id: 'A', name: 'Class A — 105 °C', tmax: 105 },
    { id: 'E', name: 'Class E — 120 °C', tmax: 120 },
    { id: 'B', name: 'Class B — 130 °C', tmax: 130 },
    { id: 'F', name: 'Class F — 155 °C', tmax: 155 },
    { id: 'H', name: 'Class H — 180 °C', tmax: 180 },
    { id: 'N', name: 'Class N — 200 °C', tmax: 200 },
    { id: 'R', name: 'Class R — 220 °C', tmax: 220 }
  ];

  function insulationFor(id) {
    for (var i = 0; i < INSULATION.length; i++) {
      if (INSULATION[i].id === id) return INSULATION[i];
    }
    return INSULATION[3];
  }

  /* ── drive modes ─────────────────────────────────────────────────────
   * Rectified mains is called out separately because it is the trap in this
   * whole subject: rectifying removes the inductive reactance that was limiting
   * the current, and a coil that sat happily on 120 VAC can draw many times its
   * design current on the DC side of a bridge.
   */
  var DRIVES = [
    { id: 'dc5',     name: '5 V DC',                       ac: false, v: 5 },
    { id: 'dc12',    name: '12 V DC',                      ac: false, v: 12 },
    { id: 'dc24',    name: '24 V DC',                      ac: false, v: 24 },
    { id: 'dc48',    name: '48 V DC',                      ac: false, v: 48 },
    { id: 'dc',      name: 'Custom DC…',                   ac: false, custom: 'dc' },
    { id: 'ac24',    name: '24 VAC, 60 Hz (control xfmr)', ac: true,  v: 24,  f: 60 },
    { id: 'ac120',   name: '120 VAC, 60 Hz (US mains)',    ac: true,  v: 120, f: 60 },
    { id: 'ac240',   name: '240 VAC, 60 Hz',               ac: true,  v: 240, f: 60 },
    { id: 'ac230e',  name: '230 VAC, 50 Hz (EU mains)',    ac: true,  v: 230, f: 50 },
    { id: 'acCustom', name: 'Custom AC…',                  ac: true,  custom: 'ac' },
    { id: 'rect120', name: '120 VAC rectified, full wave + capacitor', ac: false, v: 120, rect: 'cap' },
    { id: 'rect120n', name: '120 VAC rectified, full wave, no capacitor', ac: false, v: 120, rect: 'avg' },
    { id: 'rect240', name: '240 VAC rectified, full wave + capacitor', ac: false, v: 240, rect: 'cap' }
  ];

  function driveFor(id) {
    for (var i = 0; i < DRIVES.length; i++) {
      if (DRIVES[i].id === id) return DRIVES[i];
    }
    return DRIVES[0];
  }

  /** Terminal voltage a drive presents, and whether it is AC. */
  function driveVoltage(drive, dcVolts, customF) {
    if (drive.custom === 'dc') return { v: dcVolts, ac: false, f: 0, label: 'DC' };
    if (drive.custom === 'ac') {
      return { v: dcVolts, ac: true, f: customF || 60, label: (customF || 60) + ' Hz AC' };
    }
    if (!drive.ac && !drive.rect) return { v: drive.v, ac: false, f: 0, label: 'DC' };
    if (drive.rect === 'cap') {
      // peak-charged: the coil sees the peak, not the RMS
      return { v: drive.v * Math.SQRT2, ac: false, f: 0,
               label: 'rectified, peak-charged' };
    }
    if (drive.rect === 'avg') {
      // full-wave average, 2*sqrt(2)/pi
      return { v: drive.v * 2 * Math.SQRT2 / Math.PI, ac: false, f: 0,
               label: 'rectified, unsmoothed average' };
    }
    return { v: drive.v, ac: true, f: drive.f, label: drive.f + ' Hz AC' };
  }

  /* ── demagnetising factor ────────────────────────────────────────────
   * A core that is a bare rod does not get anywhere near its material
   * permeability: the poles at its ends set up a field opposing the one the
   * coil is driving. The prolate-spheroid factor is the standard closed-form
   * stand-in for a cylinder, and it is why a long thin core beats a stubby one.
   */
  function demagFactor(lengthOverDia) {
    var m = Math.max(lengthOverDia, 1.000001);
    var s = Math.sqrt(m * m - 1);
    return (1 / (m * m - 1)) * ((m / s) * Math.log(m + s) - 1);
  }

  function effectivePermeability(mur, lengthOverDia) {
    if (mur <= 1) return 1;
    var nd = demagFactor(lengthOverDia);
    return mur / (1 + nd * (mur - 1));
  }

  /* ── the calculation ─────────────────────────────────────────────────── */

  /**
   * @param {object} inp  all SI: boreDia, coilLen, build, gap, poleArea,
   *   awg, fill, coreId, driveId, dcVolts, ballast, ambient, insulationId,
   *   returnPath ('open'|'yoke'), hConv
   */
  function compute(inp) {
    var w    = wireFor(inp.awg);
    var core = coreFor(inp.coreId);
    var ins  = insulationFor(inp.insulationId);
    var drv  = driveFor(inp.driveId);

    var r = { wire: w, core: core, insulation: ins, drive: drv, warnings: [] };

    /* -- winding geometry -------------------------------------------- */
    var boreR = inp.boreDia / 2;
    var outerR = boreR + inp.build;
    var meanR  = boreR + inp.build / 2;

    r.windowArea = inp.coilLen * inp.build;              // m^2, axial x radial
    var cellArea = w.dIns * w.dIns;                      // square packing cell
    r.turns = Math.floor(inp.fill * r.windowArea / cellArea);
    if (r.turns < 1) {
      r.turns = 0;
      r.warnings.push('The winding window cannot hold a single turn of this wire.');
    }

    r.mlt        = 2 * Math.PI * meanR;                  // mean length of turn
    r.wireLength = r.turns * r.mlt;
    r.copperMass = r.wireLength * w.kgPerM;
    r.outerDia   = 2 * outerR;

    /* -- resistance, cold and hot ------------------------------------- */
    r.rCold = r.wireLength * w.ohmPerM;

    /* -- inductance ---------------------------------------------------
     * Wheeler's multilayer formula in inches, the standard engineering
     * approximation for a rectangular-section air coil. The core then raises it
     * by the effective permeability, which for an open rod is a small fraction
     * of the material value.
     */
    var aIn = meanR / 0.0254, bIn = inp.coilLen / 0.0254, cIn = inp.build / 0.0254;
    var lAirUH = (0.8 * aIn * aIn * r.turns * r.turns) /
                 (6 * aIn + 9 * bIn + 10 * cIn);
    r.lAir = lAirUH * 1e-6;

    r.coreSlenderness = inp.coilLen / Math.max(inp.boreDia, 1e-9);
    r.muEff = core.mur > 1 ? effectivePermeability(core.mur, r.coreSlenderness) : 1;
    if (inp.returnPath === 'yoke' && core.mur > 1) {
      // A steel shell closing the circuit removes most of the demagnetising
      // penalty; the working gap then sets the reluctance.
      var lIron = inp.coilLen + inp.boreDia;
      var rIron = lIron / (MU0 * core.mur * inp.poleArea);
      var rGap  = inp.gap / (MU0 * inp.poleArea);
      r.muEff = (lIron + inp.gap) / (MU0 * inp.poleArea * (rIron + rGap));
    }
    r.inductance = r.lAir * r.muEff;

    /* -- drive --------------------------------------------------------- */
    var dv = driveVoltage(drv, inp.dcVolts, inp.customF);
    r.supplyV = dv.v;
    r.isAC    = dv.ac;
    r.freq    = dv.f;
    r.driveLabel = dv.label;

    // Solve the operating point: resistance depends on temperature, temperature
    // depends on dissipation, dissipation depends on resistance. A handful of
    // passes settles it — it converges quickly because the tempco is small.
    var tCoil = inp.ambient, rHot = r.rCold, current = 0, pReal = 0;
    var surface = surfaceArea(inp.boreDia, r.outerDia, inp.coilLen);
    for (var pass = 0; pass < 40; pass++) {
      rHot = r.rCold * (1 + ALPHA_CU * (tCoil - 20));
      var rTot = rHot + inp.ballast;
      if (r.isAC) {
        r.xl = 2 * Math.PI * r.freq * r.inductance;
        r.z  = Math.sqrt(rTot * rTot + r.xl * r.xl);
        current = r.supplyV / r.z;
        pReal   = current * current * rHot;         // ballast burns the rest
      } else {
        r.xl = 0;
        r.z  = rTot;
        current = r.supplyV / rTot;
        pReal   = current * current * rHot;
      }
      var riseSteady = pReal / (inp.hConv * surface);
      var next = inp.ambient + riseSteady;
      if (Math.abs(next - tCoil) < 0.01) { tCoil = next; break; }
      tCoil = tCoil + 0.5 * (next - tCoil);          // damped, for stability
    }

    // The fixed point above is self-consistent but stops meaning anything once
    // it climbs past what the materials survive: copper anneals from about
    // 200 C and melts at 1085, the film is long gone, and free convection is no
    // longer the mechanism. Past that, the honest answer is "there is no usable
    // steady state" and the design has to be read off the time and duty limits.
    r.noSteadyState = tCoil > 300;

    r.rHot      = rHot;
    r.current   = current;
    r.powerCoil = pReal;
    r.powerBallast = inp.ballast > 0 ? current * current * inp.ballast : 0;
    r.surfaceArea = surface;
    r.steadyTemp  = tCoil;
    r.steadyRise  = tCoil - inp.ambient;
    r.currentDensity = r.turns > 0 ? current / w.area : 0;   // A/m^2

    if (r.isAC) {
      r.apparentVA = r.supplyV * current;
      r.powerFactor = r.z > 0 ? (rHot + inp.ballast) / r.z : 1;
    }

    /* -- magnetic circuit ---------------------------------------------- */
    r.ampereTurns = r.turns * current;
    r.magPathLen  = inp.coilLen;
    r.H           = r.magPathLen > 0 ? r.ampereTurns / r.magPathLen : 0;

    // Flux from the reluctance of iron plus working gap. With no return path
    // the leakage path is represented by the demagnetised effective mu, which
    // is the same statement in different clothes.
    /* How many working gaps the flux crosses.
     *
     * A plunger pulled onto a stop crosses one: out of the plunger face, into
     * the stop, and home through the shell with no second gap in the way.
     *
     * A flat armature on a pot or horseshoe magnet crosses two — out at one
     * pole, back in at the other — and that is not a detail. Two gaps double
     * the reluctance, so B halves; force per face goes as B squared, a quarter,
     * but there are two faces. Net result is half the force of a single-gap
     * circuit at the same ampere-turns, gap and pole area.
     */
    var nGaps = inp.gapCount === 2 ? 2 : 1;
    r.gapCount = nGaps;

    var A = inp.poleArea;
    var reluctGap  = inp.gap > 0 ? nGaps * inp.gap / (MU0 * A) : 0;
    var muUse = (inp.returnPath === 'yoke') ? core.mur : r.muEff;
    var reluctIron = inp.coilLen / (MU0 * Math.max(muUse, 1) * A);
    r.reluctance = reluctGap + reluctIron;
    r.flux       = r.reluctance > 0 ? r.ampereTurns / r.reluctance : 0;
    r.bGap       = A > 0 ? r.flux / A : 0;

    r.saturated = false;
    if (core.bsat !== null && r.bGap > core.bsat) {
      r.bUnsat = r.bGap;
      r.bGap = core.bsat;                 // the iron cannot carry more
      r.flux = r.bGap * A;
      r.saturated = true;
      r.warnings.push(
        'The core saturates. Flux density wants to reach ' +
        r.bUnsat.toFixed(2) + ' T but ' + core.name + ' holds about ' +
        core.bsat.toFixed(2) + ' T, so force is capped well below what the ' +
        'ampere-turns suggest. More current will not help; more pole area will.');
    }

    /* -- force ---------------------------------------------------------
     * Maxwell stress across the working gap. This is the honest model for a
     * flat armature or plate pulled against a pole face, and the ceiling for
     * anything else.
     */
    r.force = nGaps * r.bGap * r.bGap * A / (2 * MU0);  // N, summed over the faces
    r.pressure = r.force / (nGaps * A);                 // Pa on each face
    r.forceCeiling = core.bsat !== null
      ? nGaps * core.bsat * core.bsat * A / (2 * MU0) : null;
    r.pressureCeiling = core.bsat !== null
      ? core.bsat * core.bsat / (2 * MU0) : null;

    // How the force collapses with gap, for the curve.
    r.forceAtGap = function (g) {
      var rg = g > 0 ? nGaps * g / (MU0 * A) : 0;
      var flux = r.ampereTurns / (rg + reluctIron);
      var b = flux / A;
      if (core.bsat !== null && b > core.bsat) b = core.bsat;
      return nGaps * b * b * A / (2 * MU0);
    };

    /* -- thermal --------------------------------------------------------
     * Two bounds. Steady state assumes the coil reaches equilibrium with free
     * air. The adiabatic time assumes none of the heat escapes, which is the
     * right assumption for the first seconds — and the first seconds are
     * exactly the question when a small coil is thrown across 120 VAC.
     */
    r.tempLimit = ins.tmax;
    r.thermalOK = r.steadyTemp <= ins.tmax;

    var headroom = ins.tmax - inp.ambient;
    r.timeToLimit = (r.powerCoil > 0 && r.copperMass > 0)
      ? r.copperMass * CP_CU * headroom / r.powerCoil
      : Infinity;

    // Duty cycle that keeps the average dissipation inside what free air can
    // carry away at the insulation limit.
    var pAllowed = inp.hConv * surface * headroom;
    r.dutyCycle = r.powerCoil > 0 ? Math.min(1, pAllowed / r.powerCoil) : 1;

    if (r.noSteadyState) {
      r.warnings.push(
        'There is no usable steady state: at ' + r.powerCoil.toFixed(0) +
        ' W into ' + (surface * 1e4).toFixed(0) + ' cm² of surface the coil ' +
        'runs away past the point where copper and film survive. Size this one ' +
        'on the burst time, about ' + fmtTime(r.timeToLimit) + ' from cold to ' +
        'the ' + ins.tmax + ' °C limit, or on ' +
        Math.round(r.dutyCycle * 100) + '% duty, not on the equilibrium number.');
    } else if (!r.thermalOK) {
      r.warnings.push(
        'Continuous duty would settle at ' + Math.round(r.steadyTemp) +
        ' °C, past the ' + ins.tmax + ' °C insulation limit. Intermittent only: ' +
        'about ' + fmtTime(r.timeToLimit) + ' from cold, or ' +
        Math.round(r.dutyCycle * 100) + '% duty.');
    }

    if (r.isAC && core.id === 'steel') {
      r.warnings.push(
        'A solid steel core on AC carries eddy currents that both heat it and ' +
        'shield the interior, so the real inductance is lower and the real ' +
        'dissipation higher than modelled here. Laminate it.');
    }

    if (!r.isAC && drv.rect && r.turns > 0) {
      var acRef = null;
      for (var k = 0; k < DRIVES.length; k++) {
        if (DRIVES[k].ac && DRIVES[k].v === drv.v) { acRef = DRIVES[k]; break; }
      }
      if (acRef) {
        // Both sides are evaluated at the same (cold) resistance. Using each
        // case's own hot resistance would compare a cool coil against a
        // cooking one and understate the jump — the point being made is about
        // reactance disappearing, not about tempco.
        var rRef = r.rCold + inp.ballast;
        var xl = 2 * Math.PI * acRef.f * r.inductance;
        var zac = Math.sqrt(rRef * rRef + xl * xl);
        var iac = acRef.v / zac;
        var idc = r.supplyV / rRef;
        r.acRefCurrent = iac;
        r.dcRefCurrent = idc;
        r.rectifierRatio = iac > 0 ? idc / iac : 0;
        if (r.rectifierRatio > 1.2) {
          r.warnings.push(
            'Rectifying removes the reactance that was limiting the current. ' +
            'From cold this winding draws ' + iac.toFixed(2) + ' A on ' +
            acRef.v + ' VAC but ' + idc.toFixed(2) + ' A behind the rectifier, ' +
            r.rectifierRatio.toFixed(1) + '× the current and ' +
            Math.pow(r.rectifierRatio, 2).toFixed(0) + '× the heating. ' +
            'The more inductive the coil, the worse this gets.');
        } else {
          r.warnings.push(
            'This winding is resistance-dominated at ' +
            (2 * Math.PI * acRef.f * r.inductance).toFixed(0) + ' Ω of reactance ' +
            'against ' + r.rCold.toFixed(0) + ' Ω of copper, so rectifying ' +
            'changes the current by only ' + r.rectifierRatio.toFixed(2) + '×. ' +
            'That is not a general result: a coil built to be reactance-limited ' +
            'on mains will draw many times its design current behind a bridge.');
        }
      }
    }

    /* -- how far can the model be trusted -------------------------------
     * The lumped circuit assumes every line of flux crosses the gap inside the
     * pole footprint. That holds while the gap is small next to the pole; once
     * it is not, the flux bulges out sideways and closes through air, and the
     * lumped answer becomes an optimistic upper bound rather than an estimate.
     */
    r.poleDia  = Math.sqrt(4 * A / Math.PI);
    r.gapRatio = r.poleDia > 0 ? inp.gap / r.poleDia : 0;

    if (inp.gap <= 0) {
      r.warnings.push(
        'A zero gap is the seated condition. Force there is set by saturation ' +
        'and by surface finish, not by the magnetic circuit. Treat the number ' +
        'as an upper bound and size on the open-gap force instead.');
    } else if (r.gapRatio > 1) {
      r.warnings.push(
        'The gap is ' + r.gapRatio.toFixed(1) + '× the pole diameter, which is ' +
        'well outside where a lumped magnetic circuit means anything. Nearly ' +
        'all the flux closes through the air beside the pole rather than ' +
        'crossing to the armature, so the real pull is a small fraction of the ' +
        'figure above. Read it as "almost nothing", not as a number.');
    } else if (r.gapRatio > 0.3) {
      r.warnings.push(
        'The gap is ' + (r.gapRatio * 100).toFixed(0) + '% of the pole diameter. ' +
        'Fringing is significant at that spacing and this model ignores it, so ' +
        'the real force is lower than shown. Treat it as an upper bound.');
    }

    return r;
  }

  /* ── equivalent permanent magnet ────────────────────────────────
   * "Buy a big cheap magnet or build a strong electromagnet" is the question
   * this whole page exists to answer, so it is worth answering properly.
   *
   * A magnet sitting in the same iron circuit is the same magnetic problem with
   * a different source. The coil supplies NI ampere-turns; a magnet of length
   * L_m supplies H_c·L_m, and carries its own internal reluctance
   * L_m/(µ₀µ_rec·A) because its working point slides down the recoil line.
   * Writing that circuit out and cancelling gives a pleasantly simple result:
   *
   *     B_gap = B_r · L_m / (L_m + µ_rec·G)
   *
   * where G is everything else in the circuit expressed as an equivalent length
   * of air — the working gaps plus the iron path divided by its permeability.
   * The magnet approaches B_r only as it grows long compared with µ_rec·G,
   * which is the whole reason magnets for big gaps are thick.
   *
   * Inverting it gives the thickness needed to hit a target flux density:
   *
   *     L_m = µ_rec·G · B_t / (B_r − B_t)
   *
   * and that denominator carries the hard limit: no thickness of any grade
   * reaches B_r, so a coil driven past a grade's remanence cannot be replaced by
   * that grade at the same pole area at all, only by a larger face.
   *
   * Force is then the same Maxwell stress the coil uses, so matching B_gap
   * matches force exactly.
   */
  var MAGNETS = [
    { id: 'y30',   name: 'Ferrite / ceramic C8 (Y30)', br: 0.39, murec: 1.10,
      tmax: 250, rho: 4900, usd: 60,
      note: 'Cheap, corrosion-proof and nearly free in volume. Low remanence, ' +
            'so it wins only where there is room to be large.' },
    { id: 'alnico5', name: 'Alnico 5', br: 1.25, murec: 4.0,
      tmax: 525, rho: 7300, usd: 400,
      note: 'High remanence but low coercivity, so it must be long and thin ' +
            'and is easily demagnetised, including by the coil it replaces.' },
    { id: 'n35',   name: 'NdFeB N35', br: 1.19, murec: 1.05,
      tmax: 80, rho: 7500, usd: 220,
      note: 'The usual starting grade. Loses about 0.11% of B_r per °C.' },
    { id: 'n42',   name: 'NdFeB N42', br: 1.30, murec: 1.05,
      tmax: 80, rho: 7500, usd: 260,
      note: 'The common value choice, with most of the strength of N52 at a ' +
            'lower price.' },
    { id: 'n52',   name: 'NdFeB N52', br: 1.44, murec: 1.05,
      tmax: 80, rho: 7500, usd: 340,
      note: 'About as strong as commercial magnets get. Brittle, and the ' +
            'grade least tolerant of heat.' },
    { id: 'n42sh', name: 'NdFeB N42SH (high temp)', br: 1.29, murec: 1.05,
      tmax: 150, rho: 7500, usd: 340,
      note: 'N42 strength rated to 150 °C, for service next to a warm coil.' },
    { id: 'sm26',  name: 'SmCo 26', br: 1.05, murec: 1.05,
      tmax: 300, rho: 8400, usd: 900,
      note: 'Expensive, but holds its strength hot and does not corrode.' }
  ];

  function magnetFor(id) {
    for (var i = 0; i < MAGNETS.length; i++) {
      if (MAGNETS[i].id === id) return MAGNETS[i];
    }
    return MAGNETS[0];
  }

  /** Gap flux density for a magnet of thickness lm across an equivalent air
   *  length gEq. @returns {number} tesla */
  function magnetB(grade, lm, gEq) {
    if (lm <= 0) return 0;
    return grade.br * lm / (lm + grade.murec * gEq);
  }

  /**
   * What magnet would do the job of this coil.
   *
   * @param {Object} r    a compute() result
   * @param {Object} inp  the same inputs that produced it
   * @returns {Object} target force and flux density, plus one row per grade
   */
  function magnetEquivalent(r, inp) {
    var A = inp.poleArea;
    var n = r.gapCount;
    var core = coreFor(inp.coreId);

    /* Pressed metal-to-metal there is still a gap: flatness, plating and the
     * finish itself leave something like 0.05 mm. Without a floor the algebra
     * would hand back a magnet of zero thickness, which is the one answer that
     * is certainly wrong. */
    var G_MIN = 5e-5;
    var gap = Math.max(inp.gap, G_MIN);
    var gapFloored = inp.gap < G_MIN;

    // the circuit, as an equivalent length of air
    var muUse = (inp.returnPath === 'yoke') ? core.mur : r.muEff;
    var gEq = n * gap + inp.coilLen / Math.max(muUse, 1);

    /* Match the coil's own gap flux density. Both sides of the comparison then
     * sit in the same circuit with the same fringing neglected, which is what
     * makes the ratio between them trustworthy even where the absolute numbers
     * are optimistic. */
    var bTarget = r.bGap;
    var fTarget = r.force;

    // a magnet filling the whole coil envelope, for the "just buy a big one" case
    var envDia = inp.boreDia + 2 * inp.build;
    var envArea = Math.PI * envDia * envDia / 4;

    var rows = MAGNETS.map(function (m) {
      var reach = bTarget < m.br;
      var lm = reach ? m.murec * gEq * bTarget / (m.br - bTarget) : null;

      var vol = lm !== null ? A * lm : null;
      var mass = vol !== null ? vol * m.rho : null;

      /* Ceiling: an infinitely thick magnet of this grade reaches B_r, so this
       * is the most force the grade can ever make across this pole face. */
      var fCeil = n * m.br * m.br * A / (2 * MU0);
      var areaNeeded = 2 * MU0 * fTarget / (n * m.br * m.br);

      // same overall size as the coil assembly
      var bEnv = magnetB(m, inp.coilLen, gEq);
      var fEnv = n * bEnv * bEnv * envArea / (2 * MU0);

      return {
        grade: m,
        reachable: reach,
        thickness: lm,               // m
        volume: vol,                 // m^3
        mass: mass,                  // kg
        /* Material cost at a finished-part rate. An earlier version floored
           this at the ~$2 a supplier charges for any small part, which was
           true but flattened every NdFeB grade onto the same number and hid
           the very difference the column exists to show. The floor is stated
           in the note instead, where it cannot destroy the ranking. */
        cost: mass !== null ? mass * m.usd : null,
        usdPerKg: m.usd,
        aspect: lm !== null && r.poleDia > 0 ? lm / r.poleDia : null,
        forceCeiling: fCeil,         // N
        areaNeeded: areaNeeded,      // m^2
        envForce: fEnv,              // N
        envB: bEnv,
        tooHotFor: r.noSteadyState ? false : r.steadyTemp > m.tmax
      };
    });

    return {
      bTarget: bTarget,
      fTarget: fTarget,
      gapUsed: gap,
      gapFloored: gapFloored,
      gapEquivalent: gEq,
      poleArea: A,
      gapCount: n,
      envArea: envArea,
      envDia: envDia,
      envLen: inp.coilLen,
      coilPower: r.powerCoil + r.powerBallast,
      rows: rows,
      feasible: rows.filter(function (x) { return x.reachable; }).length
    };
  }

  /** Outside cylinder plus the two annular ends — what free air can reach. */
  function surfaceArea(boreDia, outerDia, len) {
    var side = Math.PI * outerDia * len;
    var ends = 2 * Math.PI * (outerDia * outerDia - boreDia * boreDia) / 4;
    return side + ends;
  }

  function fmtTime(s) {
    if (!isFinite(s)) return 'indefinitely';
    if (s < 1) return (s * 1000).toFixed(0) + ' ms';
    if (s < 90) return s.toFixed(1) + ' s';
    if (s < 5400) return (s / 60).toFixed(1) + ' min';
    return (s / 3600).toFixed(1) + ' h';
  }

  return {
    MU0: MU0,
    WIRE: WIRE,
    CORES: CORES,
    MAGNETS: MAGNETS,
    INSULATION: INSULATION,
    DRIVES: DRIVES,
    wireFor: wireFor,
    coreFor: coreFor,
    magnetFor: magnetFor,
    magnetB: magnetB,
    magnetEquivalent: magnetEquivalent,
    driveFor: driveFor,
    demagFactor: demagFactor,
    effectivePermeability: effectivePermeability,
    surfaceArea: surfaceArea,
    fmtTime: fmtTime,
    compute: compute
  };
})();
