/* sensor-events.js — event detection (Web Worker) + output statistics */
'use strict';

var SensorEvents = (function() {
  var _events = [];          /* flat array, shape: {channel,start,peak,end,duration,height,area,rise,fall} */
  var _sortField = null;
  var _sortAsc   = true;
  var _worker    = null;
  var _workerBusy = false;

  /* ── STATUS HELPERS ────────────────────────────────────────────── */
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

  /* ── WORKER INIT ───────────────────────────────────────────────── */
  function _initWorker() {
    if (_worker) return;
    try {
      _worker = new Worker('sensor-integrity-bit-analysis/js/workers/detect-worker.js');
      _worker.onmessage = _onWorkerMessage;
      _worker.onerror   = function(e) {
        _setStatus('Worker error: ' + e.message, 'err');
        _workerBusy = false;
        _enableRunBtn(true);
      };
    } catch(e) {
      _worker = null;
      /* Fall back to main-thread detection */
    }
  }

  function _onWorkerMessage(e) {
    var data = e.data;
    if (data.type === 'events') {
      _events = _events.concat(data.events);
      _workerBusy = false;
      _enableRunBtn(true);
      _pendingChannels--;
      if (_pendingChannels <= 0) {
        _finishDetection();
      }
    }
  }

  var _pendingChannels = 0;

  /* ── RUN DETECTION ─────────────────────────────────────────────── */
  function runDetection() {
    var channels = SensorManager.getEnabledChannels();
    if (channels.length === 0) {
      _setStatus('No enabled channels — import data and enable at least one channel.', 'warn');
      return;
    }

    var settings = _readSettings();
    if (settings.threshold === null) {
      _setStatus('Enter a Threshold value before running detection.', 'warn');
      return;
    }

    _events = [];
    _pendingChannels = channels.length;
    _initWorker();

    _setStatus('Detection running…', 'warn');
    _enableRunBtn(false);

    if (_worker) {
      channels.forEach(function(ch) {
        /* Transfer a copy as Float64Array — original stays in channel */
        var samplesCopy = new Float64Array(ch.samples instanceof Float64Array ? ch.samples : new Float64Array(Array.from(ch.samples)));
        var tsCopy = ch.timestamps
          ? new Float64Array(ch.timestamps instanceof Float64Array ? ch.timestamps : new Float64Array(Array.from(ch.timestamps)))
          : null;
        var msg = { type: 'detect', channel: ch.name, settings: settings };
        var transfers = [samplesCopy.buffer];
        if (tsCopy) transfers.push(tsCopy.buffer);
        msg.samples    = samplesCopy;
        msg.timestamps = tsCopy;
        _worker.postMessage(msg, transfers);
      });
    } else {
      /* Main-thread fallback */
      channels.forEach(function(ch) {
        var evts = _detectOnMainThread(ch.name, Array.from(ch.samples), ch.timestamps ? Array.from(ch.timestamps) : null, settings);
        _events = _events.concat(evts);
      });
      _pendingChannels = 0;
      _finishDetection();
    }
  }

  function _finishDetection() {
    _enableRunBtn(true);
    var n = _events.length;
    var m = SensorManager.getEnabledChannels().length;
    _setStatus('Detected ' + n + ' event' + (n !== 1 ? 's' : '') + ' across ' + m + ' channel' + (m !== 1 ? 's' : '') + '.', n > 0 ? 'ok' : 'warn');
    _setWarning('');
    updateOutputs();
    renderEventTable();
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function _enableRunBtn(enable) {
    var btn = document.getElementById('btnRunDetection');
    if (btn) btn.disabled = !enable;
  }

  /* ── SETTINGS READER ───────────────────────────────────────────── */
  function _readSettings() {
    var threshold   = parseFloat(document.getElementById('evtThreshold').value);
    var minDuration = parseFloat(document.getElementById('evtMinDuration').value);
    var minHeight   = parseFloat(document.getElementById('evtMinHeight').value);
    var debounce    = parseFloat(document.getElementById('evtDebounce').value);
    var durUnit     = document.getElementById('evtMinDurationUnit').value;
    var debUnit     = document.getElementById('evtDebounceUnit').value;
    return {
      threshold:   isNaN(threshold)   ? null : threshold,
      minDuration: isNaN(minDuration) ? 1    : minDuration,
      minHeight:   isNaN(minHeight)   ? 0    : minHeight,
      debounce:    isNaN(debounce)    ? 0    : debounce,
      durUnit:     durUnit,
      debUnit:     debUnit,
    };
  }

  /* ── MAIN-THREAD FALLBACK DETECTION ────────────────────────────── */
  function _detectOnMainThread(chName, samples, timestamps, settings) {
    return _detect(chName, samples, timestamps, settings);
  }

  /* Shared detection logic (also used by the worker) */
  function _detect(chName, samples, timestamps, s) {
    var N = samples.length;
    if (N === 0) return [];
    var thr = s.threshold;

    /* Convert duration/debounce to samples if ms units and timestamps available */
    var minDurSamples = s.minDuration;
    var debounceSamples = s.debounce;
    if (s.durUnit === 'ms' && timestamps && timestamps.length > 1) {
      var dt = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1) * 1000;
      if (dt > 0) minDurSamples = s.minDuration / dt;
    }
    if (s.debUnit === 'ms' && timestamps && timestamps.length > 1) {
      var dt2 = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1) * 1000;
      if (dt2 > 0) debounceSamples = s.debounce / dt2;
    }

    /* Compute global baseline */
    var baselineVals = samples.filter(function(v){ return v <= thr; });
    var baseline = baselineVals.length > 0
      ? baselineVals.reduce(function(a,b){ return a+b; }, 0) / baselineVals.length
      : 0;

    /* Find contiguous above-threshold segments */
    var segments = [];
    var inSeg = false, segStart = -1;
    for (var i = 0; i < N; i++) {
      var above = samples[i] > thr;
      if (above && !inSeg)  { inSeg = true;  segStart = i; }
      if (!above && inSeg)  { inSeg = false; segments.push([segStart, i - 1]); }
    }
    if (inSeg) segments.push([segStart, N - 1]);

    /* Filter by minDuration and minHeight */
    var events = segments
      .filter(function(seg) { return (seg[1] - seg[0] + 1) >= minDurSamples; })
      .map(function(seg) {
        var start = seg[0], end = seg[1];
        var peakVal = -Infinity, peakIdx = start;
        for (var j = start; j <= end; j++) {
          if (samples[j] > peakVal) { peakVal = samples[j]; peakIdx = j; }
        }
        var height = peakVal - baseline;
        /* Trapezoidal area (baseline-subtracted) */
        var area = 0;
        for (var k = start; k < end; k++) {
          var dt = timestamps ? (timestamps[k+1] - timestamps[k]) : 1;
          area += ((samples[k] - baseline) + (samples[k+1] - baseline)) * dt / 2;
        }
        var startTs = timestamps ? timestamps[start]   : start;
        var peakTs  = timestamps ? timestamps[peakIdx] : peakIdx;
        var endTs   = timestamps ? timestamps[end]     : end;
        return { channel: chName, start: startTs, peak: peakTs, end: endTs,
                 duration: endTs - startTs, height: height, area: area,
                 rise: peakTs - startTs, fall: endTs - peakTs };
      })
      .filter(function(ev) { return ev.height >= s.minHeight; });

    /* Debounce merge */
    if (debounceSamples > 0 && events.length > 1) {
      var merged = [events[0]];
      for (var m = 1; m < events.length; m++) {
        var prev = merged[merged.length - 1];
        var curr = events[m];
        /* Convert timestamps to indices for comparison if needed */
        var gap = timestamps
          ? (curr.start - prev.end)
          : (curr.start - prev.end);
        if (gap < debounceSamples) {
          /* Merge */
          var newEnd   = Math.max(prev.end, curr.end);
          var newPeak  = (prev.height >= curr.height) ? prev.peak : curr.peak;
          var newH     = Math.max(prev.height, curr.height);
          merged[merged.length - 1] = {
            channel: prev.channel, start: prev.start, peak: newPeak, end: newEnd,
            duration: newEnd - prev.start, height: newH,
            area: prev.area + curr.area, rise: newPeak - prev.start, fall: newEnd - newPeak
          };
        } else {
          merged.push(curr);
        }
      }
      events = merged;
    }

    return events;
  }

  /* ── SORT ──────────────────────────────────────────────────────── */
  function sortEvents(field) {
    if (_sortField === field) { _sortAsc = !_sortAsc; }
    else { _sortField = field; _sortAsc = true; }
    renderEventTable();
  }

  /* ── OUTPUT PANEL UPDATE ───────────────────────────────────────── */
  function updateOutputs() {
    var channels = SensorManager.getEnabledChannels();

    /* Total events */
    _out('outTotalEvents', _events.length);

    /* Per-channel event counts */
    var perCh = document.getElementById('outPerChannelEvents');
    if (perCh) {
      perCh.innerHTML = channels.map(function(ch) {
        var cnt = _events.filter(function(e){ return e.channel === ch.name; }).length;
        return '<div class="prop-row">' +
          '<span class="prop-row-label" title="' + ch.name + '">' + _trunc(ch.name, 14) + '</span>' +
          '<span class="prop-output">' + cnt + '</span>' +
          '<span class="prop-row-unit"></span></div>';
      }).join('');
    }

    /* Stats channel select — repopulate */
    var statsSel = document.getElementById('statsChannelSelect');
    if (statsSel) {
      var curVal = statsSel.value;
      statsSel.innerHTML = '<option value="">— select channel —</option>' +
        channels.map(function(ch){
          return '<option value="' + ch.name + '"' + (ch.name === curVal ? ' selected' : '') + '>' + ch.name + '</option>';
        }).join('');
      if (!curVal && channels.length > 0) {
        statsSel.value = channels[0].name;
        _updateStatsForChannel(channels[0].name);
      } else {
        _updateStatsForChannel(statsSel.value);
      }
    }

    /* Events/sec & Recording span */
    var allCh = channels;
    var totalSpan = 0;
    if (allCh.length > 0) {
      allCh.forEach(function(ch) {
        var ts = ch.timestamps ? Array.from(ch.timestamps) : null;
        var N = ch.samples.length;
        var span = ts ? (ts[ts.length-1] - ts[0]) : (N - 1);
        if (span > totalSpan) totalSpan = span;
      });
    }
    var eps = totalSpan > 0 ? (_events.length / totalSpan) : 0;
    _out('outEventsPerSec', totalSpan > 0 ? eps.toFixed(4) : '—');
    _out('outRecordingSpan', totalSpan > 0 ? totalSpan.toFixed(3) : '—');

    /* Units on span */
    var spanUnit = document.getElementById('outRecordingSpanUnit');
    if (spanUnit) {
      var hasSrate = allCh.some(function(c){ return c.sampleRate || c.timestamps; });
      spanUnit.textContent = hasSrate ? 's' : 'smp';
    }
  }

  function _updateStatsForChannel(chName) {
    var chEvents = _events.filter(function(e){ return e.channel === chName; });
    if (chEvents.length === 0) {
      ['outMeanHeight','outMedianHeight','outStdDevHeight','outMaxHeight','outMinHeight','outMeanDuration'].forEach(function(id){ _out(id, '—'); });
      _out('outTotalEnergy','—');
      return;
    }
    var heights = chEvents.map(function(e){ return e.height; });
    var durs    = chEvents.map(function(e){ return e.duration; });
    var mn = _mean(heights), mx = Math.max.apply(null,heights), mi = Math.min.apply(null,heights);
    var med = _median(heights), sd = _stddev(heights, mn);
    var mndur = _mean(durs);
    var energy = chEvents.reduce(function(a,e){ return a + e.area; }, 0);

    _out('outMeanHeight',   mn.toPrecision(5));
    _out('outMedianHeight', med.toPrecision(5));
    _out('outStdDevHeight', sd.toPrecision(5));
    _out('outMaxHeight',    mx.toPrecision(5));
    _out('outMinHeight',    mi.toPrecision(5));
    _out('outMeanDuration', mndur.toPrecision(5));
    _out('outTotalEnergy',  energy.toPrecision(5));
  }

  function _out(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = (val === null || val === undefined) ? '—' : val;
  }

  function _mean(arr) {
    return arr.reduce(function(a,b){ return a+b; }, 0) / arr.length;
  }
  function _median(arr) {
    var s = arr.slice().sort(function(a,b){ return a-b; });
    var m = Math.floor(s.length/2);
    return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
  }
  function _stddev(arr, mean) {
    var mn = mean !== undefined ? mean : _mean(arr);
    return Math.sqrt(arr.reduce(function(a,v){ return a+(v-mn)*(v-mn); }, 0) / arr.length);
  }
  function _trunc(s, n) { return s.length > n ? s.slice(0,n)+'…' : s; }

  /* ── RENDER EVENT TABLE ────────────────────────────────────────── */
  function renderEventTable() {
    var tbody = document.getElementById('eventTableTbody');
    if (!tbody) return;

    if (_events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;font-style:italic;padding:10px 0;">No events detected yet &mdash; run detection above.</td></tr>';
      return;
    }

    var sorted = _events.slice();
    if (_sortField) {
      var f = _sortField;
      sorted.sort(function(a,b) {
        var av = a[f], bv = b[f];
        if (typeof av === 'string') av = av.toLowerCase();
        if (typeof bv === 'string') bv = bv.toLowerCase();
        if (av < bv) return _sortAsc ? -1 : 1;
        if (av > bv) return _sortAsc ?  1 : -1;
        return 0;
      });
    }

    tbody.innerHTML = sorted.map(function(e) {
      var fmt = function(v) { return typeof v === 'number' ? v.toPrecision(6) : v; };
      return '<tr>' +
        '<td style="text-align:left;">' + e.channel + '</td>' +
        '<td>' + fmt(e.start)    + '</td>' +
        '<td>' + fmt(e.peak)     + '</td>' +
        '<td>' + fmt(e.end)      + '</td>' +
        '<td>' + fmt(e.duration) + '</td>' +
        '<td>' + fmt(e.height)   + '</td>' +
        '<td>' + fmt(e.area)     + '</td>' +
        '<td>' + fmt(e.rise)     + '</td>' +
        '<td>' + fmt(e.fall)     + '</td>' +
      '</tr>';
    }).join('');
  }

  /* Spike Explorer card builder */
  function renderSpikeExplorer() {
    var container = document.getElementById('spikeExplorerContainer');
    if (!container) return;
    if (_events.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#888;font-style:italic;">Run detection to see events here.</p>';
      return;
    }
    container.innerHTML = _events.map(function(e, idx) {
      var fmt = function(v) { return typeof v === 'number' ? v.toPrecision(5) : v; };
      return '<div class="spike-card">' +
        '<div class="spike-card-ch">' + e.channel + '</div>' +
        '<div class="spike-card-row"><span>Start</span><span>' + fmt(e.start) + '</span></div>' +
        '<div class="spike-card-row"><span>Peak</span><span>' + fmt(e.peak) + '</span></div>' +
        '<div class="spike-card-row"><span>Duration</span><span>' + fmt(e.duration) + '</span></div>' +
        '<div class="spike-card-row"><span>Height</span><span>' + fmt(e.height) + '</span></div>' +
        '<button class="tbtn" style="font-size:10px;padding:2px 7px;margin-top:4px;" onclick="SensorCharts.zoomToEvent(' + idx + ')" title="Center Time Plot on this event">Zoom</button>' +
      '</div>';
    }).join('');
  }

  function getEvents() { return _events; }

  function getEvent(idx) { return _events[idx] || null; }

  /* ── WIRE UP DOM ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var runBtn = document.getElementById('btnRunDetection');
    if (runBtn) runBtn.addEventListener('click', runDetection);

    var statsSel = document.getElementById('statsChannelSelect');
    if (statsSel) statsSel.addEventListener('change', function(){ _updateStatsForChannel(this.value); });

    _initWorker();
  });

  /* Expose _detect for the worker to call (and for Spike Explorer tab activation) */
  document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.querySelectorAll('.graph-tab');
    tabs.forEach(function(t) {
      t.addEventListener('click', function() {
        /* If Spike Explorer tab just became active, re-render */
        setTimeout(function() {
          var spikePanel = document.getElementById('sensorGraphContent2');
          if (spikePanel && spikePanel.classList.contains('visible')) renderSpikeExplorer();
        }, 50);
      });
    });
  });

  return {
    runDetection: runDetection,
    sortEvents: sortEvents,
    updateOutputs: updateOutputs,
    renderEventTable: renderEventTable,
    renderSpikeExplorer: renderSpikeExplorer,
    getEvents: getEvents,
    getEvent: getEvent,
    _detect: _detect, /* shared with worker */
  };
})();
