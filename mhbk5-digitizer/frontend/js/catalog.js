/* Catalog landing view: build/browse the scanned index of figures found in
 * the PDF, search by page or figure number, and hand off to the editor
 * (app.js's openFigure) when the user clicks "Open" on a row. */

const Catalog = (() => {
  let searchDebounceTimer = null;

  function showCatalogView() {
    document.getElementById("catalog-view").style.display = "block";
    document.getElementById("editor-view").style.display = "none";
    document.getElementById("back-to-catalog-btn").style.display = "none";
    document.getElementById("header-editor-actions").style.display = "none";
    refresh();
  }

  function showEditorView() {
    document.getElementById("catalog-view").style.display = "none";
    document.getElementById("editor-view").style.display = "grid";
    document.getElementById("back-to-catalog-btn").style.display = "inline-block";
    document.getElementById("header-editor-actions").style.display = "flex";
  }

  async function refresh() {
    await refreshSummary();
    await refreshRows();
  }

  async function refreshSummary() {
    const summary = await api.getCatalogSummary();
    document.getElementById("catalog-summary").textContent =
      `${summary.completed} of ${summary.total} figures completed`;
  }

  async function refreshRows() {
    const pageVal = document.getElementById("catalog-page-search").value.trim();
    const searchVal = document.getElementById("catalog-label-search").value.trim();
    const incompleteOnly = document.getElementById("catalog-incomplete-only").checked;

    const entries = await api.listCatalog({
      page: pageVal === "" ? undefined : pageVal,
      search: searchVal === "" ? undefined : searchVal,
      completed: incompleteOnly ? "false" : undefined,
    });

    const tbody = document.getElementById("catalog-rows");
    tbody.innerHTML = "";
    document.getElementById("catalog-empty-hint").style.display = entries.length === 0 ? "block" : "none";

    entries.forEach((entry) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" data-action="completed" ${entry.completed ? "checked" : ""} /></td>
        <td>${escapeHtml(entry.figure_label)}</td>
        <td>${entry.page_number}</td>
        <td><button class="small-btn" data-action="open">Open</button></td>
      `;
      tr.querySelector('[data-action="completed"]').addEventListener("change", async (e) => {
        await api.setCatalogCompleted(entry.id, e.target.checked);
        await refreshSummary();
      });
      tr.querySelector('[data-action="open"]').addEventListener("click", async () => {
        const { figure_id } = await api.openCatalogEntry(entry.id);
        showEditorView();
        await openFigure(figure_id);
      });
      tbody.appendChild(tr);
    });
  }

  async function buildCatalog() {
    const btn = document.getElementById("build-catalog-btn");
    const status = document.getElementById("catalog-build-status");
    btn.disabled = true;
    status.textContent = "Scanning the PDF for figures… this can take up to a minute.";
    try {
      const result = await api.buildCatalog();
      status.textContent = `Scanned ${result.scanned_pages} pages, found ${result.entries_found} figure mentions (${result.entries_inserted} new).`;
      await refresh();
    } catch (e) {
      status.textContent = `Build failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  function debouncedRefreshRows() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(refreshRows, 300);
  }

  function wireControls() {
    document.getElementById("build-catalog-btn").addEventListener("click", buildCatalog);
    document.getElementById("catalog-page-search").addEventListener("input", debouncedRefreshRows);
    document.getElementById("catalog-label-search").addEventListener("input", debouncedRefreshRows);
    document.getElementById("catalog-incomplete-only").addEventListener("change", refreshRows);
    document.getElementById("back-to-catalog-btn").addEventListener("click", showCatalogView);
    document.getElementById("toggle-instructions-btn").addEventListener("click", () => {
      const body = document.getElementById("instructions-body");
      const btn = document.getElementById("toggle-instructions-btn");
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "block" : "none";
      btn.textContent = hidden ? "Hide" : "Show";
    });
  }

  return { showCatalogView, showEditorView, wireControls, refresh };
})();
