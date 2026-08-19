"""Tests for backend/pdf_extract.py against the synthetic sample_page.pdf."""
from backend import pdf_extract


def test_classify_page_detects_vector(sample_page):
    result = pdf_extract.classify_page(sample_page)
    assert result["is_vector"] is True
    assert result["num_drawings"] > 0
    assert result["num_images"] == 0


def test_render_page_png_returns_valid_png(sample_page, tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_extract, "PAGES_DIR", tmp_path)
    png_bytes = pdf_extract.render_page_png(sample_page, dpi=100)
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    cached = tmp_path / f"{sample_page.number}.png"
    assert cached.exists()


def test_render_page_png_uses_cache(sample_page, tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_extract, "PAGES_DIR", tmp_path)
    first = pdf_extract.render_page_png(sample_page, dpi=100)
    cached_path = tmp_path / f"{sample_page.number}.png"
    cached_path.write_bytes(first[:-1] + b"\x00")  # corrupt slightly to prove cache is used
    second = pdf_extract.render_page_png(sample_page, dpi=100)
    assert second == cached_path.read_bytes()


def test_extract_candidate_paths_non_empty_with_points(sample_page):
    paths = pdf_extract.extract_candidate_paths(sample_page)
    assert len(paths) > 0
    assert any(len(p["points"]) > 0 for p in paths)
    for p in paths:
        assert "width" in p
        assert "points" in p


def test_classify_candidate_paths_tags_everything(sample_page):
    paths = pdf_extract.extract_candidate_paths(sample_page)
    tagged = pdf_extract.classify_candidate_paths(paths)
    assert len(tagged) == len(paths)
    valid = {"gridline", "axis", "data_curve", "unknown"}
    for t in tagged:
        assert t["classification"] in valid

    classifications = {t["classification"] for t in tagged}
    # the synthetic page has gridlines, axis-like lines, and a segmented
    # data curve, so at least one non-"unknown" classification should show up
    assert classifications - {"unknown"}
