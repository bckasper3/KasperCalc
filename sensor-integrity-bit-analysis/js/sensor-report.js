/* sensor-report.js — PDF report generation (text-only + with charts) */
'use strict';

var SensorReport = (function () {

  var _busy = false;
  var _JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  /* ── jsPDF lazy load ────────────────────────────────────────────── */
  function _loadJsPDF(cb) {
    if (window.jspdf && window.jspdf.jsPDF) { cb(); return; }
    var s   = document.createElement('script');
    s.src   = _JSPDF_CDN;
    s.onload  = function () { cb(); };
    s.onerror = function () {
      _setStatus('Could not load PDF library — check network connection.', 'warn');
      _busy = false;
    };
    document.head.appendChild(s);
  }

  /* ── status bar ─────────────────────────────────────────────────── */
  function _setStatus(msg, cls) {
    var dot = document.getElementById('sensorStatusDot');
    var txt = document.getElementById('sensorStatusText');
    if (dot) dot.className = 'status-dot ' + (cls || '');
    if (txt) txt.textContent = msg;
  }

  /* ── PDF layout constants ───────────────────────────────────────── */
  var PW = 210, PH = 297, M = 14;          /* A4, 14 mm margin each side */
  var CW = PW - M * 2;                      /* content width = 182 mm    */
  var ROW_H = 5.5;

  function _newDoc() {
    return new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  function _checkY(doc, y, need) {
    if (y + need > PH - 13) { doc.addPage(); return 18; }
    return y;
  }

  /* ── page chrome ────────────────────────────────────────────────── */
  function _drawPageHeader(doc) {
    doc.setFillColor(26, 58, 64);
    doc.rect(0, 0, PW, 19, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('KasperCalc — Sensor Event & Binary Integrity Analysis', M, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Generated: ' + new Date().toLocaleString(), PW - M, 10, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return 27;
  }

  function _drawPageFooters(doc) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        'KasperCalc · Sensor Event & Binary Integrity Analysis · Page ' + i + ' of ' + n,
        PW / 2, PH - 7, { align: 'center' }
      );
      doc.text(
        'All processing runs in your browser. Not a certified measurement instrument.',
        PW / 2, PH - 3.5, { align: 'center' }
      );
    }
    doc.setTextColor(0, 0, 0);
  }

  /* ── section heading ────────────────────────────────────────────── */
  function _sectionHead(doc, y, title) {
    y = _checkY(doc, y, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 58, 64);
    doc.text(title, M, y);
    doc.setDrawColor(26, 58, 64);
    doc.setLineWidth(0.25);
    doc.line(M, y + 2, PW - M, y + 2);
    doc.setTextColor(0, 0, 0);
    return y + 8;
  }

  /* ── table row ──────────────────────────────────────────────────── */
  function _tableRow(doc, y, cells, widths, header) {
    y = _checkY(doc, y, ROW_H + 1);
    var x = M;
    if (header) {
      doc.setFillColor(213, 220, 222);
      doc.rect(M, y - 3.5, CW, ROW_H, 'F');
    }
    doc.setFont('helvetica', header ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    for (var i = 0; i < cells.length; i++) {
      doc.text(String(cells[i] == null ? '' : cells[i]), x + 1, y, { maxWidth: widths[i] - 2 });
      x += widths[i];
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.08);
    doc.line(M, y + 2.2, PW - M, y + 2.2);
    return y + ROW_H;
  }

  /* ── 1. Channels section ────────────────────────────────────────── */
  function _secChannels(doc, y) {
    y = _sectionHead(doc, y, '1.  Channels');
    var chs = SensorManager.getAllChannels();
    if (!chs.length) {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic');
      doc.text('No channels loaded.', M, y);
      return y + 8;
    }
    var W = [50, 28, 30, 22, 20, 18, 14]; /* sum = 182 = CW */
    y = _tableRow(doc, y, ['Name', 'Samples', 'Sample Rate', 'Units', 'Raw Int', 'Enabled', 'Color'], W, true);
    chs.forEach(function (ch) {
      y = _tableRow(doc, y, [
        ch.name,
        ch.samples.length.toLocaleString(),
        ch.sampleRate ? ch.sampleRate + ' Hz' : '—',
        ch.units || '—',
        ch.rawInt   ? 'Yes' : 'No',
        ch.enabled  ? 'Yes' : 'No',
        ch.color    || '—',
      ], W);
    });
    return y + 5;
  }

  /* ── 2. Events section ──────────────────────────────────────────── */
  function _secEvents(doc, y) {
    y = _sectionHead(doc, y, '2.  Detected Events');
    var evs = (typeof SensorEvents !== 'undefined') ? SensorEvents.getEvents() : [];
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    if (!evs.length) {
      doc.setFont('helvetica', 'italic');
      doc.text('No events detected — run detection first.', M, y);
      return y + 8;
    }
    doc.text(evs.length + ' event' + (evs.length !== 1 ? 's' : '') + ' detected across all channels.', M, y);
    y += 6;
    var f = function (v) { return typeof v === 'number' ? (+v.toPrecision(5)).toString() : (v || '—'); };
    var W = [32, 26, 26, 26, 24, 24, 24]; /* sum = 182 */
    y = _tableRow(doc, y, ['Channel', 'Start', 'Peak', 'End', 'Duration', 'Height', 'Area'], W, true);
    evs.forEach(function (ev) {
      y = _tableRow(doc, y, [ev.channel, f(ev.start), f(ev.peak), f(ev.end), f(ev.duration), f(ev.height), f(ev.area)], W);
    });
    return y + 5;
  }

  /* ── date stamp ─────────────────────────────────────────────────── */
  function _stamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ════════════════════════════════════════════════════════════════
     REPORT PDF  (text only)
  ════════════════════════════════════════════════════════════════ */
  function reportPDF() {
    if (_busy) return;
    _busy = true;
    _setStatus('Building PDF report…', '');
    _loadJsPDF(function () {
      try {
        var doc = _newDoc();
        var y   = _drawPageHeader(doc);
        y = _secChannels(doc, y);
        y = _secEvents(doc, y);
        _drawPageFooters(doc);
        doc.save('sensor-report-' + _stamp() + '.pdf');
        _setStatus('Report saved.', 'ok');
      } catch (e) {
        console.error('[SensorReport]', e);
        _setStatus('Report failed: ' + e.message, 'warn');
      }
      _busy = false;
    });
  }

  /* ════════════════════════════════════════════════════════════════
     REPORT WITH GRAPHS
     Strategy:
       1. Save which .graph-content panels are currently visible.
       2. Move BOTH .graph-banner elements into an off-screen fixed
          div (left: -9999px) so they are rendered by the browser
          but invisible to the user.
       3. Add .visible to ALL .graph-content panels so every chart
          canvas has real dimensions.
       4. Trigger chart resize / re-render.
       5. Wait RENDER_DELAY ms (10 s default) for Chart.js to paint.
       6. Capture each canvas via toDataURL.
       7. Move banners back to their original DOM positions.
       8. Restore original .visible states.
       9. Build and download the PDF.
  ════════════════════════════════════════════════════════════════ */
  var RENDER_DELAY = 3000; /* ms — configurable here */

  function reportWithGraphs() {
    if (_busy) return;
    _busy = true;

    /* ── save original state ── */
    var allContent = Array.from(document.querySelectorAll('.graph-content'));
    var origVisible = allContent.filter(function (c) { return c.classList.contains('visible'); });

    var gBanner = document.querySelector('.graph-banner[aria-label="Sensor graphs"]');
    var tBanner = document.querySelector('.graph-banner[aria-label="Sensor tables"]');
    var gParent = gBanner ? gBanner.parentNode : null;
    var tParent = tBanner ? tBanner.parentNode : null;
    var gNext   = gBanner ? gBanner.nextSibling : null;
    var tNext   = tBanner ? tBanner.nextSibling : null;

    /* ── create off-screen render zone ── */
    var zone = document.createElement('div');
    zone.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:0',
      'width:900px',
      'background:#fff',
      'z-index:1',
      'overflow:visible',
    ].join(';');
    document.body.appendChild(zone);

    /* ── move banners into zone ── */
    if (gBanner) zone.appendChild(gBanner);
    if (tBanner) zone.appendChild(tBanner);

    /* ── show every content panel ── */
    allContent.forEach(function (c) { c.classList.add('visible'); });

    /* ── trigger chart resizes/repaints ── */
    if (typeof SensorCharts !== 'undefined') {
      SensorCharts.resizeTimePlot();
      SensorCharts.resizeBitPlot();
    }
    if (typeof SensorV2 !== 'undefined') {
      [5, 6, 7].forEach(function (n) { SensorV2.onTabVisible(n); });
    }

    /* ── countdown status ── */
    var secsLeft = Math.round(RENDER_DELAY / 1000);
    _setStatus('Rendering charts — ' + secsLeft + ' s…', '');
    var ticker = setInterval(function () {
      secsLeft--;
      if (secsLeft > 0) {
        _setStatus('Rendering charts — ' + secsLeft + ' s…', '');
      } else {
        clearInterval(ticker);
      }
    }, 1000);

    /* ── capture + build after delay ── */
    setTimeout(function () {
      clearInterval(ticker);
      _setStatus('Capturing charts…', '');

      /* canvas list in report order */
      var CANVASES = [
        { id: 'chartTimePlot',      label: 'Time Plot' },
        { id: 'chartBitPlot',       label: 'Bit Occupancy Plot' },
        { id: 'chartHamming',       label: 'Hamming Distance Histogram' },
        { id: 'chartCorrelHeatmap', label: 'Correlation Heatmap' },
        { id: 'chartXCorr',         label: 'Cross-Correlation' },
        { id: 'chartEventOverlay',  label: 'Event Overlay' },
        { id: 'chartSpectrogram',   label: 'Spectrogram' },
        { id: 'chartMissingCode',   label: 'Missing Code Histogram' },
      ];

      var captured = {};
      CANVASES.forEach(function (item) {
        var el = document.getElementById(item.id);
        if (!el) return;
        var w = el.width  || el.offsetWidth;
        var h = el.height || el.offsetHeight;
        if (w < 8 || h < 8) return;
        try {
          /* Composite onto a white canvas so transparent areas are white,
             not black when encoded as JPEG. */
          var flat = document.createElement('canvas');
          flat.width  = w;
          flat.height = h;
          var ctx = flat.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(el, 0, 0);
          captured[item.id] = {
            dataUrl: flat.toDataURL('image/jpeg', 0.92),
            label:   item.label,
          };
        } catch (e) { /* tainted cross-origin canvas — skip */ }
      });

      /* ── undo render trick ── */
      /* restore banners to original DOM positions */
      if (gBanner && gParent) {
        if (gNext) gParent.insertBefore(gBanner, gNext);
        else       gParent.appendChild(gBanner);
      }
      if (tBanner && tParent) {
        if (tNext) tParent.insertBefore(tBanner, tNext);
        else       tParent.appendChild(tBanner);
      }
      /* remove zone */
      if (zone.parentNode) zone.parentNode.removeChild(zone);
      /* restore .visible states */
      allContent.forEach(function (c) { c.classList.remove('visible'); });
      origVisible.forEach(function (c) { c.classList.add('visible'); });

      /* ── build PDF ── */
      _setStatus('Building PDF with charts…', '');
      _loadJsPDF(function () {
        try {
          var doc = _newDoc();
          var y   = _drawPageHeader(doc);
          y = _secChannels(doc, y);
          y = _secEvents(doc, y);

          var capturedList = CANVASES.filter(function (item) { return captured[item.id]; });
          if (capturedList.length) {
            y = _sectionHead(doc, y, '3.  Charts');
            capturedList.forEach(function (item) {
              var img  = captured[item.id];
              var imgH = 60; /* mm — chart height in PDF */
              y = _checkY(doc, y, imgH + 12);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
              doc.text(item.label, M, y);
              y += 3;
              doc.addImage(img.dataUrl, 'JPEG', M, y, CW, imgH);
              y += imgH + 7;
            });
          }

          _drawPageFooters(doc);
          doc.save('sensor-report-graphs-' + _stamp() + '.pdf');
          _setStatus('Report with graphs saved.', 'ok');
        } catch (e) {
          console.error('[SensorReport]', e);
          _setStatus('Report failed: ' + e.message, 'warn');
        }
        _busy = false;
      });
    }, RENDER_DELAY);
  }

  /* ── wire buttons ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var btnPDF   = document.getElementById('btnReportPDF');
    var btnGraph = document.getElementById('btnReportWithGraphs');
    if (btnPDF)   btnPDF.addEventListener('click',   reportPDF);
    if (btnGraph) btnGraph.addEventListener('click', reportWithGraphs);
  });

  return {
    reportPDF:         reportPDF,
    reportWithGraphs:  reportWithGraphs,
    setRenderDelay:    function (ms) { RENDER_DELAY = ms; },
  };

})();
