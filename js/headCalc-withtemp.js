// ── Density data (kg/m³) vs °F for each fuel type ────────────────────────────
const csvFiles = [
  '../csvData/1.csv',
  '../csvData/2.csv',
  '../csvData/3.csv',
  '../csvData/4.csv',
  '../csvData/5.csv',
  '../csvData/6.csv',
  '../csvData/7.csv',
  '../csvData/8.csv',
  '../csvData/9.csv',
  '../csvData/10.csv'
];

const fixedLabels = [
  'Av. Gas',
  'JP-4, Jet B',
  'JP-7, TS',
  'JP-8, Jet A, Jet A-1',
  'JP-5',
  'RJ-4',
  'JP-10',
  'JP-9',
  'RJ-6',
  'RJ-5',
];

let fuelData = {}; // will be populated after CSV load

async function processCSVFiles(filePaths) {
  const allData = [];
  for (const filePath of filePaths) {
    const response = await fetch(filePath);
    const csvText = await response.text();
    const rows = csvText.trim().split('\n');
    const parsed = rows
      .map(row => row.split(',').map(v => parseFloat(v.trim())))
      .filter(([x, y]) => !isNaN(x) && !isNaN(y));
    allData.push(parsed);
  }
  return allData;
}

function init() {
  processCSVFiles(csvFiles)
    .then(allData => {
      // Map each CSV's data to its fuel label
      allData.forEach((dataset, i) => {
        fuelData[fixedLabels[i]] = dataset; // e.g. fuelData["Av. Gas"] = [[°F, kg/m³], ...]
      });
      convertToCelsiustemp();  // triggers updateCalculatortemp() which uses fuelData
    })
    .catch(err => console.error('CSV load failed:', err));
}

document.addEventListener("DOMContentLoaded", init);


const densityWater = [
  [-40,999.9],[32.2,999.9],[34,999.9],[39.2,1000],[40,1000],[50,999.7],
  [60,999.0],[70,998.0],[80,996.6],[90,995.0],[100,993.1],[110,990.9],
  [120,988.6],[130,986.0],[140,983.2],[150,980.2],[160,977.1],[170,973.8],
  [180,970.4],[190,966.8],[200,963.0],[212,958.4],[220,955.2],[240,946.7],[260,937.5]
];

let isPSIMode = false; // false = inches of fuel input, true = PSI input

function linInterp(x, data) {
  x = parseFloat(x);
  const xs = data.map(p => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  if (x < minX || x > maxX) return null; // out of range
  for (let i = 0; i < data.length - 1; i++) {
    const x0 = data[i][0], y0 = data[i][1];
    const x1 = data[i+1][0], y1 = data[i+1][1];
    if (x >= x0 && x <= x1) return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
  }
  return null;
}

function convertToFahrenheittemp() {
  const c = parseFloat(document.getElementById("celsiustemp").value);
  document.getElementById("fahrenheittemp").value = ((c * 9/5) + 32).toFixed(2);
  updateCalculatortemp();
}

function convertToCelsiustemp() {
  const f = parseFloat(document.getElementById("fahrenheittemp").value);
  document.getElementById("celsiustemp").value = ((f - 32) * 5/9).toFixed(2);
  updateCalculatortemp();
}

function set(id, val) { document.getElementById(id).innerText = val; }

function updateCalculatortemp() {
  const fuel = document.getElementById("operationtemp").value;
  const fahr = parseFloat(document.getElementById("fahrenheittemp").value);

  const data = fuelData[fuel];
  if (!data) return;

  const rho = linInterp(fahr, data);       // fuel density kg/m³
  const rhoW = linInterp(fahr, densityWater); // water density at same temp

  if (rho === null) {
    ["result_density1temp","result_density2temp","result_density3temp",
     "result_density4temp","result_density5temp","result_density6temp",
     "result_density7temp","result_density8temp","result_InH2Otemp",
     "result_PSItemp"].forEach(id => set(id, "Out of range"));
    return;
  }

  set("result_density1temp", rho.toFixed(3));
  set("result_density2temp", (rho * 0.000036127298147753).toFixed(5));
  set("result_density3temp", (rho * 0.0083454063545262).toFixed(4));
  set("result_density8temp", (rho * 0.0083454063545262 * 7.48052).toFixed(4));
  set("result_density4temp", (rho / 1000).toFixed(5));
  set("result_density5temp", (rho / 998).toFixed(5));
  const sgTemp = rhoW ? (rho / rhoW).toFixed(5) : "N/A";
  set("result_density6temp", sgTemp);
  set("result_density7temp", ((141.5/(rho/998))-131.5).toFixed(5));;

  // inH2O: 1 PSI = 27.7076 inH2O; also fuel column = (rho/rhoW) * h_inches
  calculatetemp(rho);
}

function calculatetemp(rhoOverride) {
  const fuel = document.getElementById("operationtemp").value;
  const fahr = parseFloat(document.getElementById("fahrenheittemp").value);
  const input1 = parseFloat(document.getElementById("input1temp").value) || 0;

  const data = fuelData[fuel];
  if (rhoOverride === undefined && !data) return;
  const rho = rhoOverride !== undefined ? rhoOverride : linInterp(fahr, data);
  if (rho === null) return;

  // Conversion: PSI = rho [kg/m³] * g [m/s²] * h [m] / 6894.76
  // For height in inches: h_m = inches * 0.0254
  // PSI = rho * 9.80665 * inches * 0.0254 / 6894.76
  const inchToPSI = rho * 9.80665 * 0.0254 / 6894.76;

  let psi, inchFuel, inH2O;

  if (isPSIMode) {
    // input is PSI → calculate inches of fuel
    psi = input1;
    inchFuel = inchToPSI > 0 ? (input1 / inchToPSI) : 0;
  } else {
    // input is inches of fuel → calculate PSI
    inchFuel = input1;
    psi = input1 * inchToPSI;
  }

  // 1 PSI = 27.7076 inH2O
  inH2O = psi * 27.7076;

  set("result_InH2Otemp", inH2O.toFixed(4));
  set("result_PSItemp", isPSIMode ? inchFuel.toFixed(4) : psi.toFixed(5));
}

// Toggle switch wiring
const fuelHeadCalcCheckboxtemp = document.getElementById('fuelheadcalctoggletemp');
const varfuelHeadCalcOption1temp = document.getElementById('fuelHeadCalcOption1temp');
const varfuelHeadCalcOption2temp = document.getElementById('fuelHeadCalcOption2temp');
const varfuelHeadCalcResult1temp = document.getElementById('fuelHeadCalcResult1temp');
const varfuelHeadCalcResult2temp = document.getElementById('fuelHeadCalcResult2temp');

fuelHeadCalcCheckboxtemp.addEventListener("change", function() {
    isPSIMode = fuelHeadCalcCheckboxtemp.checked;
    if (fuelHeadCalcCheckboxtemp.checked) {
      varfuelHeadCalcOption1temp.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption2temp.style.display = 'inline'; // Show element when unchecked

      varfuelHeadCalcResult1temp.style.display = 'none'; // Show element when checked
      varfuelHeadCalcResult2temp.style.display = 'inline'; // Show element when unchecked
      convertToCelsiustemp();
      calculatetemp();
      updateCalculatortemp();
    } else {
      varfuelHeadCalcOption1temp.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcOption2temp.style.display = 'none'; // Hide element when unchecked

      varfuelHeadCalcResult1temp.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcResult2temp.style.display = 'none'; // Hide element when unchecked
      convertToCelsiustemp();
      calculatetemp();
      updateCalculatortemp();
    }
  
  convertToCelsiustemp();
  calculatetemp();
});

document.addEventListener("DOMContentLoaded", function() {
    isPSIMode = fuelHeadCalcCheckboxtemp.checked;
    if (fuelHeadCalcCheckboxtemp.checked) {
      varfuelHeadCalcOption1temp.style.display = 'none'; // Show element when checked
      varfuelHeadCalcOption2temp.style.display = 'inline'; // Show element when unchecked

      varfuelHeadCalcResult1temp.style.display = 'none'; // Show element when checked
      varfuelHeadCalcResult2temp.style.display = 'inline'; // Show element when unchecked
      convertToCelsiustemp();
      calculatetemp();
      updateCalculatortemp();
    } else {
      varfuelHeadCalcOption1temp.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcOption2temp.style.display = 'none'; // Hide element when unchecked

      varfuelHeadCalcResult1temp.style.display = 'inline'; // Hide element when unchecked
      varfuelHeadCalcResult2temp.style.display = 'none'; // Hide element when unchecked
      convertToCelsiustemp();
      calculatetemp();
      updateCalculatortemp();
    }
});
