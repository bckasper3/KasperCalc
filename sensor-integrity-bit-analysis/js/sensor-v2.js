/* sensor-v2.js — V2 features: Correlation Heatmap, Cross-Correlation,
   Event Overlay, Spectrogram, Missing Code Table */
'use strict';

var SensorV2 = (function () {

  /* ══════════════════════════════════════════════════════════════════
     SHARED MATH UTILITIES
  ══════════════════════════════════════════════════════════════════ */

  function _mean(arr, start, n) {
    var s = 0;
    for (var i = 0; i < n; i++) s += arr[start + i];
    return s / n;
  }

  /* Pearson r on sub-ranges without creating intermediate arrays */
  function _pearsonRange(x, xs, y, ys, n) {
    if (n < 2) return 0;
    var mx = _mean(x, xs, n), my = _mean(y, ys, n);
    var num = 0, dx2 = 0, dy2 = 0;
    for (var i = 0; i < n; i++) {
      var dx = x[xs + i] - mx, dy = y[ys + i] - my;
      num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    var denom = Math.sqrt(dx2 * dy2);
    return denom < 1e-12 ? 0 : num / denom;
  }

  /* Radix-2 Cooley-Tukey in-place FFT; N must be power of 2 */
  function _fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (var i = 0; i < n; i += len) {
        var ur = 1.0, ui = 0.0;
        for (var k = 0; k < (len >> 1); k++) {
          var a = i + k, b = i + k + (len >> 1);
          var vr = re[b] * ur - im[b] * ui;
          var vi = re[b] * ui + im[b] * ur;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr;        im[a] += vi;
          var nr = ur * wRe - ui * wIm;
          ui = ur * wIm + ui * wRe;
          ur = nr;
        }
      }
    }
  }

  function _nextPow2(n) {
    var p = 1; while (p < n) p <<= 1; return p;
  }

  /* r in [-1,1] → interpolated rgb() string (blue → white → red) */
  function _lerpColor(r) {
    var R, G, B;
    if (r < 0) {
      var t = -r;
      R = Math.round(255 * (1 - t) + 33  * t);
      G = Math.round(255 * (1 - t) + 102 * t);
      B = Math.round(255 * (1 - t) + 172 * t);
    } else {
      var t = r;
      R = Math.round(255 * (1 - t) + 215 * t);
      G = Math.round(255 * (1 - t) + 48  * t);
      B = Math.round(255 * (1 - t) + 39  * t);
    }
    return 'rgb(' + R + ',' + G + ',' + B + ')';
  }

  /* Binary-search timestamps array to map a timestamp → sample index */
  function _tsToIdx(ch, targetTs) {
    if (!ch.timestamps || ch.timestamps.length === 0) return Math.max(0, Math.round(targetTs));
    var ts = ch.timestamps;
    var n  = ts.length;
    if (targetTs <= ts[0]) return 0;
    if (targetTs >= ts[n - 1]) return n - 1;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (ts[mid] <= targetTs) lo = mid; else hi = mid;
    }
    return (targetTs - ts[lo] < ts[hi] - targetTs) ? lo : hi;
  }

  /* ══════════════════════════════════════════════════════════════════
     CORRELATION HEATMAP (tab 4)
  ══════════════════════════════════════════════════════════════════ */

  function _computeCorrelMatrix() {
    var channels = SensorManager.getAllChannels().filter(function (c) { return c.enabled; });
    var msgEl  = document.getElementById('correlHeatmapMsg');
    var wrapEl = document.getElementById('correlHeatmapWrap');

    if (channels.length < 2) {
      if (msgEl)  { msgEl.textContent = 'Enable ≥ 2 channels and click Compute Heatmap.'; msgEl.style.display = ''; }
      if (wrapEl) wrapEl.style.display = 'none';
      return;
    }

    var n   = channels.length;
    var smp = channels.map(function (ch) { return SensorManager.getDisplaySamples(ch); });
    var minN = smp.reduce(function (m, s) { return Math.min(m, s.length); }, Infinity);

    var mat = [];
    for (var i = 0; i < n; i++) {
      mat.push([]);
      for (var j = 0; j < n; j++) {
        mat[i].push(i === j ? 1 : _pearsonRange(smp[i], 0, smp[j], 0, minN));
      }
    }

    _drawHeatmap(mat, channels.map(function (c) { return c.name; }));
    if (msgEl)  msgEl.style.display = 'none';
    if (wrapEl) wrapEl.style.display = '';
  }

  function _drawHeatmap(matrix, labels) {
    var canvas = document.getElementById('chartCorrelHeatmap');
    if (!canvas) return;

    var n      = labels.length;
    var LABEL  = 88;
    var CELL   = Math.max(42, Math.min(80, Math.floor((560 - LABEL) / n)));
    var PAD    = 10;
    var W      = LABEL + n * CELL + PAD;
    var H      = LABEL + n * CELL + PAD;

    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = Math.min(W, 700) + 'px';
    canvas.style.height = 'auto';

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    /* rotated column labels */
    for (var j = 0; j < n; j++) {
      ctx.save();
      ctx.translate(LABEL + j * CELL + CELL / 2, LABEL - 6);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#333';
      ctx.font = '11px Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(labels[j], 0, 0);
      ctx.restore();
    }

    /* row labels */
    ctx.textAlign = 'right';
    ctx.font = '11px Roboto, Arial, sans-serif';
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = '#333';
      ctx.fillText(labels[i], LABEL - 6, LABEL + i * CELL + CELL / 2);
    }

    /* cells */
    ctx.textAlign = 'center';
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var r  = matrix[i][j];
        var cx = LABEL + j * CELL;
        var cy = LABEL + i * CELL;
        ctx.fillStyle = _lerpColor(r);
        ctx.fillRect(cx, cy, CELL, CELL);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, CELL, CELL);
        ctx.fillStyle = Math.abs(r) > 0.5 ? '#fff' : '#333';
        ctx.font = CELL > 50 ? '11px Roboto, Arial, sans-serif' : '9px Roboto, Arial, sans-serif';
        ctx.fillText(r.toFixed(2), cx + CELL / 2, cy + CELL / 2);
      }
    }

    /* color-scale legend strip */
    var LX = LABEL, LY = LABEL + n * CELL + 8, LW = n * CELL, LH = 10;
    for (var px = 0; px < LW; px++) {
      ctx.fillStyle = _lerpColor((px / LW) * 2 - 1);
      ctx.fillRect(LX + px, LY, 1, LH);
    }
    ctx.fillStyle = '#555';
    ctx.font = '9px Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';  ctx.fillText('−1', LX, LY + LH + 8);
    ctx.textAlign = 'center'; ctx.fillText('0',  LX + LW / 2, LY + LH + 8);
    ctx.textAlign = 'right'; ctx.fillText('+1', LX + LW, LY + LH + 8);
  }

  /* ══════════════════════════════════════════════════════════════════
     CROSS-CORRELATION (tab 5)
  ══════════════════════════════════════════════════════════════════ */

  var _xcorrChart = null;

  function _initXCorrChart() {
    var canvas = document.getElementById('chartXCorr');
    if (!canvas || !window.Chart) return;
    if (_xcorrChart) { _xcorrChart.destroy(); _xcorrChart = null; }
    _xcorrChart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Lag (samples)', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
          y: {
            min: -1, max: 1,
            title: { display: true, text: 'Normalized Cross-Correlation', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false },
        },
        elements: { point: { radius: 0, hitRadius: 5 }, line: { borderWidth: 1.5 } },
      },
    });
  }

  function _computeXCorr() {
    if (!_xcorrChart) _initXCorrChart();
    if (!_xcorrChart) return;

    var selA    = document.getElementById('xcorrChA');
    var selB    = document.getElementById('xcorrChB');
    var lagEl   = document.getElementById('xcorrMaxLag');

    if (!selA || !selA.value || !selB || !selB.value) {
      alert('Select both channels before computing.');
      return;
    }
    if (selA.value === selB.value) {
      alert('Select two different channels.');
      return;
    }

    var chA = SensorManager.getChannel(parseInt(selA.value, 10));
    var chB = SensorManager.getChannel(parseInt(selB.value, 10));
    if (!chA || !chB) return;

    var xArr   = SensorManager.getDisplaySamples(chA);
    var yArr   = SensorManager.getDisplaySamples(chB);
    var N      = Math.min(xArr.length, yArr.length);
    var maxLag = Math.max(1, Math.min(parseInt(lagEl ? lagEl.value : 200, 10) || 200, 5000, Math.floor(N * 0.9)));

    if (N < 4) { alert('Channels too short for cross-correlation.'); return; }

    var pts = [];
    for (var L = -maxLag; L <= maxLag; L++) {
      var xs = Math.max(0, -L);
      var ys = Math.max(0, L);
      var useN = Math.min(N - xs, N - ys);
      if (useN < 2) { pts.push({ x: L, y: 0 }); continue; }
      pts.push({ x: L, y: _pearsonRange(xArr, xs, yArr, ys, useN) });
    }

    _xcorrChart.data.datasets = [
      {
        label: chA.name + ' × ' + chB.name,
        data: pts,
        borderColor: '#2196F3',
        backgroundColor: 'transparent',
        tension: 0,
        pointRadius: 0,
        borderWidth: 1.5,
      },
      {
        label: 'r = 0',
        data: [{ x: -maxLag, y: 0 }, { x: maxLag, y: 0 }],
        borderColor: '#bbb',
        backgroundColor: 'transparent',
        borderDash: [4, 3],
        pointRadius: 0,
        borderWidth: 1,
      },
    ];
    _xcorrChart.update('none');
  }

  /* ══════════════════════════════════════════════════════════════════
     EVENT OVERLAY (tab 6)
  ══════════════════════════════════════════════════════════════════ */

  var _overlayChart = null;

  function _initOverlayChart() {
    var canvas = document.getElementById('chartEventOverlay');
    if (!canvas || !window.Chart) return;
    if (_overlayChart) { _overlayChart.destroy(); _overlayChart = null; }
    _overlayChart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Samples from peak (0 = peak)', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
          y: {
            title: { display: true, text: 'Normalized height (1 = peak)', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'nearest', intersect: false,
            callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(3); } }
          },
        },
        elements: { point: { radius: 0 }, line: { borderWidth: 1.2 } },
      },
    });
  }

  function _refreshOverlay() {
    if (!_overlayChart) _initOverlayChart();
    if (!_overlayChart) return;

    var ctxEl   = document.getElementById('overlayContext');
    var context = Math.max(1, parseInt(ctxEl ? ctxEl.value : 20, 10) || 20);

    var statusEl = document.getElementById('overlayStatus');

    var events = (typeof SensorEvents !== 'undefined') ? SensorEvents.getEvents() : [];
    if (!events || events.length === 0) {
      _overlayChart.data.datasets = [];
      _overlayChart.update('none');
      if (statusEl) statusEl.textContent = 'No events detected yet — run detection first.';
      return;
    }

    var channels = SensorManager.getAllChannels();
    var chByName = {};
    channels.forEach(function (ch) { chByName[ch.name] = ch; });

    var datasets = [];
    events.forEach(function (ev, ei) {
      var ch = chByName[ev.channel];
      if (!ch) return;

      var peakIdx  = _tsToIdx(ch, ev.peak);
      var startIdx = Math.max(0, peakIdx - context);
      var endIdx   = Math.min(ch.samples.length - 1, peakIdx + context);

      var peakVal  = ch.samples[peakIdx];
      var baseline = (typeof ev.height === 'number' && ev.height !== 0) ? peakVal - ev.height : peakVal;
      var range    = (typeof ev.height === 'number' && ev.height !== 0) ? Math.abs(ev.height) : 1;

      var data = [];
      for (var i = startIdx; i <= endIdx; i++) {
        data.push({ x: i - peakIdx, y: (ch.samples[i] - baseline) / range });
      }

      datasets.push({
        label: ev.channel + ' #' + (ei + 1),
        data: data,
        borderColor: (ch.color || '#888') + 'cc',
        backgroundColor: 'transparent',
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 1.2,
      });
    });

    _overlayChart.data.datasets = datasets;
    _overlayChart.update('none');
    if (statusEl) statusEl.textContent = datasets.length + ' event' + (datasets.length !== 1 ? 's' : '') + ' plotted.';
  }

  /* ══════════════════════════════════════════════════════════════════
     SPECTROGRAM / FFT MAGNITUDE (tab 7)
  ══════════════════════════════════════════════════════════════════ */

  var _spectroChart = null;

  function _initSpectroChart() {
    var canvas = document.getElementById('chartSpectrogram');
    if (!canvas || !window.Chart) return;
    if (_spectroChart) { _spectroChart.destroy(); _spectroChart = null; }
    _spectroChart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Frequency', font: { size: 11 } },
            ticks: { font: { size: 10 } },
          },
          y: {
            title: { display: true, text: 'Magnitude', font: { size: 11 } },
            min: 0,
            ticks: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false },
        },
        elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
        fill: true,
      },
    });
  }

  function _computeSpectrogram() {
    if (!_spectroChart) _initSpectroChart();
    if (!_spectroChart) return;

    var sel = document.getElementById('spectroChannelSelect');
    if (!sel || !sel.value) { alert('Select a channel first.'); return; }

    var ch = SensorManager.getChannel(parseInt(sel.value, 10));
    if (!ch) return;

    var raw   = ch.samples;
    var N     = raw.length;
    var sr    = ch.sampleRate;  /* may be null */

    var fftN = _nextPow2(N + 1) >> 1;
    fftN = Math.min(fftN, 131072);
    if (fftN < 4) { alert('Channel too short for FFT (need ≥ 4 samples).'); return; }

    var start = Math.max(0, Math.floor((N - fftN) / 2));

    /* DC-remove and apply Hanning window */
    var meanV = 0;
    for (var i = 0; i < fftN; i++) meanV += raw[start + i];
    meanV /= fftN;

    var re = new Float64Array(fftN);
    var im = new Float64Array(fftN);
    for (var i = 0; i < fftN; i++) {
      var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftN - 1));
      re[i] = (raw[start + i] - meanV) * w;
      im[i] = 0;
    }

    _fft(re, im);

    var useDec  = (document.querySelector('input[name="spectroScale"]:checked') || {}).value === 'db';
    var halfN   = fftN >> 1;
    var scale   = 2.0 / fftN;
    var freqUnit = sr ? 'Hz' : 'cycles/sample';
    var freqScale = sr ? sr / fftN : 1.0 / fftN;

    var pts = [];
    for (var k = 1; k < halfN; k++) {
      var mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
      var y   = useDec ? 20 * Math.log10(Math.max(mag, 1e-12)) : mag;
      pts.push({ x: k * freqScale, y: y });
    }

    _spectroChart.options.scales.x.title.text = 'Frequency (' + freqUnit + ')';
    _spectroChart.options.scales.y.title.text = useDec ? 'Magnitude (dB)' : 'Magnitude';
    if (useDec) {
      delete _spectroChart.options.scales.y.min;
    } else {
      _spectroChart.options.scales.y.min = 0;
    }

    _spectroChart.data.datasets = [{
      label: ch.name,
      data: pts,
      borderColor: ch.color || '#2196F3',
      backgroundColor: (ch.color || '#2196F3') + '30',
      fill: true,
      tension: 0,
      pointRadius: 0,
      borderWidth: 1.5,
    }];
    _spectroChart.update('none');
  }

  /* ══════════════════════════════════════════════════════════════════
     MISSING CODE TABLE (table tab 3)
  ══════════════════════════════════════════════════════════════════ */

  var _missingChart = null;

  function _initMissingChart() {
    var canvas = document.getElementById('chartMissingCode');
    if (!canvas || !window.Chart) return;
    if (_missingChart) { _missingChart.destroy(); _missingChart = null; }
    _missingChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Sample Count',
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: {
            title: { display: true, text: 'Value range (bucket)', font: { size: 11 } },
            ticks: { font: { size: 9 }, maxRotation: 45 },
          },
          y: {
            title: { display: true, text: 'Count', font: { size: 11 } },
            min: 0,
            ticks: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return 'Count: ' + ctx.parsed.y + (ctx.parsed.y === 0 ? '  ← MISSING' : '');
              },
            },
          },
        },
      },
    });
  }

  function _computeMissingCode() {
    if (!_missingChart) _initMissingChart();
    if (!_missingChart) return;

    var sel = document.getElementById('missingCodeChannelSelect');
    if (!sel || !sel.value) { alert('Select a raw integer channel.'); return; }

    var ch = SensorManager.getChannel(parseInt(sel.value, 10));
    if (!ch) return;

    var N = ch.samples.length;
    if (N === 0) { alert('Channel has no samples.'); return; }

    /* Integer conversion and range scan */
    var minV = Infinity, maxV = -Infinity;
    var intVals = new Uint32Array(N);
    for (var i = 0; i < N; i++) {
      var v = Math.trunc(ch.samples[i]) >>> 0;
      intVals[i] = v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    var range = maxV - minV + 1;
    var seen  = new Set();
    for (var i = 0; i < N; i++) seen.add(intVals[i]);

    /* Histogram: bucket count (up to 256 bins) */
    var BINS     = Math.min(256, range);
    var binSize  = Math.ceil(range / BINS);
    var counts   = new Array(BINS).fill(0);
    var binLabels = [];
    for (var b = 0; b < BINS; b++) {
      var lo = minV + b * binSize;
      var hi = Math.min(maxV, lo + binSize - 1);
      binLabels.push(lo === hi ? String(lo) : lo + '–' + hi);
    }
    for (var i = 0; i < N; i++) {
      var b = Math.min(BINS - 1, Math.floor((intVals[i] - minV) / binSize));
      counts[b]++;
    }

    var bgColors = counts.map(function (c) { return c === 0 ? 'rgba(255,68,68,0.55)' : 'rgba(105,157,173,0.55)'; });
    var bdColors = counts.map(function (c) { return c === 0 ? '#cc2222'              : '#3a6270'; });

    _missingChart.data.labels = binLabels;
    _missingChart.data.datasets[0].data = counts;
    _missingChart.data.datasets[0].backgroundColor = bgColors;
    _missingChart.data.datasets[0].borderColor = bdColors;
    _missingChart.update('none');

    /* Summary text */
    var totalMissing = range - seen.size;
    var summaryEl = document.getElementById('missingCodeSummary');
    if (summaryEl) {
      summaryEl.textContent = seen.size.toLocaleString() + ' / ' + range.toLocaleString() +
        ' possible values seen — ' + totalMissing.toLocaleString() + ' missing (' +
        (range > 0 ? (100 * totalMissing / range).toFixed(1) : '0.0') + '% gap rate)';
    }

    /* Find first 50 missing individual values */
    var missing = [];
    for (var v = minV; v <= maxV && missing.length < 50; v++) {
      if (!seen.has(v)) missing.push(v);
    }

    var tbody = document.getElementById('missingCodeTbody');
    if (!tbody) return;

    if (missing.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#2a7a2a;padding:10px;">' +
        'No missing codes — all values in [' + minV + ', ' + maxV + '] appear at least once.</td></tr>';
      return;
    }

    /* Sorted seen array for neighbor lookup */
    var seenSorted = Array.from(seen).sort(function (a, b) { return a - b; });

    tbody.innerHTML = missing.map(function (v) {
      /* Binary-search seenSorted for the largest value < v */
      var lo = 0, hi = seenSorted.length - 1, prevSeen = null, nextSeen = null;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (seenSorted[mid] < v) { prevSeen = seenSorted[mid]; lo = mid + 1; }
        else hi = mid - 1;
      }
      lo = 0; hi = seenSorted.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (seenSorted[mid] > v) { nextSeen = seenSorted[mid]; hi = mid - 1; }
        else lo = mid + 1;
      }
      var gap = (prevSeen !== null && nextSeen !== null) ? nextSeen - prevSeen - 1 : '—';
      return '<tr>' +
        '<td style="font-family:\'Courier New\',monospace;">' + v + '</td>' +
        '<td>' + (prevSeen !== null ? prevSeen : '—') + ' / ' + (nextSeen !== null ? nextSeen : '—') + '</td>' +
        '<td>' + gap + '</td>' +
        '</tr>';
    }).join('') +
    (totalMissing > 50
      ? '<tr><td colspan="3" style="text-align:center;color:#888;font-style:italic;">… and ' +
          (totalMissing - 50).toLocaleString() + ' more missing values</td></tr>'
      : '');
  }

  /* ══════════════════════════════════════════════════════════════════
     CHART RESIZE (called by switchSensorGraphTab for tabs 4–7)
  ══════════════════════════════════════════════════════════════════ */

  function onTabVisible(n) {
    if (n === 5 && _xcorrChart)   { _xcorrChart.resize();   return; }
    if (n === 6 && _overlayChart) { _overlayChart.resize(); return; }
    if (n === 7 && _spectroChart) { _spectroChart.resize(); return; }
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    var b;
    b = document.getElementById('btnComputeCorrel');       if (b) b.addEventListener('click', _computeCorrelMatrix);
    b = document.getElementById('btnComputeXCorr');        if (b) b.addEventListener('click', _computeXCorr);
    b = document.getElementById('btnRefreshOverlay');      if (b) b.addEventListener('click', _refreshOverlay);
    b = document.getElementById('btnComputeSpectrogram');  if (b) b.addEventListener('click', _computeSpectrogram);
    b = document.getElementById('btnComputeMissingCode');  if (b) b.addEventListener('click', _computeMissingCode);

    /* Spectro scale radio → toggle .sel class on labels */
    document.querySelectorAll('input[name="spectroScale"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var lLin = document.getElementById('spectroLinear');
        var lDb  = document.getElementById('spectroDb');
        if (lLin) lLin.classList.toggle('sel', this.value === 'linear');
        if (lDb)  lDb.classList.toggle('sel', this.value === 'db');
      });
    });
  });

  return {
    computeCorrel:      _computeCorrelMatrix,
    computeXCorr:       _computeXCorr,
    refreshOverlay:     _refreshOverlay,
    computeSpectrogram: _computeSpectrogram,
    computeMissingCode: _computeMissingCode,
    onTabVisible:       onTabVisible,
  };

})();
