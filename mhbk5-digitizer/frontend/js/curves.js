/* Curve (dataset) selection, labeling, merging and splitting. A "dataset"
 * groups one or more candidate paths (by index into Viewer.getCurrentPaths())
 * that together trace one labeled curve; raw_path_points is the merged,
 * de-duplicated point list from all member paths in x order. */

const Curves = (() => {
  let getFigure = null;
  let onChange = null;
  let selectedPathIndices = []; // paths chosen for the next "create dataset" action
  let editingDatasetId = null; // non-null while adjusting an existing dataset's segments
  // Same chart palette used across the KasperCalc site (see e.g. the `PAL`
  // array in Chapter2.3(steel).html) so digitized curves look consistent
  // with the rest of the site instead of a generic/default color set.
  const DATASET_COLORS = [
    "#3a6270", "#c87941", "#5a9aaa", "#b34040", "#4a7a4a", "#7a5a8a",
    "#40a0c0", "#a08040", "#2a4a55", "#c04060", "#3a7a5a", "#806030",
  ];
  const DEFAULT_LINE_WIDTH = 3; // thick by default, per user preference

  function init({ getFigure: gf, onChange: oc }) {
    getFigure = gf;
    onChange = oc;
  }

  function handlePathClick(pathIndex) {
    const idx = selectedPathIndices.indexOf(pathIndex);
    if (idx === -1) {
      selectedPathIndices.push(pathIndex);
    } else {
      selectedPathIndices.splice(idx, 1);
    }
    onChange();
  }

  function clearPathSelection() {
    selectedPathIndices = [];
    onChange();
  }

  function getSelectedPathIndices() {
    return selectedPathIndices.slice();
  }

  function mergePointsFromPaths(pathIndices) {
    const paths = Viewer.getCurrentPaths();
    const points = [];
    pathIndices.forEach((idx) => {
      const path = paths[idx];
      if (path && path.points) points.push(...path.points);
    });
    // sort by x pixel so the polyline reads left-to-right
    points.sort((a, b) => a[0] - b[0]);
    return points;
  }

  function createDatasetFromSelection(label, axisX, axisY) {
    if (selectedPathIndices.length === 0) {
      alert("Click one or more curve paths in the viewer first.");
      return null;
    }
    const figure = getFigure();
    const id = `ds-${(label || "curve").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${figure.datasets.length}`;
    const color = DATASET_COLORS[figure.datasets.length % DATASET_COLORS.length];
    const dataset = {
      dataset_id: id,
      label: label || `Curve ${figure.datasets.length + 1}`,
      axis_x: axisX,
      axis_y: axisY,
      raw_path_points: mergePointsFromPaths(selectedPathIndices),
      calibrated_points: [],
      style: { color, width: DEFAULT_LINE_WIDTH, dash: "solid" },
      source_path_indices: selectedPathIndices.slice(),
      visible: true,
    };
    figure.datasets.push(dataset);
    selectedPathIndices = [];
    onChange();
    return dataset;
  }

  /* ---------- Editing an existing dataset's segment membership ---------- */

  // Loads a dataset's known member paths back into the pending selection so
  // they show highlighted, and switches the UI into "editing" mode (see
  // app.js's renderDatasetsPanel) instead of the normal "create new
  // dataset" form. Datasets saved before source_path_indices existed start
  // from an empty selection - there's no way to recover which paths they
  // came from once merged into plain points.
  function startEditingDataset(datasetId) {
    const figure = getFigure();
    const ds = figure.datasets.find((d) => d.dataset_id === datasetId);
    if (!ds) return;
    editingDatasetId = datasetId;
    selectedPathIndices = (ds.source_path_indices || []).slice();
    onChange();
  }

  function cancelEditingDataset() {
    editingDatasetId = null;
    selectedPathIndices = [];
    onChange();
  }

  // Re-merges raw_path_points from whatever is currently selected (which
  // may have had paths added or removed since startEditingDataset) into
  // the dataset being edited, in place - keeps its label/axes/style, just
  // changes which segments make it up. Calibrated points are cleared since
  // they're now stale; "Calibrate + Preview" recomputes them.
  function applyEditingSelection() {
    if (!editingDatasetId) return null;
    const figure = getFigure();
    const ds = figure.datasets.find((d) => d.dataset_id === editingDatasetId);
    if (!ds) return null;
    if (selectedPathIndices.length === 0) {
      alert("Click at least one curve path in the viewer first (or Cancel to leave this dataset unchanged).");
      return null;
    }
    ds.raw_path_points = mergePointsFromPaths(selectedPathIndices);
    ds.source_path_indices = selectedPathIndices.slice();
    ds.calibrated_points = [];
    editingDatasetId = null;
    selectedPathIndices = [];
    onChange();
    return ds;
  }

  function isEditingDataset() {
    return editingDatasetId !== null;
  }

  function getEditingDatasetId() {
    return editingDatasetId;
  }

  function removeDataset(datasetId) {
    const figure = getFigure();
    figure.datasets = figure.datasets.filter((d) => d.dataset_id !== datasetId);
    if (editingDatasetId === datasetId) {
      editingDatasetId = null;
      selectedPathIndices = [];
    }
    onChange();
  }

  function updateDatasetField(datasetId, field, value) {
    const figure = getFigure();
    const ds = figure.datasets.find((d) => d.dataset_id === datasetId);
    if (!ds) return;
    if (field.startsWith("style.")) {
      ds.style[field.split(".")[1]] = value;
    } else {
      ds[field] = value;
    }
    onChange();
  }

  function toggleDatasetVisibility(datasetId) {
    const figure = getFigure();
    const ds = figure.datasets.find((d) => d.dataset_id === datasetId);
    if (!ds) return;
    ds.visible = ds.visible === false; // flip; undefined/true -> false, false -> true
    onChange();
  }

  // {pathIndex: {color, width}} for every visible dataset's known member
  // paths, so the viewer can keep every finished dataset's overlay drawn
  // in its own color at once - by the end of digitizing a figure with 4
  // curves, all 4 should show simultaneously, not just whichever one was
  // clicked most recently.
  function getDatasetAssignments() {
    const figure = getFigure();
    if (!figure) return {};
    const assignments = {};
    figure.datasets.forEach((ds) => {
      if (ds.visible === false) return;
      (ds.source_path_indices || []).forEach((idx) => {
        assignments[idx] = { color: ds.style.color, width: ds.style.width || DEFAULT_LINE_WIDTH };
      });
    });
    return assignments;
  }

  function splitDataset(datasetId, splitIndex) {
    const figure = getFigure();
    const ds = figure.datasets.find((d) => d.dataset_id === datasetId);
    if (!ds) return;
    const firstHalf = ds.raw_path_points.slice(0, splitIndex);
    const secondHalf = ds.raw_path_points.slice(splitIndex);
    if (firstHalf.length === 0 || secondHalf.length === 0) return;
    ds.raw_path_points = firstHalf;
    ds.calibrated_points = [];
    // Both halves' points no longer correspond 1:1 with ds's original
    // source paths, so "Edit selection" can't reliably re-derive either
    // half's membership afterward - clear it rather than leave it wrong.
    ds.source_path_indices = [];
    const newId = `${ds.dataset_id}-b`;
    figure.datasets.push({
      dataset_id: newId,
      label: `${ds.label} (part 2)`,
      axis_x: ds.axis_x,
      axis_y: ds.axis_y,
      raw_path_points: secondHalf,
      calibrated_points: [],
      style: { ...ds.style },
      source_path_indices: [],
    });
    onChange();
  }

  function mergeDatasets(datasetIdA, datasetIdB) {
    const figure = getFigure();
    const a = figure.datasets.find((d) => d.dataset_id === datasetIdA);
    const b = figure.datasets.find((d) => d.dataset_id === datasetIdB);
    if (!a || !b) return;
    a.raw_path_points = a.raw_path_points.concat(b.raw_path_points).sort((p, q) => p[0] - q[0]);
    a.calibrated_points = [];
    a.source_path_indices = (a.source_path_indices || []).concat(b.source_path_indices || []);
    figure.datasets = figure.datasets.filter((d) => d.dataset_id !== datasetIdB);
    onChange();
  }

  return {
    init,
    handlePathClick,
    clearPathSelection,
    getSelectedPathIndices,
    createDatasetFromSelection,
    startEditingDataset,
    cancelEditingDataset,
    applyEditingSelection,
    isEditingDataset,
    getEditingDatasetId,
    removeDataset,
    updateDatasetField,
    toggleDatasetVisibility,
    getDatasetAssignments,
    splitDataset,
    mergeDatasets,
  };
})();
