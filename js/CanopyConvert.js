'use strict';
// Main app controller — wires DOM, AG Grid, events, Edit Mode overlay

function ccInit() {

  // ── AG Grid instances ────────────────────────────────────────────────────────
  let mainGridApi  = null;
  let editGridApi  = null;

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const el = (id) => document.getElementById(id);

  // ── Refresh callback (called after any data mutation) ────────────────────────
  CC._refresh = () => {
    if (CC.dataset.records.length) showWorkspace();
    refreshGrid();
    updateRightPanel();
    updateStatusBar();
    updateUndoButtons();
  };
  CC._updateUndoUI = () => updateUndoButtons();

  CC._toast = (msg) => {
    const t = el('cc-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'cc-toast show';
    setTimeout(() => t.className = 'cc-toast', 3000);
  };

  // ── File input ───────────────────────────────────────────────────────────────
  const fileInput = el('cc-file-input');
  fileInput && fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = CC.parseAuto(ev.target.result, { fileName: file.name });
        CC.rawImport = raw;
        CC.normalizeToDataset(raw);
        showWorkspace();
        CC._refresh();
        CC._toast(`Loaded "${file.name}" — ${CC.dataset.records.length} rows, ${CC.dataset.columns.length} columns`);
      } catch(err) {
        showError('Parse error: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  });

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const dropZone = el('cc-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const raw = CC.parseAuto(ev.target.result, { fileName: file.name });
          CC.rawImport = raw;
          CC.normalizeToDataset(raw);
          showWorkspace();
          CC._refresh();
          CC._toast(`Loaded "${file.name}" — ${CC.dataset.records.length} rows`);
        } catch(err) { showError('Parse error: ' + err.message); }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // ── Paste input ──────────────────────────────────────────────────────────────
  const pasteArea = el('cc-paste-area');
  const parseBtn  = el('cc-parse-paste-btn');
  parseBtn && parseBtn.addEventListener('click', () => {
    const text = pasteArea ? pasteArea.value.trim() : '';
    if (!text) { showError('Paste area is empty.'); return; }
    try {
      const raw = CC.parseAuto(text, { fileName: '', fileType: 'pasted' });
      CC.rawImport = raw;
      CC.normalizeToDataset(raw);
      showWorkspace();
      CC._refresh();
      CC._toast(`Parsed pasted data — ${CC.dataset.records.length} rows`);
    } catch(err) { showError('Parse error: ' + err.message); }
  });

  // ── Sample data ──────────────────────────────────────────────────────────────
  el('cc-sample-btn') && el('cc-sample-btn').addEventListener('click', () => {
    CC.loadSampleData();
    showWorkspace();
    CC._refresh();
    CC._toast('Sample data loaded — 30 fake rows for demo/testing');
  });

  // ── Clear ─────────────────────────────────────────────────────────────────────
  el('cc-clear-btn') && el('cc-clear-btn').addEventListener('click', () => {
    if (!CC.dataset.records.length || confirm('Clear all data?')) {
      CC.dataset.columns = []; CC.dataset.records = []; CC.rawImport = null;
      CC.UndoStack.clear();
      hideWorkspace();
      if (pasteArea) pasteArea.value = '';
      CC._refresh();
    }
  });

  // ── Name convention selector ──────────────────────────────────────────────────
  const convSelect = el('cc-convention');
  if (convSelect) {
    CC.NAME_CONVENTIONS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.label;
      if (c.id === CC.activeConvention) opt.selected = true;
      convSelect.appendChild(opt);
    });
    convSelect.addEventListener('change', () => {
      CC.activeConvention = convSelect.value;
      refreshMappingPanel();
    });
  }

  // ── Export buttons ────────────────────────────────────────────────────────────
  el('cc-export-canopy-btn') && el('cc-export-canopy-btn').addEventListener('click', () => {
    CC.validateAll();
    CC.findDuplicates();
    const { errors, warnings } = CC.getValidationSummary();
    const unknownCount = CC.getClassificationCounts().unknown;
    let msg = '';
    if (errors)   msg += `⚠ ${errors} error(s) in the data will cause Canopy import failures.\n`;
    if (warnings) msg += `⚠ ${warnings} warning(s) — review recommended.\n`;
    if (unknownCount) msg += `⚠ ${unknownCount} row(s) with unknown type will be skipped (set type via Edit Table).\n`;
    msg += '\n📋 Canopy creates NEW clients on import — it does NOT update existing ones.\n';
    if (errors) {
      if (!confirm(msg + '\nExport anyway (Path A only)?')) return;
    } else if (msg.trim()) {
      if (!confirm(msg + '\nProceed with export?')) return;
    }
    CC.triggerCanopyPathADownload();
  });

  el('cc-export-xlsx-btn')    && el('cc-export-xlsx-btn').addEventListener('click',    CC.exportCanopyPathB);
  el('cc-export-csv-btn')     && el('cc-export-csv-btn').addEventListener('click',     CC.exportGenericCSV);
  el('cc-export-json-btn')    && el('cc-export-json-btn').addEventListener('click',    CC.exportGenericJSON);
  el('cc-export-generic-xl')  && el('cc-export-generic-xl').addEventListener('click',  CC.exportGenericExcel);

  // ── Undo / Redo ───────────────────────────────────────────────────────────────
  el('cc-undo-btn') && el('cc-undo-btn').addEventListener('click', CC.UndoStack.undo.bind(CC.UndoStack));
  el('cc-redo-btn') && el('cc-redo-btn').addEventListener('click', CC.UndoStack.redo.bind(CC.UndoStack));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); CC.UndoStack.undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); CC.UndoStack.redo(); }
  });

  // ── Restore original order ────────────────────────────────────────────────────
  el('cc-restore-order') && el('cc-restore-order').addEventListener('click', () => {
    if (mainGridApi) mainGridApi.applyColumnState({ defaultState: { sort: null } });
    mainGridApi && mainGridApi.setSortModel([]);
    CC.dataset.records.sort((a,b) => a._sourceIndex - b._sourceIndex);
    refreshGrid();
  });

  // ── Edit Mode overlay ─────────────────────────────────────────────────────────
  el('cc-edit-mode-btn') && el('cc-edit-mode-btn').addEventListener('click', openEditMode);
  el('cc-edit-close-btn') && el('cc-edit-close-btn').addEventListener('click', closeEditMode);
  el('cc-edit-undo-btn') && el('cc-edit-undo-btn').addEventListener('click', CC.UndoStack.undo.bind(CC.UndoStack));
  el('cc-edit-redo-btn') && el('cc-edit-redo-btn').addEventListener('click', CC.UndoStack.redo.bind(CC.UndoStack));
  el('cc-edit-restore-btn') && el('cc-edit-restore-btn').addEventListener('click', () => {
    CC.dataset.records.sort((a,b) => a._sourceIndex - b._sourceIndex);
    refreshEditGrid();
  });

  // ── AG Grid setup ─────────────────────────────────────────────────────────────
  const buildColumnDefs = (forEditMode) => {
    const typeCol = {
      field: '__class', headerName: 'Type', width: 85, pinned: 'left', editable: false, sortable: true,
      cellRenderer: (params) => {
        const cls = params.value || 'unknown';
        const label = cls === 'individual' ? 'Indiv' : cls === 'business' ? 'Biz' : '?';
        const color = cls === 'individual' ? '#2a7a8c' : cls === 'business' ? '#5a7a5a' : '#999';
        return `<span style="background:${color};color:#fff;padding:1px 6px;border-radius:10px;font-size:11px;cursor:pointer" title="Click to toggle type" data-recid="${params.data?.__id}">${label}</span>`;
      },
    };

    const flagCol = {
      field: '__flags', headerName: '⚑', width: 38, pinned: 'left', editable: false,
      cellRenderer: (params) => {
        const flags = params.value || [];
        if (!flags.length) return '';
        const hasErr = flags.some(f => f.level === 'error');
        return `<span title="${flags.map(f=>f.message).join('\n')}" style="color:${hasErr?'#cc2222':'#cc7700'};font-size:14px;cursor:help">${hasErr?'●':'◐'}</span>`;
      },
    };

    const dataCols = CC.dataset.columns.filter(c => !c.isDeleted).map(col => {
      const fieldLabel = col.mappedField ? (CC.FIELD_LABELS[col.mappedField] || col.mappedField) : null;
      const confColor  = col.mappingConfidence >= 85 ? '#2a7a2a' : col.mappingConfidence >= 50 ? '#cc7700' : '#aaa';
      const headerName = col.displayName + (fieldLabel ? ` → ${fieldLabel}` : '');

      // Use dropdown for controlled-vocab fields in edit mode
      const isDropdown = forEditMode && ['state','active','business_type','industry'].includes(col.mappedField);
      const dropdownValues = {
        state: [...CC.STATE_CODES].sort(),
        active: ['Active','Inactive'],
        business_type: CC.BIZ_TYPES,
        industry: CC.INDUSTRIES,
      }[col.mappedField];

      return {
        field: col.id,
        headerName,
        headerTooltip: fieldLabel ? `Mapped to: ${fieldLabel} (${col.mappingConfidence}% confidence, mode: ${col.mappingMode})` : 'Unmapped column',
        editable: true,
        sortable: true,
        resizable: true,
        flex: 1,
        minWidth: 150,
        headerClass: col.mappedField ? 'col-mapped' : 'col-unmapped',
        cellStyle: { borderRight: `2px solid ${confColor}` },
        ...(isDropdown ? {
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: ['', ...dropdownValues] },
        } : {}),
      };
    });

    // Derived Client Name column (read-only, always present)
    const derivedNameCol = {
      field: '__composed_name', headerName: '⊕ Client Name (composed)', width: 190,
      editable: false, sortable: true, pinned: false,
      cellStyle: { background: '#f0f8ff', fontStyle: 'italic', fontSize: '11px' },
      headerTooltip: 'Derived Client Name — what Canopy will receive. Not editable; set from name parts.',
      valueGetter: (params) => CC.composeClientName(CC.dataset.records.find(r=>r.id===params.data?.__id)) || '',
    };

    return [typeCol, flagCol, ...dataCols, derivedNameCol];
  };

  const buildRowData = () =>
    CC.dataset.records.filter(r => !r._deleted).map(rec => {
      const row = { __id: rec.id, __class: rec.classification, __flags: rec.validationFlags };
      for (const col of CC.dataset.columns) {
        if (!col.isDeleted) row[col.id] = rec.cells[col.id] || '';
      }
      return row;
    });

  const onCellChanged = (params) => {
    if (!params.colDef.field || params.colDef.field.startsWith('__')) return;
    const rec = CC.dataset.records.find(r => r.id === params.data.__id);
    if (!rec) return;
    const colId = params.colDef.field;
    const oldVal = rec.cells[colId] ?? '';
    const newVal = params.newValue ?? '';
    if (oldVal === newVal) return;
    rec.cells[colId] = newVal; rec._stale = true;
    CC.UndoStack.push(
      () => { const r=CC.dataset.records.find(x=>x.id===rec.id); if(r){r.cells[colId]=newVal;r._stale=true;} },
      () => { const r=CC.dataset.records.find(x=>x.id===rec.id); if(r){r.cells[colId]=oldVal;r._stale=true;} }
    );
    // Lazy stale recompute
    clearTimeout(CC._staleTimer);
    CC._staleTimer = setTimeout(() => {
      CC.classifyAll(); CC.validateAll();
      updateRightPanel(); updateStatusBar();
      mainGridApi && mainGridApi.refreshCells({ force: true });
      editGridApi && editGridApi.refreshCells({ force: true });
    }, 200);
    CC._updateUndoUI();
  };

  // Main grid
  const mainGridDiv = el('cc-main-grid');
  if (mainGridDiv && typeof agGrid !== 'undefined') {
    const gridOptions = {
      columnDefs: [],
      rowData: [],
      animateRows: false,
      suppressMovableColumns: false,
      domLayout: 'autoHeight',
      defaultColDef: { sortable: true, resizable: true, filter: false },
      rowHeight: 28,
      headerHeight: 36,
      onCellValueChanged: onCellChanged,
      onCellClicked: (params) => {
        if (params.colDef.field === '__class' && params.data?.__id) {
          const rec = CC.dataset.records.find(r => r.id === params.data.__id);
          if (!rec) return;
          const next = rec.classification === 'individual' ? 'business' : rec.classification === 'business' ? 'unknown' : 'individual';
          CC.setClassification(rec.id, next);
        }
      },
    };
    const grid = new agGrid.Grid(mainGridDiv, gridOptions);
    mainGridApi = gridOptions.api;
  }

  // Edit Mode grid
  const editGridDiv = el('cc-edit-grid');
  if (editGridDiv && typeof agGrid !== 'undefined') {
    const editOptions = {
      columnDefs: [],
      rowData: [],
      animateRows: false,
      domLayout: 'autoHeight',
      defaultColDef: { sortable: true, resizable: true, filter: false },
      rowHeight: 28,
      headerHeight: 36,
      onCellValueChanged: onCellChanged,
      onCellClicked: (params) => {
        if (params.colDef.field === '__class' && params.data?.__id) {
          const rec = CC.dataset.records.find(r => r.id === params.data.__id);
          if (!rec) return;
          const next = rec.classification === 'individual' ? 'business' : rec.classification === 'business' ? 'unknown' : 'individual';
          CC.setClassification(rec.id, next);
          editGridApi && editGridApi.refreshCells({ force: true });
        }
      },
    };
    const egrid = new agGrid.Grid(editGridDiv, editOptions);
    editGridApi = editOptions.api;
  }

  // ── Grid refresh helpers ───────────────────────────────────────────────────────
  function refreshGrid() {
    if (!mainGridApi) return;
    mainGridApi.setColumnDefs(buildColumnDefs(false));
    mainGridApi.setRowData(buildRowData());
  }
  function refreshEditGrid() {
    if (!editGridApi) return;
    editGridApi.setColumnDefs(buildColumnDefs(true));
    editGridApi.setRowData(buildRowData());
  }

  // ── Right panel ───────────────────────────────────────────────────────────────
  function updateRightPanel() {
    // Classification counts
    const cts = CC.getClassificationCounts();
    const fmtCount = (id, v) => { const e = el(id); if(e) e.textContent = v; };
    fmtCount('cc-count-indiv',  cts.individuals);
    fmtCount('cc-count-biz',    cts.businesses);
    fmtCount('cc-count-unknown',cts.unknown);
    fmtCount('cc-count-total',  cts.total);

    // Validation summary
    const vs = CC.getValidationSummary();
    fmtCount('cc-sum-errors',   vs.errors);
    fmtCount('cc-sum-warnings', vs.warnings);

    // Mapping panel
    refreshMappingPanel();
  }

  function refreshMappingPanel() {
    const panel = el('cc-mapping-panel');
    if (!panel) return;
    const activeCols = CC.dataset.columns.filter(c => !c.isDeleted);
    if (!activeCols.length) { panel.innerHTML = '<span style="color:#888;font-size:12px">No columns yet</span>'; return; }

    const groups = CC.getFieldDropdownGroups();
    const opts = groups.flatMap(g => g.fields.map(f => `<option value="${f}">${CC.FIELD_LABELS[f]||f}</option>`));
    const optHtml = `<option value="">— Unmapped —</option>${opts.join('')}`;

    panel.innerHTML = activeCols.map(col => {
      const conf = col.mappingConfidence;
      const dotColor = conf >= 85 ? '#2a7a2a' : conf >= 50 ? '#cc7700' : '#aaa';
      const label = col.mappedField ? (CC.FIELD_LABELS[col.mappedField] || col.mappedField) : '—';
      return `<div class="cc-map-row" data-colid="${col.id}">
        <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0">
          <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
          <span class="cc-map-colname" title="${col.sourceHeader}">${col.displayName}</span>
        </div>
        <select class="cc-map-select" data-colid="${col.id}">
          ${optHtml.replace(`value="${col.mappedField||''}"`, `value="${col.mappedField||''}" selected`)}
        </select>
      </div>`;
    }).join('');

    panel.querySelectorAll('.cc-map-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const colId = e.target.dataset.colid;
        CC.setMapping(colId, e.target.value || null);
      });
    });
  }

  // ── Status bar ────────────────────────────────────────────────────────────────
  function updateStatusBar() {
    const dot  = el('statusDot');
    const text = el('statusSummary');
    if (!CC.dataset.records.length) {
      if (dot)  dot.className = 'status-dot';
      if (text) text.textContent = 'No data loaded';
      return;
    }
    const vs = CC.getValidationSummary();
    const cts = CC.getClassificationCounts();
    const msg = `${cts.total} rows · ${cts.individuals} individuals · ${cts.businesses} businesses · ${cts.unknown} unknown · ${vs.errors} error(s) · ${vs.warnings} warning(s)`;
    if (text) text.textContent = msg;
    if (dot)  dot.className = 'status-dot ' + (vs.errors ? 'err' : vs.warnings ? 'warn' : 'ok');
  }

  function updateUndoButtons() {
    const u = el('cc-undo-btn');  if (u) u.disabled  = !CC.UndoStack.canUndo();
    const r = el('cc-redo-btn');  if (r) r.disabled  = !CC.UndoStack.canRedo();
    const eu = el('cc-edit-undo-btn'); if (eu) eu.disabled = !CC.UndoStack.canUndo();
    const er = el('cc-edit-redo-btn'); if (er) er.disabled = !CC.UndoStack.canRedo();
  }

  // ── Show / hide workspace ─────────────────────────────────────────────────────
  function showWorkspace() {
    const ws = el('cc-workspace');
    const ex = el('cc-export-section');
    if (ws) ws.style.display = 'flex';
    if (ex) ex.style.display = 'block';
  }
  function hideWorkspace() {
    const ws = el('cc-workspace');
    const ex = el('cc-export-section');
    if (ws) ws.style.display = 'none';
    if (ex) ex.style.display = 'none';
    updateStatusBar();
  }

  function showError(msg) {
    CC._toast && CC._toast('Error: ' + msg);
    const dot = el('statusDot'); const txt = el('statusSummary');
    if (dot) dot.className = 'status-dot err';
    if (txt) txt.textContent = msg;
  }

  // ── Edit Mode ─────────────────────────────────────────────────────────────────
  function openEditMode() {
    const overlay = el('cc-edit-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    refreshEditGrid();
    updateUndoButtons();
  }
  function closeEditMode() {
    // Commit active cell before tearing down
    if (editGridApi) try { editGridApi.stopEditing(); } catch(e){}
    const overlay = el('cc-edit-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    // Reflect any changes back to the main grid
    CC.classifyAll(); CC.validateAll();
    refreshGrid(); updateRightPanel(); updateStatusBar();
  }

  // Expose for legacy HTML onclick stubs
  window.clearAll    = () => el('cc-clear-btn')?.click();
  window.importCfg   = () => el('cc-file-input')?.click();
  window.exportCfg   = () => CC.loadSampleData && CC.loadSampleData();
  window.copyOutput  = () => {};
  window.downloadOutput = () => {};
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ccInit);
} else {
  ccInit();
}
