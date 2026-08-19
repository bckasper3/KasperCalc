"""Scans the MIL-HDBK-5J PDF for figure captions, building a catalog of
(page_number, figure_label) rows the user can search/browse before opening
the editor for any given figure.

This is a heuristic text scan, not authoritative: some pages have multiple
sub-charts sharing one figure number (e.g. "Figure 3.2.1.1.6(a)" through
"(o)" all on different pages, or several on the same page) — that's a real
feature of this handbook's structure, not a bug in the scanner.
"""
from __future__ import annotations

import re

import fitz  # PyMuPDF

FIGURE_CAPTION_RE = re.compile(r'FIGURE\s+([0-9]+(?:\.[0-9]+)*)\s*(\([a-z]\))?', re.IGNORECASE)

# A page needs at least this many vector drawings to plausibly contain a
# chart worth cataloging — skips pages that just mention "Figure X" in
# body text with no accompanying plot.
MIN_DRAWINGS_FOR_FIGURE_PAGE = 5


def find_figure_captions_on_page(page: "fitz.Page") -> list[str]:
    """Return sorted, de-duplicated figure_label strings found on this page,
    e.g. ['Figure 3.2.1.1.6(o)']. Empty if the page doesn't look like it has
    enough vector content to be a real figure."""
    if len(page.get_drawings()) < MIN_DRAWINGS_FOR_FIGURE_PAGE:
        return []
    text = page.get_text()
    labels = set()
    for m in FIGURE_CAPTION_RE.finditer(text):
        num = m.group(1).rstrip('.')
        suffix = (m.group(2) or '').strip()
        labels.add(f"Figure {num}{suffix}")
    return sorted(labels)


def scan_pdf_for_catalog(pdf_path: str) -> list[dict]:
    """Open the PDF and scan every page for figure captions.

    Returns a flat list of {"page_number": int, "figure_label": str} dicts.
    page_number is 0-indexed, matching the convention used everywhere else
    in this app (see pdf_extract.render_page_png, which keys its cache off
    page.number).
    """
    doc = fitz.open(pdf_path)
    try:
        entries: list[dict] = []
        for page in doc:
            for label in find_figure_captions_on_page(page):
                entries.append({"page_number": page.number, "figure_label": label})
        return entries
    finally:
        doc.close()
