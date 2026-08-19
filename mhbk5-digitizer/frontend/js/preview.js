/* Chart.js live preview panel. Pulls the export/{id} endpoint (server-side
 * calibration math) when possible, falls back to nothing if the figure
 * hasn't been saved/calibrated yet. */

const Preview = (() => {
  let charts = []; // active Chart.js instances, destroyed on each refresh
  const container = document.getElementById("chart-container");

  function destroyAll() {
    charts.forEach((c) => c.destroy());
    charts = [];
  }

  async function refresh(figureId) {
    destroyAll();
    container.innerHTML = "";
    if (!figureId) {
      container.innerHTML = '<p class="hint">Save the figure to see a live preview.</p>';
      return;
    }
    let exportResult;
    try {
      exportResult = await api.exportFigure(figureId);
    } catch (err) {
      container.innerHTML = `<p class="hint">Preview unavailable: ${err.message}</p>`;
      return;
    }
    const chartEntries = Object.entries(exportResult.charts || {});
    if (chartEntries.length === 0) {
      container.innerHTML = '<p class="hint">No datasets yet.</p>';
      return;
    }
    chartEntries.forEach(([axisId, config]) => {
      const canvas = document.createElement("canvas");
      canvas.id = `chart-${axisId}`;
      container.appendChild(canvas);
      const chart = new Chart(canvas.getContext("2d"), config);
      charts.push(chart);
    });
  }

  return { refresh };
})();
