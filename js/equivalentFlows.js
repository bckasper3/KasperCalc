let denseWater1 = 998; //kg per m^3, for water at 70°F
let denseWater2 = 998; //kg per m^3, for water at 70°F
let waterDensity1;
let waterDensity2;
let flow1PPH;
let density1_kgm;
let density2_kgm;
let result;

let denseWater3 = 998; //kg per m^3, for water at 70°F
let denseWater4 = 998; //kg per m^3, for water at 70°F
let denseWater5 = 998; //kg per m^3, for water at 70°F
let waterDensity3;
let waterDensity4;
let waterDensity5;
let flow3PPH;
let flow4PPH;
let density3_kgm;
let density4_kgm;
let density5_kgm;
let result1;

const csvFiles1 = [
  '../csvData/densityofWater-combined.csv',
];

let switchIndex = 0;
let flag = false;
let fallData1;
let nonChartData;

// ─── Unit Conversion Factors ──────────────────────────────────────────────────
const PPH_PER_LBSEC   = 3600;
const PPH_PER_LBMIN   = 60;
const PPH_PER_KGMIN   = 132.2773573;
const PPH_PER_KGHR    = 2.204622622;
const PPH_PER_GRAMSEC = 7.936641439;
const PPH_PER_TONHR   = 2204.622622;

// ─── Unit Label Lookup ────────────────────────────────────────────────────────
const unitLabels = {
  PPH:     'lb/hr (PPH)',
  GPM:     'GPM',
  kgPs:    'kg/sec',
  gramM:   'gram/min',
  lbSec:   'lb/sec',
  lbMin:   'lb/min',
  kgMin:   'kg/min',
  kgHr:    'kg/hr',
  gramSec: 'gram/sec',
  tonHr:   'ton/hr (metric)',
  inSec:   'in³/sec',
  ftSec:   'ft³/sec',
  mSEc:    'm³/sec',
  mmSec:   'mm³/sec',
  lMin:    'L/min',
};

// Maps flowUnit value → result label span ID for Calculator 1 (Flow 2 output)
const resultLabelIds1 = {
  PPH:     'FlowResult1',
  GPM:     'FlowResult2',
  kgPs:    'FlowResult3',
  gramM:   'FlowResult4',
  lbSec:   'FlowResult10',
  lbMin:   'FlowResult11_lbsec',
  kgMin:   'FlowResult12_lbmin',
  kgHr:    'FlowResult13_kgmin',
  gramSec: 'FlowResult14_kghr',
  tonHr:   'FlowResult15_tonhr',
  inSec:   'FlowResult5',
  ftSec:   'FlowResult6',
  mSEc:    'FlowResult7',
  mmSec:   'FlowResult8',
  lMin:    'FlowResult9',
};

// Maps flowUnit value → result label span ID for Calculator 2 (Flow 5 output)
const resultLabelIds2 = {
  PPH:     'FlowResult11',
  GPM:     'FlowResult12',
  kgPs:    'FlowResult13',
  gramM:   'FlowResult14',
  lbSec:   'FlowResult20_gramsec',
  lbMin:   'FlowResult21_lbsec',
  kgMin:   'FlowResult22_lbmin',
  kgHr:    'FlowResult23_kgmin',
  gramSec: 'FlowResult24_kghr',
  tonHr:   'FlowResult25_tonhr',
  inSec:   'FlowResult15',
  ftSec:   'FlowResult16',
  mSEc:    'FlowResult17',
  mmSec:   'FlowResult18',
  lMin:    'FlowResult19',
};

function updateResultLabel(labelIds, selectedUnit) {
  Object.values(labelIds).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const activeId = labelIds[selectedUnit];
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.style.display = '';
  }
}

// ─── CSV Load & Init ──────────────────────────────────────────────────────────
transformedData = function () {
  return fallData1.map(dataset => dataset.map(point => [point.x, point.y]));
};

processCSVFiles(csvFiles1)
  .then(allData1 => {
    fallData1   = allData1;
    nonChartData = transformedData();
    calculate();
    calculate6();
  })
  .catch(error => {
    console.error('Error processing CSV files:', error);
  });


// ─── CALCULATOR 1: Single-stream flow conversion ──────────────────────────────
function calculate() {
  calculate1();
  denseWater1 = waterDensity1;
  calculate2();
  denseWater2 = waterDensity2;

  const flow1InputNum = parseFloat(document.getElementById('flow1InputNum').value) || 0;
  const flowUnit1     = document.getElementById('flowUnit1').value;
  const dens1InputNum = parseFloat(document.getElementById('dens1InputNum').value) || 0;
  const densUnit1     = document.getElementById('densUnit1').value;

  const flowUnit2     = document.getElementById('flowUnit2').value;
  const dens2InputNum = parseFloat(document.getElementById('dens2InputNum').value) || 0;
  const densUnit2     = document.getElementById('densUnit2').value;

  const HideableDensity1          = document.getElementById('HideableDensity1');
  const HideableTemp1             = document.getElementById('HideableTemp1');
  const HideableDensity2          = document.getElementById('HideableDensity2');
  const HideableTemp2             = document.getElementById('HideableTemp2');
  const HideableTemp1waterdensity = document.getElementById('HideableTemp1waterdensity');
  const HideableTemp2waterdensity = document.getElementById('HideableTemp2waterdensity');

  // Show / hide S.G. temperature fields
  toggleSGFields(densUnit1, HideableTemp1, HideableTemp1waterdensity);
  toggleSGFields(densUnit2, HideableTemp2, HideableTemp2waterdensity);

  // Convert densities → kg/m³
  density1_kgm = toDensityKGM(densUnit1, dens1InputNum, denseWater1);
  density2_kgm = toDensityKGM(densUnit2, dens2InputNum, denseWater2);

  // Convert input flow → PPH, then PPH → desired output unit
  flow1PPH = toFlowPPH(flowUnit1, flow1InputNum, density1_kgm, HideableDensity1, HideableTemp1);
  result   = fromFlowPPH(flowUnit2, flow1PPH, density2_kgm, HideableDensity2, HideableTemp2);

  // Write result and update label to match selected output unit
  document.getElementById('result_selectedUnit').innerText  = result.toFixed(3);
  updateResultLabel(resultLabelIds1, flowUnit2);
}


// ─── CALCULATOR 2: Two-stream blended flow conversion ─────────────────────────
function calculate6() {
  calculate3();
  denseWater3 = waterDensity3;
  calculate4();
  denseWater4 = waterDensity4;
  calculate5();
  denseWater5 = waterDensity5;

  const flow3InputNum = parseFloat(document.getElementById('flow3InputNum').value) || 0;
  const flowUnit3     = document.getElementById('flowUnit3').value;
  const dens3InputNum = parseFloat(document.getElementById('dens3InputNum').value) || 0;
  const densUnit3     = document.getElementById('densUnit3').value;

  const flow4InputNum = parseFloat(document.getElementById('flow4InputNum').value) || 0;
  const flowUnit4     = document.getElementById('flowUnit4').value;
  const dens4InputNum = parseFloat(document.getElementById('dens4InputNum').value) || 0;
  const densUnit4     = document.getElementById('densUnit4').value;

  const flowUnit5     = document.getElementById('flowUnit5').value;
  const dens5InputNum = parseFloat(document.getElementById('dens5InputNum').value) || 0;
  const densUnit5     = document.getElementById('densUnit5').value;

  const HideableDensity3          = document.getElementById('HideableDensity3');
  const HideableTemp3             = document.getElementById('HideableTemp3');
  const HideableDensity4          = document.getElementById('HideableDensity4');
  const HideableTemp4             = document.getElementById('HideableTemp4');
  const HideableDensity5          = document.getElementById('HideableDensity5');
  const HideableTemp5             = document.getElementById('HideableTemp5');
  const HideableTemp3waterdensity = document.getElementById('HideableTemp3waterdensity');
  const HideableTemp4waterdensity = document.getElementById('HideableTemp4waterdensity');
  const HideableTemp5waterdensity = document.getElementById('HideableTemp5waterdensity');

  // Show / hide S.G. temperature fields
  toggleSGFields(densUnit3, HideableTemp3, HideableTemp3waterdensity);
  toggleSGFields(densUnit4, HideableTemp4, HideableTemp4waterdensity);
  toggleSGFields(densUnit5, HideableTemp5, HideableTemp5waterdensity);

  // Convert densities → kg/m³
  density3_kgm = toDensityKGM(densUnit3, dens3InputNum, denseWater3);
  density4_kgm = toDensityKGM(densUnit4, dens4InputNum, denseWater4);
  density5_kgm = toDensityKGM(densUnit5, dens5InputNum, denseWater5);

  // Convert each input flow → PPH, sum, then convert to desired output
  flow3PPH = toFlowPPH(flowUnit3, flow3InputNum, density3_kgm, HideableDensity3, HideableTemp3);
  flow4PPH = toFlowPPH(flowUnit4, flow4InputNum, density4_kgm, HideableDensity4, HideableTemp4);
  result1  = fromFlowPPH(flowUnit5, flow3PPH + flow4PPH, density5_kgm, HideableDensity5, HideableTemp5);

  // Write result and update label to match selected output unit
  document.getElementById('result_selectedUnit1').innerText = result1.toFixed(3);
  updateResultLabel(resultLabelIds2, flowUnit5);
}


// ─── Helper: toggle S.G.-dependent temperature & water density fields ─────────
function toggleSGFields(densUnit, hideableTemp, hideableTempWaterDensity) {
  const show = densUnit === 'S.G.' ? 'flex' : 'none';
  hideableTemp.style.display              = show;
  hideableTempWaterDensity.style.display  = show;
}


// ─── Helper: convert any density unit → kg/m³ ────────────────────────────────
function toDensityKGM(densUnit, value, waterDensity) {
  switch (densUnit) {
    case 'kgm':       return value;
    case 'S.G.':      return value * waterDensity;
    case 'LB / Gal':  return value * (1 / 231) * 27679.90471;
    case 'lbin':      return value * 27679.90471;
    default:          return 999;
  }
}


// ─── Helper: convert any flow unit → PPH ─────────────────────────────────────
function toFlowPPH(flowUnit, flowValue, density_kgm, hideableDensity, hideableTemp) {
  let pph;
  switch (flowUnit) {
    // Mass flow — no density needed
    case 'PPH':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue;
      break;
    case 'kgPs':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * 7936.6414387;
      break;
    case 'gramM':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * 0.1322773573;           // gram/min → PPH
      break;
    case 'lbSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_LBSEC;
      break;
    case 'lbMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_LBMIN;
      break;
    case 'kgMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_KGMIN;
      break;
    case 'kgHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_KGHR;
      break;
    case 'gramSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_GRAMSEC;
      break;
    case 'tonHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_TONHR;
      break;
    // Volumetric flow — density required
    case 'GPM':
      hideableDensity.style.display = 'flex';
      pph = flowValue * 60 * density_kgm * (1 / 27679.90471) * 231;
      break;
    case 'inSec':
      hideableDensity.style.display = 'flex';
      pph = flowValue * 3600 * density_kgm * (1 / 27679.90471);
      break;
    case 'ftSec':
      hideableDensity.style.display = 'flex';
      pph = flowValue * 1728 * 3600 * density_kgm * (1 / 27679.90471);
      break;
    case 'mSEc':
      hideableDensity.style.display = 'flex';
      pph = flowValue * Math.pow(39.3701, 3) * 3600 * density_kgm * (1 / 27679.90471);
      break;
    case 'mmSec':
      hideableDensity.style.display = 'flex';
      pph = flowValue * Math.pow(0.0393701, 3) * 3600 * density_kgm * (1 / 27679.90471);
      break;
    case 'lMin':
      hideableDensity.style.display = 'flex';
      pph = flowValue * 61.0237 * 60 * density_kgm * (1 / 27679.90471);
      break;
    default:
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue;
  }
  return pph;
}


// ─── Helper: convert PPH → any output unit ───────────────────────────────────
function fromFlowPPH(flowUnit, pph, density_kgm, hideableDensity, hideableTemp) {
  let value;
  switch (flowUnit) {
    // Mass flow — no density needed
    case 'PPH':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph;
      break;
    case 'kgPs':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph * 0.0001259979;
      break;
    case 'gramM':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph * 7.5598728333;               // PPH → gram/min
      break;
    case 'lbSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_LBSEC;
      break;
    case 'lbMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_LBMIN;
      break;
    case 'kgMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_KGMIN;
      break;
    case 'kgHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_KGHR;
      break;
    case 'gramSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_GRAMSEC;
      break;
    case 'tonHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_TONHR;
      break;
    // Volumetric flow — density required
    case 'GPM':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 60) * 27679.90471 * (1 / density_kgm) * (1 / 231);
      break;
    case 'inSec':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 3600) * 27679.90471 * (1 / density_kgm);
      break;
    case 'ftSec':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 3600) * 27679.90471 * (1 / density_kgm) * (1 / 1728);
      break;
    case 'mSEc':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 3600) * 27679.90471 * (1 / density_kgm) * Math.pow(0.0254, 3);
      break;
    case 'mmSec':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 3600) * 27679.90471 * (1 / density_kgm) * Math.pow(25.4, 3);
      break;
    case 'lMin':
      hideableDensity.style.display = 'flex';
      value = pph * (1 / 3600) * 27679.90471 * (1 / density_kgm) * 0.0163871;
      break;
    default:
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph;
  }
  return value;
}


// ─── CSV Processing ───────────────────────────────────────────────────────────
async function processCSVFiles(filePaths) {
  const allData = [];
  for (const filePath of filePaths) {
    try {
      const response = await fetch(filePath);
      const csvData  = await response.text();
      allData.push(parseCSV(csvData));
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  return allData;
}

function parseCSV(csvData) {
  const rows       = csvData.trim().split('\n');
  const parsedData = [];
  rows.forEach(row => {
    const columns = row.split(',');
    if (columns.length >= 2) {
      const x = parseFloat(columns[0].trim());
      const y = parseFloat(columns[1].trim());
      if (!isNaN(x) && !isNaN(y)) parsedData.push({ x, y });
    }
  });
  return parsedData;
}


// ─── Linear Interpolation ─────────────────────────────────────────────────────
function linearInterpolation(x, data) {
  x = parseFloat(x);
  const minX = Math.min(...data.map(p => p[0]));
  const maxX = Math.max(...data.map(p => p[0]));
  flag = (x < minX || x > maxX);

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === x) return data[i][1];
  }
  for (let i = 0; i < data.length - 1; i++) {
    const x0 = parseFloat(data[i][0]);
    const y0  = parseFloat(data[i][1]);
    const x1  = parseFloat(data[i + 1][0]);
    const y1  = parseFloat(data[i + 1][1]);
    if (x >= x0 && x <= x1) {
      return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    }
  }
}


// ─── Water Density Calculators ────────────────────────────────────────────────
function calculate1() {
  const tempUnit1     = document.getElementById('tempUnit1').value;
  const Temp1InputNum = parseFloat(document.getElementById('Temp1InputNum').value) || 60;
  waterDensity1 = linearInterpolation(toFahrenheit(Temp1InputNum, tempUnit1), nonChartData[switchIndex]);
  document.getElementById('waterDensity1').innerText = flag ? 'Out of Range' : waterDensity1.toFixed(2);
}

function calculate2() {
  const tempUnit2     = document.getElementById('tempUnit2').value;
  const Temp2InputNum = parseFloat(document.getElementById('Temp2InputNum').value) || 60;
  waterDensity2 = linearInterpolation(toFahrenheit(Temp2InputNum, tempUnit2), nonChartData[switchIndex]);
  document.getElementById('waterDensity2').innerText = flag ? 'Out of Range' : waterDensity2.toFixed(2);
}

function calculate3() {
  const tempUnit3     = document.getElementById('tempUnit3').value;
  const Temp3InputNum = parseFloat(document.getElementById('Temp3InputNum').value) || 60;
  waterDensity3 = linearInterpolation(toFahrenheit(Temp3InputNum, tempUnit3), nonChartData[switchIndex]);
  document.getElementById('waterDensity3').innerText = flag ? 'Out of Range' : waterDensity3.toFixed(2);
}

function calculate4() {
  const tempUnit4     = document.getElementById('tempUnit4').value;
  const Temp4InputNum = parseFloat(document.getElementById('Temp4InputNum').value) || 60;
  waterDensity4 = linearInterpolation(toFahrenheit(Temp4InputNum, tempUnit4), nonChartData[switchIndex]);
  document.getElementById('waterDensity4').innerText = flag ? 'Out of Range' : waterDensity4.toFixed(2);
}

function calculate5() {
  const tempUnit5     = document.getElementById('tempUnit5').value;
  const Temp5InputNum = parseFloat(document.getElementById('Temp5InputNum').value) || 60;
  waterDensity5 = linearInterpolation(toFahrenheit(Temp5InputNum, tempUnit5), nonChartData[switchIndex]);
  document.getElementById('waterDensity5').innerText = flag ? 'Out of Range' : waterDensity5.toFixed(2);
}


// ─── Helper: convert any temperature unit → °F ───────────────────────────────
function toFahrenheit(value, unit) {
  switch (unit) {
    case 'degF': return value;
    case 'degC': return value * (9 / 5) + 32;
    case 'degK': return (value - 273.15) * (9 / 5) + 32;
    case 'degR': return value - 459.67;
    default:     return 0;
  }
}