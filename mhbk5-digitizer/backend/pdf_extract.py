"""PDF page classification and vector-path extraction, built on PyMuPDF (fitz).

Functions here work on a `fitz.Page` object. They don't know anything about
figure identity or calibration — they just turn a PDF page into candidate
vector paths tagged with a rough classification guess, and render page
thumbnails for the frontend viewer.
"""
from __future__ import annotations

from pathlib import Path

import fitz  # PyMuPDF

# Directory (relative to the mhbk5-digitizer project root) where rendered
# page PNGs are cached.
PAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "pages"

# Heuristic thresholds used by classify_candidate_paths().
GRIDLINE_MAX_WIDTH = 0.6
AXIS_MIN_WIDTH = 1.2
DATA_CURVE_MIN_SEGMENTS = 4

# MIL-HDBK-5 keeps at least a 0.5" margin on every page, so cropping that
# much off each edge never clips real content - it just removes blank
# border and lets the actual figure fill more of the viewer.
MARGIN_INCHES = 0.5
MARGIN_POINTS = MARGIN_INCHES * 72  # PDF units are 1/72 inch


def _crop_rect(page: "fitz.Page") -> "fitz.Rect":
    """The page's bounding box inset by MARGIN_INCHES on every side."""
    rect = page.rect
    cropped = fitz.Rect(
        rect.x0 + MARGIN_POINTS, rect.y0 + MARGIN_POINTS,
        rect.x1 - MARGIN_POINTS, rect.y1 - MARGIN_POINTS,
    )
    # Guard against a page smaller than 2x the margin (shouldn't happen for
    # this handbook, but would otherwise produce an inverted/empty rect).
    if cropped.is_empty or cropped.width <= 0 or cropped.height <= 0:
        return rect
    return cropped


def classify_page(page: "fitz.Page") -> dict:
    """Classify a page as vector-graphic or image/scan based, plus counts.

    Returns a dict: {is_vector, num_drawings, num_images}.
    A page is considered "vector" if it has more vector drawings than
    raster images (a scanned page typically has one full-page image and
    little/no vector content).
    """
    drawings = page.get_drawings()
    images = page.get_images(full=True)
    num_drawings = len(drawings)
    num_images = len(images)
    is_vector = num_drawings > num_images
    return {
        "is_vector": is_vector,
        "num_drawings": num_drawings,
        "num_images": num_images,
    }


def render_page_png(page: "fitz.Page", dpi: int = 200) -> bytes:
    """Render a page to PNG bytes, caching the result under data/pages/.

    Cropped to the page minus MARGIN_INCHES on every side (see _crop_rect) -
    extract_candidate_paths() applies the exact same crop + DPI scaling to
    its coordinates, so the two stay pixel-aligned. Cache key is the page
    number (0-indexed, as reported by PyMuPDF).
    """
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = PAGES_DIR / f"{page.number}.png"
    if cache_path.exists():
        return cache_path.read_bytes()

    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, clip=_crop_rect(page))
    png_bytes = pix.tobytes("png")
    cache_path.write_bytes(png_bytes)
    return png_bytes


def extract_candidate_paths(page: "fitz.Page", dpi: int = 200) -> list[dict]:
    """Wrap page.get_drawings() into a simplified list of candidate paths.

    Each entry: {path_index, width, color, fill, points, bbox}.
    `points` is a flattened list of [x, y] vertices drawn from every item
    in the drawing's `items` list (lines, curves approximated by their
    endpoints/control points, rects as 4 corners).

    Coordinates are converted from raw PDF point space into the exact same
    pixel space as render_page_png(page, dpi) - offset by the same margin
    crop, then scaled by the same dpi/72 zoom - so a path point here lands
    on the matching pixel in the rendered image. (`width` is left in PDF
    point units; it's only used for the gridline/axis/curve thickness
    heuristic below, not for placing anything, and that heuristic's
    thresholds were tuned against real PDF stroke widths.)
    """
    crop = _crop_rect(page)
    zoom = dpi / 72.0

    def to_pixel(x: float, y: float) -> list[float]:
        return [(x - crop.x0) * zoom, (y - crop.y0) * zoom]

    drawings = page.get_drawings()
    candidates = []
    for idx, drawing in enumerate(drawings):
        points: list[list[float]] = []
        for item in drawing.get("items", []):
            kind = item[0]
            if kind == "l":  # line: (p1, p2)
                p1, p2 = item[1], item[2]
                points.append(to_pixel(p1.x, p1.y))
                points.append(to_pixel(p2.x, p2.y))
            elif kind == "c":  # cubic bezier: (p1, p2, p3, p4)
                for p in item[1:5]:
                    points.append(to_pixel(p.x, p.y))
            elif kind == "re":  # rect
                rect = item[1]
                points.extend([
                    to_pixel(rect.x0, rect.y0), to_pixel(rect.x1, rect.y0),
                    to_pixel(rect.x1, rect.y1), to_pixel(rect.x0, rect.y1),
                ])
            elif kind == "qu":  # quad
                quad = item[1]
                for p in (quad.ul, quad.ur, quad.lr, quad.ll):
                    points.append(to_pixel(p.x, p.y))

        rect = drawing.get("rect")
        bbox = None
        if rect:
            p0 = to_pixel(rect.x0, rect.y0)
            p1 = to_pixel(rect.x1, rect.y1)
            bbox = [p0[0], p0[1], p1[0], p1[1]]

        candidates.append({
            "path_index": idx,
            "width": drawing.get("width") or 0.0,
            "color": drawing.get("color"),
            "fill": drawing.get("fill"),
            "points": points,
            "bbox": bbox,
        })
    return candidates


def classify_candidate_paths(paths: list[dict]) -> list[dict]:
    """Tag each candidate path with a classification guess.

    Heuristic, not authoritative — the human reviewer confirms/corrects in
    the UI. Rules of thumb:
      - very thin, short/straight lines -> "gridline"
      - thick, spans a large fraction of the page bbox -> "axis"
      - everything else with several segments -> "data_curve"
      - anything that doesn't fit -> "unknown"
    """
    tagged = []
    for path in paths:
        width = path.get("width") or 0.0
        points = path.get("points") or []
        num_segments = max(len(points) - 1, 0)
        bbox = path.get("bbox")
        span = 0.0
        if bbox:
            span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])

        guess = "unknown"
        if width and width <= GRIDLINE_MAX_WIDTH and num_segments <= 2:
            guess = "gridline"
        elif width and width >= AXIS_MIN_WIDTH and span > 0:
            guess = "axis"
        elif num_segments >= DATA_CURVE_MIN_SEGMENTS:
            guess = "data_curve"
        elif num_segments >= 1:
            guess = "gridline"

        tagged.append({**path, "classification": guess})
    return tagged
