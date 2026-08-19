"""Pixel -> data-space calibration math.

This is the most safety-critical module in the project: a bug here silently
produces wrong engineering numbers downstream. Keep it small and well tested.

Convention: every function in this module takes **dicts**, not Pydantic
models. If you have a `models.Axis` / `models.Dataset` instance, call
`.model_dump()` on it first. This keeps the math functions decoupled from
the API/validation layer and easy to unit test with plain literals.

An axis calibration works on a single 1-D pixel coordinate (the axis's own
pixel axis) mapped to a single 1-D data value:
  - for orientation "x", the pixel coordinate used is pixel[0] (px)
  - for orientation "y", the pixel coordinate used is pixel[1] (py)

PDF/image pixel space has y growing *downward*, which is why a y-axis's
calibration points frequently have the *larger* pixel value at the
*smaller* data value (origin at the bottom of the plot, but at the bottom
of the page in pixel terms that's a large y-pixel). The linear/log fits
below don't care about direction — they just solve for the two-point line
(or log-line) through whatever points they're given, so inverted axes work
automatically as long as the calibration_points reflect reality.
"""
from __future__ import annotations

import math


def _axis_pixel_component(axis: dict, pixel: tuple[float, float]) -> float:
    return pixel[0] if axis["orientation"] == "x" else pixel[1]


def fit_linear_axis(calibration_points: list[dict]) -> dict:
    """Fit value = a * pixel + b from >=2 calibration points {pixel, value}.

    calibration_points here are already reduced to the axis's own 1-D pixel
    coordinate, i.e. each point is {"pixel": <float>, "value": <float>}.
    Uses a least-squares fit when given more than 2 points (falls back to
    exact solve for exactly 2), so noisy manual clicks average out.
    """
    if len(calibration_points) < 2:
        raise ValueError("fit_linear_axis requires at least 2 calibration points")

    pxs = [p["pixel"] for p in calibration_points]
    vals = [p["value"] for p in calibration_points]
    n = len(pxs)

    mean_px = sum(pxs) / n
    mean_val = sum(vals) / n
    numerator = sum((px - mean_px) * (val - mean_val) for px, val in zip(pxs, vals))
    denominator = sum((px - mean_px) ** 2 for px in pxs)

    if denominator == 0:
        raise ValueError("calibration points have identical pixel coordinates")

    a = numerator / denominator
    b = mean_val - a * mean_px
    return {"kind": "linear", "a": a, "b": b}


def fit_log_axis(calibration_points: list[dict]) -> dict:
    """Fit log10(value) = a * pixel + b, i.e. value = 10**(a*pixel + b).

    Same point format as fit_linear_axis, but `value` must be > 0.
    """
    if len(calibration_points) < 2:
        raise ValueError("fit_log_axis requires at least 2 calibration points")
    for p in calibration_points:
        if p["value"] <= 0:
            raise ValueError("log-scale axis calibration values must be > 0")

    log_points = [{"pixel": p["pixel"], "value": math.log10(p["value"])} for p in calibration_points]
    linear_fit = fit_linear_axis(log_points)
    return {"kind": "log", "a": linear_fit["a"], "b": linear_fit["b"]}


def build_axis_transform(axis: dict | object):
    """Return a callable pixel -> value for the given axis (dict or Pydantic model).

    Dispatches on axis["scale"] / axis.scale ("linear" or "log").
    """
    axis_dict = axis.model_dump() if hasattr(axis, "model_dump") else axis

    # A calibration point exists as soon as its pixel location is clicked,
    # but its value stays None until the user types it in - skip those; the
    # fit functions below raise a clear "requires at least 2 points" error
    # if that leaves too few to work with.
    reduced_points = [
        {"pixel": _axis_pixel_component(axis_dict, cp["pixel"]), "value": cp["value"]}
        for cp in axis_dict["calibration_points"]
        if cp["value"] is not None
    ]

    scale = axis_dict["scale"]
    if scale == "linear":
        fit = fit_linear_axis(reduced_points)

        def transform(pixel_component: float) -> float:
            return fit["a"] * pixel_component + fit["b"]

    elif scale == "log":
        fit = fit_log_axis(reduced_points)

        def transform(pixel_component: float) -> float:
            return 10 ** (fit["a"] * pixel_component + fit["b"])

    else:
        raise ValueError(f"unknown axis scale: {scale!r}")

    return transform


def calibrate_dataset(dataset: dict | object, axes: list[dict] | list[object]) -> list[list[float]]:
    """Map a dataset's raw_path_points (pixel space) to calibrated data-space points.

    `axes` is the list of Axis dicts/models for the figure; the dataset's
    axis_x/axis_y ids select which two axes to use. Returns a list of
    [x_value, y_value] pairs, same order/length as raw_path_points.
    """
    dataset_dict = dataset.model_dump() if hasattr(dataset, "model_dump") else dataset
    axes_dicts = [a.model_dump() if hasattr(a, "model_dump") else a for a in axes]

    axis_x = next((a for a in axes_dicts if a["axis_id"] == dataset_dict["axis_x"]), None)
    axis_y = next((a for a in axes_dicts if a["axis_id"] == dataset_dict["axis_y"]), None)
    if axis_x is None:
        raise ValueError(f"axis_x {dataset_dict['axis_x']!r} not found in axes")
    if axis_y is None:
        raise ValueError(f"axis_y {dataset_dict['axis_y']!r} not found in axes")

    transform_x = build_axis_transform(axis_x)
    transform_y = build_axis_transform(axis_y)

    calibrated = []
    for px, py in dataset_dict["raw_path_points"]:
        x_val = transform_x(px)
        y_val = transform_y(py)
        calibrated.append((x_val, y_val))
    return calibrated
