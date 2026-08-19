"""Tests for backend/export.py using the sample_figure.json fixture."""
import json
from pathlib import Path

from backend import export

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_figure.json"


def _load_fixture() -> dict:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_figure_to_chartjs_groups_by_y_axis():
    figure = _load_fixture()
    result = export.figure_to_chartjs(figure)
    charts = result["charts"]

    # fixture has y1 (tension+compression) and y2 (tangent modulus)
    assert set(charts.keys()) == {"y1", "y2"}
    assert len(charts["y1"]["data"]["datasets"]) == 2
    assert len(charts["y2"]["data"]["datasets"]) == 1


def test_figure_to_chartjs_dataset_points_match_calibrated_points():
    figure = _load_fixture()
    result = export.figure_to_chartjs(figure)
    y1_chart = result["charts"]["y1"]
    tension_ds = next(d for d in y1_chart["data"]["datasets"] if d["label"] == "Tension, T")

    raw = next(d for d in figure["datasets"] if d["dataset_id"] == "ds-tension")
    expected_points = [{"x": p[0], "y": p[1]} for p in raw["calibrated_points"]]
    assert tension_ds["data"] == expected_points


def test_figure_to_chartjs_axis_titles_include_units():
    figure = _load_fixture()
    result = export.figure_to_chartjs(figure)
    y1_title = result["charts"]["y1"]["options"]["scales"]["y"]["title"]["text"]
    assert "Stress" in y1_title
    assert "ksi" in y1_title


def test_figure_to_chartjs_log_scale_axis():
    figure = {
        "figure_label": "Fig X",
        "axes": [
            {"axis_id": "x1", "orientation": "x", "scale": "linear", "label": "N", "units": "cycles"},
            {"axis_id": "y1", "orientation": "y", "scale": "log", "label": "Stress", "units": "ksi"},
        ],
        "datasets": [
            {
                "dataset_id": "d1", "label": "S-N", "axis_x": "x1", "axis_y": "y1",
                "raw_path_points": [], "calibrated_points": [[1, 100], [1000, 10]],
                "style": {},
            }
        ],
    }
    result = export.figure_to_chartjs(figure)
    assert result["charts"]["y1"]["options"]["scales"]["y"]["type"] == "logarithmic"


def test_figure_to_chartjs_empty_figure():
    result = export.figure_to_chartjs({"axes": [], "datasets": []})
    assert result == {"charts": {}}
