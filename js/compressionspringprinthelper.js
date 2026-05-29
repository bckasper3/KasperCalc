// ============================================================
// KASPERCALC — SPRING COMPRESSION PRINT HELPERS
//
// Report (no graphs):
//   Adds print-report class → CSS hides toolbar, controls,
//   and graph banner → prints → removes class.
//
// Report with Graphs:
//   The #springGraphsPrint section holds 6 shadow canvases
//   (position:fixed;left:-9999px;width:750px).  rebuildChart()
//   in springCharts.js keeps them in sync on every calculation,
//   so they always contain fully-rendered charts regardless of
//   which tab is currently active.  We just swap classes and
//   call window.print() — no DOM juggling, no toDataURL() PNG
//   captures, no off-screen Chart.js re-renders.
// ============================================================

function generateDesignReport() {
  document.body.classList.remove('print-with-graphs');
  document.body.classList.add('print-report');
  window.print();
  document.body.classList.remove('print-report');
}

function generateDesignReportWithGraphs() {
  const p = window._lastChartParams;
  if (!p) {
    alert('Please solve a spring design first — enter enough parameters for the calculator to find a solution.');
    return;
  }

  // Force-render all 6 print shadow canvases.
  // updateAllCharts() only renders the active tab's chart, so the other 5
  // shadow canvases stay blank.  Calling each function here ensures every
  // #chartXxx_p canvas is populated before we print.
  if (typeof window._chartLoadVsDeflection   === 'function') window._chartLoadVsDeflection(p);
  if (typeof window._chartLoadVsLength       === 'function') window._chartLoadVsLength(p);
  if (typeof window._chartPctMTSvsDeflection === 'function') window._chartPctMTSvsDeflection(p);
  if (typeof window._chartStressVsLength     === 'function') window._chartStressVsLength(p);
  if (typeof window._chartFatigueStrength    === 'function') window._chartFatigueStrength(p);
  if (typeof window._chartStressVsLoad       === 'function') window._chartStressVsLoad(p);

  // Wait for Chart.js animations (duration: 250 ms) to finish before printing.
  setTimeout(function () {
    document.body.classList.add('print-report', 'print-with-graphs');
    window.print();
    document.body.classList.remove('print-report', 'print-with-graphs');
  }, 400);
}
