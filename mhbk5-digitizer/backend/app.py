"""FastAPI app for the MIL-HDBK-5 Digitizer backend.

Run from the mhbk5-digitizer/ directory with:
    uvicorn backend.app:app --reload

--- PDF source configuration ---
This tool needs a copy of the MIL-HDBK-5J PDF to read pages/figures from.
Defaults to the copy already in the KasperCalc site's downloadable/ folder
(../downloadable/MIL-HDBK-5J-1.pdf relative to this project). Set the
MHBK5_PDF_PATH env var to point somewhere else if needed.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import fitz
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import calibration, catalog, db, pdf_extract
from backend.export import figure_to_chartjs
from backend.models import Axis, Figure

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
FIGURES_DIR = DATA_DIR / "figures"

# --- Configure where the real MIL-HDBK-5J PDF lives ---
# Defaults to the copy already checked into the KasperCalc site's
# downloadable/ folder. Set the MHBK5_PDF_PATH environment variable to an
# absolute path if you want to point at a different copy instead.
PDF_SOURCE_PATH = os.environ.get(
    "MHBK5_PDF_PATH", str(PROJECT_ROOT.parent / "downloadable" / "MIL-HDBK-5J-1.pdf")
)

DB_PATH = str(DATA_DIR / "index.sqlite3")

app = FastAPI(title="MIL-HDBK-5 Digitizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    db.init_db(DB_PATH)


def _open_pdf() -> "fitz.Document":
    path = PDF_SOURCE_PATH
    if not os.path.exists(path):
        raise HTTPException(
            status_code=503,
            detail=(
                f"PDF source not found at {path!r}. Drop your MIL-HDBK-5J PDF "
                "there, or set the MHBK5_PDF_PATH environment variable."
            ),
        )
    return fitz.open(path)


def _figure_json_path(figure_id: str) -> Path:
    return FIGURES_DIR / f"{figure_id}.json"


def _load_figure_json(figure_id: str) -> dict:
    path = _figure_json_path(figure_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"figure {figure_id!r} not found")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_figure_json(figure_id: str, data: dict) -> None:
    path = _figure_json_path(figure_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# --- Pages ---

@app.get("/api/pages/{page_number}/scan")
def scan_page(page_number: int):
    """Classify a page (vector vs scanned) and persist the result in the index."""
    doc = _open_pdf()
    try:
        if page_number < 0 or page_number >= doc.page_count:
            raise HTTPException(status_code=404, detail=f"page {page_number} out of range")
        page = doc[page_number]
        result = pdf_extract.classify_page(page)
        db.upsert_page_scan(
            page_number=page_number,
            pdf_source=PDF_SOURCE_PATH,
            is_vector=result["is_vector"],
            num_drawings=result["num_drawings"],
            num_images=result["num_images"],
            db_path=DB_PATH,
        )
        return result
    finally:
        doc.close()


@app.get("/api/pages/{page_number}/image")
def get_page_image(page_number: int, dpi: int = 200):
    """Return a rendered PNG of the page (cached under data/pages/)."""
    doc = _open_pdf()
    try:
        if page_number < 0 or page_number >= doc.page_count:
            raise HTTPException(status_code=404, detail=f"page {page_number} out of range")
        page = doc[page_number]
        png_bytes = pdf_extract.render_page_png(page, dpi=dpi)
        return Response(content=png_bytes, media_type="image/png")
    finally:
        doc.close()


@app.get("/api/pages/{page_number}/paths")
def get_page_paths(page_number: int, dpi: int = 200):
    """Return classified candidate vector paths for a page.

    `dpi` must match whatever was passed to /api/pages/{n}/image for the
    same page - path coordinates are scaled to that image's pixel space
    (see extract_candidate_paths' docstring). Both endpoints default to
    200, matching the frontend's default, so this only matters if the
    frontend ever requests a non-default DPI image.
    """
    doc = _open_pdf()
    try:
        if page_number < 0 or page_number >= doc.page_count:
            raise HTTPException(status_code=404, detail=f"page {page_number} out of range")
        page = doc[page_number]
        paths = pdf_extract.extract_candidate_paths(page, dpi=dpi)
        tagged = pdf_extract.classify_candidate_paths(paths)
        return {"page_number": page_number, "paths": tagged}
    finally:
        doc.close()


# --- Figures ---

class CreateFigureRequest(BaseModel):
    source_pdf: str
    page_number: int
    figure_label: str
    caption: str | None = None
    material: str | None = None


def _create_figure(source_pdf: str, page_number: int, figure_label: str,
                    caption: str | None = None, material: str | None = None) -> dict:
    """Shared figure-creation logic used by both POST /api/figures and the
    catalog's "open" endpoint."""
    figure_id = f"fig-{uuid.uuid4().hex[:12]}"
    figure = Figure(
        figure_id=figure_id,
        source_pdf=source_pdf,
        page_number=page_number,
        figure_label=figure_label,
        caption=caption,
        material=material,
        # Most figures need exactly one X and one Y axis to calibrate —
        # start with those already in place instead of making every figure
        # begin with an empty axes list. Dual-axis charts (e.g. a second Y
        # axis for tangent modulus) can still add more via "+ X axis"/"+ Y axis".
        axes=[
            Axis(axis_id="x1", orientation="x", scale="linear", label="X Axis", units="", calibration_points=[]),
            Axis(axis_id="y1", orientation="y", scale="linear", label="Y Axis", units="", calibration_points=[]),
        ],
        datasets=[],
        qc_status="unreviewed",
    )
    data = figure.model_dump(mode="json")
    _save_figure_json(figure_id, data)
    db.create_figure(
        id=figure_id,
        pdf_source=source_pdf,
        page_number=page_number,
        figure_label=figure_label,
        json_path=str(_figure_json_path(figure_id)),
        db_path=DB_PATH,
    )
    return data


@app.post("/api/figures")
def create_figure(req: CreateFigureRequest):
    return _create_figure(
        source_pdf=req.source_pdf,
        page_number=req.page_number,
        figure_label=req.figure_label,
        caption=req.caption,
        material=req.material,
    )


@app.get("/api/figures/{figure_id}")
def get_figure(figure_id: str):
    return _load_figure_json(figure_id)


@app.put("/api/figures/{figure_id}")
def update_figure(figure_id: str, figure: dict):
    _load_figure_json(figure_id)  # 404 if missing
    validated = Figure.model_validate({**figure, "figure_id": figure_id})
    data = validated.model_dump(mode="json")
    _save_figure_json(figure_id, data)
    return data


@app.post("/api/figures/{figure_id}/calibrate")
def calibrate_figure(figure_id: str):
    """Recompute calibrated_points for every dataset from raw_path_points +
    the figure's current axis calibration."""
    raw = _load_figure_json(figure_id)
    figure = Figure.model_validate(raw)

    for dataset in figure.datasets:
        try:
            calibrated = calibration.calibrate_dataset(dataset, figure.axes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        dataset.calibrated_points = calibrated

    data = figure.model_dump(mode="json")
    _save_figure_json(figure_id, data)
    return data


class StatusUpdateRequest(BaseModel):
    status: str


@app.put("/api/figures/{figure_id}/status")
def update_status(figure_id: str, req: StatusUpdateRequest):
    raw = _load_figure_json(figure_id)
    if req.status not in db.VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"invalid status: {req.status}")
    raw["qc_status"] = req.status
    _save_figure_json(figure_id, raw)
    try:
        db.update_figure_status(figure_id, req.status, db_path=DB_PATH)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return raw


@app.get("/api/figures")
def list_figures(status: str | None = None):
    return db.list_figures(status=status, db_path=DB_PATH)


@app.get("/api/progress")
def get_progress():
    return db.get_progress_summary(db_path=DB_PATH)


@app.get("/api/figures/{figure_id}/export")
def export_figure(figure_id: str):
    figure = _load_figure_json(figure_id)
    return figure_to_chartjs(figure)


@app.post("/api/catalog/build")
def build_catalog():
    """One-time (re-runnable) scan of the whole PDF for figure captions.
    Not run automatically on startup — this can take up to ~a minute over
    the full 1700+ page handbook, so it's triggered explicitly."""
    path = PDF_SOURCE_PATH
    if not os.path.exists(path):
        raise HTTPException(
            status_code=503,
            detail=(
                f"PDF source not found at {path!r}. Drop your MIL-HDBK-5J PDF "
                "there, or set the MHBK5_PDF_PATH environment variable."
            ),
        )
    entries = catalog.scan_pdf_for_catalog(path)
    inserted = db.bulk_insert_catalog_entries(entries, db_path=DB_PATH)
    scanned_pages = fitz.open(path).page_count
    return {
        "scanned_pages": scanned_pages,
        "entries_found": len(entries),
        "entries_inserted": inserted,
    }


@app.get("/api/catalog")
def get_catalog(page: int | None = None, search: str | None = None, completed: str | None = None):
    completed_bool = None
    if completed is not None:
        completed_bool = completed.strip().lower() == "true"
    return db.list_catalog_entries(
        page_number=page, label_search=search, completed=completed_bool, db_path=DB_PATH,
    )


@app.get("/api/catalog/summary")
def catalog_summary():
    return db.get_catalog_summary(db_path=DB_PATH)


class CatalogCompletedRequest(BaseModel):
    completed: bool


@app.put("/api/catalog/{entry_id}/completed")
def set_catalog_completed(entry_id: int, req: CatalogCompletedRequest):
    entry = db.get_catalog_entry(entry_id, db_path=DB_PATH)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"catalog entry {entry_id} not found")
    db.set_catalog_entry_completed(entry_id, req.completed, db_path=DB_PATH)
    return db.get_catalog_entry(entry_id, db_path=DB_PATH)


@app.post("/api/catalog/{entry_id}/open")
def open_catalog_entry(entry_id: int):
    """Return a figure_id for this catalog row, creating a new working
    figure the first time it's opened and reusing it on later opens."""
    entry = db.get_catalog_entry(entry_id, db_path=DB_PATH)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"catalog entry {entry_id} not found")

    if entry["figure_id"]:
        return {"figure_id": entry["figure_id"]}

    figure = _create_figure(
        source_pdf=os.path.basename(PDF_SOURCE_PATH),
        page_number=entry["page_number"],
        figure_label=entry["figure_label"],
    )
    db.set_catalog_entry_figure_id(entry_id, figure["figure_id"], db_path=DB_PATH)
    return {"figure_id": figure["figure_id"]}


@app.post("/api/shutdown")
def shutdown():
    """Kills this backend process. Used by the frontend's Quit button."""
    import os
    import threading

    def _kill():
        os._exit(0)

    threading.Timer(0.3, _kill).start()
    return {"status": "shutting down"}
