/* sensor-import.js — Method A (SheetJS file upload) + Method B (binary/hex paste) */
'use strict';

var SensorImport = (function() {
  var _workbook = null;
  var _sheetName = null;
  var _colRoles = [];   /* array of role strings per column index */
  var _headers = [];
  var _rows = [];       /* first 10 data rows (arrays) */

  /* ── STATUS HELPER ─────────────────────────────────────────────── */
  function _setStatus(msg, cls) {
    var dot = document.getElementById('sensorStatusDot');
    var txt = document.getElementById('sensorStatusText');
    if (dot) dot.className = 'status-dot ' + (cls || '');
    if (txt) txt.textContent = msg;
  }

  function _setWarning(msg) {
    var el = document.getElementById('sensorWarnings');
    if (el) el.textContent = msg ? ('⚠ ' + msg) : '';
  }

  /* ── METHOD A: FILE UPLOAD ─────────────────────────────────────── */
  function handleFileChange(evt) {
    var file = evt.target.files[0];
    if (!file) return;

    var label = document.getElementById('sensorFileLabelText');
    if (label) label.textContent = file.name;

    _setStatus('Reading file…', 'warn');
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        _workbook = XLSX.read(e.target.result, { type: 'array' });
        var names = _workbook.SheetNames;
        var sheetWrap = document.getElementById('sheetSelectWrap');
        var sheetSel  = document.getElementById('sheetSelect');

        if (names.length > 1) {
          sheetSel.innerHTML = names.map(function(n){ return '<option>' + n + '</option>'; }).join('');
          sheetWrap.style.display = '';
        } else {
          sheetWrap.style.display = 'none';
        }
        _sheetName = names[0];
        _loadSheet(_sheetName);
      } catch (err) {
        _setStatus('Error reading file: ' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function _loadSheet(name) {
    _sheetName = name;
    var ws = _workbook.Sheets[name];
    var data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!data || data.length < 2) {
      _setStatus('Sheet is empty or has only one row.', 'err');
      return;
    }

    _headers = data[0].map(function(h){ return String(h); });
    _rows = data.slice(1, 11); /* first 10 data rows */

    /* Auto-assign roles */
    _colRoles = _headers.map(function(h) {
      var l = h.toLowerCase().trim();
      if (l === 'timestamp' || l === 'time' || l === 't') return 'Timestamp';
      if (/^sensor\s*[a-z]$/i.test(h)) return 'Sensor Channel';
      return 'Sensor Channel'; /* default: treat everything as sensor data */
    });
    /* Ensure only one Timestamp */
    var tsAssigned = false;
    _colRoles = _colRoles.map(function(r) {
      if (r === 'Timestamp') {
        if (!tsAssigned) { tsAssigned = true; return 'Timestamp'; }
        return 'Sensor Channel';
      }
      return r;
    });

    _renderPreview();
    _setStatus('File loaded — assign column roles then click Confirm Import.', 'warn');
  }

  function _renderPreview() {
    var wrap = document.getElementById('colPreviewWrap');
    if (!wrap) return;
    wrap.style.display = '';

    /* Role dropdowns */
    var roleRow = document.getElementById('colRoleRow');
    roleRow.innerHTML = _headers.map(function(h, i) {
      return '<div style="display:flex;flex-direction:column;gap:2px;min-width:90px;">' +
        '<span style="font-size:10px;color:#888;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;max-width:90px;" title="' + h + '">' + h + '</span>' +
        '<select style="font-size:11px;padding:1px 2px;border-radius:4px;border:1.5px solid rgb(67,67,67);background:#d9d9d9;height:20px;" ' +
          'onchange="SensorImport._setColRole(' + i + ',this.value)">' +
          ['Timestamp','Sensor Channel','Ignore'].map(function(opt) {
            return '<option' + (_colRoles[i] === opt ? ' selected' : '') + '>' + opt + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    }).join('');

    /* Preview table */
    var thead = document.getElementById('colPreviewThead');
    var tbody = document.getElementById('colPreviewTbody');
    thead.innerHTML = '<tr>' + _headers.map(function(h){ return '<th>' + _esc(h) + '</th>'; }).join('') + '</tr>';
    tbody.innerHTML = _rows.map(function(row) {
      return '<tr>' + _headers.map(function(h, i) {
        return '<td>' + _esc(String(row[i] !== undefined ? row[i] : '')) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function _setColRole(idx, role) {
    /* Enforce single Timestamp rule */
    if (role === 'Timestamp') {
      _colRoles = _colRoles.map(function(r, i){ return (i === idx) ? 'Timestamp' : (r === 'Timestamp' ? 'Sensor Channel' : r); });
      _renderPreview();
    } else {
      _colRoles[idx] = role;
    }
  }

  function confirmImport() {
    if (!_workbook || !_sheetName) return;
    var ws = _workbook.Sheets[_sheetName];
    var data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!data || data.length < 2) return;

    var headers = data[0].map(function(h){ return String(h); });
    var allRows = data.slice(1).filter(function(r){ return r.some(function(v){ return v !== ''; }); });

    /* Find timestamp column */
    var tsIdx = _colRoles.indexOf('Timestamp');
    var tsVals = null;
    if (tsIdx >= 0) {
      tsVals = allRows.map(function(r){ return parseFloat(r[tsIdx]); });
      if (tsVals.some(isNaN)) tsVals = null;
    }

    /* Import each sensor channel column */
    var added = 0;
    _colRoles.forEach(function(role, i) {
      if (role !== 'Sensor Channel') return;
      var vals = allRows.map(function(r){ return parseFloat(r[i]); });
      /* Drop NaN-only columns */
      if (vals.every(isNaN)) return;
      /* Replace NaN with 0 for partial data */
      vals = vals.map(function(v){ return isNaN(v) ? 0 : v; });

      SensorManager.addChannel({
        name:       headers[i] || ('Channel ' + (SensorManager.getAllChannels().length + 1)),
        samples:    new Float64Array(vals),
        timestamps: tsVals ? new Float64Array(tsVals) : null,
        rawInt:     false,
      });
      added++;
    });

    if (added === 0) {
      _setStatus('No sensor channel columns were found — check column role assignments.', 'err');
      return;
    }

    /* Collapse the preview */
    document.getElementById('colPreviewWrap').style.display = 'none';
    var label = document.getElementById('sensorFileLabelText');
    if (label) label.textContent = 'Choose file…';
    document.getElementById('sensorFileInput').value = '';
    _workbook = null;

    _setStatus('Imported ' + added + ' channel' + (added > 1 ? 's' : '') + ' from file.', 'ok');
    _setWarning('');
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function cancelImport() {
    document.getElementById('colPreviewWrap').style.display = 'none';
    var label = document.getElementById('sensorFileLabelText');
    if (label) label.textContent = 'Choose file…';
    document.getElementById('sensorFileInput').value = '';
    _workbook = null;
    _setStatus('Import cancelled.', '');
  }

  /* ── METHOD B: PASTE BINARY / HEX ─────────────────────────────── */
  var TYPE_INFO = {
    uint8:   { bytes: 1, signed: false, float: false },
    uint16:  { bytes: 2, signed: false, float: false },
    uint32:  { bytes: 4, signed: false, float: false },
    int8:    { bytes: 1, signed: true,  float: false },
    int16:   { bytes: 2, signed: true,  float: false },
    int32:   { bytes: 4, signed: true,  float: false },
    float32: { bytes: 4, signed: true,  float: true  },
    float64: { bytes: 8, signed: true,  float: true  },
  };

  function parseBinaryPaste() {
    var raw = (document.getElementById('binaryPasteArea').value || '').trim();
    if (!raw) { _setStatus('Paste binary or hex data first.', 'warn'); return; }

    var typeSel   = document.querySelector('input[name=binType]:checked');
    var endianSel = document.querySelector('input[name=binEndian]:checked');
    var srateEl   = document.getElementById('binarySampleRate');
    var nameEl    = document.getElementById('binaryChannelName');

    var typeName = typeSel ? typeSel.value : 'uint8';
    var endian   = endianSel ? endianSel.value : 'little';
    var srate    = srateEl ? parseFloat(srateEl.value) : NaN;
    var chName   = nameEl ? (nameEl.value.trim() || 'Binary Channel') : 'Binary Channel';
    var info     = TYPE_INFO[typeName];

    /* Detect format */
    var bytes;
    try { bytes = _decodeInput(raw, info.bytes); }
    catch(e) { _setStatus(e.message, 'err'); return; }

    if (bytes.length === 0) { _setStatus('No valid data found in pasted text.', 'err'); return; }
    if (bytes.length % info.bytes !== 0) {
      _setStatus('Data length (' + bytes.length + ' bytes) is not a multiple of ' + info.bytes + ' bytes for ' + typeName + '.', 'err');
      return;
    }

    var samples  = _bytesToSamples(bytes, typeName, endian === 'big');
    var sampleCount = samples.length;
    var timestamps = null;
    if (!isNaN(srate) && srate > 0) {
      timestamps = new Float64Array(sampleCount);
      for (var i = 0; i < sampleCount; i++) timestamps[i] = i / srate;
    }

    SensorManager.addChannel({
      name:       chName,
      samples:    new Float64Array(samples),
      timestamps: timestamps,
      sampleRate: (!isNaN(srate) && srate > 0) ? srate : null,
      rawInt:     !info.float,
    });

    _setStatus('Imported ' + sampleCount + ' samples as "' + chName + '".', 'ok');
    _setWarning('');
    document.getElementById('binaryPasteArea').value = '';
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function _decodeInput(raw, bytesPerSample) {
    /* Detect format: binary (all 0/1), prefixed hex (0x…), bare hex */
    var isBinary = /^[01\s]+$/.test(raw);
    if (isBinary) {
      var bits = raw.replace(/\s/g,'');
      if (bits.length % 8 !== 0) throw new Error('Binary string length is not a multiple of 8 bits.');
      var out = [];
      for (var i = 0; i < bits.length; i += 8) {
        out.push(parseInt(bits.slice(i, i+8), 2));
      }
      return out;
    }
    /* Normalize hex: strip 0x prefixes, spaces, commas */
    var hex = raw.replace(/0x/gi,'').replace(/[\s,;]/g,'');
    if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('Unrecognized input format. Expected binary (010011…), hex with 0x prefix, or bare hex (A23C…).');
    if (hex.length % 2 !== 0) throw new Error('Hex string has an odd number of characters — cannot decode to bytes.');
    var bytes = [];
    for (var j = 0; j < hex.length; j += 2) {
      bytes.push(parseInt(hex.slice(j, j+2), 16));
    }
    return bytes;
  }

  function _bytesToSamples(bytes, type, bigEndian) {
    var buf  = new Uint8Array(bytes).buffer;
    var view = new DataView(buf);
    var le   = !bigEndian;
    var info = TYPE_INFO[type];
    var count = Math.floor(bytes.length / info.bytes);
    var out  = [];

    for (var i = 0; i < count; i++) {
      var offset = i * info.bytes;
      switch(type) {
        case 'uint8':   out.push(view.getUint8(offset));              break;
        case 'uint16':  out.push(view.getUint16(offset, le));         break;
        case 'uint32':  out.push(view.getUint32(offset, le));         break;
        case 'int8':    out.push(view.getInt8(offset));               break;
        case 'int16':   out.push(view.getInt16(offset, le));          break;
        case 'int32':   out.push(view.getInt32(offset, le));          break;
        case 'float32': out.push(view.getFloat32(offset, le));        break;
        case 'float64': out.push(view.getFloat64(offset, le));        break;
      }
    }
    return out;
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── WIRE UP DOM ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var fileInput = document.getElementById('sensorFileInput');
    if (fileInput) fileInput.addEventListener('change', handleFileChange);

    var sheetSel = document.getElementById('sheetSelect');
    if (sheetSel) sheetSel.addEventListener('change', function(){ _loadSheet(this.value); });

    var btnConfirm = document.getElementById('btnConfirmImport');
    if (btnConfirm) btnConfirm.addEventListener('click', confirmImport);

    var btnCancel = document.getElementById('btnCancelImport');
    if (btnCancel) btnCancel.addEventListener('click', cancelImport);

    var btnConvert = document.getElementById('btnConvertBinary');
    if (btnConvert) btnConvert.addEventListener('click', parseBinaryPaste);

    /* Clickable file label */
    var fileLabel = document.getElementById('sensorFileLabel');
    if (fileLabel) {
      fileLabel.addEventListener('click', function(e) {
        /* let the click fall through to the hidden input */
      });
    }
  });

  return {
    handleFileChange: handleFileChange,
    confirmImport: confirmImport,
    cancelImport: cancelImport,
    parseBinaryPaste: parseBinaryPaste,
    _setColRole: _setColRole,
  };
})();
