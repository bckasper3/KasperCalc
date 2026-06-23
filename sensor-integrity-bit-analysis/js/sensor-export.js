/* sensor-export.js — CSV export (V1) */
'use strict';

var SensorExport = (function() {

  function exportEventCSV() {
    var events = SensorEvents.getEvents();
    if (!events || events.length === 0) {
      var dot = document.getElementById('sensorStatusDot');
      var txt = document.getElementById('sensorStatusText');
      if (dot) dot.className = 'status-dot warn';
      if (txt) txt.textContent = 'No events to export — run detection first.';
      return;
    }

    var header = ['channel','start','peak','end','duration','height','area','rise','fall'];
    var rows = events.map(function(e) {
      return header.map(function(k) {
        var v = e[k];
        if (typeof v === 'number') return v;
        /* Wrap strings that contain commas in quotes */
        if (typeof v === 'string' && v.indexOf(',') >= 0) return '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(',');
    });

    var csv = header.join(',') + '\r\n' + rows.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'sensor-events-' + _dateStamp() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    var dot2 = document.getElementById('sensorStatusDot');
    var txt2 = document.getElementById('sensorStatusText');
    if (dot2) dot2.className = 'status-dot ok';
    if (txt2) txt2.textContent = 'Exported ' + events.length + ' events as CSV.';
  }

  function _dateStamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('btnExportCSV');
    if (btn) btn.addEventListener('click', exportEventCSV);
  });

  return { exportEventCSV: exportEventCSV };
})();
