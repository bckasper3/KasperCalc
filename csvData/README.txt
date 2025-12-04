Welcome to KasperCalc.

To figure out which CSV files you need, you must reference the Javascript files. They are located in the folder labeled "JS".


For example, if I wanted the raw data for the propylene glycol density (https://kaspercalc.com/PGdensity.html). I would look at the files named "pgDensity.js".

Looking at this file, I would see that the following csv files were used:

  '../csvData/propylenegylcol/pg-1.csv', // Replace with actual file paths or URLs
  '../csvData/propylenegylcol/pg-2.csv',
  '../csvData/propylenegylcol/pg-3.csv',
  '../csvData/propylenegylcol/pg-4.csv',
  '../csvData/propylenegylcol/pg-5.csv',
  '../csvData/propylenegylcol/pg-6.csv',
  '../csvData/propylenegylcol/pg-7.csv',


and that they were labeled:
const fixedLabels = [ //for the data labels because they aren't in the csv files
  'Freeze Curve',
  '25%',
  '30%',
  '35%',
  '40%',
  '45%',
  '50%',
];

Please contact me at bckasper3@gmail.com for additional clarification or suggestions or bug fixes.