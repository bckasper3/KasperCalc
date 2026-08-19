/* Top-level wiring: figure list / batch queue, figure detail panel (axes,
 * datasets, notes, status), and gluing Viewer/Calibration/Curves/Preview
 * together. Vanilla JS, no framework, no build step. */

let currentFigure = null; // the figure object currently being edited
let isDirty = false;

function getFigure() {
  return currentFigure;
}

// Redraws the viewer's SVG overlay: the pending multi-selection (paths
// picked for the next dataset/edit) plus every visible dataset's own
// color/width, all at once - so by the time you're done digitizing a
// figure with several curves, all of them stay visible simultaneously,
// each in its own color.
function refreshViewerOverlay() {
  Viewer.renderPaths(Curves.getSelectedPathIndices(), Curves.getDatasetAssignments());
}

function markDirty() {
  isDirty = true;
  renderAxesPanel();
  renderDatasetsPanel();
}

async function saveCurrentFigure({ silent } = {}) {
  if (!currentFigure) return;
  const saved = await api.updateFigure(currentFigure.figure_id, currentFigure);
  currentFigure = saved;
  isDirty = false;
  currentFigure.axes.forEach((axis) => addRecentAxisTitle({ label: axis.label, units: axis.units }));
  if (!silent) await updateProgressCounter();
  await Preview.refresh(currentFigure.figure_id);
}

async function quitApp() {
  if (isDirty && !confirm("You have unsaved changes. Quit anyway?")) return;
  if (!confirm("Stop the backend server and close this tab?")) return;

  try {
    await api.shutdown();
  } catch (e) {
    /* the backend closes its own connection as it exits, so this request
     * usually errors out even on success — that's expected, not a failure */
  }

  // window.close() only works on tabs JS itself opened; most browsers block
  // it for a normal address-bar/bookmark tab. Attempt it, then fall back to
  // a clear on-screen message so the user knows what to do next.
  window.close();
  setTimeout(() => {
    document.body.innerHTML =
      '<div style="padding:40px;font:16px system-ui;max-width:520px;margin:0 auto;">' +
      '<h2>Backend stopped</h2>' +
      "<p>The server has been shut down. Your browser won't let this tab close itself, " +
      "so you can close this tab manually.</p>" +
      "<p>The frontend file server (the second black console window) is still running — " +
      "close that window too, or leave it, it does nothing without the backend.</p>" +
      "</div>";
  }, 300);
}

async function calibrateAndPreview() {
  if (!currentFigure) return;
  await saveCurrentFigure({ silent: true });
  const recalibrated = await api.calibrateFigure(currentFigure.figure_id);
  currentFigure = recalibrated;
  renderDatasetsPanel();
  await Preview.refresh(currentFigure.figure_id);
}

/* ---------- Progress counter (header) ---------- */

async function updateProgressCounter() {
  const progress = await api.getProgress();
  const total = Object.values(progress).reduce((a, b) => a + b, 0);
  document.getElementById("progress-counter").textContent =
    `${progress.approved || 0}/${total} approved · ${progress.unreviewed || 0} unreviewed`;
}

async function openFigure(figureId) {
  currentFigure = await api.getFigure(figureId);
  isDirty = false;
  // A pending path selection or in-progress dataset edit from whatever
  // figure was open before doesn't mean anything here - those path
  // indices belong to the previous figure's page.
  Curves.cancelEditingDataset();
  document.getElementById("figure-detail").style.display = "block";
  document.getElementById("no-figure-hint").style.display = "none";
  await Viewer.loadPage(currentFigure.page_number);
  refreshViewerOverlay();
  renderFigureMeta();
  renderAxesPanel();
  renderDatasetsPanel();
  await Preview.refresh(currentFigure.figure_id);
  await updateProgressCounter();
}

async function approveAndNext() {
  if (!currentFigure) return;
  await saveCurrentFigure({ silent: true });
  await api.setFigureStatus(currentFigure.figure_id, "approved");
  const unreviewed = await api.listFigures("unreviewed");
  await updateProgressCounter();
  if (unreviewed.length > 0) {
    await openFigure(unreviewed[0].id);
  } else {
    currentFigure = null;
    document.getElementById("figure-detail").style.display = "none";
    document.getElementById("no-figure-hint").style.display = "block";
    document.getElementById("no-figure-hint").textContent = "All figures reviewed!";
  }
}

async function flagCurrent() {
  if (!currentFigure) return;
  await saveCurrentFigure({ silent: true });
  await api.setFigureStatus(currentFigure.figure_id, "flagged");
  await updateProgressCounter();
}

/* ---------- Figure meta / notes ---------- */

function renderFigureMeta() {
  document.getElementById("figure-title").textContent = currentFigure.figure_label;
  document.getElementById("figure-caption").value = currentFigure.caption || "";
  document.getElementById("figure-notes").value = currentFigure.notes || "";
}

/* ---------- Axes panel ---------- */

/* Builds the "Quick fill" chip buttons for an axis card: recently used
 * titles (this browser, most-recent-first) above the common titles pulled
 * from the existing KasperCalc chapter pages. A <select> here was slow to
 * use (open the dropdown, scroll, click) for something meant to save time
 * — plain clickable buttons are one click, no dropdown involved. Each
 * chip's data-preset is a JSON {label, units} pair, parsed back out on
 * click. */
function renderAxisPresetChips() {
  const recents = getRecentAxisTitles();
  const chipFor = (preset) => {
    const text = preset.units ? `${preset.label}, ${preset.units}` : preset.label;
    // encodeURIComponent keeps the JSON out of quote/angle-bracket territory
    // so it's always safe inside an HTML attribute, even if a saved title
    // itself contains an apostrophe or quote (e.g. "Poisson's Ratio").
    return `<button type="button" class="preset-chip" data-preset="${encodeURIComponent(JSON.stringify(preset))}">${escapeHtml(text)}</button>`;
  };
  const recentSection = recents.length
    ? `<div class="preset-chip-group-label">Recently used</div><div class="preset-chip-row">${recents.map(chipFor).join("")}</div>`
    : "";
  const commonSection = `<div class="preset-chip-group-label">Common axis titles</div><div class="preset-chip-row">${COMMON_AXIS_PRESETS.map(chipFor).join("")}</div>`;
  return recentSection + commonSection;
}

/* The data model keeps label and units as separate fields (useful
 * internally — the export code can format them differently), but showing
 * two inputs for "one axis title" was confusing. The UI collapses them
 * into a single "Stress, ksi"-style text field and splits it back apart
 * on the comma when saving. */
function formatAxisTitle(axis) {
  return axis.units ? `${axis.label}, ${axis.units}` : axis.label;
}
function applyAxisTitle(axisId, text) {
  const commaIndex = text.indexOf(",");
  const label = (commaIndex === -1 ? text : text.slice(0, commaIndex)).trim();
  const units = commaIndex === -1 ? "" : text.slice(commaIndex + 1).trim();
  Calibration.updateAxisField(axisId, "label", label);
  Calibration.updateAxisField(axisId, "units", units);
}

/* Always shows a row for every point up to Calibration.defaultPointCount
 * (X1/X2 or Y1/Y2), even before it's been clicked — placeholder rows show
 * "not placed yet" instead of a pixel/value input. This is the WebPlot-
 * Digitizer pattern: the labeled slots are always visible, no popup ever
 * appears, clicking the image fills in a slot's pixel and the value gets
 * typed directly into that row's own input. */
function renderCalibrationPointRows(axis) {
  const rowCount = Math.max(axis.calibration_points.length, Calibration.defaultPointCount);
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const cp = axis.calibration_points[i];
    const label = Calibration.pointLabel(axis, i);
    if (!cp) {
      rows.push(`
        <div class="cal-point-row cal-point-row-empty">
          <span class="cal-point-label">${label}</span>
          <span class="cal-point-pixel hint">not placed — click "Calibrate", then click this point in the image</span>
        </div>
      `);
      continue;
    }
    const hasValue = cp.value !== null && cp.value !== undefined;
    rows.push(`
      <div class="cal-point-row">
        <span class="cal-point-label">${label}</span>
        <span class="cal-point-pixel">px (${cp.pixel[0].toFixed(1)}, ${cp.pixel[1].toFixed(1)})</span>
        <input type="number" step="any" data-cal-index="${i}" placeholder="value" ${hasValue ? `value="${cp.value}"` : ""} />
        <button class="small-btn" data-action="remove-cal-point" data-cal-index="${i}">✕</button>
      </div>
    `);
  }
  return rows.join("");
}

// Which axes currently have their "Quick fill" chip panel expanded. Module-
// level (not per-figure data) since it's pure UI state that should persist
// across re-renders but reset to collapsed for axes we haven't touched -
// the chip panel is the single biggest source of vertical space per axis
// card, so keeping it collapsed by default is most of the space savings.
const axisQuickFillExpanded = new Set();

function renderAxesPanel() {
  if (!currentFigure) return;
  const container = document.getElementById("axes-list");
  container.innerHTML = "";
  currentFigure.axes.forEach((axis) => {
    const card = document.createElement("div");
    card.className = "axis-card";
    card.dataset.axisId = axis.axis_id;
    const calibrating = Calibration.isCalibrating() && Calibration.activeAxisId() === axis.axis_id;
    const quickFillOpen = axisQuickFillExpanded.has(axis.axis_id);
    const presetChips = renderAxisPresetChips();
    card.innerHTML = `
      <div class="title">
        <span>${axis.axis_id} (${axis.orientation})</span>
        <button class="small-btn" data-action="remove">✕</button>
      </div>
      <div class="field-row">
        <div class="flex-2">
          <label>Axis title <span class="tooltip-wrap"><span class="tooltip-icon" tabindex="0">i</span><span class="tooltip-box">The axis name and units together, e.g. "Stress, ksi" — put the units after a comma if it has any. Shown in the Live Preview chart and the exported Chart.js config; doesn't affect the pixel-to-data math.</span></span></label>
          <input type="text" data-field="title" value="${escapeHtml(formatAxisTitle(axis))}" placeholder="e.g. Stress, ksi" />
        </div>
        <div>
          <label>Scale <span class="tooltip-wrap"><span class="tooltip-icon" tabindex="0">i</span><span class="tooltip-box">Linear or log. This changes the actual math used to convert pixel positions into real values — pick log for axes plotted logarithmically, such as cycles in an S-N fatigue chart.</span></span></label>
          <select data-field="scale">
            <option value="linear" ${axis.scale === "linear" ? "selected" : ""}>Linear</option>
            <option value="log" ${axis.scale === "log" ? "selected" : ""}>Log</option>
          </select>
        </div>
      </div>
      <button class="small-btn" data-action="toggle-quick-fill" style="margin:4px 0;">${quickFillOpen ? "Hide quick fill titles ▲" : "Quick fill a title ▾"}</button>
      <div class="preset-chips" style="${quickFillOpen ? "" : "display:none;"}">${presetChips}</div>
      <label>Calibration points <span class="tooltip-wrap"><span class="tooltip-icon" tabindex="0">i</span><span class="tooltip-box">The known pixel-to-value correspondences for this axis, named the way WebPlotDigitizer names them (X1/X2 or Y1/Y2). No popups: click "Calibrate" then click each point on the page image, and type its real value directly into the row that appears here. Edit a value any time, or ✕ to remove just that one point.</span></span></label>
      <div class="cal-points-list">${renderCalibrationPointRows(axis)}</div>
      <div class="field-row">
        <button data-action="calibrate" title="Click, then click this axis's known points on the page image — each click fills the next X1/X2 row below, where you type its real value. This calibration is what every dataset assigned to this axis is converted with — get it right first.">${calibrating ? "Calibrating… (click the image)" : "Calibrate"}</button>
        <button class="small-btn" data-action="clear-cal" title="Deletes all calibration points for this axis so you can start over.">Clear pts</button>
      </div>
    `;
    card.querySelector('[data-field="title"]').addEventListener("change", (e) => {
      applyAxisTitle(axis.axis_id, e.target.value);
    });
    card.querySelector('[data-field="scale"]').addEventListener("change", (e) => {
      Calibration.updateAxisField(axis.axis_id, "scale", e.target.value);
    });
    card.querySelector('[data-action="toggle-quick-fill"]').addEventListener("click", () => {
      if (axisQuickFillExpanded.has(axis.axis_id)) {
        axisQuickFillExpanded.delete(axis.axis_id);
      } else {
        axisQuickFillExpanded.add(axis.axis_id);
      }
      renderAxesPanel();
    });
    card.querySelectorAll(".preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const preset = JSON.parse(decodeURIComponent(chip.dataset.preset));
        Calibration.updateAxisField(axis.axis_id, "label", preset.label);
        Calibration.updateAxisField(axis.axis_id, "units", preset.units);
        renderAxesPanel();
      });
    });
    card.querySelector('[data-action="remove"]').addEventListener("click", () => {
      Calibration.removeAxis(axis.axis_id);
    });
    card.querySelector('[data-action="calibrate"]').addEventListener("click", () => {
      if (calibrating) {
        Calibration.stopCalibrating();
      } else {
        Calibration.startCalibratingAxis(axis.axis_id);
      }
      renderAxesPanel();
    });
    card.querySelector('[data-action="clear-cal"]').addEventListener("click", () => {
      Calibration.clearCalibrationPoints(axis.axis_id);
      Viewer.clearCalibrationMarkers();
    });
    card.querySelectorAll("[data-cal-index]").forEach((el) => {
      const index = Number(el.dataset.calIndex);
      if (el.matches("input")) {
        // Click-to-select-all so typing immediately overwrites whatever was
        // there, instead of needing to select the text first.
        el.addEventListener("focus", (e) => e.target.select());
        el.addEventListener("change", (e) => {
          if (e.target.value.trim() === "") {
            Calibration.updateCalibrationPointValue(axis.axis_id, index, null);
            return;
          }
          const numeric = Number(e.target.value);
          if (Number.isNaN(numeric)) return;
          Calibration.updateCalibrationPointValue(axis.axis_id, index, numeric);
        });
      } else {
        el.addEventListener("click", () => {
          Calibration.removeCalibrationPoint(axis.axis_id, index);
          Viewer.clearCalibrationMarkers();
          renderAxesPanel();
        });
      }
    });
    container.appendChild(card);
  });

  // If a click just placed a calibration point, move focus straight into
  // that row's value input so the user can type the number immediately —
  // no popup, no extra click needed to get there.
  const placed = Calibration.consumeLastPlaced();
  if (placed) {
    const input = container.querySelector(
      `.axis-card[data-axis-id="${placed.axisId}"] input[data-cal-index="${placed.index}"]`
    );
    if (input) {
      input.focus();
      input.select();
    }
  }
}

/* ---------- Datasets panel ---------- */

function renderDatasetsPanel() {
  if (!currentFigure) return;
  const container = document.getElementById("datasets-list");
  container.innerHTML = "";

  const selectedPaths = Curves.getSelectedPathIndices();
  document.getElementById("selected-paths-count").textContent = selectedPaths.length;

  const editingId = Curves.getEditingDatasetId();
  document.getElementById("dataset-edit-banner").style.display = editingId ? "block" : "none";
  document.getElementById("new-dataset-form").style.display = editingId ? "none" : "block";
  if (editingId) {
    const editingDs = currentFigure.datasets.find((d) => d.dataset_id === editingId);
    document.getElementById("dataset-edit-label").textContent = editingDs ? editingDs.label : "";
  }

  currentFigure.datasets.forEach((ds) => {
    const card = document.createElement("div");
    card.className = "dataset-card" + (ds.dataset_id === editingId ? " editing" : "");
    const axisOptionsX = currentFigure.axes
      .filter((a) => a.orientation === "x")
      .map((a) => `<option value="${a.axis_id}" ${a.axis_id === ds.axis_x ? "selected" : ""}>${a.axis_id}</option>`)
      .join("");
    const axisOptionsY = currentFigure.axes
      .filter((a) => a.orientation === "y")
      .map((a) => `<option value="${a.axis_id}" ${a.axis_id === ds.axis_y ? "selected" : ""}>${a.axis_id}</option>`)
      .join("");
    const hasSourcePaths = (ds.source_path_indices || []).length > 0;
    const isHidden = ds.visible === false;
    card.innerHTML = `
      <div class="title">
        <span><span class="swatch" style="background:${ds.style.color || "#2f6f8f"}"></span>${escapeHtml(ds.label)}</span>
        <button class="small-btn" data-action="remove">✕</button>
      </div>
      <div class="field-row">
        <div class="flex-2">
          <label>Label</label>
          <input type="text" data-field="label" value="${escapeHtml(ds.label)}" />
        </div>
        <div>
          <label>X axis</label>
          <select data-field="axis_x">${axisOptionsX}</select>
        </div>
        <div>
          <label>Y axis</label>
          <select data-field="axis_y">${axisOptionsY}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="flex-shrink">
          <label>Color</label>
          <input type="color" data-field="style.color" value="${ds.style.color || "#3a6270"}" />
        </div>
        <div class="flex-shrink">
          <label>Width</label>
          <input type="number" data-field="style.width" value="${ds.style.width || 3}" min="1" max="10" step="0.5" />
        </div>
        <p class="hint dataset-point-count" title="Raw points are the untouched pixel coordinates pulled from the PDF. Calibrated points are what you get after applying the assigned axes' calibration — click &quot;Calibrate + Preview&quot; to recompute them. These are the numbers in the final export.">${ds.raw_path_points.length} raw points<br>${ds.calibrated_points.length} calibrated</p>
      </div>
      <div class="field-row">
        <button
          class="small-btn"
          data-action="edit-selection"
          ${editingId ? "disabled" : ""}
          title="${hasSourcePaths
            ? "Click segments in the viewer to add or remove them from this dataset."
            : "This dataset was created before segment membership was tracked, so editing starts from no selection — click the segments that should make it up, then Apply."}"
        >Edit selection</button>
        <button
          class="small-btn"
          data-action="toggle-visible"
          title="Toggle whether this dataset's segments show their colored overlay on the page image. Doesn't delete or change the dataset, just hides the highlight."
        >${isHidden ? "Show line" : "Hide line"}</button>
      </div>
    `;
    card.querySelector('[data-field="label"]').addEventListener("change", (e) => {
      Curves.updateDatasetField(ds.dataset_id, "label", e.target.value);
    });
    card.querySelector('[data-field="axis_x"]').addEventListener("change", (e) => {
      Curves.updateDatasetField(ds.dataset_id, "axis_x", e.target.value);
    });
    card.querySelector('[data-field="axis_y"]').addEventListener("change", (e) => {
      Curves.updateDatasetField(ds.dataset_id, "axis_y", e.target.value);
    });
    card.querySelector('[data-field="style.color"]').addEventListener("input", (e) => {
      Curves.updateDatasetField(ds.dataset_id, "style.color", e.target.value);
      // Update the swatch dot directly instead of a full renderDatasetsPanel()
      // re-render, since "input" fires continuously while dragging the
      // color picker and a full re-render would be janky and drop focus.
      card.querySelector(".swatch").style.background = e.target.value;
      refreshViewerOverlay();
    });
    card.querySelector('[data-field="style.width"]').addEventListener("change", (e) => {
      const width = Number(e.target.value);
      if (Number.isNaN(width) || width <= 0) return;
      Curves.updateDatasetField(ds.dataset_id, "style.width", width);
      refreshViewerOverlay();
    });
    card.querySelector('[data-action="remove"]').addEventListener("click", () => {
      Curves.removeDataset(ds.dataset_id);
      refreshViewerOverlay();
    });
    card.querySelector('[data-action="edit-selection"]').addEventListener("click", () => {
      Curves.startEditingDataset(ds.dataset_id);
      refreshViewerOverlay();
    });
    card.querySelector('[data-action="toggle-visible"]').addEventListener("click", () => {
      Curves.toggleDatasetVisibility(ds.dataset_id);
      refreshViewerOverlay();
    });
    container.appendChild(card);
  });
}

function createDatasetFromForm() {
  const label = document.getElementById("new-dataset-label").value.trim();
  const axisX = document.getElementById("new-dataset-axis-x").value;
  const axisY = document.getElementById("new-dataset-axis-y").value;
  if (!axisX || !axisY) {
    alert("Add an x and y axis first.");
    return;
  }
  const ds = Curves.createDatasetFromSelection(label, axisX, axisY);
  if (ds) {
    document.getElementById("new-dataset-label").value = "";
    refreshViewerOverlay();
  }
}

function populateNewDatasetAxisOptions() {
  const xSel = document.getElementById("new-dataset-axis-x");
  const ySel = document.getElementById("new-dataset-axis-y");
  xSel.innerHTML = currentFigure.axes
    .filter((a) => a.orientation === "x")
    .map((a) => `<option value="${a.axis_id}">${a.axis_id}</option>`)
    .join("");
  ySel.innerHTML = currentFigure.axes
    .filter((a) => a.orientation === "y")
    .map((a) => `<option value="${a.axis_id}">${a.axis_id}</option>`)
    .join("");
}

/* ---------- Utilities ---------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Init ---------- */

function wireStaticControls() {
  document.getElementById("save-figure-btn").addEventListener("click", () => saveCurrentFigure());
  document.getElementById("calibrate-btn").addEventListener("click", calibrateAndPreview);
  document.getElementById("approve-next-btn").addEventListener("click", approveAndNext);
  document.getElementById("flag-btn").addEventListener("click", flagCurrent);
  document.getElementById("add-x-axis-btn").addEventListener("click", () => {
    Calibration.addAxis("x");
    populateNewDatasetAxisOptions();
  });
  document.getElementById("add-y-axis-btn").addEventListener("click", () => {
    Calibration.addAxis("y");
    populateNewDatasetAxisOptions();
  });
  document.getElementById("create-dataset-btn").addEventListener("click", createDatasetFromForm);
  document.getElementById("clear-path-selection-btn").addEventListener("click", () => {
    Curves.clearPathSelection();
    refreshViewerOverlay();
  });
  document.getElementById("dataset-edit-apply-btn").addEventListener("click", () => {
    Curves.applyEditingSelection();
    refreshViewerOverlay();
  });
  document.getElementById("dataset-edit-cancel-btn").addEventListener("click", () => {
    Curves.cancelEditingDataset();
    refreshViewerOverlay();
  });
  document.getElementById("quit-btn").addEventListener("click", quitApp);

  ["figure-caption", "figure-notes"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      if (!currentFigure) return;
      const fieldMap = { "figure-caption": "caption", "figure-notes": "notes" };
      currentFigure[fieldMap[id]] = e.target.value;
      isDirty = true;
    });
  });
}

async function init() {
  wireStaticControls();
  Catalog.wireControls();
  Calibration.init({
    getFigure,
    onChange: () => {
      markDirty();
      populateNewDatasetAxisOptions();
    },
  });
  Curves.init({
    getFigure,
    onChange: () => {
      markDirty();
      // Re-highlight every selected path, not just the last one clicked —
      // this is what lets you see all the segments of a broken/interrupted
      // curve you've gathered so far before grouping them into one dataset.
      refreshViewerOverlay();
    },
  });
  // Calibration.init() above already wired Viewer's pathClick (to
  // Curves.handlePathClick) and stageClick (to its own handler) — don't
  // override stageClick here or axis calibration clicks stop working.
  await updateProgressCounter();
  // The catalog is the landing view; the editor (actions/viewer/detail panels)
  // is only shown once the user opens a figure from a catalog row.
  Catalog.showCatalogView();
}

document.addEventListener("DOMContentLoaded", init);
