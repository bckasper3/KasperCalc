'use strict';
// Field mapping — alias table (Mode 1), pattern detection (Mode 2), dropdown list (Mode 3)

// ── Alias table ───────────────────────────────────────────────────────────────
CC.FIELD_ALIASES = {
  first_name:    ['firstname','fname','first','taxpayerfirstname','primaryfirst'],
  last_name:     ['lastname','lname','last','surname','taxpayerlastname','primarylast'],
  middle_name:   ['middlename','mname','middle','mi','middleinitial'],
  business_name: ['businessname','companyname','company','entityname','dbaname','entity','dba'],
  client_id:     ['id','clientid','clientnumber','clientcode','clientno','clientnum'],
  ssn:           ['ssn','socialsecurity','socialsecuritynumber','taxpayerssn','tin','taxid'],
  ein:           ['ein','fein','employerid','federalid','federalein'],
  email:         ['email','emailaddress','primaryemail','taxpayeremail','emailaddr'],
  phone:         ['phone','phonenumber','telephone','homephone','primaryphone','workphone'],
  mobile:        ['mobile','cell','cellphone','mobilephone','cellnumber'],
  address1:      ['address','address1','addressline1','street','streetaddress','mailingaddress','addr1','addr'],
  address2:      ['address2','addressline2','suite','unit','apt','addr2'],
  city:          ['city','town'],
  state:         ['state','st','province','stateprovince'],
  zip:           ['zip','zipcode','postal','postalcode','postcode','zippostcode'],
  country:       ['country'],
  dob:           ['dob','dateofbirth','birthdate','birthday','birthdt'],
  client_name:   ['clientname','name','fullname','clientfullname'],
  active:        ['active','status','activestatus','clientstatus'],
  client_owner:  ['clientowner','owner','assignedto','partner','manager','clientmanager'],
  source:        ['source','referral','referralsource','leadsource'],
  client_since:  ['clientsince','since','startdate','datestarted','clientstartdate'],
  client_group:  ['clientgroup','clientcategory','group'],
  business_type: ['businesstype','entitytype','orgtype','organizationtype'],
  industry:      ['industry','sector','businesssector'],
  date_est:      ['dateest','dateinc','incorporateddate','establisheddate','dateestablished','incdate'],
  contact_type:  ['contacttype'],
  tags:          ['tag','tags','category','label'],
  spouse_first:  ['spousefirstname','spousefirst','spfirstname','spousefname'],
  spouse_last:   ['spouselastname','spouselast','splastname','spouselname'],
  spouse_middle: ['spousemiddle','spousemi','spousemiddlename'],
  spouse_ssn:    ['spousessn','spousetin','spousetaxid'],
  spouse_email:  ['spouseemail','spouseemailaddress'],
  spouse_dob:    ['spousedob','spousebirthdate','spousebirthday'],
};

CC.FIELD_LABELS = {
  first_name:'First name', last_name:'Last name', middle_name:'Middle name',
  business_name:'Business name', client_id:'Client ID', ssn:'SSN', ein:'EIN',
  email:'Email', phone:'Phone number', mobile:'Mobile number',
  address1:'Address line 1', address2:'Address line 2', city:'City',
  state:'State', zip:'Zip', country:'Country', dob:'Date of birth',
  client_name:'Client Name', active:'Active', client_owner:'Client Owner',
  source:'Source', client_since:'Client Since', client_group:'Client Group',
  business_type:'Business Type', industry:'Industry', date_est:'Date Est./Inc.',
  contact_type:'Contact type', tags:'Tags',
  spouse_first:'Spouse first name', spouse_last:'Spouse last name',
  spouse_middle:'Spouse middle name', spouse_ssn:'Spouse SSN',
  spouse_email:'Spouse email', spouse_dob:'Spouse date of birth',
  __ignore:'Do not import',
};

CC.BIZ_SUFFIX_RE = /\b(LLC|INC|CORP|LTD|LLP|CO|PC|PLLC|LP|PARTNERSHIP|TRUST|FOUNDATION|ASSOCIATES|GROUP)\b/i;

// ── Normalization ─────────────────────────────────────────────────────────────
CC.normalizeHeader = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]/g, '');

// Levenshtein distance
CC.levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) =>
    Array.from({length: n + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
  return dp[m][n];
};

// Mode 1: header → field
CC.mapByHeader = (header) => {
  const norm = CC.normalizeHeader(header);
  if (!norm) return { mappedField: null, confidence: 0, mode: 'none' };
  for (const [field, aliases] of Object.entries(CC.FIELD_ALIASES)) {
    if (aliases.includes(norm)) return { mappedField: field, confidence: 100, mode: 'header' };
  }
  for (const [field, aliases] of Object.entries(CC.FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (norm.includes(alias) || alias.includes(norm))
        return { mappedField: field, confidence: 85, mode: 'header' };
    }
  }
  for (const [field, aliases] of Object.entries(CC.FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (CC.levenshtein(norm, alias) <= 2)
        return { mappedField: field, confidence: 70, mode: 'header' };
    }
  }
  return { mappedField: null, confidence: 0, mode: 'none' };
};

// Mode 2: pattern detectors
CC.PATTERN_TESTS = {
  ssn:       v => /^\d{3}-?\d{2}-?\d{4}$/.test(v) && v.replace(/\D/g,'').length === 9,
  ein:       v => /^\d{2}-?\d{7}$/.test(v),
  phone:     v => /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(v),
  email:     v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  zip:       v => /^\d{5}(-\d{4})?$/.test(v),
  state:     v => CC.STATE_CODES.has(v.toUpperCase()) || !!CC.STATE_MAP[v.toLowerCase()],
  date:      v => /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})$/.test(v),
  name_lf:   v => /^[A-Za-z'\-]+,\s+[A-Za-z'\-. ]+$/.test(v),
  biz_name:  v => CC.BIZ_SUFFIX_RE.test(v),
};

const PATTERN_TO_FIELD = {
  ssn:'ssn', ein:'ein', phone:'phone', email:'email', zip:'zip',
  state:'state', date:'dob', name_lf:'client_name', biz_name:'business_name',
};

CC.mapByPattern = (col, records) => {
  const sample = records.filter(r => !r._deleted && r.cells[col.id]?.trim()).slice(0, 100);
  if (sample.length < 3) return { mappedField: null, confidence: 0, mode: 'none' };
  const counts = {};
  for (const rec of sample) {
    const v = (rec.cells[col.id] || '').trim();
    for (const [key, test] of Object.entries(CC.PATTERN_TESTS)) {
      if (test(v)) counts[key] = (counts[key] || 0) + 1;
    }
  }
  let best = null, bestPct = 0;
  for (const [key, cnt] of Object.entries(counts)) {
    const pct = cnt / sample.length;
    if (pct > bestPct) { best = key; bestPct = pct; }
  }
  if (!best || bestPct < 0.30) return { mappedField: null, confidence: 0, mode: 'none' };
  const field = PATTERN_TO_FIELD[best] || null;
  return { mappedField: field, confidence: Math.min(95, Math.round(bestPct * 95)), mode: 'pattern' };
};

// Run Modes 1+2 on the whole column set (skips manual overrides)
CC.autoMapColumns = (columns, records) => {
  const claimed = new Set(columns.filter(c => c.mappingMode === 'manual' && c.mappedField).map(c => c.mappedField));
  for (const col of columns) {
    if (col.isDeleted || col.mappingMode === 'manual') continue;
    const h = CC.mapByHeader(col.sourceHeader);
    if (h.mappedField && !claimed.has(h.mappedField)) {
      col.mappedField = h.mappedField; col.mappingMode = h.mode; col.mappingConfidence = h.confidence;
      claimed.add(h.mappedField);
      continue;
    }
    const p = CC.mapByPattern(col, records);
    if (p.mappedField && !claimed.has(p.mappedField)) {
      col.mappedField = p.mappedField; col.mappingMode = p.mode; col.mappingConfidence = p.confidence;
      claimed.add(p.mappedField);
      continue;
    }
    col.mappedField = null; col.mappingMode = 'none'; col.mappingConfidence = 0;
  }
};

// Dropdown groups for Mode 3
CC.getFieldDropdownGroups = () => [
  { group: 'Individual',    fields: ['first_name','middle_name','last_name','ssn','dob'] },
  { group: 'Business',      fields: ['business_name','ein','business_type','industry','date_est'] },
  { group: 'Shared',        fields: ['client_name','client_id','email','phone','mobile',
      'address1','address2','city','state','zip','country',
      'contact_type','client_owner','source','client_since','active','client_group','tags'] },
  { group: 'Spouse',        fields: ['spouse_first','spouse_middle','spouse_last','spouse_ssn','spouse_email','spouse_dob'] },
  { group: 'Ignore',        fields: ['__ignore'] },
];

// Helper: get column by mappedField key
CC.getColByField = (field) =>
  CC.dataset.columns.find(c => !c.isDeleted && c.mappedField === field);

CC.getCellByField = (record, field) => {
  const col = CC.getColByField(field);
  return col ? (record.cells[col.id] || '').trim() : '';
};
