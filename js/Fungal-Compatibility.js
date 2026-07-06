(async function () {

  const $ = id => document.getElementById(id);
  const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  /* ---- RFC 4180 CSV parser (handles quoted fields with embedded commas) ---- */
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

  /* ---- Parse a rating string ("0", "0-1", "2-4", …) to its worst-case (max) digit ---- */
  function parseRatingMax(s) {
    const digits = (s.match(/\d/g) || []).map(Number);
    return digits.length ? Math.max(...digits) : 0;
  }

  $('rows').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#6a746a;font-style:italic">Loading fungal resistance data…</td></tr>';

  let materials;
  try {
    const resp = await fetch('csvData/FungalCompatibilityTable.csv');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const dataRows = parseCSV(text).slice(1);
    materials = dataRows.filter(r => r[0] && r[0].trim()).map((r, idx) => {
      const res    = (r[5] || '').trim();
      const rating = (r[6] || '').trim();
      return {
        id:         idx,
        trade:      (r[0] || '').trim(),
        owner:      (r[1] || '').trim(),
        type:       (r[2] || '').trim(),
        polymer:    (r[3] || '').trim(),
        abbrev:     (r[4] || '').trim(),
        res,
        rating,
        ratingNum:  parseRatingMax(rating),
        basis:      (r[7] || '').trim(),
        notes:      (r[8] || '').trim(),
      };
    });
  } catch (e) {
    $('rows').innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#b03030">Failed to load data: ${e.message}</td></tr>`;
    return;
  }

  const materialsById = new Map(materials.map(m => [m.id, m]));
  const state = { search: '', type: 'All', res: 'All', abbrevs: new Set(), sortKey: 'trade', sortDir: 1 };
  const abbrevList = [...new Set(materials.map(m => m.abbrev))].filter(Boolean).sort((a, b) => a.localeCompare(b));

  let selectedIds = new Set();

  /* ---- Summary counts (computed from data, not hardcoded) ---- */
  function renderTotals() {
    const total  = materials.length;
    const plastics  = materials.filter(m => m.type === 'Plastic').length;
    const elastomers = materials.filter(m => m.type === 'Elastomer').length;
    $('totals').textContent = `${total} materials · ${plastics} plastics · ${elastomers} elastomers`;
  }

  /* ---- Type / Resistance filter buttons ---- */
  function renderFilterBar(id, options, current, onSelect) {
    const bar = $(id);
    bar.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (opt === current ? ' active' : '');
      btn.textContent = opt;
      btn.addEventListener('click', () => onSelect(opt));
      bar.appendChild(btn);
    });
  }

  function renderTypeBar() {
    renderFilterBar('typeBar', ['All', 'Plastic', 'Elastomer'], state.type, v => { state.type = v; render(); });
  }
  function renderResBar() {
    renderFilterBar('resBar', ['All', 'Resistant', 'Conditional', 'Susceptible'], state.res, v => { state.res = v; render(); });
  }

  /* ---- Abbreviation groups (multi-select) ---- */
  function renderAbbrevBar() {
    const bar = $('abbrevBar');
    bar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'cat-btn' + (state.abbrevs.size === 0 ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => { state.abbrevs.clear(); render(); });
    bar.appendChild(allBtn);

    abbrevList.forEach(ab => {
      const n = materials.filter(m => m.abbrev === ab).length;
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (state.abbrevs.has(ab) ? ' active' : '');
      btn.innerHTML = `${ab}<span class="cat-ct"> (${n})</span>`;
      btn.addEventListener('click', () => {
        if (state.abbrevs.has(ab)) state.abbrevs.delete(ab);
        else state.abbrevs.add(ab);
        render();
      });
      bar.appendChild(btn);
    });
  }

  /* ---- Sortable column headers ---- */
  const columns = [
    { key: 'trade',   label: 'Trade Name' },
    { key: 'owner',   label: 'Owner' },
    { key: 'type',    label: 'Type' },
    { key: 'polymer', label: 'Polymer / Chemical Name' },
    { key: 'abbrev',  label: 'Abbrev' },
    { key: 'ratingNum', label: 'Rating (0–4)' },
    { key: 'basis',   label: 'Basis / Citation' },
    { key: 'notes',   label: 'Notes' },
  ];

  function renderHead() {
    const tr = $('head');
    tr.innerHTML = '';

    const cbTh = document.createElement('th');
    cbTh.className = 'cb-h';
    cbTh.innerHTML = '<input type="checkbox" id="cbAll" title="Select / deselect all visible rows">';
    tr.appendChild(cbTh);

    columns.forEach(col => {
      const th = document.createElement('th');
      th.className = 'sortable';
      if (state.sortKey === col.key) th.classList.add('sorted', state.sortDir === 1 ? 'asc' : 'desc');
      th.textContent = col.label;
      th.addEventListener('click', () => {
        if (state.sortKey === col.key) state.sortDir *= -1;
        else { state.sortKey = col.key; state.sortDir = 1; }
        render();
      });
      tr.appendChild(th);
    });

    $('cbAll').addEventListener('change', function () {
      const visible = currentList();
      visible.forEach(m => this.checked ? selectedIds.add(m.id) : selectedIds.delete(m.id));
      render();
    });
    updateHeaderCb();
  }

  function updateHeaderCb() {
    const cbAll = $('cbAll');
    if (!cbAll) return;
    const visible = currentList();
    const nSel = visible.filter(m => selectedIds.has(m.id)).length;
    cbAll.checked       = visible.length > 0 && nSel === visible.length;
    cbAll.indeterminate = nSel > 0 && nSel < visible.length;
  }

  function noteSup(notes) {
    if (!notes) return '';
    return notes.split(',').map(n => `<sup>${n.trim()}</sup>`).join(',');
  }

  /* ---- shared row markup (used by both the main table and the selected-materials mirror table) ---- */
  function buildDataCells(m) {
    return `
      <td class="cmpd">${m.trade}</td>
      <td>${m.owner}</td>
      <td>${m.type}</td>
      <td>${m.polymer}</td>
      <td>${m.abbrev}</td>
      <td class="rating-cell"><span class="rating-badge r${m.ratingNum}" data-id="${m.id}">${m.ratingNum}</span></td>
      <td class="basis-cell">${m.basis}</td>
      <td class="notes-cell">${noteSup(m.notes)}</td>
    `;
  }

  /* ---- filter + sort (shared by table render and header select-all) ---- */
  function currentList() {
    const q = state.search.trim().toLowerCase();
    let list = materials.filter(m => {
      if (state.type !== 'All' && m.type !== state.type) return false;
      if (state.res !== 'All' && m.res !== state.res) return false;
      if (state.abbrevs.size && !state.abbrevs.has(m.abbrev)) return false;
      if (!q) return true;
      return m.trade.toLowerCase().includes(q) ||
             m.owner.toLowerCase().includes(q) ||
             m.polymer.toLowerCase().includes(q) ||
             m.abbrev.toLowerCase().includes(q);
    });

    list = list.slice().sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return -1 * state.sortDir;
      if (av > bv) return 1 * state.sortDir;
      return 0;
    });
    return list;
  }

  /* ---- selected-materials chip panel ---- */
  function renderSelPanel() {
    const count = selectedIds.size;
    $('spCount').textContent = `${count} selected`;
    if (count === 0) {
      $('spChips').innerHTML = '<span class="sp-empty">Check materials in the table below to add them here.</span>';
      return;
    }
    const sel = [...selectedIds].map(id => materialsById.get(id)).filter(Boolean)
      .sort((a, b) => a.trade.localeCompare(b.trade));
    $('spChips').innerHTML = sel.map(m =>
      `<span class="sp-chip">` +
      `<span class="sp-chip-name" title="${escAttr(m.trade)}">${m.trade}</span>` +
      `<button class="sp-chip-x" data-id="${m.id}" aria-label="Remove ${escAttr(m.trade)}">&times;</button>` +
      `</span>`
    ).join('');
    $('spChips').querySelectorAll('.sp-chip-x').forEach(btn => {
      btn.onclick = () => {
        selectedIds.delete(Number(btn.dataset.id));
        render();
      };
    });
  }

  /* ---- selected-materials mirror table (pinned to the top of the tool) ---- */
  function renderSelTable() {
    const wrap = $('selTableWrap');
    if (selectedIds.size === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';

    $('selHead').innerHTML = '<th class="cb-h"></th>' +
      columns.map(col => `<th>${col.label}</th>`).join('');

    const sel = [...selectedIds].map(id => materialsById.get(id)).filter(Boolean)
      .sort((a, b) => a.trade.localeCompare(b.trade));

    $('selRows').innerHTML = sel.map(m => `
      <tr class="row-selected">
        <td class="cb-cell"><input type="checkbox" class="sel-row-cb" data-id="${m.id}" checked></td>
        ${buildDataCells(m)}
      </tr>
    `).join('');

    $('selRows').querySelectorAll('.sel-row-cb').forEach(cb => {
      cb.addEventListener('change', function () {
        selectedIds.delete(Number(this.dataset.id));
        render();
      });
    });
    $('selRows').querySelectorAll('td.cb-cell').forEach(td => {
      td.addEventListener('click', e => {
        if (e.target.type === 'checkbox') return;
        td.querySelector('input[type="checkbox"]').click();
      });
    });
  }

  function render() {
    renderTotals();
    renderTypeBar();
    renderResBar();
    renderAbbrevBar();
    renderHead();
    renderSelPanel();
    renderSelTable();

    const list = currentList();

    const tbody = $('rows');
    if (!list.length) {
      tbody.innerHTML = '';
      $('empty').style.display = '';
    } else {
      $('empty').style.display = 'none';
      tbody.innerHTML = list.map(m => {
        const sel = selectedIds.has(m.id);
        return `
        <tr class="${sel ? 'row-selected' : ''}">
          <td class="cb-cell"><input type="checkbox" class="row-cb" data-id="${m.id}"${sel ? ' checked' : ''}></td>
          ${buildDataCells(m)}
        </tr>
      `;
      }).join('');

      tbody.querySelectorAll('.row-cb').forEach(cb => {
        cb.addEventListener('change', function () {
          const id = Number(this.dataset.id);
          this.checked ? selectedIds.add(id) : selectedIds.delete(id);
          render();
        });
      });
      tbody.querySelectorAll('td.cb-cell').forEach(td => {
        td.addEventListener('click', e => {
          if (e.target.type === 'checkbox') return;
          td.querySelector('input[type="checkbox"]').click();
        });
      });
    }

    updateHeaderCb();
  }

  $('search').addEventListener('input', e => { state.search = e.target.value; render(); });
  $('clearf').addEventListener('click', () => {
    state.search = ''; $('search').value = '';
    state.type = 'All'; state.res = 'All'; state.abbrevs.clear();
    render();
  });

  $('clearSel').addEventListener('click', () => {
    selectedIds.clear();
    render();
  });

  /* ---- custom tooltip (toggle-able) ---- */
  let tooltipsEnabled = true;
  $('tipToggle').addEventListener('click', () => {
    tooltipsEnabled = !tooltipsEnabled;
    $('tipToggle').setAttribute('aria-pressed', tooltipsEnabled);
    $('tipToggle').textContent = tooltipsEnabled ? 'Tooltips On' : 'Tooltips Off';
    if (!tooltipsEnabled) { tip.style.visibility = 'hidden'; tipCell = null; }
  });

  const tip = document.createElement('div');
  tip.className = 'fungal-tip';
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
      const badge = e.target.closest('.rating-badge[data-id]');
      if (!badge) { tip.style.visibility = 'hidden'; tipCell = null; return; }
      if (badge !== tipCell) {
        const m = materialsById.get(Number(badge.dataset.id));
        tip.innerHTML = `${m.trade}<br>${m.res} (typical rating ${m.rating})<br>${m.polymer}`;
        tip.style.visibility = 'visible';
        tipW = tip.offsetWidth;
        tipH = tip.offsetHeight;
        tipCell = badge;
      }
      positionTip(e);
    });
    tbody.addEventListener('mouseleave', () => { tip.style.visibility = 'hidden'; tipCell = null; });
  }
  wireTooltips($('rows'));
  wireTooltips($('selRows'));

  /* ---- report generation ---- */
  function generateReport(withColor) {
    if (selectedIds.size === 0) {
      alert('Please select at least one material before generating a report.');
      return;
    }
    const sel = [...selectedIds].map(id => materialsById.get(id)).filter(Boolean)
      .sort((a, b) => a.trade.localeCompare(b.trade));
    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const colorCSS = withColor
      ? '.r0,.r1{background:#2a7a45;color:#fff}.r2{background:#c49000;color:#fff}.r3{background:#c06010;color:#fff}.r4{background:#b03030;color:#fff}' +
        '.rl-badge.r0,.rl-badge.r1{background:#2a7a45;color:#fff}.rl-badge.r2{background:#c49000;color:#fff}.rl-badge.r3{background:#c06010;color:#fff}.rl-badge.r4{background:#b03030;color:#fff}'
      : '.r0,.r1,.r2,.r3,.r4{background:#fff!important;color:#000!important;border:1.5px solid #333!important}' +
        '.rl-badge{background:#fff!important;color:#000!important;border:1.5px solid #333!important}';

    const bwOverride = withColor ? '' :
      '.mat-h,.rating-h{background:#fff!important;color:#000!important}' +
      'tbody tr:nth-child(even) td{background:#fff!important}';

    const C = '\x3C';

    const tableRows = sel.map(m => {
      const cls = 'r' + m.ratingNum;
      return '<tr>' +
        '<td class="mat-cell">' + m.trade + C + '/td>' +
        '<td class="own-cell">' + m.owner + C + '/td>' +
        '<td class="type-cell">' + m.type + C + '/td>' +
        '<td class="poly-cell-txt">' + m.polymer + C + '/td>' +
        '<td class="abbr-cell">' + m.abbrev + C + '/td>' +
        '<td class="rating-cell ' + cls + '">' + m.ratingNum + C + '/td>' +
        '<td class="basis-cell-txt">' + m.basis + C + '/td>' +
        C + '/tr>';
    }).join('');

    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>Fungal Resistance Report' + C + '/title>',
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
      '.mat-h,.own-h,.type-h,.poly-h,.abbr-h,.basis-h{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#6a746a;color:#eee;white-space:nowrap}',
      '.rating-h{text-align:center;padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:#6a746a;color:#eee;white-space:nowrap}',
      '.mat-cell{padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap}',
      '.own-cell,.type-cell,.abbr-cell{padding:4px 8px;font-size:10px;color:#4a5a5f;white-space:nowrap}',
      '.poly-cell-txt{padding:4px 8px;font-size:10px;color:#333}',
      '.basis-cell-txt{padding:4px 8px;font-size:10px;color:#4a5a5f}',
      '.rating-cell{text-align:center;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap}',
      'tbody tr:nth-child(even) td{background:#f5f5f5}',
      '.footnote{margin-top:12px;font-size:9px;color:#888;font-style:italic}',
      '@media print{body{padding:6px}@page{margin:1.2cm;size:landscape}}',
      C + '/style>',
      C + '/head>',
      '<body onload="window.print()">',
      '<h1>Plastics &amp; Elastomer Fungal Resistance Report' + C + '/h1>',
      '<div class="subtitle">Generated ' + now + ' &middot; ' + sel.length + ' material' + (sel.length !== 1 ? 's' : '') + ' selected' + C + '/div>',
      '<div class="section-label">Fungal Resistance Rating Scale' + C + '/div>',
      '<div class="rating-legend">',
      '  <div class="rl-item"><span class="rl-badge r0">0' + C + '/span>Resistant (non-nutrient)' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r1">1' + C + '/span>Resistant (non-nutrient)' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r2">2' + C + '/span>Conditional (grade/filler-dependent)' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r3">3' + C + '/span>Conditional / Susceptible' + C + '/div>',
      '  <div class="rl-item"><span class="rl-badge r4">4' + C + '/span>Susceptible (supports fungal growth)' + C + '/div>',
      C + '/div>',
      '<div class="section-label">Selected Materials' + C + '/div>',
      '<table>',
      '<thead><tr>' +
        '<th class="mat-h">Trade Name' + C + '/th>' +
        '<th class="own-h">Owner' + C + '/th>' +
        '<th class="type-h">Type' + C + '/th>' +
        '<th class="poly-h">Polymer / Chemical Name' + C + '/th>' +
        '<th class="abbr-h">Abbrev' + C + '/th>' +
        '<th class="rating-h">Rating' + C + '/th>' +
        '<th class="basis-h">Basis / Citation' + C + '/th>' +
      C + '/tr>' + C + '/thead>',
      '<tbody>' + tableRows + C + '/tbody>',
      C + '/table>',
      '<div class="footnote">Ratings reflect typical family/base-polymer resistance per MIL-HDBK-454B, MIL-STD-810 Method 508, and ASTM G21. Fillers, plasticizers, and specific compounding can shift an individual grade’s actual fungal resistance — verify by test before use in critical applications.' + C + '/div>',
      C + '/body>',
      C + '/html>',
    ].join('\n');

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up was blocked. Please allow pop-ups for this site to generate reports.'); return; }
    win.document.write(html);
    win.document.close();
  }

  $('reportColor').addEventListener('click', () => generateReport(true));
  $('reportBW').addEventListener('click', () => generateReport(false));

  render();
})();
