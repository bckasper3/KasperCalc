"""Shared pytest fixtures, including a synthetic single-page PDF that stands
in for a real MIL-HDBK-5J page (a full-page image, an axis-like thick line,
several gridlines, and a wiggly "data curve" polyline) so the test suite is
self-contained and never needs the real PDF.
"""
from pathlib import Path

import fitz
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_PAGE_PDF = FIXTURES_DIR / "sample_page.pdf"


def _build_sample_page_pdf(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)  # letter, points

    # Thick axis lines (the plot box).
    page.draw_line((72, 700), (540, 700), width=1.5, color=(0, 0, 0))  # x-axis
    page.draw_line((72, 700), (72, 100), width=1.5, color=(0, 0, 0))   # y-axis

    # Thin gridlines.
    for x in range(120, 540, 60):
        page.draw_line((x, 700), (x, 100), width=0.25, color=(0.7, 0.7, 0.7))
    for y in range(150, 700, 60):
        page.draw_line((72, y), (540, y), width=0.25, color=(0.7, 0.7, 0.7))

    # A "data curve": a multi-segment polyline with enough segments to be
    # classified as a data curve rather than a gridline/axis.
    curve_points = [
        (80, 690), (120, 640), (160, 580), (200, 520), (240, 470),
        (280, 430), (320, 400), (360, 380), (400, 365), (440, 355),
        (480, 350), (520, 348),
    ]
    for p1, p2 in zip(curve_points, curve_points[1:]):
        page.draw_line(p1, p2, width=1.0, color=(0, 0, 1))

    doc.save(str(path))
    doc.close()


@pytest.fixture()
def sample_page_pdf_path() -> Path:
    """Ensure the synthetic sample_page.pdf fixture exists on disk and
    return its path."""
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    _build_sample_page_pdf(SAMPLE_PAGE_PDF)
    return SAMPLE_PAGE_PDF


@pytest.fixture()
def sample_page(sample_page_pdf_path):
    """Open the synthetic PDF and yield its single fitz.Page."""
    doc = fitz.open(str(sample_page_pdf_path))
    try:
        yield doc[0]
    finally:
        doc.close()
