/* sensor-datagen.js — synthetic sensor data generator with fault injection */
'use strict';

var SensorDataGen = (function () {

  /* ── math helpers ──────────────────────────────────────────────── */
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function _gauss() {
    var u = 1 - Math.random();
    var v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ── base signal generators ─────────────────────────────────────── */
  function _sine(N, amp, cycles) {
    var a = new Float64Array(N);
    for (var i = 0; i < N; i++)
      a[i] = amp * Math.sin(2 * Math.PI * cycles * i / N);
    return a;
  }

  function _sawtooth(N, amp, cycles) {
    var a = new Float64Array(N);
    var perCycle = N / cycles;
    for (var i = 0; i < N; i++)
      a[i] = amp * (2 * ((i % perCycle) / perCycle) - 1);
    return a;
  }

  function _walk(N, amp) {
    var a    = new Float64Array(N);
    var step = amp * 0.02;
    a[0] = 0;
    for (var i = 1; i < N; i++)
      a[i] = _clamp(a[i - 1] + _gauss() * step, -amp, amp);
    return a;
  }

  function _step(N, amp) {
    var a       = new Float64Array(N);
    var nSteps  = 8;
    var stepLen = Math.floor(N / nSteps);
    for (var s = 0; s < nSteps; s++) {
      var val = amp * (Math.random() * 1.6 - 0.8);
      for (var i = s * stepLen; i < Math.min((s + 1) * stepLen, N); i++)
        a[i] = val;
    }
    return a;
  }

  function _base(type, N, amp, noisePct) {
    var a;
    if      (type === 'sawtooth') a = _sawtooth(N, amp, 3);
    else if (type === 'walk')     a = _walk(N, amp);
    else if (type === 'step')     a = _step(N, amp);
    else                          a = _sine(N, amp, 3);
    var noise = amp * noisePct / 100;
    for (var i = 0; i < N; i++) a[i] += _gauss() * noise;
    return a;
  }

  /* ── fault injectors ────────────────────────────────────────────── */

  /* Stuck bit: forces one bit position to always 0 or always 1 */
  function _stuckBit(s, bitPos, high) {
    var mask = (1 << bitPos) >>> 0;
    var inv  = (~mask) >>> 0;
    var o    = new Float64Array(s.length);
    for (var i = 0; i < s.length; i++) {
      var v = Math.trunc(s[i]) >>> 0;
      o[i]  = high ? ((v | mask) >>> 0) : ((v & inv) >>> 0);
    }
    return o;
  }

  /* Bit flip: random single-bit errors in 16-bit representation */
  function _bitFlip(s, per1000) {
    var prob = per1000 / 1000;
    var o    = new Float64Array(s.length);
    for (var i = 0; i < s.length; i++) {
      var v = Math.trunc(s[i]) >>> 0;
      if (Math.random() < prob)
        v = (v ^ (1 << Math.floor(Math.random() * 16))) >>> 0;
      o[i] = v;
    }
    return o;
  }

  /* Buffer overload: signal clips at threshold then wraps or saturates */
  function _bufferOverload(s, clipPct) {
    var clipAt = 65535 * clipPct / 100;
    var o      = s.slice();
    for (var i = 0; i < o.length; i++) {
      if (o[i] > clipAt)
        o[i] = Math.random() < 0.5 ? clipAt : o[i] - clipAt;
    }
    return o;
  }

  /* Sensor dropout: stretches of zero-value samples */
  function _dropout(s, ratePct, dropLen) {
    var o    = s.slice();
    var prob = ratePct / 100;
    var i    = 0;
    while (i < o.length) {
      if (Math.random() < prob) {
        var len = Math.round(dropLen * (0.5 + Math.random()));
        for (var j = i; j < Math.min(i + len, o.length); j++) o[j] = 0;
        i += len;
      } else {
        i++;
      }
    }
    return o;
  }

  /* Baseline drift: linear additive trend across the full record */
  function _drift(s, driftPct, amp) {
    var driftMax = amp * driftPct / 100;
    var o        = new Float64Array(s.length);
    for (var i = 0; i < s.length; i++)
      o[i] = s[i] + driftMax * (i / (s.length - 1));
    return o;
  }

  /* Spike injection: random large-amplitude outliers */
  function _spikes(s, per1000, spikeAmp) {
    var prob = per1000 / 1000;
    var o    = s.slice();
    for (var i = 0; i < o.length; i++) {
      if (Math.random() < prob)
        o[i] = spikeAmp * (Math.random() < 0.5 ? 1 : -1);
    }
    return o;
  }

  /* Periodic interference: secondary frequency added to signal */
  function _interference(s, freqHz, sampleRate, ampPct, amp) {
    var intAmp = amp * ampPct / 100;
    var o      = new Float64Array(s.length);
    for (var i = 0; i < s.length; i++)
      o[i] = s[i] + intAmp * Math.sin(2 * Math.PI * freqHz * (i / sampleRate));
    return o;
  }

  /* Toggle storm: one bit flips at high rate, creating maximal toggle count */
  function _toggleStorm(s, bitPos, ratePct) {
    var prob = ratePct / 100;
    var o    = new Float64Array(s.length);
    o[0]     = Math.trunc(s[0]) >>> 0;
    for (var i = 1; i < s.length; i++) {
      var v = Math.trunc(s[i]) >>> 0;
      if (Math.random() < prob) v = (v ^ (1 << bitPos)) >>> 0;
      o[i] = v;
    }
    return o;
  }

  /* Quantization step: zero out LSBs, simulating reduced ADC resolution */
  function _quantize(s, stripBits) {
    var mask = (~((1 << stripBits) - 1)) >>> 0;
    var o    = new Float64Array(s.length);
    for (var i = 0; i < s.length; i++)
      o[i] = (Math.trunc(s[i]) >>> 0) & mask;
    return o;
  }

  /* ── DOM helpers ────────────────────────────────────────────────── */
  function _num(id, def) {
    var el = document.getElementById(id);
    var v  = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? def : v;
  }
  function _int(id, def) {
    var el = document.getElementById(id);
    var v  = el ? parseInt(el.value, 10) : NaN;
    return isNaN(v) ? def : v;
  }
  function _chk(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }
  function _radio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function _selInt(id, def) {
    var el = document.getElementById(id);
    return el ? parseInt(el.value, 10) : def;
  }

  /* ── generate ───────────────────────────────────────────────────── */
  function generate() {
    var N          = _clamp(_int('dgenSamples', 1000), 10, 100000);
    var nCh        = _clamp(_int('dgenChannels', 2), 1, 8);
    var sampleRate = _num('dgenSampleRate', 1000) || 1000;
    var sigType    = _radio('dgenSignal') || 'sine';
    var amplitude  = _clamp(_num('dgenAmplitude', 32767), 1, 65535);
    var noisePct   = _clamp(_num('dgenNoise', 5), 0, 100);

    var f = {
      stuckBit:    _chk('faultStuckBitEn'),
      stuckPos:    _clamp(_int('faultStuckBitPos', 7), 0, 15),
      stuckHigh:   _selInt('faultStuckBitState', 1) === 1,

      bitFlip:     _chk('faultBitFlipEn'),
      flipRate:    _int('faultBitFlipRate', 1),

      bufOverload: _chk('faultBufOverloadEn'),
      bufPct:      _clamp(_num('faultBufOverloadPct', 80), 10, 99),

      dropout:     _chk('faultDropoutEn'),
      dropRate:    _int('faultDropoutRate', 1),
      dropLen:     _int('faultDropoutLen', 20),

      drift:       _chk('faultDriftEn'),
      driftPct:    _num('faultDriftPct', 20),

      correl:      _chk('faultCorrelEn'),
      correlDelay: _clamp(_int('faultCorrelDelay', 10), 0, N - 1),
      correlGain:  _num('faultCorrelGain', 0.8),
      correlNoise: _num('faultCorrelNoise', 5),

      spike:       _chk('faultSpikeEn'),
      spikeRate:   _int('faultSpikeRate', 2),
      spikeAmp:    _num('faultSpikeAmp', 60000),

      interf:      _chk('faultInterferenceEn'),
      interfFreq:  _num('faultIntFreq', 50),
      interfAmp:   _num('faultIntAmp', 20),

      toggle:      _chk('faultToggleStormEn'),
      toggleBit:   _clamp(_int('faultToggleBit', 0), 0, 15),
      toggleRate:  _num('faultToggleRate', 60),

      quant:       _chk('faultQuantEn'),
      quantBits:   _clamp(_int('faultQuantBits', 3), 1, 8),
    };

    /* build timestamps */
    var ts = new Float64Array(N);
    for (var t = 0; t < N; t++) ts[t] = t / sampleRate;

    /* generate independent base signals for every channel */
    var bases = [];
    for (var ch = 0; ch < nCh; ch++) bases.push(_base(sigType, N, amplitude, noisePct));

    /* correlation: channels 1+ are derived from channel 0's base */
    if (f.correl && nCh > 1) {
      var b0     = bases[0];
      var cNoise = amplitude * f.correlNoise / 100;
      for (var ch = 1; ch < nCh; ch++) {
        var corr = new Float64Array(N);
        for (var i = 0; i < N; i++) {
          var src  = i >= f.correlDelay ? b0[i - f.correlDelay] : b0[0];
          corr[i]  = f.correlGain * src + _gauss() * cNoise;
        }
        bases[ch] = corr;
      }
    }

    /* apply remaining faults to every channel and add to SensorManager */
    var added = 0;
    for (var ch = 0; ch < nCh; ch++) {
      var s = bases[ch];
      if (f.stuckBit)    s = _stuckBit(s, f.stuckPos, f.stuckHigh);
      if (f.bitFlip)     s = _bitFlip(s, f.flipRate);
      if (f.bufOverload) s = _bufferOverload(s, f.bufPct);
      if (f.dropout)     s = _dropout(s, f.dropRate, f.dropLen);
      if (f.drift)       s = _drift(s, f.driftPct, amplitude);
      if (f.spike)       s = _spikes(s, f.spikeRate, f.spikeAmp);
      if (f.interf)      s = _interference(s, f.interfFreq, sampleRate, f.interfAmp, amplitude);
      if (f.toggle)      s = _toggleStorm(s, f.toggleBit, f.toggleRate);
      if (f.quant)       s = _quantize(s, f.quantBits);

      /* shift so all values are >= 0 (uint16 positive range) */
      var minV = s[0];
      for (var i = 1; i < N; i++) if (s[i] < minV) minV = s[i];
      if (minV < 0) for (var i = 0; i < N; i++) s[i] -= minV;

      SensorManager.addChannel({
        name:       'Gen-' + String.fromCharCode(65 + ch),
        samples:    new Float64Array(s),
        timestamps: new Float64Array(ts),
        units:      'counts',
        sampleRate: sampleRate,
        rawInt:     true,
      });
      added++;
    }

    var el = document.getElementById('dgenStatus');
    if (el) {
      el.textContent = added + ' channel' + (added !== 1 ? 's' : '') + ' added to Sensor Manager.';
      el.style.color = '#2a7a2a';
    }
  }

  /* ── init ───────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btnGenerate');
    if (btn) btn.addEventListener('click', generate);

    /* fault checkbox → show/hide params panel */
    document.querySelectorAll('.fault-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var params = document.getElementById(this.id.replace('En', 'Params'));
        if (params) params.classList.toggle('hidden', !this.checked);
      });
    });
  });

  return { generate: generate };
})();
