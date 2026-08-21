// Fluid Velocity in Pipe Calculator
// v = Q / A, A = (pi/4) * D^2  ->  D = sqrt(4Q / (pi * v))
// All conversions pivot through SI base units: flow -> m3/s, length -> m, velocity -> m/s.

const pvFlowToM3s = {
  gpm:    0.003785411784 / 60,
  gps:    0.003785411784,
  gph:    0.003785411784 / 3600,
  ukgpm:  0.00454609 / 60,
  ft3s:   0.028316846592,
  ft3min: 0.028316846592 / 60,
  ft3hr:  0.028316846592 / 3600,
  in3s:   0.000016387064,
  in3min: 0.000016387064 / 60,
  m3s:    1,
  m3min:  1 / 60,
  m3hr:   1 / 3600,
  Ls:     0.001,
  Lmin:   0.001 / 60,
  Lhr:    0.001 / 3600,
  mLmin:  0.000001 / 60,
  bblday: 0.158987294928 / 86400,
  mgd:    (1000000 * 0.003785411784) / 86400,
};

const pvDiamToM = {
  in: 0.0254,
  ft: 0.3048,
  mm: 0.001,
  cm: 0.01,
  m:  1,
};

const pvVelToMs = {
  fts:   0.3048,
  ms:    1,
  ins:   0.0254,
  cms:   0.01,
  mms:   0.001,
  ftmin: 0.3048 / 60,
  mmin:  1 / 60,
  mph:   0.44704,
  kmh:   1 / 3.6,
  knot:  0.514444,
};

function pvSetOut(id, val, digits) {
  document.getElementById(id).textContent =
    (val === null || val === undefined || isNaN(val) || !isFinite(val)) ? 'Out of Range' : val.toFixed(digits);
}

function pvToggleRows() {
  const solvingForDiam = document.getElementById('pipeVelSolveCheck').checked;
  document.getElementById('HideablePipeID').style.display = solvingForDiam ? 'none' : 'flex';
  document.getElementById('HideableVelocity').style.display = solvingForDiam ? 'flex' : 'none';
  document.getElementById('VelUnitRow').style.display = solvingForDiam ? 'none' : 'flex';
  document.getElementById('DiamUnitRow').style.display = solvingForDiam ? 'flex' : 'none';
  document.getElementById('ResultVelocityRow').style.display = solvingForDiam ? 'none' : 'flex';
  document.getElementById('ResultDiamRow').style.display = solvingForDiam ? 'flex' : 'none';
}

function pvCalculate() {
  pvToggleRows();

  const solvingForDiam = document.getElementById('pipeVelSolveCheck').checked;

  const flowVal = parseFloat(document.getElementById('pvFlowInput').value);
  const flowUnit = document.getElementById('pvFlowUnit').value;
  const Q_m3s = (!isNaN(flowVal)) ? flowVal * pvFlowToM3s[flowUnit] : NaN;

  let V_ms = null;
  let D_m = null;

  if (!solvingForDiam) {
    // Solve for velocity: need flow + pipe ID
    const diamVal = parseFloat(document.getElementById('pvDiamInput').value);
    const diamUnit = document.getElementById('pvDiamInputUnit').value;
    D_m = (!isNaN(diamVal)) ? diamVal * pvDiamToM[diamUnit] : NaN;

    if (!isNaN(Q_m3s) && !isNaN(D_m) && D_m > 0) {
      const A_m2 = (Math.PI / 4) * D_m * D_m;
      V_ms = Q_m3s / A_m2;
    } else {
      V_ms = NaN;
    }

    const resultUnit = document.getElementById('pvResultVelUnit').value;
    const resultVal = (V_ms !== null) ? V_ms / pvVelToMs[resultUnit] : NaN;
    pvSetOut('pvResultVel', resultVal, 4);

  } else {
    // Solve for pipe ID: need flow + velocity
    const velVal = parseFloat(document.getElementById('pvVelInput').value);
    const velUnit = document.getElementById('pvVelInputUnit').value;
    V_ms = (!isNaN(velVal)) ? velVal * pvVelToMs[velUnit] : NaN;

    if (!isNaN(Q_m3s) && !isNaN(V_ms) && V_ms > 0) {
      D_m = Math.sqrt((4 * Q_m3s) / (Math.PI * V_ms));
    } else {
      D_m = NaN;
    }

    const resultUnit = document.getElementById('pvResultDiamUnit').value;
    const resultVal = (D_m !== null) ? D_m / pvDiamToM[resultUnit] : NaN;
    pvSetOut('pvResultDiam', resultVal, 5);
  }

  // Secondary always-shown readouts, computed whenever both V and D are known
  const vFts = (V_ms !== null && !isNaN(V_ms)) ? V_ms / pvVelToMs.fts : NaN;
  const vMs = (V_ms !== null) ? V_ms : NaN;
  pvSetOut('pvAlt_fts', vFts, 4);
  pvSetOut('pvAlt_ms', vMs, 4);

  if (D_m !== null && !isNaN(D_m) && D_m > 0) {
    const A_m2 = (Math.PI / 4) * D_m * D_m;
    const A_in2 = A_m2 / (0.0254 * 0.0254);
    const A_ft2 = A_m2 / (0.3048 * 0.3048);
    pvSetOut('pvArea_in2', A_in2, 4);
    pvSetOut('pvArea_ft2', A_ft2, 5);
  } else {
    pvSetOut('pvArea_in2', NaN, 4);
    pvSetOut('pvArea_ft2', NaN, 5);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('pipeVelSolveCheck').addEventListener('change', pvCalculate);
  pvCalculate();
});
