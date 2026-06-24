'use strict';
// Business vs Individual classification — per-record scoring model (§7)

CC.classifyRecord = (record, columns) => {
  const g = (field) => CC.getCellByField(record, field);

  const bizName  = g('business_name');
  const ein      = g('ein');
  const ssn      = g('ssn');
  const first    = g('first_name');
  const last     = g('last_name');
  const spFirst  = g('spouse_first');
  const email    = g('email');
  const cname    = g('client_name');

  let biz = 0, ind = 0;

  // Business signals
  if (bizName && CC.BIZ_SUFFIX_RE.test(bizName)) biz += 50;
  else if (bizName)                                 biz += 25;
  if (ein && /^\d{2}-?\d{7}$/.test(ein))           biz += 40;
  if (email && /^(info|accounting|admin|office|contact|support|billing|tax)@/i.test(email)) biz += 10;
  if (!first && !last && !cname)                    biz += 10;

  // Individual signals
  if (ssn && /^\d{3}-?\d{2}-?\d{4}$/.test(ssn))   ind += 40;
  if (first && last)                                 ind += 35;
  else if (first || last)                            ind += 10;
  if (spFirst)                                       ind += 20;
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
