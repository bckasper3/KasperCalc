'use strict';
// Sample data (§4A) — ~30 rows, obviously fake, exercises all pipeline branches
// SSNs use 9xx area (never issued); phones use 555-01xx; emails use @example.com / @testfirm.example

CC.SAMPLE_CSV = `ClientID,LastName,FirstName,MiddleInitial,SpouseFirstName,SpouseLastName,TaxpayerSSN,SpouseDOB,DateOfBirth,Phone,Email,Address1,City,State,Zip,Company,EIN,EntityType,Industry,ClientSince,Active
A001,Anderson,James,R,,,,1985-04-12,1982-07-23,555-0101,james.anderson@example.com,123 Maple St,Columbus,OH,43210,,,,Professional Services,01/15/2018,Y
A002,Baker,Susan,M,David,Baker,912-34-5678,1959-03-08,1957-11-19,555-0102,sbaker@example.com,456 Oak Ave,Dayton,OH,45401,,,,,,Active
A003,Chen,Michael,,Linda,Chen,923-45-6789,,1974-06-30,555-0103,m.chen@gmail.com,789 Pine Rd,Cincinnati,OH,45202,,,,Finance,03/01/2019,Yes
A004,Davis,Patricia,A,,,934-56-7890,,1991-02-14,555-0104,pdavis@yahoo.com,12 Elm Blvd,Toledo,OH,43601,,,,,,1
A005,Evans,Robert,,,,945-67-8901,,1965-09-05,555-0105,revans@hotmail.com,34 Birch Ln,Akron,OH,44301,,,,,2015-08-20,True
A006,Foster,Jennifer,,Mark,Foster,956-78-9012,1978-12-01,1980-03-17,555-0106,jfoster@icloud.com,56 Cedar Dr,Cleveland,OH,44101,,,,,01/01/2020,Y
A007,Green,Thomas,E,,,967-89-0123,,1953-07-22,555-0107,tgreen@aol.com,78 Spruce Way,Youngstown,OH,44501,,,,,,
A008,Harris,Emily,,,,978-90-1234,,1988-11-30,555-0108,eharris@outlook.com,90 Walnut Ct,Mansfield,OH,44901,,,,,2021-04-10,Active
B001,,,,,,,,,555-0120,info@acme-consulting.example,200 Corporate Blvd,Columbus,OH,43215,Acme Consulting LLC,98-1234567,LLC,Professional Services,01/01/2016,Y
B002,,,,,,,,,555-0121,accounting@midwest-mfg.example,300 Industrial Pkwy,Dayton,OH,45402,Midwest Manufacturing Inc,98-2345678,C-Corporation,Manufacturing,03/15/2010,Y
B003,,,,,,,,,555-0122,office@sunset-realty.example,401 Main St Ste 100,Cincinnati,OH,45203,Sunset Realty Group LLC,98-3456789,LLC,Real Estate,06/01/2014,Active
B004,,,,,,,,,555-0123,admin@buckeye-const.example,501 Builder Ave,Toledo,OH,43602,Buckeye Construction Corp,98-4567890,C-Corporation,Construction,09/01/2017,Yes
B005,,,,,,,,,555-0124,info@lakeside-dental.example,601 Health Dr,Akron,OH,44302,Lakeside Dental Associates PC,98-5678901,Other,Health Care,01/01/2019,Y
B006,,,,,,,,,555-0125,contact@ohio-tech.example,701 Innovation Way,Columbus,OH,43216,Ohio Tech Solutions LLC,98-6789012,LLC,Information Technology,07/15/2020,1
B007,,,,,,,,,555-0126,billing@heartland-farms.example,802 Rural Rte 1,Mansfield,OH,44902,Heartland Farms LP,98-7890123,Partnership,Agriculture,04/01/2012,Active
B008,,,,,,,,,555-0127,admin@cle-restaurant-grp.example,900 Dining Pl,Cleveland,OH,44102,Cleveland Restaurant Group LLC,98-8901234,LLC,Food Services,11/01/2018,Y
T001,Johnson,William,,,,989-12-3456,,1941-05-10,555-0140,wjohnson@example.com,1010 Trust Ln,Columbus,OH,43217,The Johnson Family Trust,,Trust,,2001-01-01,Y
T002,,,,,,,,,555-0141,info@ohio-foundation.example,1100 Giving Way,Dayton,OH,45403,Ohio Community Foundation,,Non-Profit,Social Assistance,2005-06-01,Active
D001,Wilson,Kevin,,,,990-23-4567,,1975-08-18,555-0150,kwilson@example.com,2020 Duplicate Rd,Columbus,OH,43218,,,,,,Y
D002,Wilson,Kevin,,,,990-23-4567,,1975-08-18,555-0151,k.wilson2@example.com,2021 Other St,Columbus,OH,43218,,,,,,Y
X001,,,,,,,,,555-0160,info@ambiguous.example,3000 Unknown Ave,Columbus,OH,43219,,,,,2022-01-01,Y
X002,Martinez,Sofia,C,Carlos,Garcia,991-34-5678,1983-09-15,1981-04-20,555-0161,,,Columbus,OH,43220,,,,,2020-05-01,Y
A009,Thompson,Nancy,J,,,992-45-6789,,1969-02-28,555-0162,nthompson@example.com,4040 Flower Ave,Cincinnati,OH,45204,,,,,,inactive
A010,Robinson,Charles,,Sharon,Robinson,993-56-7890,1977-10-30,1975-01-09,555-0163,crobinson@example.com,5050 River Rd,Toledo,OH,43603,,,,Health Care,2016-03-01,Y
A011,Lewis,Amanda,R,,,994-67-8901,,1995-07-14,555-0164,alewis@gmail.com,6060 Park Blvd,Akron,OH,44303,,,,,2023-02-15,True
B009,,,,,,,,,555-0170,support@tri-state-ins.example,7070 Commerce St,Youngstown,OH,44502,Tri-State Insurance LLC,99-1234567,LLC-M,Insurance,2013-09-01,Y
B010,,,,,,,,,555-0171,office@valley-pharma.example,8080 Science Dr,Columbus,OH,43220,Valley Pharmaceuticals Corp,99-2345678,C-Corporation,Pharmaceuticals,2008-12-01,Active
ERR1,Spouse-No-Name,Janet,,,,995-78-9012,,1968-04-03,555-0180,jsmith@example.com,9090 Problem St,Columbus,OH,43221,,,,,,Y
ERR1,,Janet,,,,995-78-9012,,1968-04-03,555-0181,,,,,,,,,,,`;

// SpouseSSN is present but no SpouseFirstName on ERR1 row — triggers SPOUSE_NAME_MISSING edge case
// (The last row intentionally has no last name — triggers MISSING_CLIENT_NAME)

CC.loadSampleData = () => {
  // Run through the exact same pipeline as a real upload
  const raw = CC.parseCSV(CC.SAMPLE_CSV, { fileName: 'sample-data.csv', fileType: 'csv' });
  CC.rawImport = raw;
  CC.normalizeToDataset(raw);
  CC._refresh && CC._refresh();
};
