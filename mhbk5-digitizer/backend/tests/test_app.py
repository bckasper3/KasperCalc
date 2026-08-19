"""FastAPI TestClient tests for backend/app.py.

Each test monkeypatches the app module's data-directory globals to point at
a tmp_path before creating the TestClient (as a context manager, so the
startup event re-initializes the DB at the patched path).
"""
import json
import shutil

import pytest
from fastapi.testclient import TestClient

from backend import app as app_module


@pytest.fixture()
def client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    figures_dir = data_dir / "figures"
    figures_dir.mkdir(parents=True)
    monkeypatch.setattr(app_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(app_module, "FIGURES_DIR", figures_dir)
    monkeypatch.setattr(app_module, "DB_PATH", str(data_dir / "index.sqlite3"))
    monkeypatch.setattr(app_module, "PDF_SOURCE_PATH", str(tmp_path / "does-not-exist.pdf"))
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture()
def client_with_pdf(tmp_path, monkeypatch):
    from backend.tests.conftest import _build_sample_page_pdf

    data_dir = tmp_path / "data"
    figures_dir = data_dir / "figures"
    figures_dir.mkdir(parents=True)
    pdf_path = tmp_path / "sample.pdf"
    _build_sample_page_pdf(pdf_path)

    monkeypatch.setattr(app_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(app_module, "FIGURES_DIR", figures_dir)
    monkeypatch.setattr(app_module, "DB_PATH", str(data_dir / "index.sqlite3"))
    monkeypatch.setattr(app_module, "PDF_SOURCE_PATH", str(pdf_path))
    monkeypatch.setattr(app_module.pdf_extract, "PAGES_DIR", data_dir / "pages")
    with TestClient(app_module.app) as c:
        yield c


def test_create_and_get_figure(client):
    resp = client.post("/api/figures", json={
        "source_pdf": "MIL-HDBK-5J.pdf",
        "page_number": 137,
        "figure_label": "Figure 3.2.1.1.6",
        "caption": "Stress-strain",
        "material": "2014-T6",
    })
    assert resp.status_code == 200
    created = resp.json()
    assert created["figure_id"].startswith("fig-")
    assert created["qc_status"] == "unreviewed"

    get_resp = client.get(f"/api/figures/{created['figure_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["figure_label"] == "Figure 3.2.1.1.6"


def test_get_missing_figure_404(client):
    resp = client.get("/api/figures/does-not-exist")
    assert resp.status_code == 404


def test_update_figure(client):
    created = client.post("/api/figures", json={
        "source_pdf": "src.pdf", "page_number": 1, "figure_label": "Fig 1",
    }).json()
    figure_id = created["figure_id"]

    created["notes"] = "reviewed by ben"
    resp = client.put(f"/api/figures/{figure_id}", json=created)
    assert resp.status_code == 200
    assert resp.json()["notes"] == "reviewed by ben"


def test_status_update_and_list_filter(client):
    created = client.post("/api/figures", json={
        "source_pdf": "src.pdf", "page_number": 1, "figure_label": "Fig 1",
    }).json()
    figure_id = created["figure_id"]

    resp = client.put(f"/api/figures/{figure_id}/status", json={"status": "approved"})
    assert resp.status_code == 200
    assert resp.json()["qc_status"] == "approved"

    listed = client.get("/api/figures", params={"status": "approved"}).json()
    assert any(f["id"] == figure_id for f in listed)

    unreviewed = client.get("/api/figures", params={"status": "unreviewed"}).json()
    assert not any(f["id"] == figure_id for f in unreviewed)


def test_status_update_invalid_status(client):
    created = client.post("/api/figures", json={
        "source_pdf": "src.pdf", "page_number": 1, "figure_label": "Fig 1",
    }).json()
    resp = client.put(f"/api/figures/{created['figure_id']}/status", json={"status": "bogus"})
    assert resp.status_code == 400


def test_progress_endpoint(client):
    client.post("/api/figures", json={"source_pdf": "src.pdf", "page_number": 1, "figure_label": "A"})
    client.post("/api/figures", json={"source_pdf": "src.pdf", "page_number": 2, "figure_label": "B"})
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    body = resp.json()
    assert body["unreviewed"] == 2


def test_calibrate_endpoint(client):
    fixture_path = __file__.replace("test_app.py", "fixtures/sample_figure.json")
    with open(fixture_path, encoding="utf-8") as f:
        fixture = json.load(f)

    created = client.post("/api/figures", json={
        "source_pdf": fixture["source_pdf"],
        "page_number": fixture["page_number"],
        "figure_label": fixture["figure_label"],
    }).json()
    figure_id = created["figure_id"]

    fixture["figure_id"] = figure_id
    put_resp = client.put(f"/api/figures/{figure_id}", json=fixture)
    assert put_resp.status_code == 200

    # zero out calibrated_points, then recompute via the endpoint
    body = put_resp.json()
    for ds in body["datasets"]:
        ds["calibrated_points"] = []
    client.put(f"/api/figures/{figure_id}", json=body)

    calib_resp = client.post(f"/api/figures/{figure_id}/calibrate")
    assert calib_resp.status_code == 200
    recalibrated = calib_resp.json()
    tension = next(d for d in recalibrated["datasets"] if d["dataset_id"] == "ds-tension")
    assert len(tension["calibrated_points"]) == len(tension["raw_path_points"])
    assert tension["calibrated_points"][0][0] == pytest.approx(0, abs=0.05)


def test_export_endpoint(client):
    fixture_path = __file__.replace("test_app.py", "fixtures/sample_figure.json")
    with open(fixture_path, encoding="utf-8") as f:
        fixture = json.load(f)

    created = client.post("/api/figures", json={
        "source_pdf": fixture["source_pdf"],
        "page_number": fixture["page_number"],
        "figure_label": fixture["figure_label"],
    }).json()
    figure_id = created["figure_id"]
    fixture["figure_id"] = figure_id
    client.put(f"/api/figures/{figure_id}", json=fixture)

    resp = client.get(f"/api/figures/{figure_id}/export")
    assert resp.status_code == 200
    charts = resp.json()["charts"]
    assert set(charts.keys()) == {"y1", "y2"}


def test_pages_endpoints_503_without_pdf(client):
    resp = client.get("/api/pages/0/scan")
    assert resp.status_code == 503


def test_pages_endpoints_with_synthetic_pdf(client_with_pdf):
    scan_resp = client_with_pdf.get("/api/pages/0/scan")
    assert scan_resp.status_code == 200
    assert scan_resp.json()["is_vector"] is True

    image_resp = client_with_pdf.get("/api/pages/0/image")
    assert image_resp.status_code == 200
    assert image_resp.content[:8] == b"\x89PNG\r\n\x1a\n"

    paths_resp = client_with_pdf.get("/api/pages/0/paths")
    assert paths_resp.status_code == 200
    assert len(paths_resp.json()["paths"]) > 0


def test_pages_out_of_range_404(client_with_pdf):
    resp = client_with_pdf.get("/api/pages/999/scan")
    assert resp.status_code == 404


# --- Catalog ---

def test_catalog_build_503_without_pdf(client):
    resp = client.post("/api/catalog/build")
    assert resp.status_code == 503


def test_catalog_build_against_synthetic_pdf(client_with_pdf):
    # The synthetic sample_page.pdf fixture has no "FIGURE" caption text, so
    # this just confirms the endpoint runs cleanly end-to-end with 0 hits.
    resp = client_with_pdf.post("/api/catalog/build")
    assert resp.status_code == 200
    body = resp.json()
    assert body["scanned_pages"] == 1
    assert body["entries_found"] == 0
    assert body["entries_inserted"] == 0


def _seed_catalog(client_with_pdf):
    import fitz as fitz_module

    from backend import app as app_module

    doc = fitz_module.open(app_module.PDF_SOURCE_PATH)
    page = doc[0]
    page.insert_text((72, 50), "FIGURE 3.2.1.1.6(a) Test caption")
    doc.saveIncr()
    doc.close()
    return client_with_pdf.post("/api/catalog/build").json()


def test_catalog_build_finds_inserted_caption(client_with_pdf):
    result = _seed_catalog(client_with_pdf)
    assert result["entries_found"] >= 1

    listed = client_with_pdf.get("/api/catalog").json()
    assert any(e["figure_label"] == "Figure 3.2.1.1.6(a)" for e in listed)


def test_catalog_list_filters(client_with_pdf):
    _seed_catalog(client_with_pdf)

    by_page = client_with_pdf.get("/api/catalog", params={"page": 0}).json()
    assert len(by_page) >= 1

    by_search = client_with_pdf.get("/api/catalog", params={"search": "3.2.1.1.6"}).json()
    assert len(by_search) >= 1

    by_completed_false = client_with_pdf.get("/api/catalog", params={"completed": "false"}).json()
    assert len(by_completed_false) >= 1

    by_completed_true = client_with_pdf.get("/api/catalog", params={"completed": "true"}).json()
    assert by_completed_true == []


def test_catalog_summary(client_with_pdf):
    _seed_catalog(client_with_pdf)
    summary = client_with_pdf.get("/api/catalog/summary").json()
    assert summary["total"] >= 1
    assert summary["completed"] == 0


def test_catalog_toggle_completed(client_with_pdf):
    _seed_catalog(client_with_pdf)
    entry = client_with_pdf.get("/api/catalog").json()[0]

    resp = client_with_pdf.put(f"/api/catalog/{entry['id']}/completed", json={"completed": True})
    assert resp.status_code == 200
    assert resp.json()["completed"] == 1

    summary = client_with_pdf.get("/api/catalog/summary").json()
    assert summary["completed"] == 1


def test_catalog_toggle_completed_missing_404(client_with_pdf):
    resp = client_with_pdf.put("/api/catalog/99999/completed", json={"completed": True})
    assert resp.status_code == 404


def test_catalog_open_creates_and_reuses_figure(client_with_pdf):
    _seed_catalog(client_with_pdf)
    entry = client_with_pdf.get("/api/catalog").json()[0]

    first = client_with_pdf.post(f"/api/catalog/{entry['id']}/open")
    assert first.status_code == 200
    figure_id_1 = first.json()["figure_id"]
    assert figure_id_1.startswith("fig-")

    get_resp = client_with_pdf.get(f"/api/figures/{figure_id_1}")
    assert get_resp.status_code == 200
    assert get_resp.json()["page_number"] == entry["page_number"]

    second = client_with_pdf.post(f"/api/catalog/{entry['id']}/open")
    assert second.status_code == 200
    assert second.json()["figure_id"] == figure_id_1  # reused, not duplicated

    figures = client_with_pdf.get("/api/figures").json()
    assert sum(1 for f in figures if f["id"] == figure_id_1) == 1


def test_catalog_open_missing_404(client_with_pdf):
    resp = client_with_pdf.post("/api/catalog/99999/open")
    assert resp.status_code == 404
