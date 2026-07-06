'use strict';
// Export layer — pure functions producing Blobs (§11)
// Generic: CSV, JSON, Excel   |   Canopy Path A: two CSVs   |   Canopy Path B: xlsx (template-match)

// ── Helpers ───────────────────────────────────────────────────────────────────
const CSV_TWENTY_MB = 20 * 1024 * 1024;

const escapeCSV = (v) => {
  const s = String(v == null ? '' : v);
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rowToCSV = (values) => values.map(escapeCSV).join(',');

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Per-row identifier routing ────────────────────────────────────────────────
// A TIN column may hold either an SSN or an EIN. Distinguish by dash position:
// SSN = \d{3}-\d{2}-\d{4}, EIN = \d{2}-\d{7}. When no dashes are present, fall
// back to record classification as the tiebreaker.
CC._routeIdentifier = (raw, mappedField, record) => {
  if (mappedField !== 'ssn' && mappedField !== 'ein') return null;
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length !== 9) return null;

  const looksSSN = /^\d{3}-\d{2}-\d{4}$/.test(t);
  const looksEIN = /^\d{2}-\d{7}$/.test(t);

  if (looksSSN && !looksEIN) return { field: 'ssn', coercion: CC.normalizeSSN(t) };
  if (looksEIN && !looksSSN) return { field: 'ein', coercion: CC.normalizeEIN(t) };

  // No dashes or ambiguous — use classification as tiebreaker
  const isBiz = record.classification === 'business';
  return isBiz
    ? { field: 'ein', coercion: CC.normalizeEIN(t) }
    : { field: 'ssn', coercion: CC.normalizeSSN(t) };
};

// ── Per-row address unscatter ─────────────────────────────────────────────────
// Scans the four-slot address cluster {address2, city, state, zip} for
// type mismatches and corrects them. Handles both simple swaps and cascade
// shifts where a missing ADDR2 placeholder causes all subsequent values to
// shift left (city→addr2, state→city, zip→state). Rebuilds all four slots
// from whichever position state and zip are actually found in.
CC._unscatterAddress = (out) => {
  const ZIP_RE  = /^\d{5}(-\d{4})?$/;
  const isZip   = v => !!(v && ZIP_RE.test(v.trim()));
  const isState = v => !!(v && (CC.STATE_CODES.has(v.trim().toUpperCase()) ||
                                !!CC.STATE_MAP[v.trim().toLowerCase()]));

  const cluster = ['address2', 'city', 'state', 'zip'];
  const vals    = cluster.map(k => (out[k] || '').trim());
  const st = vals[2], zp = vals[3];

  // Fast exit: both state and zip are already correctly typed
  if ((!st || isState(st)) && (!zp || isZip(zp))) return;

  // Simple swap: state slot has a zip, zip slot has a state
  if (isZip(st) && isState(zp)) {
    out['state'] = CC.coerceState(zp).value || zp;
    out['zip']   = st;
    return;
  }

  // General: find where state and zip actually live in the cluster
  const stateIdx = vals.findIndex(v => isState(v));
  const zipIdx   = vals.findIndex(v => isZip(v));
  if (stateIdx < 0 && zipIdx < 0) return;

  // Use state position as primary anchor (zip as fallback if state not found)
  const effectiveStateIdx = stateIdx >= 0 ? stateIdx : zipIdx - 1;
  if (effectiveStateIdx === 2) return; // state is already correct

  // Rebuild all four slots from the shifted positions.
  // The value immediately before state is city; the one before that is addr2.
  const stateVal = stateIdx >= 0 ? vals[stateIdx] : '';
  const zipVal   = zipIdx   >= 0 ? vals[zipIdx]   : '';
  const cityVal  = effectiveStateIdx > 0 ? vals[effectiveStateIdx - 1] : '';
  const addr2Val = effectiveStateIdx > 1 ? vals[effectiveStateIdx - 2] : '';

  out['address2'] = addr2Val;
  out['city']     = cityVal;
  out['state']    = stateVal ? (CC.coerceState(stateVal).value || stateVal) : '';
  out['zip']      = zipVal;
};

// Coerce a record's cell values for Canopy export
const coerceForCanopy = (record) => {
  const g = (f) => CC.getCellByField(record, f);
  const out = {};
  const coercedFields = {};

  for (const col of CC.dataset.columns) {
    if (col.isDeleted || !col.mappedField || col.mappedField === '__ignore') continue;
    const raw = record.cells[col.id] || '';
    let coerced = raw;
    let coercion = null;

    // Per-row identifier routing: detect SSN vs EIN by value format + classification
    const routed = CC._routeIdentifier(raw, col.mappedField, record);
    if (routed) {
      out[routed.field] = routed.coercion.value;
      if (routed.coercion.note) coercedFields[routed.field] = routed.coercion.note;
      if (routed.field !== col.mappedField)
        coercedFields[col.mappedField + '_src'] = `re-routed to ${routed.field}`;
      continue;
    }

    switch (col.mappedField) {
      case 'state':         coercion = CC.coerceState(raw);    break;
      case 'active':        coercion = CC.coerceActive(raw);   break;
      case 'business_type': coercion = CC.coerceBizType(raw);  break;
      case 'industry':      coercion = CC.coerceIndustry(raw); break;
      case 'ssn':           coercion = CC.normalizeSSN(raw);   break;
      case 'ein':           coercion = CC.normalizeEIN(raw);   break;
      case 'phone': case 'mobile': coercion = CC.normalizePhone(raw); break;
      case 'dob': case 'spouse_dob': case 'client_since': case 'date_est':
        coercion = CC.normalizeDate(raw); break;
    }
    if (coercion) { coerced = coercion.value; if (coercion.note) coercedFields[col.mappedField] = coercion.note; }
    out[col.mappedField] = coerced;
  }

  // Correct address field scatter (state/zip values in wrong slots)
  CC._unscatterAddress(out);

  out.__coercions = coercedFields;
  return out;
};

// ── Canopy Path A — column order for individuals ──────────────────────────────
const CANOPY_INDIV_HEADERS = [
  'Client Name','Client ID','Client Owner','Source','Client Since','Active','Client Group',
  'First name','Middle name','Last name','SSN','Date of birth',
  'Email','Phone number','Mobile number','Address line 1','Address line 2','City','State','Zip','Country',
  'Tags',
  'Spouse first name','Spouse middle name','Spouse last name','Spouse SSN','Spouse email','Spouse date of birth',
];
const CANOPY_INDIV_FIELDS = [
  'client_name','client_id','client_owner','source','client_since','active','client_group',
  'first_name','middle_name','last_name','ssn','dob',
  'email','phone','mobile','address1','address2','city','state','zip','country',
  'tags',
  'spouse_first','spouse_middle','spouse_last','spouse_ssn','spouse_email','spouse_dob',
];

const CANOPY_BIZ_HEADERS = [
  'Client Name','Business Name','Client ID','Client Owner','Source','Client Since','Active','Client Group',
  'EIN','Business Type','Industry','Date Est./Inc.',
  'Email','Phone number','Mobile number','Address line 1','Address line 2','City','State','Zip','Country',
  'Tags',
];
const CANOPY_BIZ_FIELDS = [
  'client_name','business_name','client_id','client_owner','source','client_since','active','client_group',
  'ein','business_type','industry','date_est',
  'email','phone','mobile','address1','address2','city','state','zip','country',
  'tags',
];

CC.exportCanopyPathA = () => {
  const indivRecords = CC.dataset.records.filter(r => !r._deleted && r.classification === 'individual');
  const bizRecords   = CC.dataset.records.filter(r => !r._deleted && r.classification === 'business');

  const buildCSV = (records, headers, fields) => {
    const lines = [rowToCSV(headers)];
    for (const rec of records) {
      const coerced = coerceForCanopy(rec);
      const composed = CC.getFormattedClientName(rec);
      coerced.client_name = CC.getFormattedClientName(rec) || coerced.client_name || '';
      lines.push(rowToCSV(fields.map(f => coerced[f] || '')));
    }
    return lines.join('\n');
  };

  const results = [];
  if (indivRecords.length) {
    const text = buildCSV(indivRecords, CANOPY_INDIV_HEADERS, CANOPY_INDIV_FIELDS);
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
    if (blob.size > CSV_TWENTY_MB) results.push({ type: 'oversize', category: 'individuals', blob });
    else results.push({ type: 'individuals', blob, filename: `canopy-individuals-${todayStr()}.csv` });
  }
  if (bizRecords.length) {
    const text = buildCSV(bizRecords, CANOPY_BIZ_HEADERS, CANOPY_BIZ_FIELDS);
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
    if (blob.size > CSV_TWENTY_MB) results.push({ type: 'oversize', category: 'businesses', blob });
    else results.push({ type: 'businesses', blob, filename: `canopy-businesses-${todayStr()}.csv` });
  }
  return results;
};

CC.triggerCanopyPathADownload = () => {
  const results = CC.exportCanopyPathA();
  if (!results.length) { alert('No rows to export. Ensure rows are classified as Individual or Business.'); return; }
  const oversized = results.filter(r => r.type === 'oversize');
  if (oversized.length) {
    alert(`Warning: ${oversized.map(r=>r.category).join(' and ')} CSV exceeds Canopy's 20 MB limit.\nConsider splitting by last-name range (A-F, G-M, …) using Edit Mode to filter rows.`);
  }
  const downloads = results.filter(r => r.type === 'individuals' || r.type === 'businesses');
  if (!downloads.length) return;
  downloadBlob(downloads[0].blob, downloads[0].filename);
  if (downloads[1]) setTimeout(() => downloadBlob(downloads[1].blob, downloads[1].filename), 600);
  const note = downloads.map(d => d.filename).join(' and ');
  CC._toast && CC._toast(`Downloading: ${note}`);
};

// ── Path B — Canopy Excel (.xlsx matching template layout) ────────────────────
CC.exportCanopyPathB = () => {
  if (typeof XLSX === 'undefined') { alert('SheetJS library not loaded.'); return; }
  const wb = XLSX.utils.book_new();

  const buildSheet = (records, headers, fields) => {
    const rows = [headers];
    for (const rec of records) {
      const coerced = coerceForCanopy(rec);
      coerced.client_name = CC.getFormattedClientName(rec) || coerced.client_name || '';
      rows.push(fields.map(f => coerced[f] || ''));
    }
    return XLSX.utils.aoa_to_sheet(rows);
  };

  const indivRecords = CC.dataset.records.filter(r => !r._deleted && r.classification === 'individual');
  const bizRecords   = CC.dataset.records.filter(r => !r._deleted && r.classification === 'business');

  XLSX.utils.book_append_sheet(wb, buildSheet(indivRecords, CANOPY_INDIV_HEADERS, CANOPY_INDIV_FIELDS), 'Individual Clients');
  XLSX.utils.book_append_sheet(wb, buildSheet(bizRecords,   CANOPY_BIZ_HEADERS,   CANOPY_BIZ_FIELDS),  'Business Clients');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `canopy-import-${todayStr()}.xlsx`);
};

// ── Combined single-sheet Excel (all clients, Type column prepended) ──────────
const CANOPY_COMBINED_HEADERS = [
  'Type',
  'Client Name','Client ID','Client Owner','Source','Client Since','Active','Client Group',
  'First name','Middle name','Last name','SSN','Date of birth',
  'Spouse first name','Spouse middle name','Spouse last name','Spouse SSN','Spouse email','Spouse date of birth',
  'Business Name','EIN','Business Type','Industry','Date Est./Inc.',
  'Email','Phone number','Mobile number','Address line 1','Address line 2','City','State','Zip','Country',
  'Tags',
];
const CANOPY_COMBINED_FIELDS = [
  '__type',
  'client_name','client_id','client_owner','source','client_since','active','client_group',
  'first_name','middle_name','last_name','ssn','dob',
  'spouse_first','spouse_middle','spouse_last','spouse_ssn','spouse_email','spouse_dob',
  'business_name','ein','business_type','industry','date_est',
  'email','phone','mobile','address1','address2','city','state','zip','country',
  'tags',
];

CC.exportCombinedExcel = () => {
  if (typeof XLSX === 'undefined') { alert('SheetJS library not loaded.'); return; }
  const records = CC.dataset.records.filter(r => !r._deleted &&
    (r.classification === 'individual' || r.classification === 'business'));
  if (!records.length) { alert('No classified rows to export. Ensure rows are classified as Individual or Business.'); return; }

  const rows = [CANOPY_COMBINED_HEADERS];
  for (const rec of records) {
    const coerced = coerceForCanopy(rec);
    coerced.client_name = CC.getFormattedClientName(rec) || coerced.client_name || '';
    coerced.__type = rec.classification === 'individual' ? 'Individual' : 'Business';
    rows.push(CANOPY_COMBINED_FIELDS.map(f => coerced[f] || ''));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'All Clients');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `canopy-all-clients-${todayStr()}.xlsx`);
  CC._toast && CC._toast(`Downloading: canopy-all-clients-${todayStr()}.xlsx`);
};

// ── Generic CSV ───────────────────────────────────────────────────────────────
CC.exportGenericCSV = () => {
  const activeCols = CC.dataset.columns.filter(c => !c.isDeleted);
  const headers    = activeCols.map(c => c.displayName);
  const lines      = [rowToCSV(headers)];
  for (const rec of CC.dataset.records) {
    if (rec._deleted) continue;
    lines.push(rowToCSV(activeCols.map(c => rec.cells[c.id] || '')));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `export-${todayStr()}.csv`);
};

// ── Generic JSON ──────────────────────────────────────────────────────────────
CC.exportGenericJSON = () => {
  const activeCols = CC.dataset.columns.filter(c => !c.isDeleted);
  const data = CC.dataset.records.filter(r => !r._deleted).map(rec => {
    const obj = {};
    activeCols.forEach(c => { obj[c.displayName] = rec.cells[c.id] || ''; });
    return obj;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `export-${todayStr()}.json`);
};

// ── Generic Excel ─────────────────────────────────────────────────────────────
CC.exportGenericExcel = () => {
  if (typeof XLSX === 'undefined') { alert('SheetJS library not loaded.'); return; }
  const activeCols = CC.dataset.columns.filter(c => !c.isDeleted);
  const rows = [activeCols.map(c => c.displayName),
    ...CC.dataset.records.filter(r => !r._deleted).map(rec => activeCols.map(c => rec.cells[c.id] || ''))];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `export-${todayStr()}.xlsx`);
};
