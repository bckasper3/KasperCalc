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
  const raw = CC.parseCSV(CC.SAMPLE_CSV, { fileName: 'sample-data.csv', fileType: 'csv' });
  CC.rawImport = raw;
  CC.normalizeToDataset(raw);
  CC._refresh && CC._refresh();
};

// ── Sample dataset 2: realistic UltraTax CSV export — Northeast Ohio tax firm ─
CC.SAMPLE_CSV_2 = `CLIENT_ID,CLIENT_NAME,CLIENT_TYPE,RETURN_TYPE,TAX_YEAR,TAXPAYER_FIRST,TAXPAYER_LAST,SPOUSE_FIRST,SPOUSE_LAST,ENTITY_NAME,TIN,PHONE,EMAIL,ADDR1,ADDR2,CITY,STATE,ZIP,CLIENT_STATUS,PREPARER,ORGANIZER_SENT,EFILE,COMMENTS
UT000912,"KASSEL, MARK D",I,1040,2025,MARK,KASSEL,,,,"435-91-2284","3305557821","mkassel@gmail.com","4436 HICKORY LN","",KENT,OH,44240,ACTIVE,AB,YES,PENDING,"PRIOR YEAR IMPORT"
UT000913,"STONE RIDGE INDUSTRIAL LLC",B,1120S,2025,,,,STONE RIDGE INDUSTRIAL LLC,"84-5629034","330-555-8821","acct@stoneridgeind.com","17 E WATER ST","STE 202",AKRON,OH,44308,ACTIVE,RM,NO,NO,"BOOKS REC'D 03/04"
UT000914,"PARKER, LINDSAY A + SP",I,1040,2025,LINDSAY,PARKER,THOMAS,PARKER,,"517-82-1990","(234)555-9281","","1106 FOX RUN",,HUDSON,OH,44236,COMPLETE,AB,YES,YES,"SCH C + CHILD CREDITS"
UT000915,"RIVERVIEW TOOLING INC",B,1120,2025,,,,RIVERVIEW TOOLING INC,"34-2281901","2165551114","tax@riverviewtool.com","442 INDUSTRIAL PKWY","",CLEVELAND,OH,44114,WAITING,RM,YES,PENDING,"VERIFY DEPR"
UT000916,"MILLER KEVIN R",I,1040,2025,KEVIN,MILLER,,,,"384-61-8281","3305559901","krmiller@email.com","9 OAKMONT DR","APT 2",STOW,OH,44224,ACTIVE,CM,NO,NO,"NEW CLIENT"
UT000917,"HARVEST RIDGE FARMS LLC",B,1065,2025,,,,HARVEST RIDGE FARMS LLC,"82-1155987","3305552910","","8129 COUNTY RD 17","",RAVENNA,OH,44266,ACTIVE,RM,YES,PENDING,"K-1 PENDING"
UT000918,"WILLIAMS, JULIA M",I,1040,2025,JULIA,WILLIAMS,,,,"201-74-4401","330.555.8134","jwilliams82@outlook.com","887 VILLAGE CT","",KENT,OH,44240,ACTIVE,AB,YES,YES,"MOVED"
UT000919,"ALLPOINT FABRICATION LTD",B,1120S,2025,,,,ALLPOINT FABRICATION LTD,"47-8211550","3305554410","finance@allpointfab.net","77 COMMERCE BLVD","BLDG C",AKRON,OH,44312,ACTIVE,RM,NO,NO,"OWNER TO SIGN"
UT000920,"OWENS, JONATHAN",I,1040,2025,JONATHAN,OWENS,,,,"287918311","","","24 RIDGEWOOD DR","",MOGADORE,OH,44260,OPEN,CM,NO,NO,"NO PHONE"
UT000921,"PINE LAKE STORAGE PARTNERS",B,1065,2025,,,,PINE LAKE STORAGE PARTNERS,"13-8902177","2345557811","office@pinelakepartners.com","4411 STATE RT 59","",KENT,OH,44240,WAITING,RM,YES,PENDING,"PARTNER BASIS"
UT000922,"LEE, CAROLYN + DAVID",I,1040,2025,CAROLYN,LEE,DAVID,LEE,,"690-17-6211","3305557171","","522 SPRINGVIEW DR","",HUDSON,OH,44236,ACTIVE,AB,YES,YES,"RENTAL"
UT000923,"BRIGHTPATH CONSULTING LLC",B,1120S,2025,,,,BRIGHTPATH CONSULTING LLC,"88-2231881","4405559012","admin@brightpathconsulting.io","117 MAIN ST","STE 3",SOLON,OH,44139,ACTIVE,RM,YES,YES,"FINAL?"
UT000924,"NELSON, EMMA T",I,1040,2025,EMMA,NELSON,,,,"599-83-0109","3305551004","emma.nelson@gmail.com","1207 CEDAR CT","",KENT,OH,44240,COMPLETE,CM,NO,YES,"SCH A"
UT000925,"OHIO MOTOR REPAIR INC",B,1120,2025,,,,OHIO MOTOR REPAIR INC,"31-7415591","3305554188","books@ohiomotorrepair.com","6100 STATE RD","",CUYAHOGA FALLS,OH,44221,ACTIVE,RM,YES,PENDING,"LATE BOOKS"
UT000926,"GARCIA, ROBERT A",I,1040,2025,ROBERT,GARCIA,,,,"411-28-9033","3305553319","","16 MAPLE ST","APT B",AKRON,OH,44310,ACTIVE,AB,YES,YES,"1099-B"
UT000927,"RAVEN INDUSTRIAL SYSTEMS LLC",B,1120S,2025,,,,RAVEN INDUSTRIAL SYSTEMS LLC,"36-9921807","2165557120","acct@ravenindustrial.com","810 ENTERPRISE DR","",MEDINA,OH,44256,OPEN,RM,NO,NO,"OWNER REVIEW"
UT000928,"SMITH, KEITH + AMANDA",I,1040,2025,KEITH,SMITH,AMANDA,SMITH,,"771-21-8112","3305559917","smithfam@email.com","89 SUNSET CIR","",ROOTSTOWN,OH,44272,ACTIVE,CM,YES,YES,"DEPENDENTS=3"
UT000929,"EAST COAST IMPORT GROUP LLC",B,1065,2025,,,,EAST COAST IMPORT GROUP LLC,"61-4477282","3305557710","","550 MARKET ST","UNIT 6",CANTON,OH,44702,HOLD,RM,NO,NO,"WAITING QB"
UT000930,"THOMPSON, JARED M",I,1040,2025,JARED,THOMPSON,,,,"555-31-2200","3305552047","jtaxclient@mail.com","311 BIRCH ST","",KENT,OH,44240,ACTIVE,AB,YES,PENDING,"SELF EMP"`;

CC.loadSampleData2 = () => {
  const raw = CC.parseCSV(CC.SAMPLE_CSV_2, { fileName: 'ultratax-sample.csv', fileType: 'csv' });
  CC.rawImport = raw;
  CC.normalizeToDataset(raw);
  CC._refresh && CC._refresh();
};
