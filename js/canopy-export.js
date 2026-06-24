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
      const composed = CC.composeClientName(rec, CC.activeConvention);
      coerced.client_name = composed || coerced.client_name || '';
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
      coerced.client_name = CC.composeClientName(rec, CC.activeConvention) || coerced.client_name || '';
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
