"""Tests for backend/calibration.py — the safety-critical pixel<->value math."""
import json
import math
from pathlib import Path

import pytest

from backend import calibration
from backend.models import Figure

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_figure.json"


def test_fit_linear_axis_exact_two_point():
    points = [{"pixel": 100, "value": 0}, {"pixel": 400, "value": 12}]
    fit = calibration.fit_linear_axis(points)
    assert fit["kind"] == "linear"
    # value = a*pixel + b; check both calibration points solve exactly
    assert math.isclose(fit["a"] * 100 + fit["b"], 0, abs_tol=1e-9)
    assert math.isclose(fit["a"] * 400 + fit["b"], 12, abs_tol=1e-9)


def test_fit_linear_axis_inverted_y_pixel_direction():
    # PDF y grows downward: pixel 1800 (bottom of page) -> value 0,
    # pixel 300 (top of page) -> value 100. Slope should be negative.
    points = [{"pixel": 1800, "value": 0}, {"pixel": 300, "value": 100}]
    fit = calibration.fit_linear_axis(points)
    assert fit["a"] < 0
    assert math.isclose(fit["a"] * 1800 + fit["b"], 0, abs_tol=1e-9)
    assert math.isclose(fit["a"] * 300 + fit["b"], 100, abs_tol=1e-9)


def test_fit_linear_axis_requires_two_points():
    with pytest.raises(ValueError):
        calibration.fit_linear_axis([{"pixel": 1, "value": 1}])


def test_fit_linear_axis_rejects_identical_pixels():
    with pytest.raises(ValueError):
        calibration.fit_linear_axis([{"pixel": 5, "value": 1}, {"pixel": 5, "value": 2}])


def test_fit_log_axis_known_values():
    # value = 10 ** (a*pixel + b); pick pixel 0 -> value 1 (log=0),
    # pixel 100 -> value 100 (log=2). So a=0.02, b=0.
    points = [{"pixel": 0, "value": 1}, {"pixel": 100, "value": 100}]
    fit = calibration.fit_log_axis(points)
    assert fit["kind"] == "log"
    assert math.isclose(fit["a"], 0.02, rel_tol=1e-9)
    assert math.isclose(fit["b"], 0.0, abs_tol=1e-9)


def test_fit_log_axis_rejects_nonpositive_values():
    with pytest.raises(ValueError):
        calibration.fit_log_axis([{"pixel": 0, "value": 0}, {"pixel": 10, "value": 100}])


def test_build_axis_transform_linear_x_axis():
    axis = {
        "axis_id": "x1",
        "orientation": "x",
        "scale": "linear",
        "label": "Strain",
        "units": "0.001 in./in.",
        "calibration_points": [
            {"pixel": [250, 1800], "value": 0},
            {"pixel": [1450, 1800], "value": 12},
        ],
    }
    transform = calibration.build_axis_transform(axis)
    assert math.isclose(transform(250), 0, abs_tol=1e-9)
    assert math.isclose(transform(1450), 12, abs_tol=1e-9)
    assert math.isclose(transform(850), 6, abs_tol=1e-6)  # midpoint


def test_build_axis_transform_accepts_pydantic_model():
    from backend.models import Axis

    axis = Axis(
        axis_id="y1",
        orientation="y",
        scale="linear",
        label="Stress",
        units="ksi",
        calibration_points=[
            {"pixel": [250, 1800], "value": 0},
            {"pixel": [250, 300], "value": 100},
        ],
    )
    transform = calibration.build_axis_transform(axis)
    assert math.isclose(transform(1800), 0, abs_tol=1e-9)
    assert math.isclose(transform(300), 100, abs_tol=1e-9)


def test_build_axis_transform_log_scale():
    axis = {
        "axis_id": "logy",
        "orientation": "y",
        "scale": "log",
        "label": "Cycles",
        "units": "N",
        "calibration_points": [
            {"pixel": [0, 1000], "value": 1},
            {"pixel": [0, 800], "value": 10},
        ],
    }
    transform = calibration.build_axis_transform(axis)
    assert math.isclose(transform(1000), 1, rel_tol=1e-6)
    assert math.isclose(transform(800), 10, rel_tol=1e-6)


def test_build_axis_transform_unknown_scale_raises():
    axis = {
        "axis_id": "bad",
        "orientation": "x",
        "scale": "weird",
        "label": "X",
        "units": None,
        "calibration_points": [
            {"pixel": [0, 0], "value": 0},
            {"pixel": [1, 0], "value": 1},
        ],
    }
    with pytest.raises(ValueError):
        calibration.build_axis_transform(axis)


def _load_fixture_figure() -> Figure:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return Figure.model_validate(raw)


def test_calibrate_dataset_matches_fixture_calibrated_points():
    figure = _load_fixture_figure()
    tension = next(d for d in figure.datasets if d.dataset_id == "ds-tension")

    result = calibration.calibrate_dataset(tension, figure.axes)

    assert len(result) == len(tension.raw_path_points)
    for (x, y), (expected_x, expected_y) in zip(result, tension.calibrated_points):
        assert math.isclose(x, expected_x, abs_tol=0.05)
        assert math.isclose(y, expected_y, abs_tol=0.5)


def test_calibrate_dataset_second_y_axis():
    figure = _load_fixture_figure()
    tm = next(d for d in figure.datasets if d.dataset_id == "ds-tangent-modulus")

    result = calibration.calibrate_dataset(tm, figure.axes)

    assert len(result) == len(tm.raw_path_points)
    for (x, y), (expected_x, expected_y) in zip(result, tm.calibrated_points):
        assert math.isclose(x, expected_x, abs_tol=0.05)
        assert math.isclose(y, expected_y, abs_tol=0.5)


def test_calibrate_dataset_unknown_axis_raises():
    figure = _load_fixture_figure()
    tension = next(d for d in figure.datasets if d.dataset_id == "ds-tension")
    bad_dataset = tension.model_copy(update={"axis_y": "does-not-exist"})
    with pytest.raises(ValueError):
        calibration.calibrate_dataset(bad_dataset, figure.axes)
