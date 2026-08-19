"""SQLite index of figure/page status. Curve data lives in per-figure JSON files, not here."""
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS figures (
    id TEXT PRIMARY KEY,
    pdf_source TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    figure_label TEXT,
    json_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unreviewed',
    axis_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
    page_number INTEGER PRIMARY KEY,
    pdf_source TEXT NOT NULL,
    is_vector INTEGER NOT NULL,
    num_drawings INTEGER,
    num_images INTEGER,
    scanned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_number INTEGER NOT NULL,
    figure_label TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    figure_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(page_number, figure_label)
);
"""

VALID_STATUSES = {"unreviewed", "in_progress", "approved", "flagged"}

# Module-level default DB path, set by init_db(). Every function below also
# accepts an explicit db_path override (used by tests to point at a temp file).
_DB_PATH: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve(db_path: str | None) -> str:
    path = db_path or _DB_PATH
    if path is None:
        raise RuntimeError("db.init_db() must be called before other db functions")
    return path


def init_db(db_path: str) -> None:
    global _DB_PATH
    _DB_PATH = db_path
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def upsert_page_scan(page_number: int, pdf_source: str, is_vector: bool,
                      num_drawings: int, num_images: int, db_path: str | None = None) -> None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        conn.execute(
            """INSERT INTO pages (page_number, pdf_source, is_vector, num_drawings, num_images, scanned_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(page_number) DO UPDATE SET
                 pdf_source=excluded.pdf_source,
                 is_vector=excluded.is_vector,
                 num_drawings=excluded.num_drawings,
                 num_images=excluded.num_images,
                 scanned_at=excluded.scanned_at""",
            (page_number, pdf_source, int(is_vector), num_drawings, num_images, _now()),
        )
        conn.commit()
    finally:
        conn.close()


def create_figure(id: str, pdf_source: str, page_number: int, figure_label: str,
                   json_path: str, db_path: str | None = None) -> None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        now = _now()
        conn.execute(
            """INSERT INTO figures (id, pdf_source, page_number, figure_label, json_path,
                                     status, axis_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'unreviewed', 0, ?, ?)""",
            (id, pdf_source, page_number, figure_label, json_path, now, now),
        )
        conn.commit()
    finally:
        conn.close()


def update_figure_status(id: str, status: str, db_path: str | None = None) -> None:
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid status: {status}")
    conn = sqlite3.connect(_resolve(db_path))
    try:
        conn.execute(
            "UPDATE figures SET status = ?, updated_at = ? WHERE id = ?",
            (status, _now(), id),
        )
        conn.commit()
    finally:
        conn.close()


def _row_to_dict(cursor, row) -> dict:
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


def list_figures(status: str | None = None, db_path: str | None = None) -> list[dict]:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        if status:
            cur.execute("SELECT * FROM figures WHERE status = ? ORDER BY page_number", (status,))
        else:
            cur.execute("SELECT * FROM figures ORDER BY page_number")
        rows = cur.fetchall()
        return [_row_to_dict(cur, r) for r in rows]
    finally:
        conn.close()


def get_figure_index(id: str, db_path: str | None = None) -> dict | None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM figures WHERE id = ?", (id,))
        row = cur.fetchone()
        return _row_to_dict(cur, row) if row else None
    finally:
        conn.close()


def get_progress_summary(db_path: str | None = None) -> dict:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT status, COUNT(*) FROM figures GROUP BY status")
        counts = {status: 0 for status in VALID_STATUSES}
        for status, n in cur.fetchall():
            counts[status] = n
        return counts
    finally:
        conn.close()


# --- Catalog ---

def catalog_is_built(db_path: str | None = None) -> bool:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM catalog_entries")
        return cur.fetchone()[0] > 0
    finally:
        conn.close()


def bulk_insert_catalog_entries(entries: list[dict], db_path: str | None = None) -> int:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        now = _now()
        before = conn.total_changes
        conn.executemany(
            """INSERT OR IGNORE INTO catalog_entries (page_number, figure_label, completed, created_at)
               VALUES (?, ?, 0, ?)""",
            [(e["page_number"], e["figure_label"], now) for e in entries],
        )
        conn.commit()
        return conn.total_changes - before
    finally:
        conn.close()


def list_catalog_entries(page_number: int | None = None, label_search: str | None = None,
                          completed: bool | None = None, db_path: str | None = None) -> list[dict]:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        clauses = []
        params: list = []
        if page_number is not None:
            clauses.append("page_number = ?")
            params.append(page_number)
        if label_search:
            clauses.append("figure_label LIKE ? COLLATE NOCASE")
            params.append(f"%{label_search}%")
        if completed is not None:
            clauses.append("completed = ?")
            params.append(int(completed))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        cur.execute(f"SELECT * FROM catalog_entries {where} ORDER BY page_number", params)
        rows = cur.fetchall()
        return [_row_to_dict(cur, r) for r in rows]
    finally:
        conn.close()


def set_catalog_entry_completed(id: int, completed: bool, db_path: str | None = None) -> None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        conn.execute(
            "UPDATE catalog_entries SET completed = ? WHERE id = ?",
            (int(completed), id),
        )
        conn.commit()
    finally:
        conn.close()


def set_catalog_entry_figure_id(id: int, figure_id: str, db_path: str | None = None) -> None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        conn.execute(
            "UPDATE catalog_entries SET figure_id = ? WHERE id = ?",
            (figure_id, id),
        )
        conn.commit()
    finally:
        conn.close()


def get_catalog_entry(id: int, db_path: str | None = None) -> dict | None:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM catalog_entries WHERE id = ?", (id,))
        row = cur.fetchone()
        return _row_to_dict(cur, row) if row else None
    finally:
        conn.close()


def get_catalog_summary(db_path: str | None = None) -> dict:
    conn = sqlite3.connect(_resolve(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*), SUM(completed) FROM catalog_entries")
        total, completed = cur.fetchone()
        return {"total": total or 0, "completed": completed or 0}
    finally:
        conn.close()
