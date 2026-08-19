/* Thin fetch wrapper around the backend REST API. */

const API_BASE = window.MHBK5_API_BASE || "http://127.0.0.1:8000";

async function apiRequest(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${API_BASE}${path}`, opts);
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const errBody = await resp.json();
      detail = errBody.detail || JSON.stringify(errBody);
    } catch (e) {
      /* ignore parse failure, keep statusText */
    }
    throw new Error(`${method} ${path} failed (${resp.status}): ${detail}`);
  }
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return resp.json();
  return resp.blob();
}

const api = {
  scanPage: (pageNumber) => apiRequest("GET", `/api/pages/${pageNumber}/scan`),
  pageImageUrl: (pageNumber, dpi = 200) => `${API_BASE}/api/pages/${pageNumber}/image?dpi=${dpi}`,
  getPagePaths: (pageNumber) => apiRequest("GET", `/api/pages/${pageNumber}/paths`),

  createFigure: (payload) => apiRequest("POST", "/api/figures", payload),
  getFigure: (id) => apiRequest("GET", `/api/figures/${id}`),
  updateFigure: (id, figure) => apiRequest("PUT", `/api/figures/${id}`, figure),
  calibrateFigure: (id) => apiRequest("POST", `/api/figures/${id}/calibrate`),
  setFigureStatus: (id, status) => apiRequest("PUT", `/api/figures/${id}/status`, { status }),
  listFigures: (status) => apiRequest("GET", `/api/figures${status ? `?status=${status}` : ""}`),
  getProgress: () => apiRequest("GET", "/api/progress"),
  exportFigure: (id) => apiRequest("GET", `/api/figures/${id}/export`),
  shutdown: () => apiRequest("POST", "/api/shutdown"),

  buildCatalog: () => apiRequest("POST", "/api/catalog/build"),
  listCatalog: ({ page, search, completed } = {}) => {
    const params = new URLSearchParams();
    if (page !== undefined && page !== null && page !== "") params.set("page", page);
    if (search) params.set("search", search);
    if (completed !== undefined && completed !== null) params.set("completed", completed);
    const qs = params.toString();
    return apiRequest("GET", `/api/catalog${qs ? `?${qs}` : ""}`);
  },
  getCatalogSummary: () => apiRequest("GET", "/api/catalog/summary"),
  setCatalogCompleted: (id, completed) => apiRequest("PUT", `/api/catalog/${id}/completed`, { completed }),
  openCatalogEntry: (id) => apiRequest("POST", `/api/catalog/${id}/open`),
};
