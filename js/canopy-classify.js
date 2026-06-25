'use strict';
// Business vs Individual classification — per-record scoring model (§7)

// Return / entity type patterns (fires on both return_type and business_type fields)
// Business max: 220 pts  |  Individual max: 165 pts
const _BIZ_RETURN_RE = /^(1065|1120-?S?|1041|990(-EZ|-PF)?|Partnership|S[\s-]?Corp(oration)?|C[\s-]?Corp(oration)?|Corporation|Fiduciary|Exempt\s+Org|LLC|PLLC|LLP|LP|LLLP|PC|PA|PLC)$/i;
const _IND_RETURN_RE = /^(1040(-SR)?|Individual)$/i;
const _ESTATE_TRUST_RE = /\b(Estate\s+of|Trust|Family\s+Trust|Living\s+Trust|Irrevocable)\b/i;
const _DBA_RE = /\b(DBA|d\/b\/a|doing\s+business\s+as)\b/i;

CC.classifyRecord = (record, columns) => {
  const g = (field) => CC.getCellByField(record, field);

  const bizName = g('business_name');
  const ein     = g('ein');
  const ssn     = g('ssn');
  const first   = g('first_name');
  const last    = g('last_name');
  const spFirst = g('spouse_first');
  const email   = g('email');
  const cname   = g('client_name');
  const bizType = g('business_type');
  const retType = g('return_type');

  let biz = 0, ind = 0;

  // ── Business signals ─────────────────────────────────────────────────────────
  // Suffix: normalize L.L.C. → LLC and "Smith, LLC" → "Smith LLC" before matching
  const normBiz = bizName ? CC.normBizName(bizName) : '';
  if (normBiz && CC.BIZ_SUFFIX_RE.test(normBiz)) biz += 50;
  else if (bizName)                               biz += 25;

  if (ein && /^\d{2}-?\d{7}$/.test(ein)) biz += 40;
  if (email && /^(info|accounting|admin|office|contact|support|billing|tax)@/i.test(email)) biz += 10;
  if (!first && !last && !cname) biz += 10;

  // Return / entity type (+45 business or +45 individual)
  // retType (mapped from RETURN_TYPE column) takes precedence over bizType (mapped from ENTITY_TYPE)
  const typeVal = (retType || bizType || '').trim();
  if (typeVal) {
    if (_BIZ_RETURN_RE.test(typeVal))      biz += 45;
    else if (_IND_RETURN_RE.test(typeVal)) ind += 45;
  }

  // Estate / Trust prefix — fires on client name or business name (+40 business, files 1041)
  if ([bizName, cname].some(n => n && _ESTATE_TRUST_RE.test(n))) biz += 40;

  // DBA / "doing business as" in any name field (+25 business)
  if ([bizName, cname].some(n => n && _DBA_RE.test(n))) biz += 25;

  // ── Individual signals ───────────────────────────────────────────────────────
  if (ssn && /^\d{3}-?\d{2}-?\d{4}$/.test(ssn)) ind += 40;
  if (first && last)  ind += 35;
  else if (first || last) ind += 10;
  if (spFirst) ind += 20;
  if (cname && /^[A-Za-z'\-]+,\s+[A-Za-z'\-. ]+$/.test(cname)) ind += 15;
  if (email && /(gmail|yahoo|outlook|icloud|aol|hotmail|comcast|me\.com|live\.com)$/i.test(email)) ind += 10;

  const total = biz + ind;
  if (total === 0) return { classification: 'unknown', classificationConfidence: 0 };
  const diff = Math.abs(biz - ind);
  if (diff < 10) return { classification: 'unknown', classificationConfidence: Math.round(Math.max(biz, ind) / total * 100) };
  if (biz > ind) return { classification: 'business',    classificationConfidence: Math.round(biz / total * 100) };
  return               { classification: 'individual',   classificationConfidence: Math.round(ind / total * 100) };
};

CC.classifyAll = () => {
  for (const rec of CC.dataset.records) {
    if (rec.classificationOverridden || rec._deleted) continue;
    const r = CC.classifyRecord(rec, CC.dataset.columns);
    rec.classification           = r.classification;
    rec.classificationConfidence = r.classificationConfidence;
  }
};

CC.getClassificationCounts = () => {
  const active = CC.dataset.records.filter(r => !r._deleted);
  return {
    individuals: active.filter(r => r.classification === 'individual').length,
    businesses:  active.filter(r => r.classification === 'business').length,
    unknown:     active.filter(r => r.classification === 'unknown').length,
    total:       active.length,
  };
};
