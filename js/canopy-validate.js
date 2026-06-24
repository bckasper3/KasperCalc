'use strict';
// Validation — produces Flag[] on records (§9)

// Flag factory
const flag = (level, code, msg, colId) => ({ level, code, message: msg, ...(colId ? {columnId: colId} : {}) });

CC.validateRecord = (record) => {
  const flags = [];
  const g  = (f) => CC.getCellByField(record, f);
  const gc = (f) => { const col = CC.getColByField(f); return col ? col.id : null; };
  const cls = record.classification;

  const clientName = CC.composeClientName(record);
  if (!clientName)
    flags.push(flag('error','MISSING_CLIENT_NAME','No composable Client Name for this row'));

  if (cls === 'business' && !g('business_name'))
    flags.push(flag('error','MISSING_BUSINESS_NAME','Business row is missing a Business Name'));

  // Spouse name required if any other spouse field present
  const spouseOthers = ['spouse_ssn','spouse_email','spouse_dob'].some(f => g(f));
  if (spouseOthers && !g('spouse_first') && !g('spouse_last'))
    flags.push(flag('error','SPOUSE_NAME_MISSING','Spouse details present but spouse name is missing (Canopy will reject)'));

  const ssn = g('ssn');
  if (ssn && CC.normalizeSSN(ssn).status === 'unmatched')
    flags.push(flag('error','BAD_SSN',`SSN "${ssn}" cannot be formatted as xxx-xx-xxxx`, gc('ssn')));

  const ein = g('ein');
  if (ein && CC.normalizeEIN(ein).status === 'unmatched')
    flags.push(flag('error','BAD_EIN',`EIN "${ein}" cannot be formatted as xx-xxxxxxx`, gc('ein')));

  ['dob','spouse_dob','client_since','date_est'].forEach(f => {
    const v = g(f);
    if (v && CC.normalizeDate(v).status === 'unmatched')
      flags.push(flag('warning','BAD_DATE',`Date "${v}" in ${CC.FIELD_LABELS[f]||f} is not recognized`, gc(f)));
  });

  ['phone','mobile'].forEach(f => {
    const v = g(f);
    if (v && CC.normalizePhone(v).status === 'unmatched')
      flags.push(flag('warning','BAD_PHONE',`Phone "${v}" cannot be normalized to xxx-xxx-xxxx`, gc(f)));
  });

  ['email','spouse_email'].forEach(f => {
    const v = g(f);
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()))
      flags.push(flag('warning','BAD_EMAIL',`"${v}" doesn't look like a valid email`, gc(f)));
  });

  const state = g('state');
  if (state && CC.coerceState(state).status === 'unmatched')
    flags.push(flag('warning','UNMATCHED_VOCAB',`State "${state}" not recognized`, gc('state')));

  const bt = g('business_type');
  if (bt && CC.coerceBizType(bt).status === 'unmatched')
    flags.push(flag('warning','UNMATCHED_VOCAB',`Business type "${bt}" defaulted to Other`, gc('business_type')));

  const ind = g('industry');
  if (ind && CC.coerceIndustry(ind).status === 'unmatched')
    flags.push(flag('warning','UNMATCHED_VOCAB',`Industry "${ind}" defaulted to Other`, gc('industry')));

  if (cls === 'unknown')
    flags.push(flag('warning','UNKNOWN_CLASS','Cannot determine if this row is an Individual or Business — review and set type manually'));

  // Empty row
  const hasAnyValue = Object.values(record.cells).some(v => v && v.trim());
  if (!hasAnyValue)
    flags.push(flag('warning','EMPTY_ROW','All mapped fields are empty'));

  return flags;
};

CC.validateAll = () => {
  for (const rec of CC.dataset.records) {
    if (rec._deleted) { rec.validationFlags = []; continue; }
    rec.validationFlags = CC.validateRecord(rec);
    rec._stale = false;
  }
};

// Dedup detection (§9A)
CC.findDuplicates = () => {
  const groups = {};
  const individual_records = CC.dataset.records.filter(r => !r._deleted && r.classification === 'individual');
  for (const rec of individual_records) {
    const first = CC.getCellByField(rec, 'first_name').toLowerCase().trim();
    const last  = CC.getCellByField(rec, 'last_name').toLowerCase().trim();
    if (!first && !last) continue;
    const nameKey = `${first}|${last}`;
    if (!groups[nameKey]) groups[nameKey] = [];
    groups[nameKey].push(rec);
  }
  const dupes = [];
  for (const [nameKey, recs] of Object.entries(groups)) {
    if (recs.length < 2) continue;
    // Check DOB or SSN overlap
    for (let i = 0; i < recs.length; i++) {
      for (let j = i + 1; j < recs.length; j++) {
        const a = recs[i], b = recs[j];
        const aSSN = CC.getCellByField(a,'ssn').replace(/\D/g,'');
        const bSSN = CC.getCellByField(b,'ssn').replace(/\D/g,'');
        const aDOB = CC.getCellByField(a,'dob');
        const bDOB = CC.getCellByField(b,'dob');
        const ssnMatch = aSSN && bSSN && aSSN === bSSN;
        const dobMatch = aDOB && bDOB && aDOB === bDOB;
        if (ssnMatch || dobMatch) {
          const reason = ssnMatch ? 'same SSN' : 'same date of birth';
          dupes.push({ records: [a.id, b.id], nameKey, reason });
          a.validationFlags.push(flag('warning','DUPLICATE_CONTACT',`Possible duplicate of row ${b._sourceIndex + 1} (${reason})`));
          b.validationFlags.push(flag('warning','DUPLICATE_CONTACT',`Possible duplicate of row ${a._sourceIndex + 1} (${reason})`));
        }
      }
    }
  }
  return dupes;
};

// Summary for the pre-export gate
CC.getValidationSummary = () => {
  const active = CC.dataset.records.filter(r => !r._deleted);
  let errors = 0, warnings = 0;
  const byCodes = {};
  for (const rec of active) {
    for (const f of rec.validationFlags) {
      if (f.level === 'error') errors++;
      else warnings++;
      byCodes[f.code] = (byCodes[f.code] || 0) + 1;
    }
  }
  return { errors, warnings, byCodes };
};
