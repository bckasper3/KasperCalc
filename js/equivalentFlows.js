let denseWater1 = 998; //kg per m^3, for water at 70°F
let denseWater2 = 998; //kg per m^3, for water at 70°F
let waterDensity1;
let waterDensity2;
let flow1PPH;
let density1_kgm;
let density2_kgm;
let result;

let Temp1InputNum = parseFloat(document.getElementById('Temp1InputNum').value) || 0;
let tempUnit1 = document.getElementById('tempUnit1').value;
let Temp2InputNum = parseFloat(document.getElementById('Temp2InputNum').value) || 0;
let tempUnit2 = document.getElementById('tempUnit2').value;


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

let Temp3InputNum = parseFloat(document.getElementById('Temp3InputNum').value) || 0;
let tempUnit3 = document.getElementById('tempUnit3').value;
let Temp4InputNum = parseFloat(document.getElementById('Temp4InputNum').value) || 0;
let tempUnit4 = document.getElementById('tempUnit4').value;
let Temp5InputNum = parseFloat(document.getElementById('Temp5InputNum').value) || 0;
let tempUnit5 = document.getElementById('tempUnit5').value;

const csvFiles1 = [
  '../csvData/densityofWater-combined.csv', // Replace with actual file paths or URLs
];

let switchIndex = 0;
let flag = false;
let fallData1;
let nonChartData; // Declare a global variable to store the result

// ─── Unit Conversion Factors ─────────────────────────────────────────────────
// All mass-flow units are converted to/from PPH (pounds per hour)
// 1 PPH = 1 lb/hr
const PPH_PER_LBSEC   = 3600;           // 1 lb/sec  = 3600 lb/hr
const PPH_PER_LBMIN   = 60;             // 1 lb/min  = 60   lb/hr
const PPH_PER_KGMIN   = 132.2773573;    // 1 kg/min  = 132.2773573 lb/hr
const PPH_PER_KGHR    = 2.204622622;    // 1 kg/hr   = 2.204622622 lb/hr
const PPH_PER_GRAMSEC = 7.936641439;    // 1 g/sec   = 7.936641439 lb/hr  (same as gramM factor already used)
const PPH_PER_TONHR   = 2204.622622;    // 1 metric ton/hr = 2204.622622 lb/hr

transformedData = function (parameter1) {
  const transformedDataintermediate = fallData1.map(dataset =>
    dataset.map(point => [point.x, point.y])
  );
  return transformedDataintermediate;
};

processCSVFiles(csvFiles1)
  .then(allData1 => {
    fallData1 = allData1;
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

  // Result display elements — original 9 + 6 new units
  const resultIDs = [
    'FlowResult1',  'FlowResult2',  'FlowResult3',  'FlowResult4',  'FlowResult5',
    'FlowResult6',  'FlowResult7',  'FlowResult8',  'FlowResult9',
    // New units
    'FlowResult10', 'FlowResult11_lbsec', 'FlowResult12_lbmin',
    'FlowResult13_kgmin', 'FlowResult14_kghr', 'FlowResult15_tonhr',
  ];
  resultIDs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Show / hide density & temp fields based on selected density unit
  if (densUnit1 === 'S.G.') {
    HideableTemp1.style.display             = 'flex';
    HideableTemp1waterdensity.style.display = 'flex';
  } else {
    HideableTemp1.style.display             = 'none';
    HideableTemp1waterdensity.style.display = 'none';
  }

  if (densUnit2 === 'S.G.') {
    HideableTemp2.style.display             = 'flex';
    HideableTemp2waterdensity.style.display = 'flex';
  } else {
    HideableTemp2.style.display             = 'none';
    HideableTemp2waterdensity.style.display = 'none';
  }

  // Convert input density → kg/m³
  density1_kgm = toDensityKGM(densUnit1, dens1InputNum, denseWater1);
  density2_kgm = toDensityKGM(densUnit2, dens2InputNum, denseWater2);

  // Convert input flow → PPH (internal working unit)
  flow1PPH = toFlowPPH(flowUnit1, flow1InputNum, density1_kgm, HideableDensity1, HideableTemp1);

  // Convert PPH → desired output unit and display result
  result = fromFlowPPH(flowUnit2, flow1PPH, density2_kgm, HideableDensity2, HideableTemp2);

  document.getElementById('result_selectedUnit').innerText = result.toFixed(3);
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

  // Result display elements — original 9 + 6 new units
  const resultIDs = [
    'FlowResult11', 'FlowResult12', 'FlowResult13', 'FlowResult14', 'FlowResult15',
    'FlowResult16', 'FlowResult17', 'FlowResult18', 'FlowResult19',
    // New units
    'FlowResult20_gramsec', 'FlowResult21_lbsec', 'FlowResult22_lbmin',
    'FlowResult23_kgmin',   'FlowResult24_kghr',  'FlowResult25_tonhr',
  ];
  resultIDs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Show / hide density & temp fields
  toggleSGFields(densUnit3, HideableTemp3, HideableTemp3waterdensity);
  toggleSGFields(densUnit4, HideableTemp4, HideableTemp4waterdensity);
  toggleSGFields(densUnit5, HideableTemp5, HideableTemp5waterdensity);

  // Convert densities → kg/m³
  density3_kgm = toDensityKGM(densUnit3, dens3InputNum, denseWater3);
  density4_kgm = toDensityKGM(densUnit4, dens4InputNum, denseWater4);
  density5_kgm = toDensityKGM(densUnit5, dens5InputNum, denseWater5);

  // Convert each input flow → PPH
  flow3PPH = toFlowPPH(flowUnit3, flow3InputNum, density3_kgm, HideableDensity3, HideableTemp3);
  flow4PPH = toFlowPPH(flowUnit4, flow4InputNum, density4_kgm, HideableDensity4, HideableTemp4);

  // Sum the two streams and convert to desired output
  result1 = fromFlowPPH(flowUnit5, flow3PPH + flow4PPH, density5_kgm, HideableDensity5, HideableTemp5);

  document.getElementById('result_selectedUnit1').innerText = result1.toFixed(3);
}


// ─── Helper: toggle SG-dependent fields ───────────────────────────────────────
function toggleSGFields(densUnit, hideableTemp, hideableTempWaterDensity) {
  const show = densUnit === 'S.G.' ? 'flex' : 'none';
  hideableTemp.style.display             = show;
  hideableTempWaterDensity.style.display = show;
}


// ─── Helper: convert any density unit → kg/m³ ────────────────────────────────
function toDensityKGM(densUnit, value, waterDensity) {
  switch (densUnit) {
    case 'kgm':      return value;
    case 'S.G.':     return value * waterDensity;
    case 'LB / Gal': return value * (1 / 231) * 27679.90471;
    case 'lbin':     return value * 27679.90471;
    default:         return 999; // safe fallback
  }
}


// ─── Helper: convert any volumetric/mass flow unit → PPH ─────────────────────
// Also manages show/hide of density & temp UI elements.
function toFlowPPH(flowUnit, flowValue, density_kgm, hideableDensity, hideableTemp) {
  let pph;
  switch (flowUnit) {
    // ── Mass flow units (no density needed) ──
    case 'PPH':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue;
      break;
    case 'kgPs':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * 7936.6414387;          // kg/s → PPH
      break;
    case 'gramM':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_GRAMSEC;       // g/min → PPH  (0.1322773573 lb/hr per g/min)
      break;
    case 'lbSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_LBSEC;         // lb/sec → PPH
      break;
    case 'lbMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_LBMIN;         // lb/min → PPH
      break;
    case 'kgMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_KGMIN;         // kg/min → PPH
      break;
    case 'kgHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_KGHR;          // kg/hr  → PPH
      break;
    case 'gramSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_GRAMSEC;       // g/sec  → PPH
      break;
    case 'tonHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      pph = flowValue * PPH_PER_TONHR;         // metric ton/hr → PPH
      break;

    // ── Volumetric flow units (density required) ──
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
// Also manages show/hide of density & temp UI elements.
function fromFlowPPH(flowUnit, pph, density_kgm, hideableDensity, hideableTemp) {
  let value;
  switch (flowUnit) {
    // ── Mass flow outputs (no density needed) ──
    case 'PPH':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph;
      break;
    case 'kgPs':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph * 0.0001259979;              // PPH → kg/s
      break;
    case 'gramM':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph * 7.5598728333;              // PPH → g/min
      break;
    case 'lbSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_LBSEC;            // PPH → lb/sec
      break;
    case 'lbMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_LBMIN;            // PPH → lb/min
      break;
    case 'kgMin':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_KGMIN;            // PPH → kg/min
      break;
    case 'kgHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_KGHR;             // PPH → kg/hr
      break;
    case 'gramSec':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_GRAMSEC;          // PPH → g/sec
      break;
    case 'tonHr':
      hideableDensity.style.display = 'none';
      hideableTemp.style.display    = 'none';
      value = pph / PPH_PER_TONHR;            // PPH → metric ton/hr
      break;

    // ── Volumetric flow outputs (density required) ──
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
      if (!isNaN(x) && !isNaN(y)) {
        parsedData.push({ x, y });
      }
    }
  });

  return parsedData;
}

// Secondary CSV call retained for backwards compatibility (fallData global)
processCSVFiles(csvFiles1)
  .then(allData => {
    fallData = allData;
  })
  .catch(error => {
    console.error('Error processing CSV files:', error);
  });


// ─── Linear Interpolation ────────────────────────────────────────────────────
function linearInterpolation(x, data) {
  x    = parseFloat(x);
  const minX = Math.min(...data.map(point => point[0]));
  const maxX = Math.max(...data.map(point => point[0]));

  flag = (x < minX || x > maxX);

  // Exact match check
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === x) return data[i][1];
  }

  // Interpolation
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


// ─── Water density calculators (temperature → water density via interpolation) ─

function calculate1() {
  const tempUnit1      = document.getElementById('tempUnit1').value;
  const Temp1InputNum  = parseFloat(document.getElementById('Temp1InputNum').value) || 60;
  const result_temp_F  = toFahrenheit(Temp1InputNum || 60, tempUnit1);

  waterDensity1 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  document.getElementById('waterDensity1').innerText =
    flag ? 'Out of Range' : waterDensity1.toFixed(2);
}

function calculate2() {
  const tempUnit2      = document.getElementById('tempUnit2').value;
  const Temp2InputNum  = parseFloat(document.getElementById('Temp2InputNum').value) || 60;
  const result_temp_F  = toFahrenheit(Temp2InputNum || 60, tempUnit2);

  waterDensity2 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  document.getElementById('waterDensity2').innerText =
    flag ? 'Out of Range' : waterDensity2.toFixed(2);
}

function calculate3() {
  const tempUnit3      = document.getElementById('tempUnit3').value;
  const Temp3InputNum  = parseFloat(document.getElementById('Temp3InputNum').value) || 60;
  const result_temp_F  = toFahrenheit(Temp3InputNum || 60, tempUnit3);

  waterDensity3 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  document.getElementById('waterDensity3').innerText =
    flag ? 'Out of Range' : waterDensity3.toFixed(2);
}

function calculate4() {
  const tempUnit4      = document.getElementById('tempUnit4').value;
  const Temp4InputNum  = parseFloat(document.getElementById('Temp4InputNum').value) || 60;
  const result_temp_F  = toFahrenheit(Temp4InputNum || 60, tempUnit4);

  waterDensity4 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  document.getElementById('waterDensity4').innerText =
    flag ? 'Out of Range' : waterDensity4.toFixed(2);
}

function calculate5() {
  const tempUnit5      = document.getElementById('tempUnit5').value;
  const Temp5InputNum  = parseFloat(document.getElementById('Temp5InputNum').value) || 60;
  const result_temp_F  = toFahrenheit(Temp5InputNum || 60, tempUnit5);

  waterDensity5 = linearInterpolation(result_temp_F, nonChartData[switchIndex]);
  document.getElementById('waterDensity5').innerText =
    flag ? 'Out of Range' : waterDensity5.toFixed(2);
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