# MIL-HDBK-5 Digitizer

A local tool for extracting vector-drawn curve data (stress-strain curves,
S-N fatigue curves, etc.) directly from vector-graphic figures in the
MIL-HDBK-5J PDF, instead of digitizing them by eye pixel-by-pixel.

A human calibrates each figure's axes and labels/selects the curve paths in
a browser UI; the Python backend does the PDF parsing (via PyMuPDF) and the
pixel -> data-space math.

## How it works

1. The backend reads a page from the MIL-HDBK-5J PDF, renders it to PNG,
   and extracts the page's vector drawing primitives (lines/curves), tagging
   each with a rough guess ("gridline", "axis", "data_curve", "unknown").
2. The frontend overlays those candidate paths (color-coded by guess) on
   the page image. You click 2+ points on each axis and type in their known
   data values to calibrate; you click curve paths to group them into a
   labeled dataset.
3. The backend fits a linear or log pixel->value transform per axis and
   applies it to every dataset's raw pixel points, producing calibrated
   (x, y) data points.
4. A Chart.js panel previews the calibrated curves live so you can sanity
   check them before approving the figure.
5. Approved figures are exported as Chart.js-ready JSON for downstream use.

## Setup

From the `mhbk5-digitizer/` directory:

```
pip install -r requirements.txt
```

**Drop your copy of the MIL-HDBK-5J PDF into `data/MIL-HDBK-5J.pdf`.** The
backend won't be able to serve page images/paths until it's there. If you'd
rather keep it somewhere else, set the `MHBK5_PDF_PATH` environment
variable to its absolute path instead of moving the file (see
`PDF_SOURCE_PATH` at the top of `backend/app.py`).

## Running it

Start the backend (from `mhbk5-digitizer/`):

```
uvicorn backend.app:app --reload
```

This serves the API at `http://127.0.0.1:8000`.

Serve the frontend as static files (any static server works, e.g.):

```
python -m http.server 8080 --directory frontend
```

Then open `http://127.0.0.1:8080/index.html` in a browser. The frontend
talks to the backend at `http://127.0.0.1:8000` by default; override with
`window.MHBK5_API_BASE` in the browser console or by editing `frontend/js/api.js`
if you're running the backend somewhere else.

## Running the tests

From `mhbk5-digitizer/`:

```
pytest backend/tests -v
```

All backend tests are self-contained — they build a synthetic PDF and a
synthetic figure fixture on the fly, so they never need the real
MIL-HDBK-5J PDF.

## Project layout

- `backend/db.py` — SQLite index of figure/page review status.
- `backend/models.py` — Pydantic models for the figure JSON schema.
- `backend/pdf_extract.py` — page classification, PNG rendering, vector
  path extraction/classification (PyMuPDF).
- `backend/calibration.py` — pixel -> data-space math (linear/log axis
  fits, dataset calibration). The most safety-critical module; treat any
  change here with extra care and re-run the tests.
- `backend/export.py` — figure -> Chart.js config conversion.
- `backend/app.py` — FastAPI app tying it all together. **Set your PDF
  path here** (`PDF_SOURCE_PATH` / `MHBK5_PDF_PATH`).
- `frontend/` — plain HTML/CSS/vanilla JS viewer, calibration UI, curve
  labeling UI, and live Chart.js preview. No build step; Chart.js is
  pulled from a CDN (fine for a local dev tool).
- `data/figures/` — one JSON file per digitized figure.
- `data/pages/` — cached page PNG renders.
