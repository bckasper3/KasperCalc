'use strict';
// CSV + DIF parsers → RawImport (§5)
// Both run through the same normalizeToDataset() to produce NormalizedDataset

// ── Delimiter detection ───────────────────────────────────────────────────────
CC.detectDelimiter = (text) => {
  const candidates = [',', '\t', ';', '|'];
  const lines = text.split('\n').filter(l => l.trim()).slice(0, 5);
  if (!lines.length) return ',';
  const scores = {};
  for (const delim of candidates) {
    const counts = lines.map(l => l.split(delim).length - 1);
    const avg   = counts.reduce((a,b)=>a+b,0) / counts.length;
    const variance = counts.reduce((a,b)=>a+(b-avg)**2,0) / counts.length;
    scores[delim] = avg > 0 ? avg / (1 + variance) : 0;
  }
  return candidates.reduce((best, d) => scores[d] > scores[best] ? d : best, ',');
};

// ── Header detection ──────────────────────────────────────────────────────────
CC.looksLikeHeaderRow = (row) => {
  if (!row || !row.length) return false;
  const SSN_RE   = /^\d{3}-?\d{2}-?\d{4}$/;
  const PHONE_RE = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const nonEmpty = row.filter(v => v && v.trim());
  if (!nonEmpty.length) return false;
  const dataLike = nonEmpty.filter(v =>
    /^\d+$/.test(v.trim()) || SSN_RE.test(v.trim()) || PHONE_RE.test(v.trim()) || EMAIL_RE.test(v.trim())
  );
  return dataLike.length === 0;
};

// ── CSV parser ────────────────────────────────────────────────────────────────
CC.parseCSV = (rawText, opts = {}) => {
  // Strip UTF-8 BOM
  const text = rawText.replace(/^﻿/, '');
  const delimiter = opts.delimiter || CC.detectDelimiter(text);

  let papaResult;
  if (typeof Papa !== 'undefined') {
    papaResult = Papa.parse(text, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      delimiter,
    });
  } else {
    // Minimal fallback (no PapaParse)
    const rows = text.split('\n').filter(l=>l.trim()).map(l => l.split(delimiter).map(v=>v.replace(/^"|"$/g,'')));
    papaResult = { data: rows, errors: [] };
  }

  const rows = papaResult.data;
  const warnings = papaResult.errors.map(e => ({ message: e.message, row: e.row }));

  // Check for Latin-1 mojibake (stray Â or Ã sequences)
  if (/[ÃÂ]/.test(text))
    warnings.push({ message: 'File may be Latin-1 encoded; accented characters could be garbled. Re-save as UTF-8.', row: null });

  const headerRowIndex = opts.forceNoHeaders ? null
    : (CC.looksLikeHeaderRow(rows[0]) ? 0 : null);

  return CC.newRawImport({
    fileName:          opts.fileName || '',
    fileType:          opts.fileType || 'csv',
    detectedDelimiter: delimiter,
    rawText:           rawText,
    headerRowIndex,
    rows,
    parseWarnings:     warnings,
  });
};

// ── DIF parser (UltraTax) ─────────────────────────────────────────────────────
CC.parseDIF = (rawText, opts = {}) => {
  const warnings = [];
  const lines = rawText.replace(/\r/g,'').split('\n');
  let i = 0;
  const nextLine = () => lines[i++] || '';

  const readHeader = (token) => {
    while (i < lines.length) {
      const l = nextLine().trim();
      if (l === token) { nextLine(); return parseInt(nextLine().trim().split(',')[1])||0; }
    }
    return 0;
  };

  // Scan for VECTORS and TUPLES in the preamble
  let vectors = 0, tuples = 0;
  const preambleEnd = Math.min(lines.length, 50);
  for (let p = 0; p < preambleEnd; p++) {
    if (lines[p].trim() === 'VECTORS') vectors = parseInt((lines[p+2]||'').trim().split(',')[1])||0;
    if (lines[p].trim() === 'TUPLES')  tuples  = parseInt((lines[p+2]||'').trim().split(',')[1])||0;
  }

  // Find DATA section
  const dataIdx = lines.findIndex(l => l.trim() === 'DATA');
  if (dataIdx < 0) {
    warnings.push({ message: 'DIF DATA section not found', row: null });
    return CC.newRawImport({ fileName: opts.fileName||'', fileType:'dif', rawText, rows:[], parseWarnings: warnings });
  }
  i = dataIdx + 2; // skip "DATA" and the "0,0" line

  const rows = [];
  let currentRow = [];
  while (i < lines.length) {
    const typeLine  = nextLine().trim();
    const valueLine = nextLine().trim();
    if (!typeLine) continue;
    if (valueLine.toUpperCase() === 'BOT' || typeLine === '-1,0') {
      if (valueLine.toUpperCase() === 'BOT') { if (currentRow.length) rows.push(currentRow); currentRow = []; continue; }
      if (valueLine.toUpperCase() === 'EOD') break;
    }
    const typeCode = typeLine.split(',')[0];
    if (typeCode === '1') {
      // String: strip surrounding quotes
      currentRow.push(valueLine.replace(/^"|"$/g,''));
    } else if (typeCode === '0') {
      // Numeric
      currentRow.push(valueLine.split(',')[1] || '');
    }
  }
  if (currentRow.length) rows.push(currentRow);

  // Drop trailing empty/summary rows
  const cleanRows = rows.filter(r => r.some(v => v.trim()));
  if (cleanRows.length !== rows.length)
    warnings.push({ message: `Dropped ${rows.length - cleanRows.length} empty/summary row(s)`, row: null });

  const headerRowIndex = CC.looksLikeHeaderRow(cleanRows[0]) ? 0 : null;
  return CC.newRawImport({
    fileName: opts.fileName||'', fileType:'dif', detectedDelimiter: '\t',
    rawText, headerRowIndex, rows: cleanRows, parseWarnings: warnings,
  });
};

// ── Auto-detect file type ─────────────────────────────────────────────────────
CC.parseAuto = (rawText, opts = {}) => {
  const text = rawText.replace(/^﻿/,'');
  const isDIF = /^TABLE\b/i.test(text.trimStart()) || (opts.fileName||'').toLowerCase().endsWith('.dif');
  if (isDIF) return CC.parseDIF(rawText, opts);
  return CC.parseCSV(rawText, opts);
};

// ── RawImport → NormalizedDataset ─────────────────────────────────────────────
CC.normalizeToDataset = (raw) => {
  const { rows, headerRowIndex } = raw;
  if (!rows.length) return;

  // Determine max column count
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);

  // Build columns
  let headers;
  if (headerRowIndex != null && rows[headerRowIndex]) {
    headers = rows[headerRowIndex];
    while (headers.length < colCount) headers.push('');
  } else {
    headers = Array.from({length: colCount}, (_, i) => `Column ${i + 1}`);
  }

  // Deduplicate header names
  const seen = {};
  headers = headers.map(h => {
    const base = h || 'Column';
    if (!seen[base]) { seen[base] = 1; return base; }
    return `${base} (${++seen[base]})`;
  });

  const columns = headers.map(h => CC.newColumn(h));
  CC.dataset.columns = columns;

  // Build records
  const dataStart = headerRowIndex != null ? headerRowIndex + 1 : 0;
  CC.dataset.records = [];
  rows.slice(dataStart).forEach((row, i) => {
    // Pad ragged rows
    const cells = {};
    columns.forEach((col, ci) => { cells[col.id] = row[ci] != null ? String(row[ci]) : ''; });
    // Skip rows that are entirely empty
    if (Object.values(cells).every(v => !v.trim())) return;
    CC.dataset.records.push(CC.newRecord(cells, i));
  });

  // Auto-map, classify
  CC.autoMapColumns(CC.dataset.columns, CC.dataset.records);
  CC.classifyAll();
  CC.validateAll();
  CC.UndoStack.clear();
};
