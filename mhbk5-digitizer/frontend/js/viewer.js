/* Renders the page background image + SVG overlay of extracted candidate
 * paths, color-coded by classification guess. Handles click-to-select of
 * a path (for curve labeling) and click-to-place calibration points (in
 * calibration mode, see calibration.js). */

const Viewer = (() => {
  let currentPageNumber = null;
  let currentPaths = [];
  let onPathClick = null; // callback(pathIndex, pathData)
  let onStageClick = null; // callback({x, y}) used by calibration mode
  let mode = "select"; // "select" | "calibrate"

  const stage = document.getElementById("viewer-stage");
  const img = document.getElementById("page-image");
  const svg = document.getElementById("overlay-svg");

  function setMode(newMode) {
    mode = newMode;
  }

  function setCallbacks({ pathClick, stageClick }) {
    onPathClick = pathClick || null;
    onStageClick = stageClick || null;
  }

  async function loadPage(pageNumber) {
    currentPageNumber = pageNumber;
    img.src = api.pageImageUrl(pageNumber);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    svg.setAttribute("width", img.naturalWidth);
    svg.setAttribute("height", img.naturalHeight);
    svg.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    stage.style.width = `${img.naturalWidth}px`;
    stage.style.height = `${img.naturalHeight}px`;

    const result = await api.getPagePaths(pageNumber);
    currentPaths = result.paths;
    renderPaths();
  }

  function pointsToPolylinePoints(points) {
    return points.map((p) => `${p[0]},${p[1]}`).join(" ");
  }

  // `selectedIndices` is the full set of paths currently picked for the
  // next "create dataset" action (Curves.getSelectedPathIndices()) - every
  // one of them gets highlighted, not just the most recently clicked, so
  // you can see all the broken-line segments you've gathered so far before
  // grouping them into one dataset.
  function renderPaths(selectedIndices = [], assignments = {}) {
    svg.querySelectorAll(".overlay-path").forEach((el) => el.remove());
    currentPaths.forEach((path, idx) => {
      if (!path.points || path.points.length < 2) return;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      el.setAttribute("points", pointsToPolylinePoints(path.points));
      el.classList.add("overlay-path", path.classification || "unknown");
      if (selectedIndices.includes(idx)) el.classList.add("selected");
      const assignment = assignments[idx];
      if (assignment) {
        el.classList.add("assigned");
        el.style.stroke = assignment.color;
        if (assignment.width) el.style.strokeWidth = assignment.width;
      }
      el.dataset.pathIndex = idx;
      el.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (mode === "select" && onPathClick) onPathClick(idx, path);
      });
      svg.appendChild(el);
    });
  }

  function drawCalibrationMarker(x, y, labelText) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("calib-marker");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 5);
    circle.classList.add("calib-point");
    g.appendChild(circle);
    if (labelText) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x + 8);
      text.setAttribute("y", y - 8);
      text.setAttribute("fill", "#3a8a5c");
      text.setAttribute("font-size", "11");
      text.textContent = labelText;
      g.appendChild(text);
    }
    svg.appendChild(g);
    return g;
  }

  function clearCalibrationMarkers() {
    svg.querySelectorAll(".calib-marker").forEach((el) => el.remove());
  }

  stage.addEventListener("click", (evt) => {
    if (mode !== "calibrate" || !onStageClick) return;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;
    onStageClick({ x, y });
  });

  return {
    loadPage,
    renderPaths,
    setMode,
    setCallbacks,
    drawCalibrationMarker,
    clearCalibrationMarkers,
    getCurrentPaths: () => currentPaths,
    getCurrentPageNumber: () => currentPageNumber,
  };
})();
