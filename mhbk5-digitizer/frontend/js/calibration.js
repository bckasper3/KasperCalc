/* Axis calibration UI: click-to-calibrate on the viewer stage, plus the
 * axis list panel (add axis, set orientation/scale/label/units, view
 * calibration points, clear/reset). Operates on the currently loaded
 * figure object owned by app.js (passed in via init()). */

const Calibration = (() => {
  let getFigure = null; // () => figure object
  let onChange = null; // () => void, called after mutating the figure
  let activeAxisId = null; // axis currently accepting clicks
  let lastPlaced = null; // {axisId, index} of the point just placed by a click, for auto-focusing its value input

  // WebPlotDigitizer's calibration UX has no popups: clicking the image
  // just places a point's pixel location, and its data value is typed
  // directly into an always-visible input in the sidebar (X1/X2/Y1/Y2).
  // Every axis by default needs exactly 2 points to calibrate (a straight
  // line needs 2 knowns); more can be added by clicking "Calibrate" again.
  const DEFAULT_POINT_COUNT = 2;

  // Point naming matches WebPlotDigitizer's convention: the two calibration
  // points on an axis are "X1"/"X2" (or "Y1"/"Y2"), not the axis's own id.
  function pointLabel(axis, index) {
    return `${axis.orientation.toUpperCase()}${index + 1}`;
  }

  function init({ getFigure: gf, onChange: oc }) {
    getFigure = gf;
    onChange = oc;
    Viewer.setCallbacks({
      pathClick: Curves ? Curves.handlePathClick : null,
      stageClick: handleStageClick,
    });
  }

  function addAxis(orientation) {
    const figure = getFigure();
    const id = `${orientation}${figure.axes.filter((a) => a.orientation === orientation).length + 1}`;
    figure.axes.push({
      axis_id: id,
      orientation,
      scale: "linear",
      label: orientation === "x" ? "X Axis" : "Y Axis",
      units: "",
      calibration_points: [],
    });
    onChange();
    return id;
  }

  function removeAxis(axisId) {
    const figure = getFigure();
    figure.axes = figure.axes.filter((a) => a.axis_id !== axisId);
    onChange();
  }

  function updateAxisField(axisId, field, value) {
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === axisId);
    if (!axis) return;
    axis[field] = value;
    onChange();
  }

  function startCalibratingAxis(axisId) {
    activeAxisId = axisId;
    Viewer.setMode("calibrate");
    Viewer.clearCalibrationMarkers();
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === axisId);
    if (axis) {
      axis.calibration_points.forEach((cp, i) => {
        Viewer.drawCalibrationMarker(cp.pixel[0], cp.pixel[1], pointLabel(axis, i));
      });
    }
  }

  function stopCalibrating() {
    activeAxisId = null;
    Viewer.setMode("select");
  }

  // Click just places the point's pixel location — no popup. The value
  // gets typed directly into that point's row in the sidebar afterward
  // (app.js focuses it automatically; see consumeLastPlaced()). Once the
  // axis has its default 2 points, calibration mode exits on its own so
  // the user doesn't have to remember to click "Calibrate" again to stop.
  function handleStageClick({ x, y }) {
    if (!activeAxisId) return;
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === activeAxisId);
    if (!axis) return;

    // value starts unset (null), not 0 - 0 is a legitimate real value (e.g.
    // strain starting at 0) and defaulting to it would be indistinguishable
    // from the user having actually typed it. The row's input just shows
    // blank until they type something; see app.js's renderCalibrationPointRows.
    axis.calibration_points.push({ pixel: [x, y], value: null });
    const index = axis.calibration_points.length - 1;
    Viewer.drawCalibrationMarker(x, y, pointLabel(axis, index));
    lastPlaced = { axisId: axis.axis_id, index };
    onChange();

    if (axis.calibration_points.length >= DEFAULT_POINT_COUNT) {
      stopCalibrating();
    }
  }

  // Returns and clears the {axisId, index} of the point a click just
  // placed, so app.js can focus that row's value input right after
  // re-rendering. One-shot: calling this a second time returns null.
  function consumeLastPlaced() {
    const point = lastPlaced;
    lastPlaced = null;
    return point;
  }

  function clearCalibrationPoints(axisId) {
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === axisId);
    if (!axis) return;
    axis.calibration_points = [];
    onChange();
  }

  function updateCalibrationPointValue(axisId, index, value) {
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === axisId);
    if (!axis || !axis.calibration_points[index]) return;
    axis.calibration_points[index].value = value;
    onChange();
  }

  function removeCalibrationPoint(axisId, index) {
    const figure = getFigure();
    const axis = figure.axes.find((a) => a.axis_id === axisId);
    if (!axis) return;
    axis.calibration_points.splice(index, 1);
    onChange();
  }

  return {
    init,
    addAxis,
    removeAxis,
    updateAxisField,
    startCalibratingAxis,
    stopCalibrating,
    clearCalibrationPoints,
    updateCalibrationPointValue,
    removeCalibrationPoint,
    pointLabel,
    consumeLastPlaced,
    defaultPointCount: DEFAULT_POINT_COUNT,
    isCalibrating: () => activeAxisId !== null,
    activeAxisId: () => activeAxisId,
  };
})();
