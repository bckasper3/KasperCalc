// ============================================================
// KASPERCALC PRINT HELPERS
// ============================================================

function generateDesignReport() {
  document.body.classList.remove('print-with-graphs');
  document.body.classList.add('print-report');
  window.print();
  document.body.classList.remove('print-report');
}

function generateDesignReportWithGraphs() {
  const p = (typeof _lastChartParams !== 'undefined' ? _lastChartParams : null)
         || window._lastChartParams
         || null;

  if (!p) {
    if (typeof runCalc === 'function') {
      runCalc();
      setTimeout(() => {
        const p2 = (typeof _lastChartParams !== 'undefined' ? _lastChartParams : null)
                || window._lastChartParams;
        if (!p2) {
          alert('Please solve a spring design first — enter enough parameters for the calculator to find a solution.');
          return;
        }
        _renderChartsToImagesAndPrint(p2);
      }, 150);
      return;
    }
    alert('Please solve a spring design first — enter enough parameters for the calculator to find a solution.');
    return;
  }

  _renderChartsToImagesAndPrint(p);
}

// ── Main routine ──────────────────────────────────────────────
function _renderChartsToImagesAndPrint(p) {

  const CHART_MAP = [
    { fn: window._chartLoadVsDeflection,   canvasId: 'chartLoadVsDeflection',   panelId: 'graphContent1', label: 'Load vs. Deflection'      },
    { fn: window._chartLoadVsLength,       canvasId: 'chartLoadVsLength',       panelId: 'graphContent2', label: 'Load vs. Length'          },
    { fn: window._chartPctMTSvsDeflection, canvasId: 'chartPctMTSvsDeflection', panelId: 'graphContent3', label: '% MTS vs. Deflection'     },
    { fn: window._chartStressVsLength,     canvasId: 'chartStressVsLength',     panelId: 'graphContent4', label: 'Stress vs. Length'        },
    { fn: window._chartFatigueStrength,    canvasId: 'chartFatigueStrength',    panelId: 'graphContent5', label: 'Fatigue Strength Diagram' },
    { fn: window._chartStressVsLoad,       canvasId: 'chartStressVsLoad',       panelId: 'graphContent6', label: 'Stress vs. Load'          },
  ];

  const CHART_W = 600;
  const CHART_H = 250;

  // ── 1. Intercept new Chart() to inject print-safe options ─
  // Chart.js v4 reads devicePixelRatio from per-chart options during
  // _resize(), not from Chart.defaults — so we must inject it into
  // the config object passed to the constructor.
  // We also force animation:false so the canvas is fully drawn
  // synchronously before toDataURL() is called.
  const OrigChart = window.Chart;
  window.Chart = function(canvas, config) {
    if (config && config.options) {
      // Force 1:1 pixel ratio — prevents canvas exceeding browser max size
      config.options.devicePixelRatio = 1;
      // Disable animation — ensures canvas is fully drawn synchronously
      config.options.animation = false;
    } else if (config) {
      config.options = { devicePixelRatio: 1, animation: false };
    }
    return new OrigChart(canvas, config);
  };
  // Copy all static properties (Chart.defaults, Chart.getChart, etc.)
  Object.setPrototypeOf(window.Chart, OrigChart);
  Object.assign(window.Chart, OrigChart);

  // ── 2. Off-screen container with 6 canvases ───────────────
  const offscreen = document.createElement('div');
  offscreen.id = '_printChartOffscreen';
  offscreen.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${CHART_W}px;
    visibility: visible;
    pointer-events: none;
    z-index: -1;
  `;

  CHART_MAP.forEach(({ canvasId }) => {
    const c = document.createElement('canvas');
    c.id     = canvasId + '_print';
    c.width  = CHART_W;
    c.height = CHART_H;
    c.style.cssText = `width:${CHART_W}px;height:${CHART_H}px;display:block;background:#fff;`;
    offscreen.appendChild(c);
  });

  document.body.appendChild(offscreen);

  // ── 3. Render each chart into its off-screen canvas ───────
  const origGetById = document.getElementById.bind(document);

  CHART_MAP.forEach(({ fn, canvasId }) => {
    if (typeof fn !== 'function') {
      console.warn('printHelpers: chart function not found for', canvasId);
      return;
    }

    document.getElementById = (id) =>
      id === canvasId ? origGetById(canvasId + '_print') : origGetById(id);

    try {
      fn(p);
    } catch (e) {
      console.warn('Print chart render error:', canvasId, e);
    }

    document.getElementById = origGetById;
  });

  // ── 4. Restore real Chart constructor ─────────────────────
  window.Chart = OrigChart;

  // ── 5. Capture, inject, and print ────────────────────────
  // animation:false means Chart.js drew synchronously — canvas pixels
  // are ready immediately. setTimeout(0) flushes browser compositing.
  setTimeout(() => {

    // ── 6. Capture PNGs ─────────────────────────────────────
    const images = {};
    CHART_MAP.forEach(({ canvasId, panelId, label }) => {
      const canvas = origGetById(canvasId + '_print');
      if (!canvas) {
        console.warn('printHelpers: off-screen canvas missing for', canvasId);
        return;
      }
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length < 500) {
          console.warn('printHelpers: PNG looks blank for', canvasId,
            '— length:', dataUrl.length);
        } else {
          console.log('printHelpers: captured', canvasId, '— length:', dataUrl.length);
        }
        images[panelId] = { dataUrl, label };
      } catch(e) {
        console.warn('toDataURL failed:', canvasId, e);
      }
    });

    // ── 7. Inject <img> into each print panel ───────────────
    const injected = [];
    Object.entries(images).forEach(([panelId, { dataUrl, label }]) => {
      const panel = origGetById(panelId);
      if (!panel) return;

      const panelCanvas = panel.querySelector('canvas');
      if (panelCanvas) panelCanvas.style.display = 'none';

      const img = document.createElement('img');
      img.src   = dataUrl;
      img.alt   = label;
      img.setAttribute('data-print-chart', panelId);
      img.style.cssText = `
        width: 100%;
        height: 300px;
        display: block;
        object-fit: fill;
        background: #fff;
      `;
      panel.appendChild(img);
      injected.push({ panel, img, panelCanvas });
    });

    // ── 8. Destroy off-screen charts and remove container ────
    CHART_MAP.forEach(({ canvasId }) => {
      const c = origGetById(canvasId + '_print');
      if (c) {
        try { Chart.getChart(c)?.destroy(); } catch(e) {}
      }
    });
    offscreen.remove();

    // ── 9. Print ─────────────────────────────────────────────
    document.body.classList.add('print-report');
    document.body.classList.add('print-with-graphs');

    requestAnimationFrame(() => {
      window.print();

      // ── 10. Restore DOM ─────────────────────────────────────
      document.body.classList.remove('print-report');
      document.body.classList.remove('print-with-graphs');
      injected.forEach(({ img, panelCanvas }) => {
        img.remove();
        if (panelCanvas) panelCanvas.style.display = '';
      });
    });

  }, 0);
}