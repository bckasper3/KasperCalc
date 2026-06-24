'use strict';
// UltraTax → Canopy converter — data model, undo stack, shared mutations
// All converter state lives on window.CC

const CC = window.CC = {};

CC.genId = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9);

CC.newColumn = (sourceHeader) => ({
  id: CC.genId(),
  sourceHeader: String(sourceHeader),
  displayName: String(sourceHeader),
  formatStyle: 'original',   // 'original'|'camel'|'kebab'|'upper'|'lower'|'delimited'
  delimiter: '_',
  mappedField: null,          // Canopy field key or null
  mappingMode: 'none',        // 'header'|'pattern'|'manual'|'none'
  mappingConfidence: 0,       // 0-100
  isDeleted: false,
});

CC.newRecord = (cells, sourceIndex) => ({
  id: CC.genId(),
  _sourceIndex: sourceIndex,
  cells: Object.assign({}, cells),   // keyed by Column.id
  classification: 'unknown',
  classificationConfidence: 0,
  classificationOverridden: false,
  validationFlags: [],
  _stale: true,
});

CC.newRawImport = (opts) => ({
  fileName: opts.fileName || '',
  fileType: opts.fileType || 'csv',
  detectedDelimiter: opts.detectedDelimiter || ',',
  encoding: opts.encoding || 'utf-8',
  rawText: opts.rawText || '',
  headerRowIndex: opts.headerRowIndex != null ? opts.headerRowIndex : 0,
  rows: opts.rows || [],
  parseWarnings: opts.parseWarnings || [],
});

// ── Singleton dataset ────────────────────────────────────────────────────────
CC.dataset = { columns: [], records: [] };
CC.rawImport = null;

// ── Undo / Redo stack (50 deep) ──────────────────────────────────────────────
// Each entry: { doFn, undoFn }
// _active prevents recursive recording during undo/redo execution.
CC.UndoStack = {
  _stack: [], _redo: [], MAX: 50, _active: false,

  push(doFn, undoFn) {
    if (this._active) return;
    this._stack.push({ doFn, undoFn });
    if (this._stack.length > this.MAX) this._stack.shift();
    this._redo = [];
    CC._updateUndoUI && CC._updateUndoUI();
  },

  undo() {
    const e = this._stack.pop();
    if (!e) return false;
    this._active = true;
    e.undoFn();
    this._active = false;
    this._redo.push(e);
    CC._refresh && CC._refresh();
    CC._updateUndoUI && CC._updateUndoUI();
    return true;
  },

  redo() {
    const e = this._redo.pop();
    if (!e) return false;
    this._active = true;
    e.doFn();
    this._active = false;
    this._stack.push(e);
    CC._refresh && CC._refresh();
    CC._updateUndoUI && CC._updateUndoUI();
    return true;
  },

  clear() { this._stack = []; this._redo = []; CC._updateUndoUI && CC._updateUndoUI(); },
  canUndo() { return this._stack.length > 0; },
  canRedo() { return this._redo.length > 0; },
};

// ── Tracked mutations ────────────────────────────────────────────────────────

CC._findRecord = (id) => CC.dataset.records.find(r => r.id === id);
CC._findCol    = (id) => CC.dataset.columns.find(c => c.id === id);

CC.editCell = (recordId, columnId, newValue) => {
  const rec = CC._findRecord(recordId);
  if (!rec) return;
  const oldValue = rec.cells[columnId] ?? '';
  if (oldValue === newValue) return;
  const apply = (v) => { const r = CC._findRecord(recordId); if (r) { r.cells[columnId] = v; r._stale = true; } };
  apply(newValue);
  CC.UndoStack.push(() => apply(newValue), () => apply(oldValue));
  CC._refresh && CC._refresh();
};

CC.setClassification = (recordId, cls) => {
  const rec = CC._findRecord(recordId);
  if (!rec) return;
  const prev = { classification: rec.classification, classificationConfidence: rec.classificationConfidence, classificationOverridden: rec.classificationOverridden };
  const applyNew = () => { const r = CC._findRecord(recordId); if (r) { r.classification = cls; r.classificationConfidence = 100; r.classificationOverridden = true; } };
  const applyOld = () => { const r = CC._findRecord(recordId); if (r) { Object.assign(r, prev); } };
  applyNew();
  CC.UndoStack.push(applyNew, applyOld);
  CC._refresh && CC._refresh();
};

CC.setMapping = (columnId, mappedField) => {
  const col = CC._findCol(columnId);
  if (!col) return;
  const prev = { mappedField: col.mappedField, mappingMode: col.mappingMode, mappingConfidence: col.mappingConfidence };
  const applyNew = () => { const c = CC._findCol(columnId); if (c) { c.mappedField = mappedField; c.mappingMode = 'manual'; c.mappingConfidence = 100; } };
  const applyOld = () => { const c = CC._findCol(columnId); if (c) { Object.assign(c, prev); } };
  applyNew();
  // Mark all records stale after mapping change
  CC.dataset.records.forEach(r => r._stale = true);
  CC.UndoStack.push(applyNew, applyOld);
  CC._refresh && CC._refresh();
};

CC.renameColumn = (columnId, newName) => {
  const col = CC._findCol(columnId);
  if (!col) return;
  const oldName = col.displayName;
  const applyNew = () => { const c = CC._findCol(columnId); if (c) c.displayName = newName; };
  const applyOld = () => { const c = CC._findCol(columnId); if (c) c.displayName = oldName; };
  applyNew();
  CC.UndoStack.push(applyNew, applyOld);
  CC._refresh && CC._refresh();
};

CC.deleteColumn = (columnId) => {
  const col = CC._findCol(columnId);
  if (!col) return;
  const applyNew = () => { const c = CC._findCol(columnId); if (c) c.isDeleted = true; };
  const applyOld = () => { const c = CC._findCol(columnId); if (c) c.isDeleted = false; };
  applyNew();
  CC.UndoStack.push(applyNew, applyOld);
  CC._refresh && CC._refresh();
};

CC.deleteRecord = (recordId) => {
  // Soft-delete via a `_deleted` flag
  const rec = CC._findRecord(recordId);
  if (!rec) return;
  const applyNew = () => { const r = CC._findRecord(recordId); if (r) r._deleted = true; };
  const applyOld = () => { const r = CC._findRecord(recordId); if (r) r._deleted = false; };
  applyNew();
  CC.UndoStack.push(applyNew, applyOld);
  CC._refresh && CC._refresh();
};
