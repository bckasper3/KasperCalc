/* detect-worker.js — Web Worker: event detection + bit diagnostics */
'use strict';

self.onmessage = function(e) {
  var data = e.data;
  if (data.type === 'detect') {
    var events = detect(data.channel, Array.from(data.samples), data.timestamps ? Array.from(data.timestamps) : null, data.settings);
    self.postMessage({ type: 'events', events: events });
  } else if (data.type === 'bitdiag') {
    var result = computeBitDiag(Array.from(data.samples));
    self.postMessage({ type: 'bitdiagResult', channelId: data.channelId, channelName: data.channelName, result: result });
  }
};

/* ── EVENT DETECTION ─────────────────────────────────────────────── */
function detect(chName, samples, timestamps, s) {
  var N = samples.length;
  if (N === 0) return [];
  var thr = s.threshold;
  if (thr === null || thr === undefined) return [];

  var minDurSamples   = s.minDuration;
  var debounceSamples = s.debounce;

  if (s.durUnit === 'ms' && timestamps && timestamps.length > 1) {
    var dt = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1) * 1000;
    if (dt > 0) minDurSamples = s.minDuration / dt;
  }
  if (s.debUnit === 'ms' && timestamps && timestamps.length > 1) {
    var dt2 = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1) * 1000;
    if (dt2 > 0) debounceSamples = s.debounce / dt2;
  }

  var baselineVals = samples.filter(function(v){ return v <= thr; });
  var baseline = baselineVals.length > 0
    ? baselineVals.reduce(function(a,b){ return a+b; }, 0) / baselineVals.length
    : 0;

  var segments = [];
  var inSeg = false, segStart = -1;
  for (var i = 0; i < N; i++) {
    var above = samples[i] > thr;
    if (above && !inSeg)  { inSeg = true;  segStart = i; }
    if (!above && inSeg)  { inSeg = false; segments.push([segStart, i - 1]); }
  }
  if (inSeg) segments.push([segStart, N - 1]);

  var events = segments
    .filter(function(seg) { return (seg[1] - seg[0] + 1) >= minDurSamples; })
    .map(function(seg) {
      var start = seg[0], end = seg[1];
      var peakVal = -Infinity, peakIdx = start;
      for (var j = start; j <= end; j++) {
        if (samples[j] > peakVal) { peakVal = samples[j]; peakIdx = j; }
      }
      var height = peakVal - baseline;
      var area = 0;
      for (var k = start; k < end; k++) {
        var dtt = timestamps ? (timestamps[k+1] - timestamps[k]) : 1;
        area += ((samples[k] - baseline) + (samples[k+1] - baseline)) * dtt / 2;
      }
      var startTs = timestamps ? timestamps[start]   : start;
      var peakTs  = timestamps ? timestamps[peakIdx] : peakIdx;
      var endTs   = timestamps ? timestamps[end]     : end;
      return { channel: chName, start: startTs, peak: peakTs, end: endTs,
               duration: endTs - startTs, height: height, area: area,
               rise: peakTs - startTs, fall: endTs - peakTs };
    })
    .filter(function(ev) { return ev.height >= (s.minHeight || 0); });

  if (debounceSamples > 0 && events.length > 1) {
    var merged = [events[0]];
    for (var m = 1; m < events.length; m++) {
      var prev = merged[merged.length - 1];
      var curr = events[m];
      var gap  = curr.start - prev.end;
      if (gap < debounceSamples) {
        var newEnd  = Math.max(prev.end, curr.end);
        var newPeak = (prev.height >= curr.height) ? prev.peak : curr.peak;
        merged[merged.length - 1] = {
          channel: prev.channel, start: prev.start, peak: newPeak, end: newEnd,
          duration: newEnd - prev.start, height: Math.max(prev.height, curr.height),
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

/* ── BIT DIAGNOSTICS ─────────────────────────────────────────────── */
function computeBitDiag(samples) {
  var N = samples.length;
  var maxAbs = 0;
  for (var i = 0; i < N; i++) {
    var v = Math.abs(Math.trunc(samples[i]));
    if (v > maxAbs) maxAbs = v;
  }
  var bitWidth = maxAbs === 0 ? 8 : Math.min(32, Math.max(8, Math.ceil(Math.log2(maxAbs + 1)) + 1));
  if (bitWidth <= 8)  bitWidth = 8;
  else if (bitWidth <= 16) bitWidth = 16;
  else bitWidth = 32;

  var ints = new Uint32Array(N);
  for (var j = 0; j < N; j++) ints[j] = Math.trunc(samples[j]) >>> 0;

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

  var hammingHist = new Float64Array(bitWidth + 1);
  for (var p = 1; p < N; p++) {
    var xorVal = (ints[p] ^ ints[p-1]) >>> 0;
    var cnt = 0, x = xorVal;
    while (x) { cnt += x & 1; x >>>= 1; }
    if (cnt <= bitWidth) hammingHist[cnt]++;
  }

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
