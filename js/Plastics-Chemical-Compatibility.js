(async function () {

  const $ = id => document.getElementById(id);

  /* ---- RFC 4180 CSV parser (handles quoted fields with embedded commas/newlines) ---- */
  function parseCSV(text) {
    const rows = [];
    let i = 0, n = text.length;
    while (i < n) {
      const row = [];
      while (i < n) {
        let field = '';
        if (text[i] === '"') {
          i++;
          while (i < n) {
            if (text[i] === '"') {
              if (text[i + 1] === '"') { field += '"'; i += 2; }
              else { i++; break; }
            } else { field += text[i++]; }
          }
        } else {
          while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') field += text[i++];
        }
        row.push(field);
        if (i < n && text[i] === ',') i++;
        else break;
      }
      if (i < n && text[i] === '\r') i++;
      if (i < n && text[i] === '\n') i++;
      if (row.some(f => f !== '')) rows.push(row);
    }
    return rows;
  }

  function parseRating(s) {
    const v = s.trim().toUpperCase();
    if (!v || v === 'X') return 'x';
    const n = parseInt(v, 10);
    return isNaN(n) ? 'x' : n;
  }

  /* show loading indicator */
  $('rows').innerHTML = '<tr><td colspan="20" style="text-align:center;padding:40px;color:#6a746a;font-style:italic">Loading compatibility data…</td></tr>';

  let compounds, categoryMap;
  try {
    const [compatResp, catResp] = await Promise.all([
      fetch('csvData/PlasticsCompatibilityTable.csv'),
      fetch('csvData/plastics_fluids_by_category.csv'),
    ]);
    if (!compatResp.ok) throw new Error(`HTTP ${compatResp.status} (compatibility table)`);
    if (!catResp.ok)    throw new Error(`HTTP ${catResp.status} (category list)`);
    const [compatText, catText] = await Promise.all([compatResp.text(), catResp.text()]);

    /* build compounds array from compatibility CSV */
    const compatRows = parseCSV(compatText);
    const hIdx = compatRows.findIndex(r => r[0].trim() === 'Compound / Fluid');
    compounds = compatRows.slice(hIdx + 1)
      .filter(r => r[0] && r[0].trim())
      .map(r => ({
        name:    r[0].trim(),
        ref:     (r[1] || '').trim(),
        ratings: r.slice(2, 19).map(parseRating),
      }));

    /* build category map from plastics_fluids_by_category.csv */
    categoryMap = new Map();
    parseCSV(catText).slice(1).forEach(r => {
      const cat   = (r[0] || '').trim();
      const fluid = (r[1] || '').trim();
      if (!cat || !fluid || cat === 'Category') return;
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat).push(fluid);
    });
  } catch (e) {
    $('rows').innerHTML = `<tr><td colspan="21" style="text-align:center;padding:40px;color:#b03030">Failed to load data: ${e.message}</td></tr>`;
    return;
  }

  /* Short abbreviations (used internally, for sort keys, report cells) */
  const POLY_SHORT = ['HDPE','LDPE','PA','PC','PETG','PMP','POM','PP','PS','PSU','PVC-H','PVC-S','SAN','ECTFE/ETFE','FEP','PTFE','PVDF'];

  /* Column-header display text: common name then abbreviation in parentheses */
  const POLY_HEADER = [
    'High-Density Polyethylene (HDPE)',
    'Low-Density Polyethylene (LDPE)',
    'Polyamide / Nylon (PA)',
    'Polycarbonate (PC)',
    'PET Glycol Copolymer (PETG)',
    'Polymethylpentene (PMP)',
    'Polyacetal / Delrin (POM)',
    'Polypropylene (PP)',
    'Polystyrene (PS)',
    'Polysulfone (PSU)',
    'Rigid PVC (PVC-H)',
    'Flexible PVC (PVC-S)',
    'Styrene-Acrylonitrile (SAN)',
    'ECTFE / ETFE (Halar)',
    'Teflon FEP (FEP)',
    'Polytetrafluoroethylene (PTFE)',
    'PVDF / Kynar (PVDF)',
  ];

  /* Full material descriptions — used in tooltips and printed reports */
  const POLY_FULL  = [
    'HDPE (High-Density Polyethylene)',
    'LDPE (Low-Density Polyethylene)',
    'PA (Polyamide / Nylon)',
    'PC (Polycarbonate)',
    'PETG (Polyethylene Terephthalate, Glycol-modified)',
    'PMP (Polymethylpentene / TPX)',
    'POM (Polyoxymethylene / Acetal / Delrin)',
    'PP (Polypropylene)',
    'PS (Polystyrene)',
    'PSU (Polysulfone)',
    'PVC-H (Rigid PVC / Hard)',
    'PVC-S (Flexible PVC / Soft)',
    'SAN (Styrene-Acrylonitrile)',
    'ECTFE/ETFE (Ethylene Chloro- / Tetrafluoroethylene)',
    'FEP (Fluorinated Ethylene Propylene)',
    'PTFE (Polytetrafluoroethylene / Teflon)',
    'PVDF (Polyvinylidene Fluoride / Kynar)',
  ];

  /* First index of fluoroplastic columns (used for separator styling) */
  const FLUORO_START = 13;  // ECTFE/ETFE

  const RATING_CLASS = { 1:'r1', 2:'r2', 3:'r3', 4:'r4', 'x':'rx' };
  const RATING_LABEL = { 1:'Satisfactory', 2:'Fair', 3:'Doubtful', 4:'Unsatisfactory', 'x':'Insufficient Data' };

  /* O(1) lookup by compound name */
  const compoundMap = new Map(compounds.map(c => [c.name, c]));

  let sort = { key: 'name', dir: 1 };
  let selectedCompounds = new Set();
  const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  /* ---- undo history ---- */
  const selHistory = [];
  function pushHistory() {
    selHistory.push(new Set(selectedCompounds));
    if (selHistory.length > 100) selHistory.shift();
  }

  /* ---- category buttons ---- */
  function buildCatButtons() {
    const cats = [...categoryMap.keys()].sort();
    $('catBar').innerHTML = cats.map(cat => {
      const n = (categoryMap.get(cat) || []).filter(f => compoundMap.has(f)).length;
      return `<button class="cat-btn" data-cat="${escAttr(cat)}">${cat}<span class="cat-ct"> (${n})</span></button>`;
    }).join('');
    $('catBar').addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      const fluids = (categoryMap.get(btn.dataset.cat) || []).filter(f => compoundMap.has(f));
      const allSel = fluids.length > 0 && fluids.every(f => selectedCompounds.has(f));
      pushHistory();
      fluids.forEach(f => allSel ? selectedCompounds.delete(f) : selectedCompounds.add(f));
      renderRows();
      renderSelPanel();
      renderSelTable();
    });
  }

  function updateCatButtonStates() {
    const bar = $('catBar');
    if (!bar) return;
    bar.querySelectorAll('.cat-btn').forEach(btn => {
      const fluids = (categoryMap.get(btn.dataset.cat) || []).filter(f => compoundMap.has(f));
      const nSel = fluids.filter(f => selectedCompounds.has(f)).length;
      btn.classList.toggle('active',  nSel > 0 && nSel === fluids.length);
      btn.classList.toggle('partial', nSel > 0 && nSel <  fluids.length);
    });
  }

  /* helper — build a rating-cell row from a compound object */
  function buildRatingCells(c) {
    return c.ratings.map((r, i) => {
      const cls    = RATING_CLASS[r] || '';
      const sepCls = i === FLUORO_START ? ' poly-sep' : '';
      return `<td class="poly-cell ${cls}${sepCls}"` +
             ` data-fluid="${escAttr(c.name)}"` +
             ` data-poly="${escAttr(POLY_FULL[i])}"` +
             ` data-rating="${RATING_LABEL[r] || ''}"` +
             `>${r === 'x' ? 'X' : r}</td>`;
    }).join('');
  }

  /* ---- selected-fluids chip panel ---- */
  function renderSelPanel() {
    const count = selectedCompounds.size;
    $('spCount').textContent = `${count} selected`;
    if (count === 0) {
      $('spChips').innerHTML = '<span class="sp-empty">Check fluids in the table below to add them here.</span>';
      updateCatButtonStates();
      return;
    }
    const sorted = [...selectedCompounds].sort();
    $('spChips').innerHTML = sorted.map(name =>
      `<span class="sp-chip">` +
      `<span class="sp-chip-name" title="${escAttr(name)}">${name}</span>` +
      `<button class="sp-chip-x" data-name="${escAttr(name)}" aria-label="Remove ${escAttr(name)}">&times;</button>` +
      `</span>`
    ).join('');
    $('spChips').querySelectorAll('.sp-chip-x').forEach(btn => {
      btn.onclick = () => {
        pushHistory();
        const name = btn.dataset.name;
        selectedCompounds.delete(name);
        $('rows').querySelectorAll('.row-cb').forEach(cb => {
          if (cb.dataset.name === name) { cb.checked = false; cb.closest('tr').classList.remove('row-selected'); }
        });
        renderSelPanel();
        renderSelTable();
        updateHeaderCb();
      };
    });
    updateCatButtonStates();
  }

  /* ---- selected-fluids mirror table ---- */
  function renderSelTable() {
    const wrap = $('selTableWrap');
    if (selectedCompounds.size === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    const polyCols = POLY_SHORT.map((s, i) => {
      const isFluoro = i >= FLUORO_START;
      const groupCls = isFluoro ? ' poly-fluoro' : ' poly-thermo';
      const sepCls   = i === FLUORO_START ? ' poly-sep' : '';
      return `<th class="poly${groupCls}${sepCls}" title="${POLY_FULL[i]}"><div><span>${POLY_HEADER[i]}</span></div></th>`;
    }).join('');
    $('selHead').innerHTML =
      `<th class="cb-h"></th>` +
      `<th class="cmpd-h">Fluid</th>` +
      `<th class="ref-h">Notes / Source</th>` +
      polyCols;

    const selList = [...selectedCompounds].sort().map(n => compoundMap.get(n)).filter(Boolean);
    $('selRows').innerHTML = selList.map(c =>
      `<tr class="row-selected">` +
      `<td class="cb-cell"><input type="checkbox" class="sel-row-cb" data-name="${escAttr(c.name)}" checked></td>` +
      `<td class="cmpd l" title="${escAttr(c.name)}">${c.name}</td>` +
      `<td class="ref">${c.ref}</td>` +
      buildRatingCells(c) + `</tr>`
    ).join('');

    $('selRows').querySelectorAll('.sel-row-cb').forEach(cb => {
      cb.addEventListener('change', function () {
        pushHistory();
        const name = this.dataset.name;
        selectedCompounds.delete(name);
        $('rows').querySelectorAll('.row-cb').forEach(mainCb => {
          if (mainCb.dataset.name === name) {
            mainCb.checked = false;
            mainCb.closest('tr').classList.remove('row-selected');
          }
        });
        renderSelTable();
        renderSelPanel();
        updateHeaderCb();
      });
    });
  }

  /* ---- letter-group checkboxes ---- */
  const letters = [...new Set(compounds.map(c => c.name[0].toUpperCase()))].sort();
  let activeLetters = new Set(letters);

  function buildLetterNav() {
    const counts = {};
    letters.forEach(l => { counts[l] = 0; });
    compounds.forEach(c => { counts[c.name[0].toUpperCase()]++; });
    $('letterList').innerHTML = letters.map(l => `
      <button class="std" data-l="${l}" aria-pressed="${activeLetters.has(l)}">
        <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="#1a1206" stroke-width="3.5"><path d="M5 12l5 5 9-11"/></svg></span>
        <span class="lbl"><span class="nm">${l}</span></span>
        <span class="ct">${counts[l]}</span>
      </button>`).join('');
    $('letterList').querySelectorAll('.std').forEach(b => b.onclick = () => {
      const l = b.dataset.l;
      activeLetters.has(l) ? activeLetters.delete(l) : activeLetters.add(l);
      b.setAttribute('aria-pressed', activeLetters.has(l));
      syncNavCount();
      renderRows();
    });
    syncNavCount();
  }

  function syncNavCount() {
    $('navCount').textContent = `${activeLetters.size}/${letters.length}`;
    $('letterList').querySelectorAll('.std').forEach(b =>
      b.setAttribute('aria-pressed', activeLetters.has(b.dataset.l)));
  }

  /* ---- header checkbox state ---- */
  function updateHeaderCb() {
    const cbAll = $('cbAll');
    if (!cbAll) return;
    const visible = currentRows();
    const nSel = visible.filter(c => selectedCompounds.has(c.name)).length;
    cbAll.checked       = visible.length > 0 && nSel === visible.length;
    cbAll.indeterminate = nSel > 0 && nSel < visible.length;
  }

  /* ---- table header ---- */
  function buildHead() {
    const arN = sort.key === 'name' ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
    const arR = sort.key === 'ref'  ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
    const polyCols = POLY_SHORT.map((s, i) => {
      const isSorted  = sort.key === String(i);
      const isFluoro  = i >= FLUORO_START;
      const groupCls  = isFluoro ? ' poly-fluoro' : ' poly-thermo';
      const sepCls    = i === FLUORO_START ? ' poly-sep' : '';
      return `<th class="poly${groupCls}${sepCls}${isSorted ? ' sorted' : ''}" data-k="${i}" title="${POLY_FULL[i]}">` +
             `<div><span>${POLY_HEADER[i]}</span></div></th>`;
    }).join('');
    $('head').innerHTML =
      `<th class="cb-h"><input type="checkbox" id="cbAll" title="Select / deselect all visible rows"></th>` +
      `<th class="cmpd-h" data-k="name">Fluid${arN}</th>` +
      `<th class="ref-h" data-k="ref">Notes / Source${arR}</th>` +
      polyCols;
    $('head').querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      sort.key === k ? sort.dir *= -1 : (sort = { key: k, dir: 1 });
      buildHead();
      renderRows();
    });
    $('cbAll').addEventListener('change', function () {
      pushHistory();
      currentRows().forEach(c => {
        this.checked ? selectedCompounds.add(c.name) : selectedCompounds.delete(c.name);
      });
      renderRows();
      renderSelPanel();
      renderSelTable();
    });
    updateHeaderCb();
  }

  /* ---- filter + sort ---- */
  function currentRows() {
    const q = $('search').value.trim().toLowerCase();
    let rows = compounds.filter(c => {
      if (!activeLetters.has(c.name[0].toUpperCase())) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => {
      let av, bv;
      if (sort.key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sort.key === 'ref') { av = a.ref.toLowerCase(); bv = b.ref.toLowerCase(); }
      else {
        const i = parseInt(sort.key, 10);
        const ra = a.ratings[i], rb = b.ratings[i];
        av = ra === 'x' ? 9 : Number(ra);
        bv = rb === 'x' ? 9 : Number(rb);
      }
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
    return rows;
  }

  /* ---- render main rows ---- */
  function renderRows() {
    const rows = currentRows();
    $('rows').innerHTML = rows.map(c => {
      const sel = selectedCompounds.has(c.name);
      return `<tr class="${sel ? 'row-selected' : ''}">` +
             `<td class="cb-cell"><input type="checkbox" class="row-cb" data-name="${escAttr(c.name)}"${sel ? ' checked' : ''}></td>` +
             `<td class="cmpd l" title="${escAttr(c.name)}">${c.name}</td>` +
             `<td class="ref">${c.ref}</td>` +
             buildRatingCells(c) + `</tr>`;
    }).join('');
    $('rows').querySelectorAll('.row-cb').forEach(cb => {
      cb.addEventListener('change', function () {
        pushHistory();
        const name = this.dataset.name;
        this.checked ? selectedCompounds.add(name) : selectedCompounds.delete(name);
        this.closest('tr').classList.toggle('row-selected', this.checked);
        renderSelPanel();
        renderSelTable();
        updateHeaderCb();
      });
    });
    $('empty').style.display = rows.length ? 'none' : 'block';
    $('foot').textContent =
      `${rows.length.toLocaleString()} of ${compounds.length.toLocaleString()} compounds · 17 plastics ·` +
      ` ambient temperature ratings; verify against material specifications and the controlling specification.`;
    updateHeaderCb();
  }

  /* ---- init ---- */
  $('totals').innerHTML = `<b>${compounds.length.toLocaleString()}</b> compounds &middot; <b>17</b> plastics`;
  $('search').oninput = renderRows;
  $('clearf').onclick = () => { $('search').value = ''; renderRows(); };
  $('allBtn').onclick  = () => { activeLetters = new Set(letters); syncNavCount(); renderRows(); };
  $('noneBtn').onclick = () => { activeLetters = new Set();         syncNavCount(); renderRows(); };

  let tooltipsEnabled = true;
  $('tipToggle').onclick = () => {
    tooltipsEnabled = !tooltipsEnabled;
    $('tipToggle').setAttribute('aria-pressed', tooltipsEnabled);
    $('tipToggle').textContent = tooltipsEnabled ? 'Tooltips On' : 'Tooltips Off';
    if (!tooltipsEnabled) { tip.style.visibility = 'hidden'; tipCell = null; }
  };

  $('clearSel').onclick = () => {
    pushHistory();
    selectedCompounds.clear();
    renderRows();
    renderSelPanel();
    renderSelTable();
  };

  function generateReport(withColor) {
    if (selectedCompounds.size === 0) {
      alert('Please select at least one fluid before generating a report.');
      return;
    }
    var selList = [...selectedCompounds].sort().map(function(n){ return compoundMap.get(n); }).filter(Boolean);
    var now = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    var colorCSS = withColor
      ? '.r1{background:#2a7a45;color:#fff}.r2{background:#c49000;color:#fff}.r3{background:#c06010;color:#fff}.r4{background:#b03030;color:#fff}.rx{background:#8a8a8a;color:#fff}' +
        '.rl-badge.r1{background:#2a7a45;color:#fff}.rl-badge.r2{background:#c49000;color:#fff}.rl-badge.r3{background:#c06010;color:#fff}.rl-badge.r4{background:#b03030;color:#fff}.rl-badge.rx{background:#7a7a7a;color:#fff}'
      : '.r1,.r2,.r3,.r4,.rx{background:#fff!important;color:#000!important}' +
        '.rl-badge{background:#fff!important;color:#000!important;border:1.5px solid #333!important}';

    // B/W only: strip every hardcoded background that colorCSS cannot reach
    var bwOverride = withColor ? '' :
      '.fluid-h,.ref-h,.poly-h{background:#fff!important;color:#000!important}' +
      '.rating-legend{background:#fff!important;border-color:#aaa!important}' +
      'tbody tr:nth-child(even) td.fluid-cell,' +
      'tbody tr:nth-child(even) td.ref-cell{background:#fff!important}' +
      '.section-label,.subtitle{color:#000!important}';

    var C = '\x3C';

    var polyHeaders = POLY_HEADER.map(function(name, i){
      return '<th class="poly-h" title="' + POLY_FULL[i] + '"><div><span>' + name + C + '/span>' + C + '/div>' + C + '/th>';
    }).join('');

    var tableRows = selList.map(function(c) {
      var cells = c.ratings.map(function(r) {
        var cls = RATING_CLASS[r] || '';
        return '<td class="poly-cell ' + cls + '">' + (r === 'x' ? 'X' : r) + C + '/td>';
      }).join('');
      return '<tr><td class="fluid-cell">' + c.name + C + '/td><td class="ref-cell">' + c.ref + C + '/td>' + cells + C + '/tr>';
    }).join('');

    var html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>Plastics Chemical Compatibility Report' + C + '/title>',
      '<style>',
      '*{box-sizing:border-box;margin:0;padding:0' + (withColor ? ';-webkit-print-color-adjust:exact;print-color-adjust:exact' : '') + '}',
      'body{font-family:Arial,sans-serif;font-size:11px;color:#1a3a40;padding:20px}',
      'h1{font-size:16px;font-weight:700;margin-bottom:4px}',
      '.subtitle{font-size:11px;color:#555;margin-bottom:14px}',
      '.section-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6a746a;font-weight:700;margin-bottom:6px;margin-top:14px}',
      '.rating-legend{display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:4px;padding:8px 10px;border:1px solid #c0c0c0;border-radius:4px;background:#f8f8f8}',
      '.rl-item{display:flex;align-items:center;gap:6px;font-size:11px}',
      '.rl-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:3px;font-size:11px;font-weight:700;padding:0 4px}',
      colorCSS,
      bwOverride,
      'table{border-collapse:collapse;width:100%;margin-top:8px}',
      'th,td{border:1px solid #c0c0c0}',
      '.fluid-h{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#6a746a;color:#eee;min-width:180px;white-space:nowrap}',
      '.ref-h{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#6a746a;color:#eee;min-width:120px;white-space:nowrap}',
      '.poly-h{background:#6a746a;color:#eee;width:34px;min-width:34px;max-width:34px;padding:0;height:200px;vertical-align:bottom;overflow:hidden}',
      '.poly-h div{display:flex;align-items:flex-end;justify-content:flex-start;height:200px;padding:0 0 6px 7px}',
      '.poly-h div span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-size:9px;font-weight:500;letter-spacing:.03em}',
      '.fluid-cell{padding:4px 8px;font-size:11px;white-space:nowrap;min-width:180px}',
      '.ref-cell{padding:4px 8px;font-size:10px;color:#4a5a5f;white-space:nowrap;min-width:120px}',
      '.poly-cell{text-align:center;padding:3px 1px;font-size:10px;font-weight:700;width:34px;min-width:34px;max-width:34px}',
      'tbody tr:nth-child(even) td.fluid-cell,tbody tr:nth-child(even) td.ref-cell{background:#f5f5f5}',
      '.footnote{margin-top:12px;font-size:9px;color:#888;font-style:italic}',
      '@media print{body{padding:6px}@page{margin:1.2cm;size:landscape}}',
      C + '/style>',
      C + '/head>',
      '<body onload="window.print()">',
      '<h1>Plastics Chemical Compatibility Report' + C + '/h1>',
      '<div class="subtitle">Plastics Chemical Compatibility &middot; Ambient temperature ratings &middot; Generated ' + now + ' &middot; ' + selList.length + ' fluid' + (selList.length !== 1 ? 's' : '') + ' selected' + C + '/div>',
      '<div class="section-label">Compatibility Rating Scale' + C + '/div>',
      '<div class="rating-legend">',
      '  <div class="rl-item"><span class="rl-badge r1">1' + C + '/span>Satisfactory' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r2">2' + C + '/span>Fair (usually acceptable)' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r3">3' + C + '/span>Doubtful (use with caution)' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r4">4' + C + '/span>Unsatisfactory' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge rx">x' + C + '/span>Insufficient Data' + C + '/div>',
      C + '/div>',
      '<div class="section-label">Selected Fluids' + C + '/div>',
      '<table>',
      '<thead><tr><th class="fluid-h">Fluid / Chemical' + C + '/th><th class="ref-h">Notes / Source' + C + '/th>' + polyHeaders + C + '/tr>' + C + '/thead>',
      '<tbody>' + tableRows + C + '/tbody>',
      C + '/table>',
      '<div class="footnote">Ratings are for ambient temperature. Elevated temperatures generally reduce chemical resistance. Verify against material specifications and the controlling specification before use.' + C + '/div>',
      C + '/body>',
      C + '/html>',
    ].join('\n');

    var win = window.open('', '_blank');
    if (!win) { alert('Pop-up was blocked. Please allow pop-ups for this site to generate reports.'); return; }
    win.document.write(html);
    win.document.close();
  }

  $('reportColor').onclick = () => generateReport(true);
  $('reportBW').onclick    = () => generateReport(false);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (e.target.matches('input, textarea, select')) return;
      if (!selHistory.length) return;
      e.preventDefault();
      selectedCompounds = selHistory.pop();
      renderRows();
      renderSelPanel();
      renderSelTable();
    }
  });

  buildLetterNav();
  buildCatButtons();
  buildHead();
  renderRows();
  renderSelPanel();
  renderSelTable();

  /* ---- custom tooltip ---- */
  const tip = document.createElement('div');
  tip.className = 'oring-tip';
  document.body.appendChild(tip);

  let tipCell = null, tipW = 0, tipH = 0;

  function positionTip(e) {
    const pad = 14;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + tipW > window.innerWidth  - 8) x = e.clientX - tipW - pad;
    if (y + tipH > window.innerHeight - 8) y = e.clientY - tipH - pad;
    tip.style.transform = `translate(${x}px,${y}px)`;
  }

  function wireTooltips(tbody) {
    tbody.addEventListener('pointermove', e => {
      if (!tooltipsEnabled) return;
      const td = e.target.closest('td.poly-cell[data-fluid]');
      if (!td) { tip.style.visibility = 'hidden'; tipCell = null; return; }
      if (td !== tipCell) {
        tip.innerHTML = `${td.dataset.fluid}<br>${td.dataset.poly}<br>${td.dataset.rating}`;
        tip.style.visibility = 'visible';
        tipW = tip.offsetWidth;
        tipH = tip.offsetHeight;
        tipCell = td;
      }
      positionTip(e);
    });
    tbody.addEventListener('mouseleave', () => { tip.style.visibility = 'hidden'; tipCell = null; });
  }

  wireTooltips($('rows'));
  wireTooltips($('selRows'));

  function wireCellClick(tbody) {
    tbody.addEventListener('click', e => {
      const td = e.target.closest('td.cb-cell');
      if (!td || e.target.type === 'checkbox') return;
      td.querySelector('input[type="checkbox"]').click();
    });
  }
  wireCellClick($('rows'));
  wireCellClick($('selRows'));

})();
