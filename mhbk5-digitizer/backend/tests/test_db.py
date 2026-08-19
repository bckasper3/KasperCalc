"""Tests for backend/db.py — SQLite index of figure/page status."""
import sqlite3

import pytest

from backend import db


def _init(tmp_path):
    db_path = str(tmp_path / "index.sqlite3")
    db.init_db(db_path)
    return db_path


def test_init_db_creates_tables(tmp_path):
    db_path = _init(tmp_path)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        names = {row[0] for row in cur.fetchall()}
        assert "figures" in names
        assert "pages" in names
    finally:
        conn.close()


def test_create_and_get_figure(tmp_path):
    db_path = _init(tmp_path)
    db.create_figure(
        id="fig1",
        pdf_source="MIL-HDBK-5J.pdf",
        page_number=42,
        figure_label="Figure 3.2.1.1.6",
        json_path="data/figures/fig1.json",
        db_path=db_path,
    )
    row = db.get_figure_index("fig1", db_path=db_path)
    assert row is not None
    assert row["id"] == "fig1"
    assert row["page_number"] == 42
    assert row["figure_label"] == "Figure 3.2.1.1.6"
    assert row["status"] == "unreviewed"
    assert row["axis_count"] == 0
    assert row["created_at"] and row["updated_at"]


def test_get_figure_index_missing_returns_none(tmp_path):
    db_path = _init(tmp_path)
    assert db.get_figure_index("nope", db_path=db_path) is None


def test_list_figures_ordered_by_page(tmp_path):
    db_path = _init(tmp_path)
    db.create_figure("fig2", "src.pdf", 20, "Fig B", "b.json", db_path=db_path)
    db.create_figure("fig1", "src.pdf", 10, "Fig A", "a.json", db_path=db_path)
    rows = db.list_figures(db_path=db_path)
    assert [r["id"] for r in rows] == ["fig1", "fig2"]


def test_list_figures_status_filter(tmp_path):
    db_path = _init(tmp_path)
    db.create_figure("fig1", "src.pdf", 1, "A", "a.json", db_path=db_path)
    db.create_figure("fig2", "src.pdf", 2, "B", "b.json", db_path=db_path)
    db.update_figure_status("fig2", "approved", db_path=db_path)

    unreviewed = db.list_figures(status="unreviewed", db_path=db_path)
    approved = db.list_figures(status="approved", db_path=db_path)

    assert [r["id"] for r in unreviewed] == ["fig1"]
    assert [r["id"] for r in approved] == ["fig2"]


def test_update_figure_status_invalid_raises(tmp_path):
    db_path = _init(tmp_path)
    db.create_figure("fig1", "src.pdf", 1, "A", "a.json", db_path=db_path)
    with pytest.raises(ValueError):
        db.update_figure_status("fig1", "bogus", db_path=db_path)


def test_upsert_page_scan(tmp_path):
    db_path = _init(tmp_path)
    db.upsert_page_scan(5, "src.pdf", True, 12, 0, db_path=db_path)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM pages WHERE page_number = 5")
        row = cur.fetchone()
        assert row is not None
        assert row[2] == 1  # is_vector stored as int
        assert row[3] == 12
    finally:
        conn.close()

    # upsert again with different values overwrites the row instead of inserting a new one
    db.upsert_page_scan(5, "src.pdf", False, 0, 3, db_path=db_path)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM pages WHERE page_number = 5")
        assert cur.fetchone()[0] == 1
        cur.execute("SELECT is_vector, num_images FROM pages WHERE page_number = 5")
        is_vector, num_images = cur.fetchone()
        assert is_vector == 0
        assert num_images == 3
    finally:
        conn.close()


def test_progress_summary_counts(tmp_path):
    db_path = _init(tmp_path)
    db.create_figure("fig1", "src.pdf", 1, "A", "a.json", db_path=db_path)
    db.create_figure("fig2", "src.pdf", 2, "B", "b.json", db_path=db_path)
    db.create_figure("fig3", "src.pdf", 3, "C", "c.json", db_path=db_path)
    db.update_figure_status("fig2", "approved", db_path=db_path)
    db.update_figure_status("fig3", "flagged", db_path=db_path)

    summary = db.get_progress_summary(db_path=db_path)
    assert summary["unreviewed"] == 1
    assert summary["approved"] == 1
    assert summary["flagged"] == 1
    assert summary["in_progress"] == 0


def test_progress_summary_empty(tmp_path):
    db_path = _init(tmp_path)
    summary = db.get_progress_summary(db_path=db_path)
    assert summary == {"unreviewed": 0, "in_progress": 0, "approved": 0, "flagged": 0}


# --- Catalog ---

def test_catalog_is_built_false_when_empty(tmp_path):
    db_path = _init(tmp_path)
    assert db.catalog_is_built(db_path=db_path) is False


def test_bulk_insert_catalog_entries_and_is_built(tmp_path):
    db_path = _init(tmp_path)
    inserted = db.bulk_insert_catalog_entries(
        [
            {"page_number": 10, "figure_label": "Figure 3.1"},
            {"page_number": 20, "figure_label": "Figure 3.2"},
        ],
        db_path=db_path,
    )
    assert inserted == 2
    assert db.catalog_is_built(db_path=db_path) is True


def test_bulk_insert_catalog_entries_ignores_duplicates(tmp_path):
    db_path = _init(tmp_path)
    db.bulk_insert_catalog_entries(
        [{"page_number": 10, "figure_label": "Figure 3.1"}], db_path=db_path,
    )
    inserted_again = db.bulk_insert_catalog_entries(
        [
            {"page_number": 10, "figure_label": "Figure 3.1"},  # duplicate
            {"page_number": 11, "figure_label": "Figure 3.2"},  # new
        ],
        db_path=db_path,
    )
    assert inserted_again == 1
    rows = db.list_catalog_entries(db_path=db_path)
    assert len(rows) == 2


def test_list_catalog_entries_filters(tmp_path):
    db_path = _init(tmp_path)
    db.bulk_insert_catalog_entries(
        [
            {"page_number": 10, "figure_label": "Figure 3.1"},
            {"page_number": 20, "figure_label": "Figure 4.2"},
            {"page_number": 20, "figure_label": "Figure 4.2(a)"},
        ],
        db_path=db_path,
    )
    entries = db.list_catalog_entries(db_path=db_path)
    ids = [e["id"] for e in entries]
    db.set_catalog_entry_completed(ids[0], True, db_path=db_path)

    by_page = db.list_catalog_entries(page_number=20, db_path=db_path)
    assert len(by_page) == 2
    assert all(e["page_number"] == 20 for e in by_page)

    by_search = db.list_catalog_entries(label_search="4.2", db_path=db_path)
    assert len(by_search) == 2

    by_search_case_insensitive = db.list_catalog_entries(label_search="figure 3", db_path=db_path)
    assert len(by_search_case_insensitive) == 1

    completed = db.list_catalog_entries(completed=True, db_path=db_path)
    assert len(completed) == 1

    incomplete = db.list_catalog_entries(completed=False, db_path=db_path)
    assert len(incomplete) == 2

    ordered = db.list_catalog_entries(db_path=db_path)
    assert [e["page_number"] for e in ordered] == sorted(e["page_number"] for e in ordered)


def test_set_catalog_entry_completed(tmp_path):
    db_path = _init(tmp_path)
    db.bulk_insert_catalog_entries(
        [{"page_number": 10, "figure_label": "Figure 3.1"}], db_path=db_path,
    )
    entry = db.list_catalog_entries(db_path=db_path)[0]
    assert entry["completed"] == 0

    db.set_catalog_entry_completed(entry["id"], True, db_path=db_path)
    updated = db.get_catalog_entry(entry["id"], db_path=db_path)
    assert updated["completed"] == 1

    db.set_catalog_entry_completed(entry["id"], False, db_path=db_path)
    updated = db.get_catalog_entry(entry["id"], db_path=db_path)
    assert updated["completed"] == 0


def test_set_catalog_entry_figure_id(tmp_path):
    db_path = _init(tmp_path)
    db.bulk_insert_catalog_entries(
        [{"page_number": 10, "figure_label": "Figure 3.1"}], db_path=db_path,
    )
    entry = db.list_catalog_entries(db_path=db_path)[0]
    assert entry["figure_id"] is None

    db.set_catalog_entry_figure_id(entry["id"], "fig-abc123", db_path=db_path)
    updated = db.get_catalog_entry(entry["id"], db_path=db_path)
    assert updated["figure_id"] == "fig-abc123"


def test_get_catalog_entry_missing_returns_none(tmp_path):
    db_path = _init(tmp_path)
    assert db.get_catalog_entry(999, db_path=db_path) is None


def test_get_catalog_summary(tmp_path):
    db_path = _init(tmp_path)
    assert db.get_catalog_summary(db_path=db_path) == {"total": 0, "completed": 0}

    db.bulk_insert_catalog_entries(
        [
            {"page_number": 10, "figure_label": "Figure 3.1"},
            {"page_number": 20, "figure_label": "Figure 4.2"},
        ],
        db_path=db_path,
    )
    entries = db.list_catalog_entries(db_path=db_path)
    db.set_catalog_entry_completed(entries[0]["id"], True, db_path=db_path)

    summary = db.get_catalog_summary(db_path=db_path)
    assert summary == {"total": 2, "completed": 1}
