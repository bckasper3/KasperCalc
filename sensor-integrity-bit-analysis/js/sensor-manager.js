/* sensor-manager.js — channel registry + sensor manager table */
'use strict';

var SensorManager = (function() {
  var _channels = [];
  var _nextId = 1;
  var _normalizeActive = false;

  var DEFAULT_COLORS = [
    '#2196F3','#E91E63','#4CAF50','#FF9800','#9C27B0',
    '#00BCD4','#F44336','#8BC34A','#FF5722','#607D8B'
  ];

  function _makeId() { return _nextId++; }

  /* Add a new channel. Returns the new channel object. */
  function addChannel(opts) {
    var ch = {
      id:         _makeId(),
      name:       opts.name      || ('Channel ' + (_channels.length + 1)),
      samples:    opts.samples   || [],   /* Float64Array or plain number[] */
      timestamps: opts.timestamps || null, /* Float64Array or null (index-based) */
      units:      opts.units     || '',
      color:      opts.color     || DEFAULT_COLORS[(_channels.length) % DEFAULT_COLORS.length],
      sampleRate: opts.sampleRate || null,
      rawInt:     opts.rawInt    || false,
      enabled:    true,
      hidden:     false,
    };
    _channels.push(ch);
    render();
    return ch;
  }

  function removeChannel(id) {
    _channels = _channels.filter(function(c){ return c.id !== id; });
    render();
  }

  function getChannel(id) {
    return _channels.find(function(c){ return c.id === id; }) || null;
  }

  function getEnabledChannels() {
    return _channels.filter(function(c){ return c.enabled; });
  }

  function getAllChannels() { return _channels.slice(); }

  function clearAll() {
    _channels = [];
    _normalizeActive = false;
    render();
    _updateChannelSelects();
  }

  /* Duplicate a channel */
  function duplicateChannel(id) {
    var src = getChannel(id);
    if (!src) return;
    var samplesCopy = src.samples instanceof Float64Array
      ? new Float64Array(src.samples)
      : src.samples.slice();
    var tsCopy = src.timestamps instanceof Float64Array
      ? new Float64Array(src.timestamps)
      : (src.timestamps ? src.timestamps.slice() : null);
    addChannel({
      name:       src.name + ' (copy)',
      samples:    samplesCopy,
      timestamps: tsCopy,
      units:      src.units,
      color:      src.color,
      sampleRate: src.sampleRate,
      rawInt:     src.rawInt,
    });
  }

  /* Align: resample all enabled channels onto the shared highest-rate grid */
  function alignChannels() {
    var enabled = getEnabledChannels();
    if (enabled.length < 2) {
      _setStatus('Need at least 2 enabled channels to align.', 'warn');
      return;
    }
    /* Check all have timestamps */
    var anyMissing = enabled.some(function(c){ return !c.timestamps || c.timestamps.length === 0; });
    if (anyMissing) {
      _setStatus('Some channels have no timestamps — set a sample rate or use a Timestamp column first.', 'warn');
      return;
    }
    /* Find reference grid (most samples) */
    var ref = enabled.reduce(function(best, c) {
      return c.timestamps.length > best.timestamps.length ? c : best;
    });
    var refTs = Array.from(ref.timestamps);
    /* Interpolate all others onto refTs */
    enabled.forEach(function(ch) {
      if (ch.id === ref.id) return;
      ch.samples    = new Float64Array(_linearInterp(ch.timestamps, ch.samples, refTs));
      ch.timestamps = new Float64Array(refTs);
    });
    render();
    _setStatus('Channels aligned to ' + ref.name + ' (' + refTs.length + ' samples).', 'ok');
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function _linearInterp(srcTs, srcVals, dstTs) {
    var src = Array.from(srcTs);
    var vals = Array.from(srcVals);
    return dstTs.map(function(t) {
      if (t <= src[0]) return vals[0];
      if (t >= src[src.length - 1]) return vals[vals.length - 1];
      var lo = 0, hi = src.length - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (src[mid] <= t) lo = mid; else hi = mid;
      }
      var frac = (t - src[lo]) / (src[hi] - src[lo]);
      return vals[lo] + frac * (vals[hi] - vals[lo]);
    });
  }

  /* Normalize toggle */
  function toggleNormalize() {
    _normalizeActive = !_normalizeActive;
    var label = document.getElementById('normalizeActiveLabel');
    if (label) label.style.display = _normalizeActive ? '' : 'none';
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function isNormalizeActive() { return _normalizeActive; }

  /* Returns normalized sample array for a channel (0-1), or original if not active */
  function getDisplaySamples(ch) {
    var vals = Array.from(ch.samples);
    if (!_normalizeActive) return vals;
    var mn = Math.min.apply(null, vals);
    var mx = Math.max.apply(null, vals);
    if (mx === mn) return vals.map(function(){ return 0; });
    return vals.map(function(v){ return (v - mn) / (mx - mn); });
  }

  /* Render the sensor manager table */
  function render() {
    var tbody = document.getElementById('sensorManagerTbody');
    if (!tbody) return;

    if (_channels.length === 0) {
      tbody.innerHTML = '<tr id="sensorManagerEmptyRow"><td colspan="8" style="text-align:center;color:#888;font-style:italic;padding:10px 0;">No channels loaded &mdash; import data above.</td></tr>';
      _updateChannelSelects();
      return;
    }

    tbody.innerHTML = _channels.map(function(ch) {
      return '<tr data-chid="' + ch.id + '">' +
        '<td style="text-align:left;">' +
          '<span class="sensor-name-view" style="cursor:pointer;text-decoration:underline dotted;" onclick="SensorManager._startRename(' + ch.id + ')" title="Click to rename">' + _esc(ch.name) + '</span>' +
          '<input class="sensor-name-edit" type="text" value="' + _esc(ch.name) + '" style="display:none;font-size:11.5px;border:1px solid #61828A;border-radius:3px;padding:1px 4px;width:100%;" ' +
            'onblur="SensorManager._commitRename(' + ch.id + ',this.value)" ' +
            'onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')SensorManager._cancelRename(' + ch.id + ')">' +
        '</td>' +
        '<td>' + ch.samples.length.toLocaleString() + '</td>' +
        '<td><input type="text" value="' + _esc(ch.units) + '" style="font-size:11px;width:60px;border:1px solid #aaa;border-radius:3px;padding:1px 4px;background:#fff;" onchange="SensorManager._setUnits(' + ch.id + ',this.value)" placeholder="—"></td>' +
        '<td><input type="color" value="' + ch.color + '" style="width:30px;height:20px;padding:0;border:1px solid #999;border-radius:3px;cursor:pointer;" onchange="SensorManager._setColor(' + ch.id + ',this.value)"></td>' +
        '<td style="text-align:center;"><input type="checkbox" ' + (ch.rawInt ? 'checked' : '') + ' title="Treat as raw integer for bit diagnostics" onchange="SensorManager._setRawInt(' + ch.id + ',this.checked)"></td>' +
        '<td style="text-align:center;"><input type="checkbox" ' + (ch.enabled ? 'checked' : '') + ' title="Include in detection and charts" onchange="SensorManager._setEnabled(' + ch.id + ',this.checked)"></td>' +
        '<td style="text-align:center;"><input type="checkbox" ' + (ch.hidden ? 'checked' : '') + ' title="Hide from charts only" onchange="SensorManager._setHidden(' + ch.id + ',this.checked)"></td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="sensor-action-btn" onclick="SensorManager.duplicateChannel(' + ch.id + ')" title="Duplicate channel">&#x2398;</button>' +
          '<button class="sensor-action-btn" style="color:#a00;" onclick="SensorManager._confirmDelete(' + ch.id + ')" title="Delete channel">&#x2715;</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    _updateChannelSelects();
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _startRename(id) {
    var row = document.querySelector('[data-chid="' + id + '"]');
    if (!row) return;
    row.querySelector('.sensor-name-view').style.display = 'none';
    var inp = row.querySelector('.sensor-name-edit');
    inp.style.display = '';
    inp.focus();
    inp.select();
  }

  function _commitRename(id, val) {
    var ch = getChannel(id);
    if (ch) ch.name = val.trim() || ch.name;
    render();
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  function _cancelRename(id) {
    render();
  }

  function _setUnits(id, val) {
    var ch = getChannel(id);
    if (ch) ch.units = val;
  }

  function _setColor(id, val) {
    var ch = getChannel(id);
    if (ch) { ch.color = val; if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot(); }
  }

  function _setRawInt(id, val) {
    var ch = getChannel(id);
    if (ch) ch.rawInt = val;
    _updateChannelSelects();
  }

  function _setEnabled(id, val) {
    var ch = getChannel(id);
    if (ch) { ch.enabled = val; if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot(); }
  }

  function _setHidden(id, val) {
    var ch = getChannel(id);
    if (ch) { ch.hidden = val; if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot(); }
  }

  function _confirmDelete(id) {
    var ch = getChannel(id);
    if (!ch) return;
    if (!confirm('Delete channel "' + ch.name + '"?')) return;
    removeChannel(id);
    if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
  }

  /* Update all channel <select> dropdowns on the page */
  function _updateChannelSelects() {
    var selects = [
      'statsChannelSelect','bitPlotChannelSelect','bitTableChannelSelect',
      'xcorrChA','xcorrChB','spectroChannelSelect','missingCodeChannelSelect',
    ];
    selects.forEach(function(sid) {
      var sel = document.getElementById(sid);
      if (!sel) return;
      var current = sel.value;
      var rawOnly = (sid === 'bitPlotChannelSelect' || sid === 'bitTableChannelSelect' || sid === 'missingCodeChannelSelect');
      var list = rawOnly ? _channels.filter(function(c){ return c.rawInt; }) : _channels;
      sel.innerHTML = '<option value="">— select channel —</option>' +
        list.map(function(c){
          return '<option value="' + c.id + '"' + (String(c.id) === current ? ' selected' : '') + '>' + _esc(c.name) + '</option>';
        }).join('');
    });
  }

  function _setStatus(msg, cls) {
    var dot  = document.getElementById('sensorStatusDot');
    var txt  = document.getElementById('sensorStatusText');
    if (dot) dot.className = 'status-dot ' + (cls || '');
    if (txt) txt.textContent = msg;
  }

  /* Wire up buttons */
  document.addEventListener('DOMContentLoaded', function() {
    var btnAlign = document.getElementById('btnAlignChannels');
    if (btnAlign) btnAlign.addEventListener('click', alignChannels);

    var btnNorm = document.getElementById('btnNormalizeChannels');
    if (btnNorm) btnNorm.addEventListener('click', toggleNormalize);

    var btnClear = document.getElementById('btnClearAllChannels');
    if (btnClear) btnClear.addEventListener('click', function() {
      if (_channels.length === 0) return;
      if (!confirm('Remove all channels? This cannot be undone.')) return;
      clearAll();
      if (typeof SensorCharts !== 'undefined') SensorCharts.updateTimePlot();
    });
  });

  return {
    addChannel: addChannel,
    removeChannel: removeChannel,
    getChannel: getChannel,
    getEnabledChannels: getEnabledChannels,
    getAllChannels: getAllChannels,
    clearAll: clearAll,
    duplicateChannel: duplicateChannel,
    alignChannels: alignChannels,
    toggleNormalize: toggleNormalize,
    isNormalizeActive: isNormalizeActive,
    getDisplaySamples: getDisplaySamples,
    render: render,
    /* exposed for inline onclick handlers */
    _startRename: _startRename,
    _commitRename: _commitRename,
    _cancelRename: _cancelRename,
    _setUnits: _setUnits,
    _setColor: _setColor,
    _setRawInt: _setRawInt,
    _setEnabled: _setEnabled,
    _setHidden: _setHidden,
    _confirmDelete: _confirmDelete,
  };
})();
