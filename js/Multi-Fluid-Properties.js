// ---------------------------------------------------------------------------
// Multi-Fluid Properties — specific gravity, kinematic viscosity, and
// derived dynamic viscosity for a broad set of typical industrial/aerospace
// fluids, vs. temperature.
//
// Source charts (image-only — no published tabular data):
//   Specific Gravity of Typical Fluids vs. Temperature — The Lee Company
//     https://www.theleeco.com/uploads/2023/05/SPECIFIC-GRAVITY-OF-TYPICAL-FLUIDS-VS.-TEMPERATURE_branded-1440x774.png
//   Viscosities of Typical Fluids vs. Temperature — The Lee Company
//     https://www.theleeco.com/support-resources/engineering-tools/lohm-laws-working-with-liquids/viscosities-of-typical-fluids-vs-temperature/
//
// Specific gravity, density, and kinematic viscosity are digitized from the
// two source charts above (e.g. with this site's own
// kaspercalc-webplot-digitizer.html) as [{x: tempF, y: value}, ...] point
// arrays, sorted ascending by x. A handful of fluids in the viscosity chart
// (MIL-PRF-87257, MIL-PRF-6083) have no specific gravity / density data yet —
// those stay as empty arrays until digitized, and the calculators/derived
// dynamic-viscosity chart correctly report "Data pending" for them until then.
// ---------------------------------------------------------------------------

const mfpFluidLabels = [
  'Water',
  'MIL-PRF-7808',
  'MIL-PRF-83282',
  'MIL-PRF-5606',
  'MIL-PRF-23699',
  'MIL-PRF-6081 (1010)',
  'MIL-PRF-6082 (1100) / SAE 50, 90 & 140 Avg',
  'Hatcol 2925',
  'Skydrol 500B-4',
  'Skydrol LD-4',
  'Skydrol 7000',
  'Silicone Fluid 200 cS',
  'Silicone Fluid 500 cS',
  'Silicone Fluid 1000 cS',
  'Ethylene Glycol 100%',
  'Ethylene Glycol/Water Mixture 50/50',
  'Ethylene Oxide',
  '#4 Fuel Oil & Bunker C',
  'Diesel Fuel',
  'Benzene',
  'Kerosene',
  'Jet A',
  'JP-4',
  'JP-5',
  'JP-8',
  'MIL-C-7024 Type II',
  'Automobile Gasoline, Avg',
  'MIL-G-5572 Aviation Gasoline',
  'Alcohol & Acetone',
  'SAE 10 Oil',
  'SAE 20 Oil',
  'SAE 30 Oil',
  'SAE 40 Oil',
  'SAE 90 Oil',
  'SAE 140 Oil',
  'MIL-PRF-87257',
  'MIL-PRF-6083',
];

// Fluid categories behind the per-chart filter buttons. Same grouping as the
// reference table at the top of the page — keep the two in step. `name` is
// the button label, so it can read shorter than the table's row heading
// (the table's "Reference Liquid" row is just "Water" here). Fluids are
// listed by label so reordering mfpFluidLabels can't silently regroup them.
const mfpCategories = [
  {
    name: 'Water',
    fluids: ['Water'],
  },
  {
    name: 'Aerospace/Military Hydraulic & Lubricating Oils',
    fluids: ['MIL-PRF-7808', 'MIL-PRF-83282', 'MIL-PRF-5606', 'MIL-PRF-23699',
      'MIL-PRF-6081 (1010)', 'MIL-PRF-6082 (1100) / SAE 50, 90 & 140 Avg',
      'MIL-PRF-6083', 'MIL-PRF-87257', 'Hatcol 2925'],
  },
  {
    name: 'Phosphate Ester (Skydrol) Fluids',
    fluids: ['Skydrol 500B-4', 'Skydrol LD-4', 'Skydrol 7000'],
  },
  {
    name: 'Silicone Fluids',
    fluids: ['Silicone Fluid 200 cS', 'Silicone Fluid 500 cS', 'Silicone Fluid 1000 cS'],
  },
  {
    name: 'Glycols',
    fluids: ['Ethylene Glycol 100%', 'Ethylene Glycol/Water Mixture 50/50', 'Ethylene Oxide'],
  },
  {
    name: 'Fuels & Petroleum Distillates',
    fluids: ['#4 Fuel Oil & Bunker C', 'Diesel Fuel', 'Benzene', 'Kerosene', 'Jet A',
      'JP-4', 'JP-5', 'JP-8', 'MIL-C-7024 Type II', 'Automobile Gasoline, Avg',
      'MIL-G-5572 Aviation Gasoline'],
  },
  {
    name: 'Solvents',
    fluids: ['Alcohol & Acetone'],
  },
  {
    name: 'SAE Motor & Gear Oils',
    fluids: ['SAE 10 Oil', 'SAE 20 Oil', 'SAE 30 Oil', 'SAE 40 Oil', 'SAE 90 Oil', 'SAE 140 Oil'],
  },
];

// Resolve the category lists to dataset indices once, warning about any name
// that no longer matches a label (a typo here would silently drop a fluid
// from its button) or any fluid that ended up in no category at all.
const mfpCategoryIndices = mfpCategories.map(function (cat) {
  return cat.fluids.map(function (name) {
    const i = mfpFluidLabels.indexOf(name);
    if (i < 0) console.warn('Multi-Fluid-Properties: category "' + cat.name + '" lists an unknown fluid:', name);
    return i;
  }).filter(function (i) { return i >= 0; });
});
(function () {
  const seen = new Set();
  mfpCategoryIndices.forEach(function (list) { list.forEach(function (i) { seen.add(i); }); });
  mfpFluidLabels.forEach(function (label, i) {
    if (!seen.has(i)) console.warn('Multi-Fluid-Properties: fluid is in no category:', label);
  });
})();

const mfpColors = [
  'rgb(68,119,170)',   // Blue
  'rgb(34,136,51)',    // Green
  'rgb(204,187,68)',   // Yellow
  'rgb(238,102,119)',  // Red
  'rgb(170,51,119)',   // Purple
  'rgb(187,187,187)',  // Grey
  'rgb(102,204,238)',  // Cyan
  'rgb(238,119,51)',   // Orange
  'rgb(204,51,17)',    // Red (dark)
  'rgb(0,153,136)',    // Teal
  'rgb(153,153,51)',   // Olive
  'rgb(136,34,85)',    // Wine
  'rgb(17,119,51)',    // Dark green
  'rgb(51,34,136)',    // Indigo
  'rgb(153,51,51)',    // Brick
  'rgb(102,102,102)',  // Grey (dark)
  'rgb(221,204,119)',  // Sand
  'rgb(136,204,238)',  // Sky
  'rgb(204,102,119)',  // Rose
  'rgb(68,170,153)',   // Sea green
  'rgb(153,153,153)',  // Light grey
  'rgb(51,102,170)',   // Steel blue
  'rgb(170,102,68)',   // Brown
  'rgb(119,119,17)',   // Olive dark
  'rgb(85,85,187)',    // Slate
  'rgb(187,85,102)',   // Rust
  'rgb(51,153,102)',   // Emerald
  'rgb(170,68,153)',   // Magenta
  'rgb(119,170,221)',  // Light blue
  'rgb(221,119,68)',   // Copper
  'rgb(102,153,51)',   // Olive green
  'rgb(153,68,119)',   // Plum
  'rgb(68,136,204)',   // Cornflower
  'rgb(187,153,68)',   // Gold
  'rgb(119,68,68)',    // Maroon
  'rgb(68,119,102)',   // Pine
  'rgb(136,102,170)',  // Lavender
];

// Digitized from The Lee Company "Specific Gravity of Typical Fluids vs. Temperature" chart.
const mfpSpecificGravityData = [
  // Water is NOT digitized from the Lee chart — that curve is too coarse to
  // resolve water's density maximum and put it at 66.5 °F, 8 kg/m³ low at
  // freezing. Taken from mfpDensityWater (the site-wide reference table)
  // divided by 999.01, which puts the peak back at 39.2 °F and SG at exactly
  // 1.0000 at the 60 °F reference. Liquid range only (32 °F to 212 °F).
  [{x:32.2,y:1.0009}, {x:34,y:1.0009}, {x:39.2,y:1.0010}, {x:40,y:1.0010}, {x:50,y:1.0007}, {x:60,y:1.0000}, {x:70,y:0.9990}, {x:80,y:0.9976}, {x:90,y:0.9960}, {x:100,y:0.9941}, {x:110,y:0.9919}, {x:120,y:0.9896}, {x:130,y:0.9870}, {x:140,y:0.9842}, {x:150,y:0.9812}, {x:160,y:0.9781}, {x:170,y:0.9748}, {x:180,y:0.9714}, {x:190,y:0.9678}, {x:200,y:0.9640}, {x:212,y:0.9593}], // Water <- H2O
  [{x:-79.97,y:0.9751}, {x:-34.71,y:0.9575}, {x:18.97,y:0.9364}, {x:89.13,y:0.9087}, {x:195.19,y:0.8674}, {x:274.4,y:0.8362}, {x:320.38,y:0.818}], // MIL-PRF-7808 <- MIL-L-7808
  [{x:-80.04,y:0.9045}, {x:-29.53,y:0.8835}, {x:41.28,y:0.8571}, {x:117.59,y:0.8277}, {x:194.22,y:0.7978}, {x:281.78,y:0.7637}], // MIL-PRF-83282 <- MIL-H-5606 & MIL-H-83282
  [{x:-80.04,y:0.9045}, {x:-29.53,y:0.8835}, {x:41.28,y:0.8571}, {x:117.59,y:0.8277}, {x:194.22,y:0.7978}, {x:281.78,y:0.7637}], // MIL-PRF-5606 <- MIL-H-5606 & MIL-H-83282
  [{x:-11.1,y:1.0191}, {x:53.24,y:0.9903}, {x:111.12,y:0.964}, {x:171.91,y:0.9376}, {x:225.9,y:0.9136}, {x:320.51,y:0.8715}], // MIL-PRF-23699 <- MIL-L-23699
  [{x:-73.83,y:0.9278}, {x:-23.07,y:0.9061}, {x:35.78,y:0.8804}, {x:114.35,y:0.8459}, {x:243.36,y:0.7901}, {x:287.34,y:0.7708}, {x:320.64,y:0.7581}], // MIL-PRF-6081 (1010) <- MIL-L-6081 (1010) MIL-H-6083
  [{x:-59.6,y:0.9448}, {x:-18.22,y:0.9264}, {x:34.81,y:0.903}, {x:115.32,y:0.8671}, {x:166.73,y:0.8447}, {x:227.2,y:0.8175}, {x:276.99,y:0.7957}, {x:319.8,y:0.7766}], // MIL-PRF-6082 (1100) / SAE 50, 90 & 140 Avg <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [{x:-79.65,y:0.9956}, {x:-17.89,y:0.9773}, {x:48.07,y:0.9581}, {x:120.5,y:0.9358}, {x:205.86,y:0.9109}, {x:320.32,y:0.8773}], // Hatcol 2925 <- HATCOL 2925
  [{x:-79.97,y:1.1216}, {x:-7.55,y:1.0896}, {x:53.89,y:1.0625}, {x:115.32,y:1.0358}, {x:194.22,y:1.0023}, {x:245.95,y:0.9793}, {x:320.32,y:0.9467}], // Skydrol 500B-4 <- SKYDROL 500 B-4
  [{x:-79.65,y:1.0788}, {x:-29.86,y:1.0548}, {x:31.25,y:1.0256}, {x:100.45,y:0.9927}, {x:170.61,y:0.9594}, {x:225.26,y:0.9339}, {x:274.08,y:0.9105}, {x:319.99,y:0.8883}], // Skydrol LD-4 <- SKYDROL LD-4
  [{x:7.65,y:1.1122}, {x:54.53,y:1.093}, {x:108.86,y:1.069}, {x:155.42,y:1.0506}, {x:221.7,y:1.021}, {x:273.76,y:1.0002}, {x:320.32,y:0.9797}], // Skydrol 7000 <- SKYDROL 7000
  [{x:-43.31,y:1.0322}, {x:33.52,y:0.9933}, {x:92.04,y:0.9639}, {x:152.51,y:0.9341}, {x:232.05,y:0.8942}, {x:293.16,y:0.8639}, {x:320.32,y:0.85}], // Silicone Fluid 200 cS <- SILICONE FLUIDS
  [{x:-43.31,y:1.0322}, {x:33.52,y:0.9933}, {x:92.04,y:0.9639}, {x:152.51,y:0.9341}, {x:232.05,y:0.8942}, {x:293.16,y:0.8639}, {x:320.32,y:0.85}], // Silicone Fluid 500 cS <- SILICONE FLUIDS
  [{x:-43.31,y:1.0322}, {x:33.52,y:0.9933}, {x:92.04,y:0.9639}, {x:152.51,y:0.9341}, {x:232.05,y:0.8942}, {x:293.16,y:0.8639}, {x:320.32,y:0.85}], // Silicone Fluid 1000 cS <- SILICONE FLUIDS
  [{x:7.65,y:1.1397}, {x:46.77,y:1.1231}, {x:92.04,y:1.1037}, {x:151.86,y:1.0794}, {x:222.67,y:1.0493}, {x:272.14,y:1.0285}, {x:320.12,y:1.0086}], // Ethylene Glycol 100% <- ETHYLENE GLYCOL 100%
  [{x:13.79,y:1.0832}, {x:42.89,y:1.0728}, {x:84.28,y:1.0584}, {x:126.96,y:1.0441}, {x:167.06,y:1.0305}, {x:226.23,y:1.0097}], // Ethylene Glycol/Water Mixture 50/50 <- ETHYLENE GLYCOL WATER MIXTURE 50/50
  [{x:-59.6,y:0.9626}, {x:-26.95,y:0.9215}, {x:1.18,y:0.886}, {x:42.89,y:0.8345}, {x:91.01,y:0.7748}, {x:159.3,y:0.6896}, {x:229.14,y:0.6026}], // Ethylene Oxide <- ETHYLENE OXIDE
  [{x:-34.71,y:0.9731}, {x:25.76,y:0.9498}, {x:121.79,y:0.9124}, {x:189.37,y:0.8861}, {x:256.94,y:0.8601}, {x:320.19,y:0.8351}], // #4 Fuel Oil & Bunker C <- #4 FUEL OIL & BUNKER-R
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // Diesel Fuel <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // Benzene <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-29.4,y:0.8591}, {x:5.71,y:0.8458}, {x:68.44,y:0.8233}, {x:146.04,y:0.7945}, {x:216.2,y:0.7694}, {x:276.02,y:0.7475}, {x:319.93,y:0.7316}], // Kerosene <- KEROSENE
  [{x:-64.45,y:0.8575}, {x:-3.99,y:0.8359}, {x:42.89,y:0.8198}, {x:111.44,y:0.796}, {x:187.1,y:0.7705}, {x:249.83,y:0.7481}, {x:310.29,y:0.7275}], // Jet A <- JET A
  [{x:-44.73,y:0.8204}, {x:-6.25,y:0.8069}, {x:50.98,y:0.7853}, {x:107.56,y:0.7637}, {x:169.0,y:0.7413}, {x:233.34,y:0.7172}, {x:291.86,y:0.6953}, {x:320.19,y:0.6844}], // JP-4 <- MIL-T-5624 (JP-4)
  [{x:-77.71,y:0.8817}, {x:-20.8,y:0.8633}, {x:42.25,y:0.8436}, {x:114.03,y:0.8212}, {x:180.31,y:0.8005}], // JP-5 <- MIL-T-5624 (JP-5)
  [{x:-79.65,y:0.8733}, {x:-7.55,y:0.844}, {x:69.08,y:0.8135}, {x:192.92,y:0.7639}, {x:262.76,y:0.7362}, {x:320.19,y:0.7131}], // JP-8 <- MIL-T-83133 (JP-8)
  [{x:-79.25,y:0.8174}, {x:-47.64,y:0.8051}, {x:2.48,y:0.7859}, {x:54.86,y:0.7651}, {x:110.15,y:0.7435}, {x:191.63,y:0.7123}, {x:320.06,y:0.6627}], // MIL-C-7024 Type II <- MIL-C-7024 TYPE II
  [{x:-75.31,y:0.7849}, {x:-11.54,y:0.7574}, {x:32.55,y:0.7382}, {x:87.81,y:0.7141}, {x:150.68,y:0.6863}, {x:250.01,y:0.6436}], // Automobile Gasoline, Avg <- AUTOMOBILE GASOLINE
  [{x:-75.45,y:0.7662}, {x:-42.57,y:0.7506}, {x:5.0,y:0.7271}, {x:48.13,y:0.7059}, {x:83.33,y:0.6885}, {x:121.47,y:0.67}, {x:156.49,y:0.6523}, {x:222.05,y:0.6197}], // MIL-G-5572 Aviation Gasoline <- MIL-G-5572 AVIATION GASOLINE
  [{x:-79.97,y:0.8348}, {x:-40.2,y:0.8237}, {x:11.85,y:0.8092}, {x:67.47,y:0.7939}, {x:112.41,y:0.7815}, {x:175.46,y:0.7639}], // Alcohol & Acetone <- ALCOHOL & ACETONE
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // SAE 10 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // SAE 20 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // SAE 30 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:0.9215}, {x:21.23,y:0.8991}, {x:79.11,y:0.8702}, {x:119.85,y:0.849}, {x:183.22,y:0.8163}, {x:231.08,y:0.7923}, {x:284.75,y:0.7644}, {x:320.51,y:0.7458}], // SAE 40 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-59.6,y:0.9448}, {x:-18.22,y:0.9264}, {x:34.81,y:0.903}, {x:115.32,y:0.8671}, {x:166.73,y:0.8447}, {x:227.2,y:0.8175}, {x:276.99,y:0.7957}, {x:319.8,y:0.7766}], // SAE 90 Oil <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [{x:-59.6,y:0.9448}, {x:-18.22,y:0.9264}, {x:34.81,y:0.903}, {x:115.32,y:0.8671}, {x:166.73,y:0.8447}, {x:227.2,y:0.8175}, {x:276.99,y:0.7957}, {x:319.8,y:0.7766}], // SAE 140 Oil <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [], // MIL-PRF-87257 (no digitized specific gravity data yet)
  [], // MIL-PRF-6083 (no digitized specific gravity data yet)
];

// Digitized from The Lee Company "Viscosities of Typical Fluids vs. Temperature" chart.
const mfpKinematicViscosityData = [
  [{x:32.02,y:1.7918}, {x:34,y:1.726}, {x:39.2,y:1.5706}, {x:40,y:1.5485}, {x:50,y:1.3065}, {x:60,y:1.1218}, {x:70,y:0.9758}, {x:80,y:0.8594}, {x:90,y:0.765}, {x:100,y:0.6867}, {x:110,y:0.6208}, {x:120,y:0.5644}, {x:130,y:0.5157}, {x:140,y:0.474}, {x:150,y:0.4372}, {x:160,y:0.4057}, {x:170,y:0.3785}, {x:180,y:0.3549}, {x:190,y:0.3341}, {x:200,y:0.3132}, {x:212,y:0.2939}], // Water <- Engineering ToolBox via WaterViscosity.html, liquid range only (32°F to 212°F boiling point)
  [{x:-63.59,y:9886.1689}, {x:-30.49,y:1017.2196}, {x:19.82,y:112.5733}, {x:72.06,y:26.3207}, {x:401.19,y:1.1454}], // MIL-PRF-7808 <- MIL-L-7808 & MIL-H-83282
  [{x:-63.59,y:9886.1689}, {x:-30.49,y:1017.2196}, {x:19.82,y:112.5733}, {x:72.06,y:26.3207}, {x:401.19,y:1.1454}], // MIL-PRF-83282 <- MIL-L-7808 & MIL-H-83282
  [{x:-80.64,y:2054.0826}, {x:-6.78,y:129.9061}, {x:62.9,y:28.7988}, {x:140.81,y:9.8999}, {x:257.11,y:3.783}, {x:401.04,y:1.8664}], // MIL-PRF-5606 <- MIL-H-5606
  [{x:-36.77,y:9731.2481}, {x:0.94,y:872.6074}, {x:47.12,y:124.5789}, {x:100.35,y:28.4845}, {x:161.36,y:9.6339}, {x:294.38,y:2.521}, {x:374.93,y:1.5488}], // MIL-PRF-23699 <- MIL-L-23699
  [{x:-54.64,y:9775.1841}, {x:-11.33,y:424.649}, {x:18.6,y:104.5255}, {x:60.89,y:26.2816}, {x:112.65,y:8.6633}, {x:198.52,y:2.8327}, {x:292.36,y:1.3713}, {x:400.98,y:0.7826}], // MIL-PRF-6081 (1010) <- MIL-L-6081(1010)
  [{x:24.87,y:9976.5384}, {x:73.23,y:739.8149}, {x:131.69,y:99.6963}, {x:204.77,y:20.8628}, {x:285.84,y:7.3251}, {x:400.78,y:2.8621}], // MIL-PRF-6082 (1100) / SAE 50, 90 & 140 Avg <- MIL-L-6082(1100), SAE 50 & BUNKER-C
  [{x:-59.46,y:9953.1408}, {x:19.7,y:133.8766}, {x:69.13,y:31.9657}, {x:290.64,y:2.068}, {x:401.14,y:1.1652}], // Hatcol 2925 <- HATCOL 2925
  [{x:-80.58,y:2708.1987}, {x:1.61,y:89.2402}, {x:93.14,y:13.7327}, {x:177.67,y:5.083}, {x:228.07,y:3.4367}, {x:315.07,y:2.0292}, {x:400.19,y:1.3974}], // Skydrol 500B-4 <- SKYDROL 500B-4 & LD-4
  [{x:-80.58,y:2708.1987}, {x:1.61,y:89.2402}, {x:93.14,y:13.7327}, {x:177.67,y:5.083}, {x:228.07,y:3.4367}, {x:315.07,y:2.0292}, {x:400.19,y:1.3974}], // Skydrol LD-4 <- SKYDROL 500B-4 & LD-4
  [{x:-47.68,y:9953.1408}, {x:9.17,y:304.5108}, {x:81.48,y:28.0068}, {x:184.19,y:5.0323}, {x:318.96,y:1.6718}, {x:400.49,y:1.1}], // Skydrol 7000 <- SKYDROL 7000
  [{x:-54.08,y:1433.3251}, {x:4.6,y:518.9987}, {x:83.24,y:180.0335}, {x:176.09,y:77.2416}, {x:271.89,y:40.2935}, {x:349.02,y:26.5484}, {x:401.38,y:20.8161}], // Silicone Fluid 200 cS <- SILICONE FLUID 200 CS
  [{x:-26.03,y:1548.7237}, {x:33.97,y:690.0148}, {x:99.58,y:344.2433}, {x:149.91,y:221.3366}, {x:220.52,y:132.36}, {x:295.15,y:85.1299}, {x:400.66,y:51.1682}], // Silicone Fluid 500 cS <- SILICONE FLUID 500 CS
  [{x:-37.83,y:3839.9182}, {x:29.23,y:1501.342}, {x:98.81,y:680.5243}, {x:154.97,y:407.1049}, {x:218.18,y:252.4879}, {x:288.41,y:164.3222}, {x:361.94,y:108.2858}, {x:401.02,y:91.0334}], // Silicone Fluid 1000 cS <- SILICONE FLUID 1000 CS
  [{x:25.97,y:66.1046}, {x:68.18,y:18.0326}, {x:111.7,y:7.2923}, {x:179.03,y:2.8836}, {x:251.36,y:1.5459}, {x:318.28,y:1.0016}, {x:400.68,y:0.6679}], // Ethylene Glycol 100% <- ETHYLENE GLYCOL 100%
  [{x:-35.44,y:86.5474}, {x:3.98,y:15.0135}, {x:60.74,y:3.6714}, {x:109.38,y:1.7826}, {x:160.5,y:1.0511}, {x:226.7,y:0.6288}], // Ethylene Glycol/Water Mixture 50/50 <- ETHYLENE GYLCOL WATER MIXTURE 50/50
  [{x:-80.77,y:0.9481}, {x:-71.7,y:0.8179}, {x:-60.96,y:0.7018}, {x:-49.24,y:0.6016}], // Ethylene Oxide <- ETHYLENE OXIDE
  [{x:-35.01,y:230.7132}, {x:0.54,y:50.3095}, {x:62.47,y:9.8999}, {x:140.32,y:3.1555}, {x:211.32,y:1.6635}, {x:316.36,y:0.8822}], // #4 Fuel Oil & Bunker C <- #4 FUEL OIL
  [{x:-69.44,y:129.9061}, {x:-36.84,y:33.4521}, {x:14.69,y:8.6934}, {x:72.85,y:3.3972}, {x:154.07,y:1.5228}, {x:226.93,y:0.9379}, {x:317.0,y:0.6029}], // Diesel Fuel <- DIESEL FUEL
  [{x:41.72,y:0.9379}, {x:82.27,y:0.7425}, {x:125.9,y:0.6033}], // Benzene <- BENZENE
  [{x:-43.43,y:15.8889}, {x:-9.85,y:7.0089}, {x:47.73,y:2.8141}, {x:115.82,y:1.4193}, {x:189.91,y:0.8577}, {x:256.16,y:0.6024}], // Kerosene <- MIL-T-5624 (JP-5) & KEROSENE
  [{x:-63.98,y:22.2468}, {x:-32.62,y:9.174}, {x:6.83,y:4.2941}, {x:49.67,y:2.3794}, {x:99.11,y:1.4517}, {x:157.94,y:0.9434}, {x:238.96,y:0.6012}], // Jet A <- JET A
  [{x:-70.86,y:6.9163}, {x:-25.35,y:2.9738}, {x:28.87,y:1.5524}, {x:89.49,y:0.9379}, {x:160.81,y:0.6012}], // JP-4 <- MIL-T-5624 (JP-4)
  [{x:-43.43,y:15.8889}, {x:-9.85,y:7.0089}, {x:47.73,y:2.8141}, {x:115.82,y:1.4193}, {x:189.91,y:0.8577}, {x:256.16,y:0.6024}], // JP-5 <- MIL-T-5624 (JP-5) & KEROSENE
  [{x:-80.58,y:39.8452}, {x:-22.25,y:6.3359}, {x:35.95,y:2.3794}, {x:125.13,y:0.9861}, {x:201.29,y:0.6012}], // JP-8 <- MIL-T-83133 (JP-8)
  [{x:-69.44,y:8.2128}, {x:-42.05,y:4.6389}, {x:4.21,y:2.3503}, {x:66.37,y:1.2744}, {x:131.45,y:0.8083}, {x:184.24,y:0.6016}], // MIL-C-7024 Type II <- MIL-C-7024 TYPE II
  [{x:-59.97,y:10.9186}, {x:-14.58,y:4.2468}, {x:62.9,y:1.6376}, {x:140.81,y:0.9076}, {x:213.99,y:0.6046}], // Automobile Gasoline, Avg <- AUTOMOBILE GASOLINE AVG
  [{x:-75.21,y:2.074}, {x:-39.28,y:1.3947}, {x:-1.13,y:1.0157}, {x:42.06,y:0.7539}, {x:80.21,y:0.602}], // MIL-G-5572 Aviation Gasoline <- MIL-G-5572 AVIATION GASOLINE
  [{x:-80.45,y:90.2761}, {x:-56.85,y:25.4343}, {x:-2.8,y:4.6162}, {x:62.47,y:1.5635}, {x:110.79,y:0.9418}, {x:165.55,y:0.6029}], // Alcohol & Acetone <- ALCOHOL & ACETONE
  [{x:-21.73,y:9514.8272}, {x:3.95,y:1607.3263}, {x:45.19,y:205.3928}, {x:90.99,y:44.9567}, {x:136.99,y:16.0198}, {x:188.33,y:7.1057}, {x:297.27,y:2.4015}, {x:400.98,y:1.2923}], // SAE 10 Oil <- SAE 10
  [{x:-9.4,y:9514.8272}, {x:39.32,y:526.3899}, {x:100.19,y:58.3675}, {x:178.05,y:11.4548}, {x:274.79,y:3.7095}, {x:400.9,y:1.5707}], // SAE 20 Oil <- SAE 20
  [{x:-3.34,y:9976.5384}, {x:63.4,y:291.262}, {x:129.25,y:40.945}, {x:233.88,y:7.3606}, {x:329.74,y:3.0112}, {x:401.49,y:1.9388}], // SAE 30 Oil <- SAE 30
  [{x:5.49,y:9533.657}, {x:69.93,y:349.9922}, {x:137.02,y:49.6074}, {x:229.49,y:10.2138}, {x:311.98,y:4.3571}, {x:401.38,y:2.3489}], // SAE 40 Oil <- SAE 40
  [{x:45.33,y:9657.9282}, {x:126.82,y:190.3176}, {x:197.93,y:28.9686}, {x:260.08,y:10.4951}, {x:400.9,y:2.7203}], // SAE 90 Oil <- SAE 90
  [{x:50.23,y:9657.9282}, {x:96.12,y:872.9556}, {x:147.81,y:139.9638}, {x:223.81,y:25.6767}, {x:301.42,y:8.646}, {x:401.14,y:3.5574}], // SAE 140 Oil <- SAE 140
  [{x:-80.89,y:10279.9767}, {x:-40.67,y:488.4195}, {x:21.81,y:36.2469}, {x:87.68,y:8.2959}, {x:174.2,y:2.7588}, {x:252.03,y:1.5001}, {x:336.52,y:0.9457}, {x:400.47,y:0.7134}], // MIL-PRF-87257 <- MIL-H-87257
  [{x:-80.58,y:5862.8948}, {x:-34.52,y:551.8177}, {x:44.22,y:50.1399}, {x:125.13,y:12.7379}, {x:258.3,y:3.6173}, {x:400.9,y:1.7133}], // MIL-PRF-6083 <- MIL-H-6083
];

// Derived from mfpSpecificGravityData: density = SG x water density at 60°F (999.01 kg/m³),
// the same water-at-60°F reference used site-wide (see MIL-PRF-23699Density.html °API footnote).
const mfpDensityData = [
  [{x:32.2,y:999.91}, {x:34,y:999.91}, {x:39.2,y:1000.01}, {x:40,y:1000.01}, {x:50,y:999.71}, {x:60,y:999.01}, {x:70,y:998.01}, {x:80,y:996.61}, {x:90,y:995.01}, {x:100,y:993.12}, {x:110,y:990.92}, {x:120,y:988.62}, {x:130,y:986.02}, {x:140,y:983.23}, {x:150,y:980.23}, {x:160,y:977.13}, {x:170,y:973.83}, {x:180,y:970.44}, {x:190,y:966.84}, {x:200,y:963.05}, {x:212,y:958.35}], // Water <- H2O (see the specific gravity row: reference table, not digitized)
  [{x:-79.97,y:974.13}, {x:-34.71,y:956.55}, {x:18.97,y:935.47}, {x:89.13,y:907.8}, {x:195.19,y:866.54}, {x:274.4,y:835.37}, {x:320.38,y:817.19}], // MIL-PRF-7808 <- MIL-L-7808
  [{x:-80.04,y:903.6}, {x:-29.53,y:882.63}, {x:41.28,y:856.25}, {x:117.59,y:826.88}, {x:194.22,y:797.01}, {x:281.78,y:762.94}], // MIL-PRF-83282 <- MIL-H-5606 & MIL-H-83282
  [{x:-80.04,y:903.6}, {x:-29.53,y:882.63}, {x:41.28,y:856.25}, {x:117.59,y:826.88}, {x:194.22,y:797.01}, {x:281.78,y:762.94}], // MIL-PRF-5606 <- MIL-H-5606 & MIL-H-83282
  [{x:-11.1,y:1018.09}, {x:53.24,y:989.32}, {x:111.12,y:963.05}, {x:171.91,y:936.67}, {x:225.9,y:912.7}, {x:320.51,y:870.64}], // MIL-PRF-23699 <- MIL-L-23699
  [{x:-73.83,y:926.88}, {x:-23.07,y:905.2}, {x:35.78,y:879.53}, {x:114.35,y:845.06}, {x:243.36,y:789.32}, {x:287.34,y:770.04}, {x:320.64,y:757.35}], // MIL-PRF-6081 (1010) <- MIL-L-6081 (1010) MIL-H-6083
  [{x:-59.6,y:943.86}, {x:-18.22,y:925.48}, {x:34.81,y:902.11}, {x:115.32,y:866.24}, {x:166.73,y:843.86}, {x:227.2,y:816.69}, {x:276.99,y:794.91}, {x:319.8,y:775.83}], // MIL-PRF-6082 (1100) / SAE 50, 90 & 140 Avg <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [{x:-79.65,y:994.61}, {x:-17.89,y:976.33}, {x:48.07,y:957.15}, {x:120.5,y:934.87}, {x:205.86,y:910.0}, {x:320.32,y:876.43}], // Hatcol 2925 <- HATCOL 2925
  [{x:-79.97,y:1120.49}, {x:-7.55,y:1088.52}, {x:53.89,y:1061.45}, {x:115.32,y:1034.77}, {x:194.22,y:1001.31}, {x:245.95,y:978.33}, {x:320.32,y:945.76}], // Skydrol 500B-4 <- SKYDROL 500 B-4
  [{x:-79.65,y:1077.73}, {x:-29.86,y:1053.76}, {x:31.25,y:1024.58}, {x:100.45,y:991.72}, {x:170.61,y:958.45}, {x:225.26,y:932.98}, {x:274.08,y:909.6}, {x:319.99,y:887.42}], // Skydrol LD-4 <- SKYDROL LD-4
  [{x:7.65,y:1111.1}, {x:54.53,y:1091.92}, {x:108.86,y:1067.94}, {x:155.42,y:1049.56}, {x:221.7,y:1019.99}, {x:273.76,y:999.21}, {x:320.32,y:978.73}], // Skydrol 7000 <- SKYDROL 7000
  [{x:-43.31,y:1031.18}, {x:33.52,y:992.32}, {x:92.04,y:962.95}, {x:152.51,y:933.18}, {x:232.05,y:893.31}, {x:293.16,y:863.04}, {x:320.32,y:849.16}], // Silicone Fluid 200 cS <- SILICONE FLUIDS
  [{x:-43.31,y:1031.18}, {x:33.52,y:992.32}, {x:92.04,y:962.95}, {x:152.51,y:933.18}, {x:232.05,y:893.31}, {x:293.16,y:863.04}, {x:320.32,y:849.16}], // Silicone Fluid 500 cS <- SILICONE FLUIDS
  [{x:-43.31,y:1031.18}, {x:33.52,y:992.32}, {x:92.04,y:962.95}, {x:152.51,y:933.18}, {x:232.05,y:893.31}, {x:293.16,y:863.04}, {x:320.32,y:849.16}], // Silicone Fluid 1000 cS <- SILICONE FLUIDS
  [{x:7.65,y:1138.57}, {x:46.77,y:1121.99}, {x:92.04,y:1102.61}, {x:151.86,y:1078.33}, {x:222.67,y:1048.26}, {x:272.14,y:1027.48}, {x:320.12,y:1007.6}], // Ethylene Glycol 100% <- ETHYLENE GLYCOL 100%
  [{x:13.79,y:1082.13}, {x:42.89,y:1071.74}, {x:84.28,y:1057.35}, {x:126.96,y:1043.07}, {x:167.06,y:1029.48}, {x:226.23,y:1008.7}], // Ethylene Glycol/Water Mixture 50/50 <- ETHYLENE GLYCOL WATER MIXTURE 50/50
  [{x:-59.6,y:961.65}, {x:-26.95,y:920.59}, {x:1.18,y:885.12}, {x:42.89,y:833.67}, {x:91.01,y:774.03}, {x:159.3,y:688.92}, {x:229.14,y:602.0}], // Ethylene Oxide <- ETHYLENE OXIDE
  [{x:-34.71,y:972.14}, {x:25.76,y:948.86}, {x:121.79,y:911.5}, {x:189.37,y:885.22}, {x:256.94,y:859.25}, {x:320.19,y:834.27}], // #4 Fuel Oil & Bunker C <- #4 FUEL OIL & BUNKER-R
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // Diesel Fuel <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // Benzene <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-29.4,y:858.25}, {x:5.71,y:844.96}, {x:68.44,y:822.48}, {x:146.04,y:793.71}, {x:216.2,y:768.64}, {x:276.02,y:746.76}, {x:319.93,y:730.88}], // Kerosene <- KEROSENE
  [{x:-64.45,y:856.65}, {x:-3.99,y:835.07}, {x:42.89,y:818.99}, {x:111.44,y:795.21}, {x:187.1,y:769.74}, {x:249.83,y:747.36}, {x:310.29,y:726.78}], // Jet A <- JET A
  [{x:-44.73,y:819.59}, {x:-6.25,y:806.1}, {x:50.98,y:784.52}, {x:107.56,y:762.94}, {x:169.0,y:740.57}, {x:233.34,y:716.49}, {x:291.86,y:694.61}, {x:320.19,y:683.72}], // JP-4 <- MIL-T-5624 (JP-4)
  [{x:-77.71,y:880.83}, {x:-20.8,y:862.45}, {x:42.25,y:842.76}, {x:114.03,y:820.39}, {x:180.31,y:799.71}], // JP-5 <- MIL-T-5624 (JP-5)
  [{x:-79.65,y:872.44}, {x:-7.55,y:843.16}, {x:69.08,y:812.69}, {x:192.92,y:763.14}, {x:262.76,y:735.47}, {x:320.19,y:712.39}], // JP-8 <- MIL-T-83133 (JP-8)
  [{x:-79.25,y:816.59}, {x:-47.64,y:804.3}, {x:2.48,y:785.12}, {x:54.86,y:764.34}, {x:110.15,y:742.76}, {x:191.63,y:711.59}, {x:320.06,y:662.04}], // MIL-C-7024 Type II <- MIL-C-7024 TYPE II
  [{x:-75.31,y:784.12}, {x:-11.54,y:756.65}, {x:32.55,y:737.47}, {x:87.81,y:713.39}, {x:150.68,y:685.62}, {x:250.01,y:642.96}], // Automobile Gasoline, Avg <- AUTOMOBILE GASOLINE
  [{x:-75.45,y:765.44}, {x:-42.57,y:749.86}, {x:5.0,y:726.38}, {x:48.13,y:705.2}, {x:83.33,y:687.82}, {x:121.47,y:669.34}, {x:156.49,y:651.65}, {x:222.05,y:619.09}], // MIL-G-5572 Aviation Gasoline <- MIL-G-5572 AVIATION GASOLINE
  [{x:-79.97,y:833.97}, {x:-40.2,y:822.88}, {x:11.85,y:808.4}, {x:67.47,y:793.11}, {x:112.41,y:780.73}, {x:175.46,y:763.14}], // Alcohol & Acetone <- ALCOHOL & ACETONE
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // SAE 10 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // SAE 20 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // SAE 30 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-22.1,y:920.59}, {x:21.23,y:898.21}, {x:79.11,y:869.34}, {x:119.85,y:848.16}, {x:183.22,y:815.49}, {x:231.08,y:791.52}, {x:284.75,y:763.64}, {x:320.51,y:745.06}], // SAE 40 Oil <- DIESEL FUELS, BENZENE, AND SAE 10 THRU 40 AVG.
  [{x:-59.6,y:943.86}, {x:-18.22,y:925.48}, {x:34.81,y:902.11}, {x:115.32,y:866.24}, {x:166.73,y:843.86}, {x:227.2,y:816.69}, {x:276.99,y:794.91}, {x:319.8,y:775.83}], // SAE 90 Oil <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [{x:-59.6,y:943.86}, {x:-18.22,y:925.48}, {x:34.81,y:902.11}, {x:115.32,y:866.24}, {x:166.73,y:843.86}, {x:227.2,y:816.69}, {x:276.99,y:794.91}, {x:319.8,y:775.83}], // SAE 140 Oil <- MIL-L-6082 (1100), SEA 50, 90, & 140 AVG
  [], // MIL-PRF-87257 (no digitized density data yet)
  [], // MIL-PRF-6083 (no digitized density data yet)
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mfpCtoF(c) { return c * 9 / 5 + 32; }
function mfpFtoC(f) { return (f - 32) * 5 / 9; }

// Linear interpolation on a sorted-by-x {x,y} point array.
function mfpLinInterp(xTarget, data) {
  if (!data || data.length === 0) return NaN;
  if (data.length === 1) return xTarget === data[0].x ? data[0].y : NaN;
  for (let i = 0; i < data.length - 1; i++) {
    if (xTarget >= data[i].x && xTarget <= data[i + 1].x) {
      const t = (xTarget - data[i].x) / (data[i + 1].x - data[i].x);
      return data[i].y + t * (data[i + 1].y - data[i].y);
    }
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// ASTM D341 double-log viscosity scale
//
// Viscosity vs. temperature is a straight line only on the double-log scale
// the source charts are drawn on: the axis coordinate is
//
//   w = log10(log10(Z)),   Z = ν + 0.7 + (Wright correction terms)
//
// with Wright's correction (ASTM D341, valid for ν ≥ 0.21 cSt) mattering
// below ~2 cSt. The correction terms decay to nothing well before 8 cSt, so
// cutting them off there keeps Z continuous (the step at the cutoff is
// 2e-9) while leaving the inverse closed-form over most of the range.
// ---------------------------------------------------------------------------
const MFP_D341_CUTOFF = 8;   // above this the correction is < 1e-10, so skip it

function mfpD341Z(nu) {
  let z = nu + 0.7;
  if (nu >= 0.21 && nu < MFP_D341_CUTOFF) {
    z += Math.exp(-1.14883 - 2.65868 * nu)
       - Math.exp(-0.0038138 - 12.5645 * nu)
       + Math.exp(5.46491 - 37.6289 * nu)
       - Math.exp(13.0458 - 74.6851 * nu)
       + Math.exp(37.4619 - 192.643 * nu)
       - Math.exp(80.4945 - 400.468 * nu);
  }
  return z;
}

// Viscosity (cSt or cP) -> double-log axis coordinate. Undefined below
// ~0.21 cSt, where Z drops to 1 and the outer log10 has no real value;
// NaN there just drops the point from the chart.
function mfpViscToAxis(nu) {
  const z = mfpD341Z(nu);
  return z > 1 ? Math.log10(Math.log10(z)) : NaN;
}

// Inverse of mfpViscToAxis. Exact above the cutoff; below it Wright's
// correction has no closed form, so bisect on the (monotonic) Z(ν).
function mfpAxisToVisc(w) {
  const z = Math.pow(10, Math.pow(10, w));
  const nu = z - 0.7;
  if (nu >= MFP_D341_CUTOFF) return nu;
  let lo = 0.21, hi = MFP_D341_CUTOFF;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (mfpD341Z(mid) < z) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Interpolate viscosity along the D341 straight line between two digitized
// points rather than linearly in cSt. The digitized points can sit 25 °F and
// a factor of six apart (SAE 10 runs 9515 -> 1607 cSt over -21.7 to 4.0 °F),
// where interpolating linearly in cSt overshoots by nearly 50%.
function mfpViscInterp(xTarget, data) {
  if (!data || data.length === 0) return NaN;
  if (data.length === 1) return xTarget === data[0].x ? data[0].y : NaN;
  for (let i = 0; i < data.length - 1; i++) {
    if (xTarget >= data[i].x && xTarget <= data[i + 1].x) {
      const t = (xTarget - data[i].x) / (data[i + 1].x - data[i].x);
      const w0 = mfpViscToAxis(data[i].y);
      const w1 = mfpViscToAxis(data[i + 1].y);
      return mfpAxisToVisc(w0 + t * (w1 - w0));
    }
  }
  return NaN;
}

// Y-axis gridline ladder, following the source charts' labelling — tenths
// below 1, then 1.5/2/3/4/6/8, then 1-2-5 per decade — carried below 0.6 for
// the dynamic viscosity chart. Ticks outside a given chart's range are
// filtered out in afterBuildTicks.
const mfpViscTicks = [
  0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 4, 6, 8,
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

// Bottom of the kinematic viscosity axis, same as the source chart. Water is
// the only fluid that goes below it (0.29 cSt at boiling, from reference data
// rather than the Lee chart, whose own axis stops at 0.6); letting the axis
// follow it down spent a quarter of the chart height on a band no other fluid
// reaches, in the region where the double-log scale stretches toward its
// singularity at ~0.21 cSt.
//
// This floor is deliberately NOT applied to the dynamic viscosity chart:
// μ = ν × SG, and the light fuels' SG of ~0.7 drags a dozen of them below
// 0.6 cP, so flooring there would cut off real data instead of one tail.
const MFP_VISC_AXIS_FLOOR = 0.6;

function mfpFmtViscTick(v) { return v >= 20 ? String(v) : v.toFixed(1); }

function mfpFmtViscValue(v) {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

// Densify like mfpDenseF, but on the double-log scale and returning the axis
// coordinate itself, so every segment is drawn as the straight line the
// source chart shows. Tooltips convert back with mfpAxisToVisc.
function mfpDenseFD341(rawPts) {
  if (!rawPts || rawPts.length < 2) return [];
  const pts = [...rawPts].sort((a, b) => a.x - b.x);
  const result = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i].x, w0 = mfpViscToAxis(pts[i].y);
    const x1 = pts[i + 1].x, w1 = mfpViscToAxis(pts[i + 1].y);
    result.push({ x: parseFloat(x0.toFixed(2)), y: w0 });
    const first = Math.ceil(x0 + 0.01);
    const last = Math.floor(x1 - 0.01);
    for (let f = first; f <= last; f++) {
      result.push({ x: f, y: w0 + ((f - x0) / (x1 - x0)) * (w1 - w0) });
    }
  }
  const lastPt = pts[pts.length - 1];
  result.push({ x: parseFloat(lastPt.x.toFixed(2)), y: mfpViscToAxis(lastPt.y) });
  return result;
}

// Axis bounds in double-log space, cropped to the data with 1% padding, but
// never below `floor` (or the scale's singularity, whichever is higher).
function mfpViscAxisRange(dataArrays, floor) {
  let min = Infinity, max = -Infinity;
  dataArrays.forEach(function (pts) {
    (pts || []).forEach(function (p) {
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    });
  });
  if (!isFinite(min) || !isFinite(max)) {
    return { min: mfpViscToAxis(MFP_VISC_AXIS_FLOOR), max: mfpViscToAxis(20000) };
  }
  // 0.22 is the hard limit — below ~0.21 cSt the scale has no value at all.
  // A chart whose data all sits above its floor still crops tight to itself.
  const lo = mfpViscToAxis(Math.max(min, floor || 0, 0.22));
  const hi = mfpViscToAxis(max);
  const pad = (hi - lo) * 0.01;
  return { min: lo - pad, max: hi + pad };
}

// Densify a sparse, sorted-by-x point array to one point per whole °F between
// its first and last x (linear interpolation) — same convention used across
// KasperCalc's other charts, so hovering the chart shows a value every 1°F
// instead of only at the handful of digitized points.
function mfpDenseF(rawPts) {
  if (!rawPts || rawPts.length < 2) return rawPts || [];
  const pts = [...rawPts].sort((a, b) => a.x - b.x);
  const result = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i].x, y0 = pts[i].y;
    const x1 = pts[i + 1].x, y1 = pts[i + 1].y;
    result.push({ x: parseFloat(x0.toFixed(2)), y: parseFloat(y0.toFixed(4)) });
    const first = Math.ceil(x0 + 0.01);
    const last = Math.floor(x1 - 0.01);
    for (let f = first; f <= last; f++) {
      const t = (f - x0) / (x1 - x0);
      result.push({ x: f, y: parseFloat((y0 + t * (y1 - y0)).toFixed(4)) });
    }
  }
  const lastPt = pts[pts.length - 1];
  result.push({ x: parseFloat(lastPt.x.toFixed(2)), y: parseFloat(lastPt.y.toFixed(4)) });
  return result;
}

// Dynamic (absolute) viscosity μ [mPa·s] = ν [cSt] × SG × 1000 [kg/m³ per SG] / 1000 = ν × SG
function mfpBuildDynamicViscosityDatasets() {
  return mfpFluidLabels.map((label, i) => {
    const kin = mfpKinematicViscosityData[i];
    const sg  = mfpSpecificGravityData[i];
    if (!kin.length || !sg.length) return { label: label, data: [], fill: false, borderColor: mfpColors[i % mfpColors.length], tension: 0 };
    const pts = [];
    kin.forEach(p => {
      const sgAtT = mfpLinInterp(p.x, sg);
      if (!isNaN(sgAtT)) pts.push({ x: p.x, y: parseFloat((p.y * sgAtT).toFixed(4)) });
    });
    return { label: label, data: pts, fill: false, borderColor: mfpColors[i % mfpColors.length], tension: 0 };
  });
}
const mfpDynamicViscosityData = mfpBuildDynamicViscosityDatasets().map(ds => ds.data);

// ---------------------------------------------------------------------------
// White-background plugin (matches other KasperCalc charts)
// ---------------------------------------------------------------------------
const mfpCustomBg = {
  id: 'mfpCustomBg',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

// Crop the x-axis to the temperature range each chart's own data actually
// covers, rounded outward to the next 10 °F for a clean tick boundary. The
// specific gravity / density / dynamic viscosity data stop near 320 °F while
// kinematic viscosity runs to ~401 °F, so a single fixed window left a wide
// empty band on three of the four charts.
function mfpXRange(dataArrays) {
  let min = Infinity, max = -Infinity;
  dataArrays.forEach(function (pts) {
    (pts || []).forEach(function (p) {
      if (p.x < min) min = p.x;
      if (p.x > max) max = p.x;
    });
  });
  if (!isFinite(min) || !isFinite(max)) return { min: -90, max: 410 };
  return { min: Math.floor(min / 10) * 10, max: Math.ceil(max / 10) * 10 };
}

function mfpMakeChart(canvasId, dataArrays, yLabel, yType, yUnit, yFloor) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const xRange = mfpXRange(dataArrays);
  const d341 = yType === 'astm-d341';
  const yRange = d341 ? mfpViscAxisRange(dataArrays, yFloor) : null;
  const datasets = mfpFluidLabels.map((label, i) => ({
    label: label,
    data: d341 ? mfpDenseFD341(dataArrays[i]) : mfpDenseF(dataArrays[i]),
    fill: false,
    borderColor: mfpColors[i % mfpColors.length],
    tension: d341 ? 0 : 0.1,
  }));
  return new Chart(el.getContext('2d'), {
    type: 'line',
    data: { datasets },
    plugins: [mfpCustomBg],
    options: {
      maintainAspectRatio: false,
      layout: { padding: { left: 10, right: 25, top: 5, bottom: 5 } },
      interaction: { mode: 'nearest', axis: 'x' },
      elements: { point: { radius: 0 } },
      responsive: true,
      plugins: {
        legend: {
          labels: {
            align: 'top', padding: 20, usePointStyle: false, boxHeight: 2, font: { size: 12 },
            // Category filter buttons hide datasets via meta.hidden; rather than
            // showing those as struck-through legend entries (clutter when a
            // filter narrows to one or two fluids), drop them from the legend
            // entirely. They reappear once a category filter makes them visible again.
            generateLabels: function (chart) {
              return Chart.defaults.plugins.legend.labels.generateLabels(chart)
                .filter(function (item) { return !chart.getDatasetMeta(item.datasetIndex).hidden; });
            }
          },
          onClick(e, legendItem, legend) {
            const i = legendItem.datasetIndex;
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(i);
            meta.hidden = meta.hidden === null ? !ci.data.datasets[i].hidden : null;
            ci.update();
          }
        },
        tooltip: {
          enabled: true, mode: 'nearest', intersect: false, axis: 'x',
          // The D341 charts plot the axis coordinate, so convert back to
          // real viscosity for the readout.
          callbacks: d341 ? {
            label: function (ctx) {
              return ctx.dataset.label + ': ' + mfpFmtViscValue(mfpAxisToVisc(ctx.parsed.y)) +
                (yUnit ? ' ' + yUnit : '');
            }
          } : {}
        },
        mfpCustomBg: { color: 'white' }
      },
      scales: {
        x: {
          type: 'linear',
          min: xRange.min,
          max: xRange.max,
          ticks: { maxRotation: 0, font: { size: 14 } },
          title: { display: true, text: 'Temperature °F', font: { size: 18 } }
        },
        y: d341 ? {
          // Linear in w = log10(log10(Z)); the ladder below puts the
          // gridlines back at round viscosity values.
          type: 'linear',
          min: yRange.min,
          max: yRange.max,
          afterBuildTicks: function (axis) {
            axis.ticks = mfpViscTicks
              .map(function (v) { return { value: mfpViscToAxis(v), nu: v }; })
              .filter(function (t) { return t.value >= axis.min && t.value <= axis.max; });
          },
          ticks: {
            autoSkip: false,
            font: { size: 14 },
            callback: function (value, index, ticks) {
              const t = ticks[index];
              return mfpFmtViscTick(t && t.nu !== undefined ? t.nu : mfpAxisToVisc(value));
            }
          },
          title: { display: true, text: yLabel, padding: 10, font: { size: 18 } }
        } : {
          type: yType || 'linear',
          ticks: { font: { size: 14 } },
          title: { display: true, text: yLabel, padding: 10, font: { size: 18 } }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Category filter buttons
//
// Each chart gets its own row of toggles and its own selection. With nothing
// toggled on every fluid shows; toggling one or more categories narrows the
// chart to just those. Datasets are hidden through the same meta.hidden flag
// the legend uses (null = visible), so the two stay compatible.
// ---------------------------------------------------------------------------
function mfpApplyCategoryFilter(chart, active) {
  const showAll = active.size === 0;
  const shown = new Set();
  active.forEach(function (ci) {
    mfpCategoryIndices[ci].forEach(function (i) { shown.add(i); });
  });
  chart.data.datasets.forEach(function (ds, i) {
    chart.getDatasetMeta(i).hidden = (showAll || shown.has(i)) ? null : true;
  });
  chart.update();
}

function mfpBuildCategoryButtons(containerId, chart) {
  const box = document.getElementById(containerId);
  if (!box || !chart) return;
  const active = new Set();
  mfpCategories.forEach(function (cat, ci) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = cat.name;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      const on = !active.has(ci);
      if (on) active.add(ci); else active.delete(ci);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      mfpApplyCategoryFilter(chart, active);
    });
    box.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// Specific gravity reference temperature
//
// mfpSpecificGravityData is stored against water at 60 °F, the site-wide
// reference. The button under the chart re-references it to water at its
// density maximum (3.98 °C / 39.164 °F), which is the other convention in
// common use — a straight rescale by the ratio of the two water densities.
// ---------------------------------------------------------------------------
const MFP_SG_REF_60F = 999.01;    // water @ 60 °F, kg/m³ (site-wide reference)
const MFP_SG_REF_MAX = 999.973;   // water @ 3.98 °C, kg/m³ (density maximum)

const mfpSgRefText = {
  ref60: {
    button: 'Reference To Water @ 3.98 °C (39.164 °F)',
    axis:   'Specific Gravity (vs. H₂O @ 60°F)',
    note:   'Specific gravity referenced to water at 60 °F (999.01 kg/m³).',
  },
  refMax: {
    button: 'Reference To Water @ 60 °F',
    axis:   'Specific Gravity (vs. H₂O @ 3.98°C)',
    note:   'Specific gravity referenced to water at its density maximum, ' +
            '3.98 °C / 39.164 °F (999.973 kg/m³).',
  },
};

let mfpSgUsesMaxRef = false;

function mfpSetSgReference(useMaxRef) {
  if (!mfpSgChart) return;
  mfpSgUsesMaxRef = useMaxRef;
  const text = useMaxRef ? mfpSgRefText.refMax : mfpSgRefText.ref60;
  // Always rescale from the stored 60 °F data rather than from whatever is
  // currently plotted, so toggling back and forth can't accumulate error.
  const factor = useMaxRef ? MFP_SG_REF_60F / MFP_SG_REF_MAX : 1;
  mfpSgChart.data.datasets.forEach(function (ds, i) {
    const base = mfpDenseF(mfpSpecificGravityData[i]);
    ds.data = factor === 1 ? base : base.map(function (p) {
      return { x: p.x, y: parseFloat((p.y * factor).toFixed(5)) };
    });
  });
  mfpSgChart.options.scales.y.title.text = text.axis;
  mfpSgChart.update();

  const btn = document.getElementById('mfpSgRefToggle');
  if (btn) btn.textContent = text.button;
  const note = document.getElementById('mfpSgRefNote');
  if (note) note.textContent = text.note;
}

let mfpSgChart, mfpViscChart, mfpDynChart, mfpDensityChart;

function mfpCreateCharts() {
  mfpSgChart      = mfpMakeChart('sgChart',      mfpSpecificGravityData,    'Specific Gravity (vs. H₂O @ 60°F)', 'linear');
  mfpViscChart    = mfpMakeChart('viscChart',    mfpKinematicViscosityData, 'Kinematic Viscosity (cSt = mm²/s)', 'astm-d341', 'cSt', MFP_VISC_AXIS_FLOOR);
  mfpDynChart     = mfpMakeChart('dynChart',     mfpDynamicViscosityData,   'Dynamic Viscosity (cP = mPa·s)',    'astm-d341', 'cP');
  mfpDensityChart = mfpMakeChart('densityChart', mfpDensityData,            'Density (kg/m³)',                   'linear');

  const sgRef = document.getElementById('mfpSgRefToggle');
  if (sgRef) sgRef.addEventListener('click', function () {
    mfpSetSgReference(!mfpSgUsesMaxRef);
  });

  mfpBuildCategoryButtons('mfpCatSg',      mfpSgChart);
  mfpBuildCategoryButtons('mfpCatVisc',    mfpViscChart);
  mfpBuildCategoryButtons('mfpCatDyn',     mfpDynChart);
  mfpBuildCategoryButtons('mfpCatDensity', mfpDensityChart);

  const tipSg = document.getElementById('toggleTipSg');
  if (tipSg) tipSg.addEventListener('click', function () {
    mfpSgChart.options.plugins.tooltip.enabled = !mfpSgChart.options.plugins.tooltip.enabled;
    mfpSgChart.update();
    this.textContent = mfpSgChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
  const tipVisc = document.getElementById('toggleTipVisc');
  if (tipVisc) tipVisc.addEventListener('click', function () {
    mfpViscChart.options.plugins.tooltip.enabled = !mfpViscChart.options.plugins.tooltip.enabled;
    mfpViscChart.update();
    this.textContent = mfpViscChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
  const tipDyn = document.getElementById('toggleTipDyn');
  if (tipDyn) tipDyn.addEventListener('click', function () {
    mfpDynChart.options.plugins.tooltip.enabled = !mfpDynChart.options.plugins.tooltip.enabled;
    mfpDynChart.update();
    this.textContent = mfpDynChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
  const tipDensity = document.getElementById('toggleTipDensity');
  if (tipDensity) tipDensity.addEventListener('click', function () {
    mfpDensityChart.options.plugins.tooltip.enabled = !mfpDensityChart.options.plugins.tooltip.enabled;
    mfpDensityChart.update();
    this.textContent = mfpDensityChart.options.plugins.tooltip.enabled ? 'Hide Tooltips' : 'Show Tooltips';
  });
}

// ---------------------------------------------------------------------------
// Fluid dropdown population (shared list, one per calculator)
// ---------------------------------------------------------------------------
function mfpPopulateSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  mfpFluidLabels.forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

// Water density [T_°F, kg/m³] — same reference table used across the site,
// for the temperature-dependent specific gravity output (***).
const mfpDensityWater = [
  [-40, 999.9], [32.2, 999.9], [34, 999.9], [39.2, 1000], [40, 1000],
  [50, 999.7], [60, 999.0], [70, 998.0], [80, 996.6], [90, 995.0],
  [100, 993.1], [110, 990.9], [120, 988.6], [130, 986.0], [140, 983.2],
  [150, 980.2], [160, 977.1], [170, 973.8], [180, 970.4], [190, 966.8],
  [200, 963.0], [212, 958.4], [220, 955.2], [240, 946.7], [260, 937.5],
];
function mfpWaterInterp(fahr) {
  const d = mfpDensityWater;
  for (let i = 0; i < d.length - 1; i++) {
    if (fahr >= d[i][0] && fahr <= d[i + 1][0]) {
      const t = (fahr - d[i][0]) / (d[i + 1][0] - d[i][0]);
      return d[i][1] + t * (d[i + 1][1] - d[i][1]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calculator 1 — Density & Specific Gravity
// ---------------------------------------------------------------------------
function mfpDensityConvertToFahrenheit() {
  const c = parseFloat(document.getElementById('mfpDensityCelsius').value);
  document.getElementById('mfpDensityFahrenheit').value = mfpCtoF(c).toFixed(2);
  mfpDensityCalculate();
}
function mfpDensityConvertToCelsius() {
  const f = parseFloat(document.getElementById('mfpDensityFahrenheit').value);
  document.getElementById('mfpDensityCelsius').value = mfpFtoC(f).toFixed(2);
  mfpDensityCalculate();
}
function mfpDensityCalculate() {
  const i = parseInt(document.getElementById('mfpDensityFluid').value, 10);
  const f = parseFloat(document.getElementById('mfpDensityFahrenheit').value);
  const data = mfpDensityData[i];
  const ids = ['mfpDensity_kgm3', 'mfpDensity_lbin3', 'mfpDensity_lbgal', 'mfpDensity_lbft3',
    'mfpDensity_sg1', 'mfpDensity_sg2', 'mfpDensity_sg3', 'mfpDensity_api',
    'mfpDensity_volpct', 'mfpDensity_rhopct'];

  if (!data || data.length === 0) {
    ids.forEach(id => { document.getElementById(id).textContent = 'Data pending'; });
    return;
  }
  const rho = mfpLinInterp(f, data);
  if (isNaN(rho)) {
    ids.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
    return;
  }

  document.getElementById('mfpDensity_kgm3').textContent  = rho.toFixed(3);
  document.getElementById('mfpDensity_lbin3').textContent = (rho * 0.000036127298147753).toFixed(5);
  document.getElementById('mfpDensity_lbgal').textContent = (rho * 0.0083454063545262).toFixed(4);
  document.getElementById('mfpDensity_lbft3').textContent = (rho * 0.0083454063545262 * 7.48052).toFixed(4);
  document.getElementById('mfpDensity_sg1').textContent   = (rho / 1000).toFixed(5);
  document.getElementById('mfpDensity_sg2').textContent   = (rho / 998).toFixed(5);

  const rhoW = mfpWaterInterp(f);
  document.getElementById('mfpDensity_sg3').textContent = (rhoW != null && !isNaN(rhoW)) ? (rho / rhoW).toFixed(5) : 'N/A';
  document.getElementById('mfpDensity_api').textContent = ((141.5 / (rho / 998)) - 131.5).toFixed(5);

  // % change relative to 68°F reference
  const rho0 = mfpLinInterp(68, data);
  if (isNaN(rho0)) {
    document.getElementById('mfpDensity_volpct').textContent = 'N/A';
    document.getElementById('mfpDensity_rhopct').textContent = 'N/A';
  } else {
    document.getElementById('mfpDensity_volpct').textContent = (((rho0 - rho) / rho) * 100).toFixed(4) + ' %';
    document.getElementById('mfpDensity_rhopct').textContent = (((rho - rho0) / rho0) * 100).toFixed(4) + ' %';
  }
}

// ---------------------------------------------------------------------------
// Calculator 2 — Viscosity (Kinematic + Dynamic)
// ---------------------------------------------------------------------------
function mfpViscConvertToFahrenheit() {
  const c = parseFloat(document.getElementById('mfpViscCelsius').value);
  document.getElementById('mfpViscFahrenheit').value = mfpCtoF(c).toFixed(2);
  mfpViscCalculate();
}
function mfpViscConvertToCelsius() {
  const f = parseFloat(document.getElementById('mfpViscFahrenheit').value);
  document.getElementById('mfpViscCelsius').value = mfpFtoC(f).toFixed(2);
  mfpViscCalculate();
}
function mfpViscCalculate() {
  const i = parseInt(document.getElementById('mfpViscFluid').value, 10);
  const f = parseFloat(document.getElementById('mfpViscFahrenheit').value);
  const kinSet = mfpKinematicViscosityData[i];
  const dynSet = mfpDynamicViscosityData[i];

  const kinIds = ['mfpVisc_kin1', 'mfpVisc_kin2', 'mfpVisc_kin3', 'mfpVisc_kin4', 'mfpVisc_kin5', 'mfpVisc_kin6'];
  const dynIds = ['mfpVisc_dyn1', 'mfpVisc_dyn2', 'mfpVisc_dyn3', 'mfpVisc_dyn4', 'mfpVisc_dyn5'];

  const kinOK = kinSet && kinSet.length > 0 && !isNaN(f) && f >= kinSet[0].x && f <= kinSet[kinSet.length - 1].x;
  const dynOK = dynSet && dynSet.length > 0 && !isNaN(f) && f >= dynSet[0].x && f <= dynSet[dynSet.length - 1].x;

  if (!kinSet || kinSet.length === 0) {
    kinIds.forEach(id => { document.getElementById(id).textContent = 'Data pending'; });
  } else if (kinOK) {
    const nu = mfpViscInterp(f, kinSet);
    document.getElementById('mfpVisc_kin1').textContent = nu.toFixed(4);                  // mm²/s
    document.getElementById('mfpVisc_kin2').textContent = nu.toFixed(4);                  // cSt
    document.getElementById('mfpVisc_kin3').textContent = (nu * 0.01).toFixed(6);         // Stokes
    document.getElementById('mfpVisc_kin4').textContent = (nu * 1e-6).toExponential(3);   // m²/s
    document.getElementById('mfpVisc_kin5').textContent = (nu * 0.0015500031).toFixed(6); // in²/s
    document.getElementById('mfpVisc_kin6').textContent = (nu * 0.0000107639).toFixed(7); // ft²/s
  } else {
    kinIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }

  if (!dynSet || dynSet.length === 0) {
    dynIds.forEach(id => { document.getElementById(id).textContent = 'Data pending'; });
  } else if (dynOK) {
    const mu = mfpViscInterp(f, dynSet);
    document.getElementById('mfpVisc_dyn1').textContent = mu.toFixed(4);                  // mPa·s
    document.getElementById('mfpVisc_dyn2').textContent = mu.toFixed(4);                  // cP
    document.getElementById('mfpVisc_dyn3').textContent = (mu * 0.01).toFixed(6);         // Poise
    document.getElementById('mfpVisc_dyn4').textContent = (mu * 0.001).toFixed(7);        // Pa·s
    document.getElementById('mfpVisc_dyn5').textContent = (mu * 0.000671969).toFixed(6);  // lbm/(ft·s)
  } else {
    dynIds.forEach(id => { document.getElementById(id).textContent = 'Out of Range'; });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  mfpPopulateSelect('mfpDensityFluid');
  mfpPopulateSelect('mfpViscFluid');

  mfpCreateCharts();

  document.getElementById('mfpDensityFahrenheit').value = '70';
  mfpDensityConvertToCelsius();
  document.getElementById('mfpViscFahrenheit').value = '70';
  mfpViscConvertToCelsius();
});
