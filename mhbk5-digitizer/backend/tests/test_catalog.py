"""Tests for backend/catalog.py — scanning the PDF for figure captions."""
import fitz
import pytest

from backend import catalog


class _FakePage:
    """Minimal stand-in for a fitz.Page, for unit-testing the caption regex
    logic without needing real PDF drawings."""

    def __init__(self, text: str, num_drawings: int):
        self._text = text
        self._num_drawings = num_drawings

    def get_drawings(self):
        return [object()] * self._num_drawings

    def get_text(self):
        return self._text


def test_find_figure_captions_on_page_finds_labels():
    page = _FakePage("Some text.\nFIGURE 3.2.1.1.6(o)  Typical stress-strain curve.", num_drawings=10)
    labels = catalog.find_figure_captions_on_page(page)
    assert labels == ["Figure 3.2.1.1.6(o)"]


def test_find_figure_captions_on_page_no_suffix():
    page = _FakePage("FIGURE 9.9.9  Some chart", num_drawings=10)
    labels = catalog.find_figure_captions_on_page(page)
    assert labels == ["Figure 9.9.9"]


def test_find_figure_captions_on_page_dedupes_and_sorts():
    page = _FakePage("FIGURE 3.1  A\nFIGURE 2.1  B\nFIGURE 3.1  A again", num_drawings=10)
    labels = catalog.find_figure_captions_on_page(page)
    assert labels == ["Figure 2.1", "Figure 3.1"]


def test_find_figure_captions_on_page_skips_low_drawing_pages():
    page = _FakePage("FIGURE 3.1  A", num_drawings=1)
    assert catalog.find_figure_captions_on_page(page) == []


def test_find_figure_captions_on_page_no_captions():
    page = _FakePage("Nothing interesting here.", num_drawings=10)
    assert catalog.find_figure_captions_on_page(page) == []


def _build_pdf_with_figure_caption(path):
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    # Enough vector drawings to pass the MIN_DRAWINGS_FOR_FIGURE_PAGE gate.
    for x in range(100, 500, 40):
        page.draw_line((x, 700), (x, 100), width=0.5, color=(0, 0, 0))
    page.insert_text((72, 730), "FIGURE 9.9.9 Test chart caption")
    doc.save(str(path))
    doc.close()


@pytest.fixture()
def catalog_pdf_path(tmp_path):
    path = tmp_path / "catalog_sample.pdf"
    _build_pdf_with_figure_caption(path)
    return path


def test_scan_pdf_for_catalog_finds_entries(catalog_pdf_path):
    entries = catalog.scan_pdf_for_catalog(str(catalog_pdf_path))
    assert {"page_number": 0, "figure_label": "Figure 9.9.9"} in entries


def test_scan_pdf_for_catalog_skips_pages_without_captions(sample_page_pdf_path):
    # The shared sample_page.pdf fixture (from conftest) has plenty of
    # drawings but no "FIGURE" text, so it should produce no entries.
    entries = catalog.scan_pdf_for_catalog(str(sample_page_pdf_path))
    assert entries == []
