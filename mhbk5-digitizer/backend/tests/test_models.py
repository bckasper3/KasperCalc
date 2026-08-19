"""Round-trip test: JSON fixture -> Figure model -> dict."""
import json
from pathlib import Path

from backend.models import Figure

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_figure.json"


def _load_fixture() -> dict:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_figure_loads_from_fixture():
    raw = _load_fixture()
    figure = Figure.model_validate(raw)
    assert figure.figure_id == "mil5j-fig-3.2.1.1.6"
    assert figure.page_number == 137
    assert len(figure.axes) == 3
    assert len(figure.datasets) == 3
    assert figure.qc_status == "unreviewed"


def test_figure_round_trips_to_equivalent_dict():
    raw = _load_fixture()
    figure = Figure.model_validate(raw)
    dumped = figure.model_dump(mode="json")

    # tuples become lists on dump; compare structurally instead of literal equality
    assert dumped["figure_id"] == raw["figure_id"]
    assert len(dumped["axes"]) == len(raw["axes"])
    assert len(dumped["datasets"]) == len(raw["datasets"])

    for axis_dump, axis_raw in zip(dumped["axes"], raw["axes"]):
        assert axis_dump["axis_id"] == axis_raw["axis_id"]
        assert axis_dump["orientation"] == axis_raw["orientation"]
        assert len(axis_dump["calibration_points"]) == len(axis_raw["calibration_points"])
        for cp_dump, cp_raw in zip(axis_dump["calibration_points"], axis_raw["calibration_points"]):
            assert list(cp_dump["pixel"]) == cp_raw["pixel"]
            assert cp_dump["value"] == cp_raw["value"]

    for ds_dump, ds_raw in zip(dumped["datasets"], raw["datasets"]):
        assert ds_dump["dataset_id"] == ds_raw["dataset_id"]
        assert [list(p) for p in ds_dump["raw_path_points"]] == ds_raw["raw_path_points"]
        assert [list(p) for p in ds_dump["calibrated_points"]] == ds_raw["calibrated_points"]
        assert ds_dump["style"]["color"] == ds_raw["style"]["color"]


def test_figure_reparse_from_dump_is_stable():
    raw = _load_fixture()
    figure = Figure.model_validate(raw)
    dumped = figure.model_dump(mode="json")
    figure2 = Figure.model_validate(dumped)
    assert figure2 == figure
