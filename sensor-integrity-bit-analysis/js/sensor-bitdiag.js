/* sensor-bitdiag.js — bit occupancy, toggle rate, Hamming distance, power-of-2 jump detector */
'use strict';

var SensorBitDiag = (function() {
  var _results = {};    /* keyed by channel id */
  var _view    = 'occupancy'; /* 'occupancy' | 'toggle' */
  var _worker  = null;

  function _setStatus(msg, cls) {
    var dot = document.getElementById('sensorStatusDot');
    var txt = document.getElementById('sensorStatusText');
    if (dot) dot.className = 'status-dot ' + (cls || '');
    if (txt) txt.textContent = msg;
  }

  /* ── WORKER INIT ───────────────────────────────────────────────── */
  function _initWorker() {
    if (_worker) return;
    try {
      _worker = new Worker('sensor-integrity-bit-analysis/js/workers/detect-worker.js');
      _worker.onmessage = function(e) {
        var data = e.data;
        if (data.type === 'bitdiagResult') {
          _results[data.channelId] = data.result;
          _setStatus('Bit diagnostics complete.', 'ok');
          _renderBitPlot();
          _renderBitTable();
          document.getElementById('btnRunBitDiag').disabled = false;
        }
      };
      _worker.onerror = function(e) {
        _setStatus('Worker error: ' + e.message, 'err');
        document.getElementById('btnRunBitDiag').disabled = false;
      };
    } catch(e) {
      _worker = null;
    }
  }

  /* ── RUN DIAGNOSTICS ───────────────────────────────────────────── */
  function runDiagnostics() {
    var sel  = document.getElementById('bitPlotChannelSelect');
    var chId = sel ? parseInt(sel.value, 10) : NaN;
    if (isNaN(chId) || !chId) {
      _setStatus('Select a raw integer channel to run bit diagnostics.', 'warn');
      return;
    }
    var ch = SensorManager.getChannel(chId);
    if (!ch) { _setStatus('Channel not found.', 'err'); return; }
    if (!ch.rawInt) {
      _setStatus('Channel is not flagged as raw integer — check the "Raw Int" checkbox in Sensor Manager.', 'warn');
      return;
    }
    if (ch.samples.length < 2) {
      _setStatus('Channel has fewer than 2 samples.', 'warn');
      return;
    }

    document.getElementById('btnRunBitDiag').disabled = true;
    _setStatus('Running bit diagnostics…', 'warn');

    _initWorker();
    if (_worker) {
      var samplesCopy = new Float64Array(ch.samples instanceof Float64Array ? ch.samples : new Float64Array(Array.from(ch.samples)));
      _worker.postMessage({ type: 'bitdiag', channelId: chId, channelName: ch.name, samples: samplesCopy }, [samplesCopy.buffer]);
    } else {
      /* Main-thread fallback */
      var result = _computeBitDiag(Array.from(ch.samples));
      _results[chId] = result;
      _setStatus('Bit diagnostics complete.', 'ok');
      _renderBitPlot();
      _renderBitTable();
      document.getElementById('btnRunBitDiag').disabled = false;
    }
  }

  /* ── CORE COMPUTATION ──────────────────────────────────────────── */
  function _computeBitDiag(samples) {
    var N = samples.length;
    /* Determine bit width from max absolute value */
    var maxAbs = 0;
    for (var i = 0; i < N; i++) {
      var v = Math.abs(Math.trunc(samples[i]));
      if (v > maxAbs) maxAbs = v;
    }
    var bitWidth = maxAbs === 0 ? 8 : Math.min(32, Math.max(8, Math.ceil(Math.log2(maxAbs + 1)) + 1));
    /* Round to nearest standard width */
    if (bitWidth <= 8)  bitWidth = 8;
    else if (bitWidth <= 16) bitWidth = 16;
    else bitWidth = 32;

    var ints = new Int32Array(N);
    for (var j = 0; j < N; j++) ints[j] = Math.trunc(samples[j]) >>> 0; /* to unsigned 32-bit */

    /* Bit occupancy & toggle counts */
    var occ    = new Float64Array(bitWidth);
    var toggle = new Float64Array(bitWidth);
    for (var s = 0; s < N; s++) {
      for (var b = 0; b < bitWidth; b++) {
        if ((ints[s] >>> b) & 1) occ[b]++;
        if (s > 0 && (((ints[s] >>> b) & 1) !== ((ints[s-1] >>> b) & 1))) toggle[b]++;
      }
    }
    for (var b2 = 0; b2 < bitWidth; b2++) {
      occ[b2]    /= N;
      toggle[b2] /= (N - 1);
    }

    /* Hamming distance histogram */
    var hammingHist = new Float64Array(bitWidth + 1);
    for (var p = 1; p < N; p++) {
      var xorVal = (ints[p] ^ ints[p-1]) >>> 0;
      var cnt = 0;
      var x = xorVal;
      while (x) { cnt += x & 1; x >>>= 1; }
      if (cnt <= bitWidth) hammingHist[cnt]++;
    }

    /* Power-of-2 jump detector: per bit */
    var pow2Jumps = new Float64Array(bitWidth);
    for (var q = 1; q < N; q++) {
      var delta = Math.abs(Math.trunc(samples[q]) - Math.trunc(samples[q-1]));
      if (delta === 0) continue;
      for (var bb = 0; bb < bitWidth; bb++) {
        if (delta === (1 << bb)) { pow2Jumps[bb]++; break; }
      }
    }

    return {
      bitWidth:    bitWidth,
      occupancy:   Array.from(occ),
      toggleRate:  Array.from(toggle),
      hammingHist: Array.from(hammingHist),
      pow2Jumps:   Array.from(pow2Jumps),
      sampleCount: N,
    };
  }

  /* ── SWITCH VIEW ───────────────────────────────────────────────── */
  function switchView(v) {
    _view = v;
    _renderBitPlot();
  }

  /* ── BIT PLOT CHART ────────────────────────────────────────────── */
  function _renderBitPlot() {
    var sel  = document.getElementById('bitPlotChannelSelect');
    var chId = sel ? parseInt(sel.value, 10) : NaN;
    var result = _results[chId];
    if (typeof SensorCharts !== 'undefined') {
      SensorCharts.updateBitPlot(result, _view);
    }
  }

  /* ── BIT TABLE ─────────────────────────────────────────────────── */
  function _renderBitTable() {
    var sel  = document.getElementById('bitTableChannelSelect');
    var chId = sel ? parseInt(sel.value, 10) : NaN;
    /* Sync plot select → table select */
    var plotSel = document.getElementById('bitPlotChannelSelect');
    if (plotSel && plotSel.value && !sel.value) {
      sel.value = plotSel.value;
      chId = parseInt(plotSel.value, 10);
    }
    _renderBitTableForId(chId);
  }

  function _renderBitTableForId(chId) {
    var tbody = document.getElementById('bitDiagTbody');
    if (!tbody) return;
    var result = _results[chId];
    if (!result) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;font-style:italic;padding:10px 0;">Select a raw integer channel and run bit diagnostics.</td></tr>';
      return;
    }
    var bw = result.bitWidth;
    tbody.innerHTML = Array.from({length: bw}).map(function(_, b) {
      var occ    = result.occupancy[b].toFixed(4);
      var tog    = result.toggleRate[b].toFixed(4);
      var jumps  = result.pow2Jumps[b];
      var jumpCell = jumps > 0
        ? '<span class="pow2-badge">' + jumps + '</span>'
        : '0';
      return '<tr>' +
        '<td style="text-align:left;">Bit ' + b + (b === 0 ? ' (LSB)' : b === bw-1 ? ' (MSB)' : '') + '</td>' +
        '<td>' + occ + '</td>' +
        '<td>' + tog + '</td>' +
        '<td>' + jumpCell + '</td>' +
      '</tr>';
    }).join('');
  }

  /* Called when the bit table tab becomes active */
  function onTableTabOpen() {
    var sel  = document.getElementById('bitTableChannelSelect');
    if (!sel) return;
    /* Sync with bit plot channel if set */
    var plotSel = document.getElementById('bitPlotChannelSelect');
    if (plotSel && plotSel.value && !sel.value) {
      sel.value = plotSel.value;
    }
    var chId = parseInt(sel.value, 10);
    _renderBitTableForId(chId);
  }

  /* ── WIRE UP DOM ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var runBtn = document.getElementById('btnRunBitDiag');
    if (runBtn) runBtn.addEventListener('click', runDiagnostics);

    var plotSel = document.getElementById('bitPlotChannelSelect');
    if (plotSel) plotSel.addEventListener('change', function() {
      _renderBitPlot();
      /* Sync table select */
      var tblSel = document.getElementById('bitTableChannelSelect');
      if (tblSel) { tblSel.value = this.value; _renderBitTableForId(parseInt(this.value, 10)); }
    });

    var tblSel = document.getElementById('bitTableChannelSelect');
    if (tblSel) tblSel.addEventListener('change', function() {
      _renderBitTableForId(parseInt(this.value, 10));
    });
  });

  return {
    runDiagnostics: runDiagnostics,
    switchView: switchView,
    onTableTabOpen: onTableTabOpen,
    computeBitDiag: _computeBitDiag,
  };
})();
