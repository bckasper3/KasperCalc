"""Pydantic models for the figure JSON schema.

A Figure is the unit of work: one vector-graphic figure from the PDF,
with one or more axes and one or more digitized datasets (curves).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CalibrationPoint(BaseModel):
    """One known correspondence between a pixel location and a data value.

    `value` is None until the user types it in - a point exists (its pixel
    location was clicked) but isn't usable for calibration math yet.
    build_axis_transform() in calibration.py filters these out.
    """

    pixel: tuple[float, float]
    value: float | None = None


class Axis(BaseModel):
    axis_id: str
    orientation: Literal["x", "y"]
    scale: Literal["linear", "log"]
    label: str
    units: str | None = None
    calibration_points: list[CalibrationPoint] = Field(default_factory=list)


class CurveStyle(BaseModel):
    color: str | None = None
    width: float | None = None
    dash: str | None = None


class Dataset(BaseModel):
    dataset_id: str
    label: str
    axis_x: str
    axis_y: str
    raw_path_points: list[tuple[float, float]] = Field(default_factory=list)
    calibrated_points: list[tuple[float, float]] = Field(default_factory=list)
    style: CurveStyle = Field(default_factory=CurveStyle)
    # Which candidate path indices (into that page's /paths response) this
    # dataset was built from - lets the frontend re-select them later so a
    # dataset's segment membership can be edited instead of only deleted
    # and recreated from scratch. Empty for datasets saved before this
    # field existed; editing one of those just starts from no selection.
    source_path_indices: list[int] = Field(default_factory=list)
    # Whether this dataset's member paths show their colored overlay on the
    # page viewer. Purely a display toggle - doesn't affect raw_path_points,
    # calibration, or export.
    visible: bool = True


class Figure(BaseModel):
    figure_id: str
    source_pdf: str
    page_number: int
    figure_label: str
    caption: str | None = None
    material: str | None = None
    axes: list[Axis] = Field(default_factory=list)
    datasets: list[Dataset] = Field(default_factory=list)
    notes: str | None = None
    qc_status: Literal["unreviewed", "in_progress", "approved", "flagged"] = "unreviewed"
